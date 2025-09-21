// on events: IssueCreated
// in projects: all
// run as: ScriptRunner add-on user
// conditions:
// ['Process Review'].includes(issue.issueType.name)

def summary = issue.fields['summary'] as String
def ticketType = issue.fields.issuetype?.name?.toLowerCase()
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${ticketType} ${issue.key}")
    return
}

/***
 * Fetch and return all users in a Jira group
 * @param groupName is the name of a user group in Jira
 * @param logMembers controls whether to log the members of the group
 * @returns array of users with { id, name }, null or error
 */
def getUsersInGroup(groupName, logMembers = false) {
    // first, get the group Id
    def result = get("/rest/api/3/groups/picker?query=${groupName}")
        .header("Content-Type", "application/json")
        .asObject(Map)

    if(result.status < 200 || result.status > 204) {
        logger.info("Could not get Id of group ${groupName} (${result.status})")
        return null
    }

    def groupInfo = result.body as Map
    def groupId = null as String
    for(def group : groupInfo.groups)
        if(groupName.equalsIgnoreCase(group["name"])) {
            groupId = group["groupId"]
            break
        }

    if(null == groupId) {
        logger.info("Could not extract Id of group ${groupName}")
        return null
    }

    // get the members of the group
    result = get("/rest/api/3/group/member?groupname=${groupName}&includeInactiveUsers=false")
        .header("Content-Type", "application/json")
        .asObject(Map)

    if(result.status < 200 || result.status > 204) {
        logger.info("Could not get members of group ${groupName} (${result.status})")
        return null
    }

    def users = []
    def names = []
    def groupMembers = result.body as Map
    for(def user : groupMembers.values) {
        users.add([ id: user["accountId"], name: user["displayName"] ])
        if(logMembers)
            names.add(user["displayName"]);
    }

    if(logMembers)
        logger.info("Group ${groupName}: ${names}")

    return users
}

/***
 * Fetch and return the correct Process ticket for the current Jira project
 * @param processCode is the SMS process code
 * @param fieldsToFetch is array with Ids of the fields to return, or null to get everything
 * @returns Process ticket, null or error
 */
def getProcess(processCode, fieldsToFetch) {
    // find the ticket of 
    def result = post("/rest/api/3/search/jql") 
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .body([
                fields: null != fieldsToFetch ? fieldsToFetch : [ "*all" ],
                jql: "project=SMS and issuetype='Process ${processCode}'",
                maxResults: 1
            ])
            .asObject(Map)

    if(result.status < 200 || result.status > 204) {
        logger.info("Could not search for ${processCode} process ticket (${result.status})")
        return null
    }

    if(null == result.body.issues || result.body.issues.isEmpty()) {
        logger.info("Could not find ${processCode} process ticket (${result.status})")
        return null
    }

    return result.body.issues[0]
}

def processCode = issue.fields.project?.key as String
def processOwnerGroup = "${processCode.toLowerCase()}-process-owner"
def processManagerGroup = "${processCode.toLowerCase()}-process-manager"

logger.info("Process: ${processCode}")

// get custom fields
def customFields = get("/rest/api/3/field")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

// get field values
def processOwnerId = customFields.find { it.name == 'Process owner' }?.id?.toString()
def processManagerId = customFields.find { it.name == 'Process manager' }?.id?.toString()
def stakeholdersId = customFields.find { it.name == 'Stakeholders' }?.id?.toString()
def processReviewGuideId = customFields.find { it.name == 'Process review guide' }?.id?.toString()
def processHomeId = customFields.find { it.name == 'Process homepage' }?.id?.toString()
def definitionUpdatesId = customFields.find { it.name == 'Process definition review and updates' }?.id?.toString()
def policyHomeId = customFields.find { it.name == 'Policy homepage' }?.id?.toString()
def procedureHomeId = customFields.find { it.name == 'Procedure homepage' }?.id?.toString()
def policyUpdatesId = customFields.find { it.name == 'Policy review and updates' }?.id?.toString()
def procedureUpdatesId = customFields.find { it.name == 'Procedure review and updates' }?.id?.toString()
def kpiUpdatesId = customFields.find { it.name == 'Performance indicator review and updates' }?.id?.toString()
def reportUpdatesId = customFields.find { it.name == 'Report review and updates' }?.id?.toString()

// get the actual process owner and process manager from the relevant Jira groups
def processOwners = getUsersInGroup(processOwnerGroup)
def processManagers = getUsersInGroup(processManagerGroup)

def processOwner = processOwners?.find()
def processManager = processManagers?.find()

def stakeholders = []
if(null != processOwner) {
    stakeholders.add([ id: processOwner.id ])
    processOwner = [ accountId: processOwner.id ]
}
if(null != processManager) {
    stakeholders.add([ id: processManager.id ])
    processManager = [ accountId: processManager.id ]
}

def assignee = issue.fields.assignee
if(null == assignee) {
    if(null != processOwner)
        assignee = processOwner
    else if(null != processManager)
        assignee = processManager
}

// find and fetch the correct process ticket
def process = getProcess(processCode, ["*all"])
if(null == process)
    return

// get details from the process ticket
def processHome = process.fields[processHomeId] as String
def processReviewGuide = process.fields[processReviewGuideId]

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

// store current process owner and process manager on the review ticket,
// add them to the Stakeholders field, and init all review tabs
result = put("/rest/api/3/issue/${issue.key}")
    .queryString("overrideScreenSecurity", Boolean.TRUE)
    .header("Content-Type", "application/json")
    .body([
        fields:[
            description: processReviewGuide,
            assignee: assignee,
            (stakeholdersId): stakeholders,
            (processOwnerId): processOwner,
            (processManagerId): processManager,
            (definitionUpdatesId): definitionUpdates,
            (policyUpdatesId): policyUpdates,
            (procedureUpdatesId): procedureUpdates,
            (kpiUpdatesId): kpiUpdates,
            (reportUpdatesId): reportUpdates,
        ],
        update:[
            issuelinks: [[
                add: [
                    type: [ name: "Review" ],
                    inwardIssue: [ key: process.key ]
                ]
            ]]
        ],
    ])
    .asString()

if(result.status < 200 || result.status > 204)
    logger.info("Could not update ${processCode} process review ${issue.key} (${result.status})")
