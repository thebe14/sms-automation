// workflow: CRM Customer Satisfaction Review Workflow
// on transition: InProgress -> InProgress (Suggest improvement)
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


def reviewOwnerId = customFields.find { it.name == 'Review owner' }?.id?.toString()
def customerOwnerId = customFields.find { it.name == 'Customer owner' }?.id?.toString()
def projectNameId = customFields.find { it.name == 'Name of project' }?.id?.toString()

def projectLinkId = customFields.find { it.name == 'Link to result' }?.id?.toString()
def usedServicesId = customFields.find { it.name == 'Used services' }?.id?.toString()
def usedVOsId = customFields.find { it.name == 'Used virtual organizations' }?.id?.toString()
def percentResourcesId = customFields.find { it.name == 'Percentage of our resources' }?.id?.toString()
def targetGroupId = customFields.find { it.name == 'Target user groups' }?.id?.toString()
def userCountId = customFields.find { it.name == 'Number of users' }?.id?.toString()
def userLocationsId = customFields.find { it.name == 'Location of users' }?.id?.toString()

def projectKey = issue.fields.project.key as String
def reviewOwner = issue.fields[reviewOwnerId]?.accountId as String
def customerOwner = issue.fields[customerOwnerId]?.accountId as String
def projectName = issue.fields[projectNameId] as String

def projectLink = issue.fields[projectLinkId] as String
def usedServices = issue.fields[usedServicesId]
def usedVOs = issue.fields[usedVOsId]
def percentResources = issue.fields[percentResourcesId] as String
def targetGroup = issue.fields[targetGroupId] as String
def userCount = issue.fields[userCountId]
def userLocations = issue.fields[userLocationsId]

if(null == reviewOwner)
    reviewOwner = customerOwner

// create new Improvement Suggestion ticket
def result = post("/rest/api/3/issue")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            project: [ key: projectKey ],
            issuetype: [ name: "Achievement" ],
            summary: "New suggestion",
            assignee: [ accountId: reviewOwner ],
            (reviewOwnerId): [ accountId: reviewOwner ],
            (projectNameId): projectName,
            (projectLinkId): projectLink,
            (usedServicesId): usedServices,
            (usedVOsId): usedVOs,
            (percentResourcesId): percentResources,
            (targetGroupId): targetGroup,
            (userCountId): userCount,
            (userLocationsId): userLocations,
        ],
        update:[
            issuelinks: [[
                add: [
                    type: [ name: "Achievement" ],
                    inwardIssue: [ key: issue.key ]
                ]
            ]]
        ],
    ])
    .asObject(Map)

if(result.status < 200 || result.status >= 300) {
    logger.info("Could not create suggestion for satisfaction review ${issue.key} (${result.status})")
    return
}

def newTicket = result.body as Map
logger.info("Created suggestion ${newTicket.key} for satisfaction review ${issue.key}")

// clear the suggestion details from the satisfaction review ticket, so new suggestions can be created clean
result = put("/rest/api/3/issue/${issue.key}")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (projectNameId): null,
            (projectLinkId): null,
            (usedServicesId): null,
            (usedVOsId): null,
            (percentResourcesId): null,
            (targetGroupId): null,
            (userCountId): null,
            (userLocationsId): null,
        ],
    ])
    .asString()

if(result.status < 200 || result.status >= 300)
    logger.info("Could not clear suggestion details from satisfaction review ${issue.key} (${result.status})")

// add a comment about the new suggestion that was created
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
                        text: " New improvement suggestion was recorded, see ",
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
    logger.info("Could not add comment to satisfaction review ${issue.key} (${result.status})")
