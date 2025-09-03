// workflow: CRM Customer Workflow
// on transition: Active -> Active (Register complaint)
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
def complaintOwnerId = customFields.find { it.name == 'Complaint owner' }?.id?.toString()
def complaintTextId = customFields.find { it.name == 'Customer complaint' }?.id?.toString()
def receivedViaId = customFields.find { it.name == 'Received via channel' }?.id?.toString()

def projectKey = issue.fields.project.key as String
def customerName = issue.fields[customerNameId] as String
def customerOwner = issue.fields[customerOwnerId]?.accountId as String
def complaintOwner = issue.fields[complaintOwnerId]?.accountId as String
def complaintText = issue.fields[complaintTextId]
def receivedVia = issue.fields[receivedViaId]?.value as String

if(null == complaintOwner)
    complaintOwner = customerOwner

// create new complaint ticket
def result = post("/rest/api/3/issue")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            project: [ key: projectKey ],
            issuetype: [ name: "Complaint" ],
            summary: "New complaint from customer ${customerName}",
            assignee: [ accountId: complaintOwner ],
            (complaintOwnerId): [ accountId: complaintOwner ],
            (complaintTextId): complaintText,
            (receivedViaId): [ value: receivedVia ],
        ],
        update:[
            issuelinks: [[
                add: [
                    type: [ name: "Complaint" ],
                    inwardIssue: [ key: issue.key ]
                ]
            ]]
        ],
    ])
    .asObject(Map)

if(result.status < 200 || result.status >= 300) {
    logger.info("Could not create complaint for customer ${issue.key} (${result.status})")
    return
}

def newTicket = result.body as Map
logger.info("Created complaint ${newTicket.key} for customer ${customerName}")

// clear the complaint details from the customer ticket, so new complaints can be registered clean
result = put("/rest/api/3/issue/${issue.key}")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (complaintOwnerId): null,
            (complaintTextId): null,
            (receivedViaId): null,
        ],
    ])
    .asString()

if(result.status < 200 || result.status >= 300)
    logger.info("Could not clear complaint details from customer ${issue.key} (${result.status})")

// add a comment about the new complaint that was created
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
                        text: " New complaint was received from this customer, see ",
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
    logger.info("Could not add comment to customer ${issue.key} (${result.status})")
