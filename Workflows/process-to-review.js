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
def definitionUpdatesId = customFields.find { it.name == 'Process definition review and updates' }?.id?.toString()
def procedureUpdatesId = customFields.find { it.name == 'Procedure and policy review and updates' }?.id?.toString()
def reportUpdatesId = customFields.find { it.name == 'Report review and updates' }?.id?.toString()
def perfIndUpdatesId = customFields.find { it.name == 'Performance indicator review and updates' }?.id?.toString()

def processOwner = issue.fields[processOwnerId]?.accountId as String
def processManager = issue.fields[processManagerId]?.accountId as String

def description = [
    type: "doc",
    version: 1,
    content: [
        [
            type: "paragraph",
            content: [[
                type: "text",
                text: "This ticket collects findings from the process review.",
            ]]
        ],
        [
            type: "paragraph",
            content: [
                [
                    type: "text",
                    text: "Please refer to the ",
                ],
                [
                    type: "text",
                    text: "EGI Glossary",
                    marks: [[
                        type: "link",
                        attrs: [ href: "https://wiki.egi.eu/wiki/Glossary" ]
                    ]]
                ],
                [
                    type: "text",
                    text: " for the definitions of the terms used in this review.",
                ]
            ]
        ],
        [
            type: "paragraph",
            content: [
                [
                    type: "text",
                    text: "The keywords MUST (NOT), SHALL (NOT), SHOULD (NOT), REQUIRED, RECOMMENDED, MAY, and OPTIONAL in this review are to be interpreted as described in ",
                ],
                [
                    type: "text",
                    text: "RFC 2119",
                    marks: [[
                        type: "link",
                        attrs: [ href: "http://tools.ietf.org/html/rfc2119" ]
                    ]]
                ],
                [
                    type: "text",
                    text: ".",
                ]
            ]
        ]
    ]
]

def definitionUpdates = [
    type: "doc",
    version: 1,
    content: [
        [
            type: "heading",
            attrs: [ level: 2 ],
            content: [[
                type: "text",
                text: "Goals",
            ]]
        ],
        [
            type: "paragraph",
            content: [[
                type: "text",
                text: "Current status and need for improvements.",
            ]]
        ],
        [
            type: "heading",
            attrs: [ level: 2 ],
            content: [[
                type: "text",
                text: "Requirements",
            ]]
        ],
        [
            type: "paragraph",
            content: [[
                type: "text",
                text: "Current status and need for improvements.",
            ]]
        ],
        [
            type: "heading",
            attrs: [ level: 2 ],
            content: [[
                type: "text",
                text: "Roles",
            ]]
        ],
        [
            type: "paragraph",
            content: [[
                type: "text",
                text: "Current status and need for improvements.",
            ]]
        ],
        [
            type: "heading",
            attrs: [ level: 2 ],
            content: [[
                type: "text",
                text: "Input & Output",
            ]]
        ],
        [
            type: "paragraph",
            content: [[
                type: "text",
                text: "Current status and need for improvements.",
            ]]
        ],
    ]
]

def procedureUpdates = [
    type: "doc",
    version: 1,
    content: [
        [
            type: "heading",
            attrs: [ level: 2 ],
            content: [[
                type: "text",
                text: "PROC.NO Procedure title",
            ]]
        ],
        [
            type: "paragraph",
            content: [[
                type: "text",
                text: "Current status and need for improvements. (Repeat as needed)",
            ]]
        ],
    ]
]

def reportUpdates = [
    type: "doc",
    version: 1,
    content: [
        [
            type: "heading",
            attrs: [ level: 2 ],
            content: [[
                type: "text",
                text: "Report Type",
            ]]
        ],
        [
            type: "paragraph",
            content: [[
                type: "text",
                text: "Current status and need for improvements. (Repeat as needed)",
            ]]
        ],
    ]
]

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
            description: description,
            (definitionUpdatesId): definitionUpdates,
            (procedureUpdatesId): procedureUpdates,
            (reportUpdatesId): reportUpdates,
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

if(result.status < 200 || result.status >= 300) {
    logger.info("Could not create ${processCode} process review (${result.status})")
    return
}

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
