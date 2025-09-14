// workflow: CRM Project Workflow
// on transition: CollectUseCases -> CollectUseCases (Explore new use case)
// run as: Initiating user
// conditions: true

def summary = issue.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${issue.fields.issuetype.name.toLowerCase()} ${issue.key}")
    return
}

// get custom fields
def customFields = get("/rest/api/3/field")
    .header("Accept", "application/json")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

def usecaseTitleId = customFields.find { it.name == 'Use case title' }?.id?.toString()
def projectNameId = customFields.find { it.name == 'Project name' }?.id?.toString()
def projectOwnerId = customFields.find { it.name == 'Project owner' }?.id?.toString()

def projectKey = issue.fields.project.key as String
def usecaseTitle = issue.fields[usecaseTitleId] as String
def projectName = issue.fields[projectNameId] as String
def projectOwner = issue.fields[projectOwnerId]?.accountId as String

// create new contact ticket
def result = post("/rest/api/3/issue")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            project: [ key: projectKey ],
            issuetype: [ name: "Use Case" ],
            summary: usecaseTitle,
            assignee: [ accountId: projectOwner ],
        ],
        update:[
            issuelinks: [[
                add: [
                    type: [ name: "Use Case" ],
                    inwardIssue: [ key: issue.key ]
                ]
            ]]
        ],
    ])
    .asObject(Map)

if(result.status < 200 || result.status >= 300) {
    logger.info("Could not create use case for project ${issue.key} (${result.status})")
    return
}

def newTicket = result.body as Map
logger.info("Created use case ${newTicket.key} for project ${projectName}")

// clear the use case details from the project ticket, so new use cases can be created clean
result = put("/rest/api/3/issue/${issue.key}")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (usecaseTitleId): null,
        ],
    ])
    .asString()

if(result.status < 200 || result.status >= 300)
    logger.info("Could not clear use case details from project ${issue.key} (${result.status})")

// add a comment about the new use case that was created
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
                        text: "New use case has been created for this project, see ",
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
    logger.info("Could not add use case to project ${issue.key} (${result.status})")
