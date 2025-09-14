// workflow: Procedure Workflow
// on transition: Active -> InReview
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

// check that we have a procedure code
def procedureCodeId = customFields.find { it.name == 'Procedure code' }?.id?.toString()
def procedureCode = issue.fields[procedureCodeId]?.toUpperCase() as String
if(null == procedureCode) {
    logger.info("No procedure code on ${issue.key}")
    return
}

def processOwnerId = customFields.find { it.name == 'Process owner' }?.id?.toString()
def processManagerId = customFields.find { it.name == 'Process manager' }?.id?.toString()
def reviewFrequencyId = customFields.find { it.name == 'Review frequency' }?.id?.toString()

def processOwner = issue.fields[processOwnerId]?.accountId as String
def processManager = issue.fields[processManagerId]?.accountId as String
def reviewFrequency = issue.fields[reviewFrequencyId]?.value as String

// create Procedure Review ticket in the same Jira project
def assignee = null
if(null != processOwner)
    assignee = [ accountId: processOwner ]
else if(null != processManager)
    assignee = [ accountId: processManager ]

def now = Calendar.instance
def reviewDate = null

if(null == reviewFrequency)
    reviewFrequency = "Monthly"

switch(reviewFrequency.toLowerCase()) {
    case "weekly":
        reviewDate = "${now.get(Calendar.YEAR)}.W${String.format('%02d', now.get(Calendar.WEEK_OF_YEAR))}"
        break

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

def result = post("/rest/api/3/issue")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            project: [ key: issue.fields['project']?.key ],
            issuetype: [ name: "Procedure Review" ],
            summary: "Review of procedure ${procedureCode} on ${reviewDate}",
            assignee: assignee,
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
    logger.info("Could not create review for procedure ${procedureCode} (${result.status})")
    return
}

def newTicket = result.body as Map
logger.info("Created review for procedure ${procedureCode} ${newTicket.key}")

// add a comment about the new review that has started
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
                        text: "A review of this procedure has been initiated, see ",
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
    logger.info("Could not add comment to procedure ${issue.key} (${result.status})")
