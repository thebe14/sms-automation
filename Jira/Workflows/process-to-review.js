// workflow: SMS Process Workflow
// on transition: Active -> InReview
// run as: Initiating user
// conditions: true

def summary = issue.fields['summary'] as String
def ticketType = issue.fields.issuetype?.name?.toLowerCase()
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${ticketType} ${issue.key}")
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
    logger.info("No process code on ${issue.key}")
    return
}

def reviewFrequencyId = customFields.find { it.name == 'Review process' }?.id?.toString()

def reviewFrequency = issue.fields[reviewFrequencyId]?.value as String

// create Process Review ticket in the correct Jira project
def now = Calendar.instance
def reviewDate = null

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

def result = post("/rest/api/3/issue")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            project: [ key: processCode ],
            issuetype: [ name: "Process Review" ],
            summary: "Review of process ${processCode} on ${reviewDate}",
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
    .asString()

if(result.status < 200 || result.status > 204)
    logger.info("Could not add comment to process ${issue.key} (${result.status})")
