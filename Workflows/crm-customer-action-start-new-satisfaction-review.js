// workflow: CRM Customer Workflow
// on transition: Active -> Active (Start customer satisfaction review)
// run as: Initiating user
// conditions: true

def summary = issue.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${issue.fields.issuetype?.name?.toLowerCase()} ${issue.key}")
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
def reviewOwnerId = customFields.find { it.name == 'Review owner' }?.id?.toString()
def reviewFrequencyId = customFields.find { it.name == 'Customer satisfaction review frequency' }?.id?.toString()

def projectKey = issue.fields.project.key as String
def customerName = issue.fields[customerNameId] as String
def customerOwner = issue.fields[customerOwnerId]?.accountId as String
def reviewFrequency = issue.fields[reviewFrequencyId]?.value as String

def now = Calendar.instance
def reviewDate = null

if(null == reviewFrequency)
    reviewFrequency = "Monthly"
    
switch(reviewFrequency.toLowerCase()) {
    case "quarterly":
        def month = 1 + now.get(Calendar.MONTH)
        def quarter = 1
        if(month >= 4 && month <= 6)
            quarter = 2
        else if(month >= 7 && month <= 9)
            quarter = 3
        else if(month >= 10)
            quarter = 4
        reviewDate = "${now.get(Calendar.YEAR)}.Q${quarter}"
        break

    case "semiannually":
        def month = 1 + now.get(Calendar.MONTH)
        def half = month < 7 ? 1 : 2
        reviewDate = "${now.get(Calendar.YEAR)}-${half}"
        break

    case "annually":
        reviewDate = "${now.get(Calendar.YEAR)}"
        break

    case "monthly":
    default:
        reviewDate = "${now.get(Calendar.YEAR)}.${String.format('%02d', 1 + now.get(Calendar.MONTH))}"
        break
}

// create new Customer Satisfaction Review ticket
def result = post("/rest/api/3/issue")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            project: [ key: projectKey ],
            issuetype: [ name: "Customer Satisfaction Review" ],
            summary: "Customer satisfaction review for ${customerName} on ${reviewDate}",
            assignee: [ accountId: customerOwner ],
            (reviewOwnerId): [ accountId: customerOwner ],
        ],
        update:[
            issuelinks: [[
                add: [
                    type: [ name: "Review" ],
                    inwardIssue: [ key: issue.key ]
                ]
            ]]
        ],
    ])
    .asObject(Map)

if(result.status < 200 || result.status >= 300) {
    logger.info("Could not create satisfaction review for customer ${issue.key} (${result.status})")
    return
}

def newTicket = result.body as Map
logger.info("Created satisfaction review ${newTicket.key} for customer ${customerName}")

// add a comment about the new satisfaction review that was created
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
                        text: "New customer satisfaction review has been initiated, see ",
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
