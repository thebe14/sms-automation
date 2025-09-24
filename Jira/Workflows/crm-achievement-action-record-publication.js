// workflow: CRM Achievement Workflow
// on transition: InProgress -> InProgress (Record new scientific publication)
// run as: Initiating user
// conditions: true

String summary = issue.fields['summary']
String issueType = issue.fields?.issuetype?.name
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${issueType.toLowerCase()} ${issue.key}")
    return
}

// get custom fields
def customFields = get("/rest/api/3/field")
    .header("Accept", "application/json")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

def projectNameId = customFields.find { it.name == 'Name of project' }?.id?.toString()
def reviewOwnerId = customFields.find { it.name == 'Review owner' }?.id?.toString()
def customerOwnerId = customFields.find { it.name == 'Customer owner' }?.id?.toString()
def pubTitleId = customFields.find { it.name == 'Publication title' }?.id?.toString()
def pubDateId = customFields.find { it.name == 'Publication date' }?.id?.toString()
def pubStatusId = customFields.find { it.name == 'Publication status' }?.id?.toString()
def accessPolicyId = customFields.find { it.name == 'Access policy' }?.id?.toString()
def pidId = customFields.find { it.name == 'PID' }?.id?.toString()

def projectKey = issue.fields.project.key as String
def projectName = issue.fields[projectNameId] as String
def reviewOwner = issue.fields[reviewOwnerId]?.accountId as String
def customerOwner = issue.fields[customerOwnerId]?.accountId as String
def pubTitle = issue.fields[pubTitleId] as String
def pubDate = issue.fields[pubDateId] as String
def pubStatus = issue.fields[pubStatusId]?.value as String
def acessPolicy = issue.fields[accessPolicyId]?.value as String
def pid = issue.fields[pidId] as String

if(null == reviewOwner)
    reviewOwner = customerOwner

// create new Publication ticket
def result = post("/rest/api/3/issue")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            project: [ key: projectKey ],
            issuetype: [ name: "Publication" ],
            summary: "${pubTitle}",
            assignee: [ accountId: reviewOwner ],
            (reviewOwnerId): [ accountId: reviewOwner ],
            (pubTitleId): pubTitle,
            (pubDateId): pubDate,
            (pubStatusId): [ value: pubStatus ],
            (accessPolicyId): [ value: acessPolicy ],
            (pidId): pid,
        ],
        update:[
            issuelinks: [[
                add: [
                    type: [ name: "Relates" ],
                    inwardIssue: [ key: issue.key ]
                ]
            ]]
        ],
    ])
    .asObject(Map)

if(result.status < 200 || result.status >= 300) {
    logger.info("Could not create publication for achievement ${issue.key} (${result.status})")
    return
}

def newTicket = result.body as Map
logger.info("Created publication ${newTicket.key} for achievement ${projectName}")

// clear the publication details from the achievement ticket, so new publications can be recorded clean
result = put("/rest/api/3/issue/${issue.key}")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (pubTitleId): null,
            (pubDateId): null,
            (pubStatusId): null,
            (accessPolicyId): null,
            (pidId): null,
        ],
    ])
    .asString()

if(result.status < 200 || result.status >= 300)
    logger.info("Could not clear publication details from achievement ${issue.key} (${result.status})")

// add a comment about the new publication that was created
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
                        text: " New scientific publication was recorded for ${projectName}, see ",
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
    .asString()

if(result.status < 200 || result.status > 204)
    logger.info("Could not add comment to ${issueType} ${issue.key} (${result.status})")
