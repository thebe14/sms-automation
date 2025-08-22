// workflow: SMS Process Workflow
// on transition: Active -> InReview
// run as: Initiating user
// conditions: true

if(issue == null) {
    logger.info("No issue")
    return
}

def summary = issue.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test process ${issue.key}")
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
def processHomeId = customFields.find { it.name == 'Process homepage' }?.id?.toString()
def processReviewGuideId = customFields.find { it.name == 'Process review guide' }?.id?.toString()
def definitionUpdatesId = customFields.find { it.name == 'Process definition review and updates' }?.id?.toString()
def policyHomeId = customFields.find { it.name == 'Policy homepage' }?.id?.toString()
def procedureHomeId = customFields.find { it.name == 'Procedure homepage' }?.id?.toString()
def policyUpdatesId = customFields.find { it.name == 'Policy review and updates' }?.id?.toString()
def procedureUpdatesId = customFields.find { it.name == 'Procedure review and updates' }?.id?.toString()
def kpiUpdatesId = customFields.find { it.name == 'Performance indicator review and updates' }?.id?.toString()
def reportUpdatesId = customFields.find { it.name == 'Report review and updates' }?.id?.toString()
def reviewFrequencyId = customFields.find { it.name == 'Review process' }?.id?.toString()

def processOwner = issue.fields[processOwnerId]?.accountId as String
def processManager = issue.fields[processManagerId]?.accountId as String
def processHome = issue.fields[processHomeId] as String
def processReviewGuide = issue.fields[processReviewGuideId]
def reviewFrequency = issue.fields[reviewFrequencyId]?.value as String

def definitionUpdates = [
    type: "doc",
    version: 1,
    content: [
        [
            type: "heading",
            attrs: [ level: 3 ],
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
            attrs: [ level: 3 ],
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
            attrs: [ level: 3 ],
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
            attrs: [ level: 3 ],
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

def policyUpdates = [
    type: "doc",
    version: 1,
    content: []
]

def procedureUpdates = [
    type: "doc",
    version: 1,
    content: []
]

def kpiUpdates = [
    type: "doc",
    version: 1,
    content: []
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

logger.info(processHome)

if(null != processHome) {
    definitionUpdates.content[0]?.content[0]?.marks = [[
        type: "link",
        attrs: [ href: "${processHome}#Goals" ]
    ]]

    definitionUpdates.content[2]?.content[0]?.marks = [[
        type: "link",
        attrs: [ href: "${processHome}#Requirements" ]
    ]]

    definitionUpdates.content[4]?.content[0]?.marks = [[
        type: "link",
        attrs: [ href: "${processHome}#Roles" ]
    ]]

    definitionUpdates.content[6]?.content[0]?.marks = [[
        type: "link",
        attrs: [ href: "${processHome}#Inputs-%26-Outputs" ]
    ]]
}

// find all active policies
def result = get("/rest/api/3/search/jql?fields=key,summary,status,${policyHomeId}&jql=project%3D${processCode}%20AND%20issuetype%3DPolicy%20AND%20status%20!%3D%20Inactive")
    .asObject(Map)

if(result.status >= 200 && result.status < 300) {
    for(def pol : result.body.issues) {

        def heading = [
            type: "heading",
            attrs: [ level: 3 ],
            content: [[
                type: "text",
                text: pol?.fields?.summary,
            ]]
        ]

        if(null != pol?.fields[policyHomeId])
            heading.content[0].marks = [[
                type: "link",
                attrs: [ href: pol?.fields[policyHomeId] ]
            ]]
        
        policyUpdates.content.add(heading)
        policyUpdates.content.add([
            type: "paragraph",
            content: [[
                type: "text",
                text: "Current status and need for improvements.",
            ]]
        ])
    }
}
else
    logger.info("Could not list ${processCode} policies (${result.status})")

// find all active procedures
result = get("/rest/api/3/search/jql?fields=key,summary,status,${procedureHomeId}&jql=project%3D${processCode}%20AND%20issuetype%3DProcedure%20AND%20status%20!%3D%20Inactive")
    .asObject(Map)

if(result.status >= 200 && result.status < 300) {
    for(def proc : result.body.issues) {

        def heading = [
            type: "heading",
            attrs: [ level: 3 ],
            content: [[
                type: "text",
                text: proc?.fields?.summary,
            ]]
        ]

        if(null != proc?.fields[procedureHomeId])
            heading.content[0].marks = [[
                type: "link",
                attrs: [ href: proc?.fields[procedureHomeId] ]
            ]]
        
        procedureUpdates.content.add(heading)
        procedureUpdates.content.add([
            type: "paragraph",
            content: [[
                type: "text",
                text: "Current status and need for improvements.",
            ]]
        ])
    }
}
else
    logger.info("Could not list ${processCode} procedures (${result.status})")

// find all active KPIs
result = get("/rest/api/3/search/jql?fields=key,summary,status&jql=project%3D${processCode}%20and%20issuetype%3D%22Key%20Performance%20Indicator%22%20and%20status!%3DInactive")
    .asObject(Map)

if(result.status >= 200 && result.status < 300) {
    for(def kpi : result.body.issues) {

        def heading = [
            type: "heading",
            attrs: [ level: 3 ],
            content: [[
                type: "text",
                text: kpi.fields?.summary,
                marks: [[
                    type: "link",
                    attrs: [ href: "/browse/${kpi?.key}" ]
                ]]
            ]]
        ]

        kpiUpdates.content.add(heading)
        kpiUpdates.content.add([
            type: "paragraph",
            content: [[
                type: "text",
                text: "Current status and need for improvements.",
            ]]
        ])
    }
}
else
    logger.info("Could not list ${processCode} KPIs (${result.status})")

// create Process Review ticket in the correct Jira project
def assignee = null
if(null != processOwner)
    assignee = [ accountId: processOwner ]
else if(null != processManager)
    assignee = [ accountId: processManager ]

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

result = post("/rest/api/3/issue")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            project: [ key: processCode ],
            issuetype: [ name: "Process Review" ],
            summary: "Review of process ${processCode} on ${reviewDate}",
            assignee: assignee,
            description: processReviewGuide,
            (definitionUpdatesId): definitionUpdates,
            (policyUpdatesId): policyUpdates,
            (procedureUpdatesId): procedureUpdates,
            (kpiUpdatesId): kpiUpdates,
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
    logger.info("Could not add comment to process ${issue.key} (${result.status})")
