// workflow: SMS Process Workflow
// on transition: Active -> UnderReview
// run as: Initiating user
// conditions: true

import java.time.LocalDate

if(issue == null) {
    logger.info("No issue")
    return
}

def summary = issue.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ticket ${issue.key}")
    return
}

// get custom fields
def customFields = get("/rest/api/3/field")
    .header("Accept", "application/json")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

// check that we have a process code
def processCodeId = customFields.find { it.name == 'Process code' }?.id?.toString()

def processCode = issue.fields[processCodeId]?.toUpperCase() as String
if(null == processCode) {
    logger.info("No process code")
    return
}

def processOwnerId = customFields.find { it.name == 'Process owner' }?.id?.toString()
def processManagerId = customFields.find { it.name == 'Process manager' }?.id?.toString()

def processOwner = issue.fields[processOwnerId]?.accountId as String
def processManager = issue.fields[processManagerId]?.accountId as String

// create Process Review ticket in the correct Jira project
def now = LocalDate.now()
def result = post("/rest/api/3/issue") 
    .header("Content-Type", "application/json")
    .body([
        fields:[
            project: [ key: processCode ],
            issuetype: [ name: "Process Review" ],
            summary: "${processCode} process review ${now.year}.${now.monthValue}",
            assignee: null != processOwner ? [ accountId: processOwner ] : null,
            (processOwnerId): null != processOwner ? [ accountId: processOwner ] : null,
            (processManagerId): null != processManager ? [ accountId: processManager ] : null,
        ],
        update:[
            issuelinks: [[
                add: [
                    type: [ name: "Relates" ],
                    outwardIssue: [ key: issue.key ]
                ]
            ]]
        ],
    ])
    .asObject(Map)

if(result.status >= 200 && result.status < 300) {
    def newTicket = result.body as Map
    logger.info("Created process review ${newTicket.key}")

    // add a comment about the new review that has started
    result = get('/rest/api/3/myself').asObject(Map)
    def currentUser = result.body as Map
    result = post("/rest/api/3/issue/${issue.key}/comment") 
        .header("Content-Type", "application/json")
        .body([
            body: [
                type: "doc",
                version: 1,
                content: [[
                    type: "paragraph",
                    content: [
                        [
                            type: "text",
                            text: "A review of this process has been initiated, see ",
                        ],
                        [
                            type: "text",
                            text: "${newTicket.key}",
                            marks: [[
                                type: "link",
                                attrs: [ href: "/browse/${newTicket.key}" ]
                            ]]
                        ]
                    ]
                ]]
            ]
        ])
        .asObject(Map)

    if(result.status < 200 || result.status > 204)
        logger.info("Could not add comment to ${issue.key} (${result.status})")
}
else
    logger.info("Could not create ${processCode} process review (${result.status})")
