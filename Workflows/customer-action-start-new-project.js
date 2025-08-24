// workflow: CRM Customer Workflow
// on transition: InProgress -> InProgress (Start new project)
// run as: Initiating user
// conditions: true

if(issue == null) {
    logger.info("No issue")
    return
}

def summary = issue.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test customer ${issue.key}")
    return
}

// get custom fields
def customFields = get("/rest/api/3/field")
    .header("Accept", "application/json")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

def customerNameId = customFields.find { it.name == 'Customer name' }?.id?.toString()
def customerOwnerId = customFields.find { it.name == 'Customer owner' }?.id?.toString()
def projectNameId = customFields.find { it.name == 'Project name' }?.id?.toString()
def projectOwnerId = customFields.find { it.name == 'Project owner' }?.id?.toString()

def customerName = issue.fields[customerNameId] as String
def customerOwner = issue.fields[customerOwnerId]?.accountId as String
def projectOwner = issue.fields[projectOwnerId]?.accountId as String
def projectName = issue.fields[projectNameId] as String
def projectKey = issue.fields.project.key as String

if(null == projectOwner)
    projectOwner = customerOwner

def result = post("/rest/api/3/issue")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            project: [ key: projectKey ],
            issuetype: [ name: "Project" ],
            summary: projectName,
            assignee: [ accountId: projectOwner ],
            (projectNameId): projectName,
            (projectOwnerId): [ accountId: projectOwner ],
        ],
        update:[
            issuelinks: [[
                add: [
                    type: [ name: "Customer-Project" ],
                    inwardIssue: [ key: issue.key ]
                ]
            ]]
        ],
    ])
    .asObject(Map)

if(result.status < 200 || result.status >= 300) {
    logger.info("Could not create project for customer ${customerName} (${result.status})")
    return
}

def newTicket = result.body as Map
logger.info("Created project ${newTicket.key} for customer ${customerName}")

// clear the project details from the customer ticket, so new projects can be created clean
result = put("/rest/api/3/issue/${issue.key}")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (projectNameId): null,
            (projectOwnerId): null,
        ],
    ])
    .asString()

if(result.status < 200 || result.status >= 300)
    logger.info("Could not clear contact details from customer ${issue.key} (${result.status})")

// add a comment about the new project that was created
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
                        text: "New project ${projectName} has been created for this customer, see ",
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
    logger.info("Could not add comment to customer ${issue.key} (${result.status})")
