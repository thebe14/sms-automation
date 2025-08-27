// workflow: CRM Customer Workflow
// on transition: InProgress -> InProgress (Create new contact)
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

def customerNameId = customFields.find { it.name == 'Customer name' }?.id?.toString()
def customerOwnerId = customFields.find { it.name == 'Customer owner' }?.id?.toString()
def contactNameId = customFields.find { it.name == 'Contact name' }?.id?.toString()
def contactSurnameId = customFields.find { it.name == 'Contact surname' }?.id?.toString()
def contactEmailId = customFields.find { it.name == 'Contact email' }?.id?.toString()
def contactPhoneId = customFields.find { it.name == 'Contact phone' }?.id?.toString()
def contactOrgId = customFields.find { it.name == 'Contact organization' }?.id?.toString()

def projectKey = issue.fields.project.key as String
def customerName = issue.fields[customerNameId] as String
def customerOwner = issue.fields[customerOwnerId]?.accountId as String
def contactName = issue.fields[contactNameId] as String
def contactSurname = issue.fields[contactSurnameId] as String
def contactEmail = issue.fields[contactEmailId] as String
def contactPhone = issue.fields[contactPhoneId] as String
def contactOrg = issue.fields[contactOrgId] as String

// create new contact ticket
def result = post("/rest/api/3/issue")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            project: [ key: projectKey ],
            issuetype: [ name: "Contact" ],
            summary: "${contactSurname} ${contactName}",
            assignee: [ accountId: customerOwner ],
            (contactNameId): contactName,
            (contactSurnameId): contactSurname,
            (contactEmailId): contactEmail,
            (contactPhoneId): contactPhone,
            (contactOrgId): contactOrg,
        ],
        update:[
            issuelinks: [[
                add: [
                    type: [ name: "Customer-Contact" ],
                    inwardIssue: [ key: issue.key ]
                ]
            ]]
        ],
    ])
    .asObject(Map)

if(result.status < 200 || result.status >= 300) {
    logger.info("Could not create contact for customer ${issue.key} (${result.status})")
    return
}

def newTicket = result.body as Map
logger.info("Created contact ${newTicket.key} for customer ${customerName}")

// clear the contact details from the customer ticket, so new contacts can be added clean
result = put("/rest/api/3/issue/${issue.key}")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (contactNameId): null,
            (contactSurnameId): null,
            (contactEmailId): null,
            (contactPhoneId): null,
            (contactOrgId): null,
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
                        text: "New contact ${contactSurname} ${contactName} has been created for this customer, see ",
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
