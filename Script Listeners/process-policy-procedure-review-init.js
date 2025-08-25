// on events: IssueCreated
// in projects: all
// run as: ScriptRunner add-on user
// conditions:
// ['Process Review', 'Policy Review', 'Procedure Review'].includes(issue.issueType.name)

def summary = issue.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${issue.fields.issuetype.name.toLowerCase()} ${issue.key}")
    return
}

/***
 * Fetch and return all users in a Jira group
 * @param groupName is the name of a user group in Jira
 * @param logMembers controls whether to log the members of the group
 * @returns array of user, null or error
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

    def ids = []
    def names = []
    def groupMembers = result.body as Map
    for(def user : groupMembers.values) {
        ids.add(user["accountId"])
        if(logMembers)
            names.add(user["displayName"]);
    }

    if(logMembers)
        logger.info("Group ${groupName}: ${names}")

    return ids
}

// determine value to select in field SMS process, based on the Jira project of the new issue
def projectKey = issue.fields.project.key.toLowerCase() as String
def processOwnerGroup = "${projectKey}-process-owner"
def processManagerGroup = "${projectKey}-process-manager"
def process = null

switch(projectKey.toUpperCase()) {
    case "BA": process = "Budgeting and Accounting (BA)"; break
    case "BDS": process = "Business Development and Stakeholder (BDS)"; break
    case "CAPM": process = "Capacity Management (CAPM)"; break
    case "CHARDM": process = "Change and Release Deployment Management (ChaRDM)"; break
    case "COM": process = "Communications Management (COM)"; break
    case "CONFM": process = "Configuration Management (CONFM)"; break
    case "CSI": process = "Continual Improvement (CSI)"; break
    case "CRM": process = "Customer Relationship Management (CRM)"; break
    case "FA": process = "Finance Administration (FA)"; break
    case "PROF": process = "Project Finance (PROF)"; break
    case "HR": process = "Human Resources (HR)"; break
    case "ISM": process = "Information Security Management (ISM)"; break
    case "ISRM": process = "Incident and Service Request Management (ISRM)"; break
    case "PM": process = "Problem Management (PM)"; break
    case "PKM": process = "Project Knowledge Management (PKM)"; break
    case "PPM": process = "Project Portfolio Management (PPM)"; break
    case "PRM": process = "Project Management (PRM)"; break
    case "RM": process = "Risk management (RM)"; break
    case "SACM": process = "Service Availability and Continuity Management (SACM)"; break
    case "SUPPM": process = "Supplier Relationship Management (SUPPM)"; break
    case "SLM": process = "Service Level Management (SLM)"; break
    case "SPM": process = "Service Portfolio Management (SPM)"; break
    case "SRM": process = "Service Reporting Management (SRM)"; break
    case "SMS": process = "Management System (SMS)"; break
}

if(null == process || process.isEmpty()) {
    logger.info("Unknown process code ${projectKey.toUpperCase()}")
    return
}

logger.info("Process: ${process}")

// get custom fields
def customFields = get("/rest/api/3/field")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

// get field values
def processId = customFields.find { it.name == 'SMS process' }?.id?.toString()
def processOwnerId = customFields.find { it.name == 'Process owner' }?.id?.toString()
def processManagerId = customFields.find { it.name == 'Process manager' }?.id?.toString()
def stakeholdersId = customFields.find { it.name == 'Stakeholders' }?.id?.toString()

def processOwners = getUsersInGroup(processOwnerGroup)
def processManagers = getUsersInGroup(processManagerGroup)

def processOwner = processOwners?.find()
def processManager = processManagers?.find()

def stakeholders = []
if(null != processOwner) {
    stakeholders.add([ id: processOwner ])
    processOwner = [ accountId: processOwner ]
}
if(null != processManager) {
    stakeholders.add([ id: processManager ])
    processManager = [ accountId: processManager ]
}

// store current process owner and process manager on the review ticket,
// and add them to the Stakeholders field
def result = put("/rest/api/3/issue/${issue.key}")
    .queryString("overrideScreenSecurity", Boolean.TRUE)
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (stakeholdersId): stakeholders,
            (processOwnerId): processOwner,
            (processManagerId): processManager,
            (processId): null != process ? [value: process] : null,
        ],
    ])
    .asObject(Map)

if(result.status < 200 || result.status > 204)
    logger.info("Could not update ${issue.fields.issuetype.name.toLowerCase()} ${issue.key} (${result.status})")
