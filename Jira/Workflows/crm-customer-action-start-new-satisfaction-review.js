// workflow: CRM Customer Workflow
// on transition: Active -> Active (Start customer satisfaction review)
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

def customerNameId = customFields.find { it.name == 'Customer name' }?.id?.toString()
def customerOwnerId = customFields.find { it.name == 'Customer owner' }?.id?.toString()
def reviewOwnerId = customFields.find { it.name == 'Review owner' }?.id?.toString()
def reviewFrequencyId = customFields.find { it.name == 'Customer satisfaction review frequency' }?.id?.toString()
def projectNameId = customFields.find { it.name == 'Project name' }?.id?.toString()
def nameOfProjectId = customFields.find { it.name == 'Name of project' }?.id?.toString()

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
            (customerOwnerId): [ accountId: customerOwner ],
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

def newSatReview = result.body as Map
logger.info("Created satisfaction review ${newSatReview.key} for customer ${customerName}")

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
                        text: "${newSatReview.key}",
                        marks: [[
                            type: "link",
                            attrs: [ href: "/browse/${newSatReview.key}" ]
                        ]]
                    ]
                ]
            ]]
        ]
    ])
    .asString()

if(result.status < 200 || result.status > 204)
    logger.info("Could not add comment to customer ${issue.key} (${result.status})")

// create Achievement tickets for all active projects of this customer
def projects = []
def links = issue.fields?.issuelinks as Map

for(def link : links)
    if(link?.type.name.equals("Project") && null != link?.outwardIssue)
        projects.add(link.outwardIssue)

// for all linked projects...
for(def project : projects) {
    // if we don't have the status of the project, get it
    if(null == project.fields?.status || null == project.fields[projectNameId]) {
        result = get("/rest/api/3/issue/${project.key}")
            .header("Content-Type", "application/json")
            .asObject(Map)

        if(result.status < 200 || result.status > 204) {
            logger.info("Could not get project ${project.key} (${result.status})")
            continue
        }

        project = result.body
    }

    // if the project is in preparation or in production
    if(!['To Do', 'Canceled', 'Decommissioned'].contains(project.fields?.status?.name)) {
        // create new Achievement ticket for it
        def projectName = project.fields[projectNameId] as String
        def inProduction = ['In Production', 'Handover'].contains(project.fields?.status?.name)
        result = post("/rest/api/3/issue")
            .header("Content-Type", "application/json")
            .body([
                fields:[
                    project: [ key: projectKey ],
                    issuetype: [ name: "Achievement" ],
                    summary: "Achievement for ${projectName} in ${inProduction ? 'production' : 'preparation'} on ${reviewDate}",
                    assignee: [ accountId: customerOwner ],
                    (reviewOwnerId): [ accountId: customerOwner ],
                    (nameOfProjectId): projectName,
                ],
                update:[
                    issuelinks: [[
                        add: [
                            type: [ name: "Achievement" ],
                            inwardIssue: [ key: newSatReview.key ]
                        ]
                    ]]
                ],
            ])
            .asObject(Map)

        if(result.status < 200 || result.status > 204) {
            logger.info("Could not create achievement for project ${projectName} (${result.status})")
            continue
        }

        def newAchievement = result.body as Map
        logger.info("Created achievement ${newAchievement.key} for project ${projectName}")

        // add a comment to the satisfaction review about the new achievement that was created
        result = post("/rest/api/3/issue/${newSatReview.key}/comment") 
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
                                text: "New achievement was created for ${projectName}, see ",
                            ],
                            [
                                type: "text",
                                text: "${newAchievement.key}",
                                marks: [[
                                    type: "link",
                                    attrs: [ href: "/browse/${newAchievement.key}" ]
                                ]]
                            ]
                        ]
                    ]]
                ]
            ])
            .asString()

        if(result.status < 200 || result.status > 204)
            logger.info("Could not add comment to satisfaction review ${newSatReview.key} (${result.status})")
    }
}
