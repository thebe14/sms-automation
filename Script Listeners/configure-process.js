// on events: IssueCreated, IssueUpdated
// in projects: all
// run as: ScriptRunner add-on user
// conditions:
// ['Process'].includes(issue.issueType.name)

if(issue == null) {
    logger.info("No issue")
    return
}

def summary = issue.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ticket ${issue.key}")
    return
}

def jiraUser = "sms@mydomain.org"
def jiraToken = "mytoken"

/***
 * Replace members of a Jira group
 * @param groupName is the name of a user group in Jira
 * @param users is an array of the new group members, having accountID and displayName fields
 * @returns true on success
 */
def setUsersInGroup(groupName, users) {
    // first, get the group Id
    def result = get("/rest/api/2/groups/picker?query=${groupName}")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .asObject(Map)

    if(result.status < 200 || result.status > 204) {
        logger.info("Could not get Id of group ${groupName} (${result.status})")
        return false
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
        return false
    }

    // get the current members of the group
    result = get("/rest/api/3/group/member?groupname=${groupName}&includeInactiveUsers=true")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .asObject(Map)

    if(result.status < 200 || result.status > 204) {
        logger.info("Could not get members of group ${groupName} (${result.status})")
        return false
    }

    def oldUserIds = []
    def groupMembers = result.body as Map
    if(null != groupMembers && !groupMembers.isEmpty())
        for(def member : groupMembers.values) {
            if(null == member || null == member.accountId)
                continue

            // and remove them from the group
            def accountId = member["accountId"]
            result = delete("/rest/api/3/group/user?groupId=${groupId}&accountId=${accountId}")
                        .basicAuth(jiraUser, jiraToken)
                        .asObject(Map)

            if(result.status < 200 || result.status > 204) {
                logger.info("Could not remove user ${member["displayName"]} from group ${groupName} (${result.status})")
                return false
            }

            logger.info("Removed user ${member["displayName"]} from group ${groupName}")
        }

    // add the new members of the group
    for(def user : users) {
        if(null == user || null == user.accountId)
            continue

        result = post("/rest/api/3/group/user?groupId=${groupId}")
            .basicAuth(jiraUser, jiraToken)
            .header("Content-Type", "application/json")
            .body([ accountId: user.accountId ])
            .asString()

        if(result.status < 200 || result.status > 204) {
            logger.info("Could not add user ${user.displayName} to group ${groupName} (${result.status})")
            return false
        }

        logger.info("Added user ${user.displayName} to group ${groupName}")
    }

    return true
}

// get custom fields
def customFields = get("/rest/api/2/field")
    .header("Accept", "application/json")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

def processId = customFields.find { it.name == 'SMS process' }?.id?.toString()
def processOldId = customFields.find { it.name == 'SMS process old' }?.id?.toString()
def processCodeId = customFields.find { it.name == 'Process code' }?.id?.toString()
def processOwnerId = customFields.find { it.name == 'Process owner' }?.id?.toString()
def processOwnerOldId = customFields.find { it.name == 'Process owner old' }?.id?.toString()
def processManagerId = customFields.find { it.name == 'Process manager' }?.id?.toString()
def processManagerOldId = customFields.find { it.name == 'Process manager old' }?.id?.toString()

def process = issue.fields[processId]?.value as String
def processOld = issue.fields[processOldId] as String
def processOwner = issue.fields[processOwnerId]?.accountId as String
def processOwnerName = issue.fields[processOwnerId]?.displayName as String
def processManager = issue.fields[processManagerId]?.accountId as String
def processManagerName = issue.fields[processManagerId]?.displayName as String
def processOwnerOld = issue.fields[processOwnerOldId] as String
def processManagerOld = issue.fields[processManagerOldId] as String

def processChanged = (null == process) != (null == processOld) || // both null or non-null
                     (null != process && 0 != process.compareTo(processOld))

def ownerChanged = (null == processOwner) != (null == processOwnerOld) || // both null or non-null
                   (null != processOwner && 0 != processOwner.compareTo(processOwnerOld))

def managerChanged = (null == processManager) != (null == processManagerOld) || // both null or non-null
                     (null != processManager && 0 != processManager.compareTo(processManagerOld))


def changes = new ArrayList<String>()
if(processChanged)
    changes.add("process")
if(ownerChanged)
    changes.add("owner")
if(managerChanged)
    changes.add("manager")
if(changes.isEmpty()) {
    logger.info("No relevant changes for ${issue.key}")
    return
}

logger.info("Changed ${String.join(', ', changes)} for ${issue.key}")

def processCode = null;
switch(process) {
    case "Budgeting and Accounting (BA)": processCode = "BA"; break
    case "Business Development and Stakeholder (BDS)": processCode = "BDS"; break
    case "Capacity Management (CAPM)": processCode = "CAPM"; break
    case "Change and Release Deployment Management (ChaRDM)": processCode = "CHARDM"; break
    case "Communications Management (COM)": processCode = "COM"; break
    case "Configuration Management (CONFM)": processCode = "CONFM"; break
    case "Continual Improvement (CSI)": processCode = "CSI"; break
    case "Customer Relationship Management (CRM)": processCode = "CRM"; break
    case "Finance Administration (FA)": processCode = "FA"; break
    case "Project Finance (PROF)": processCode = "PROF"; break
    case "Human Resources (HR)": processCode = "HR"; break
    case "Information Security Management (ISM)": processCode = "ISM"; break
    case "Incident and Service Request Management (ISRM)": processCode = "ISRM"; break
    case "Problem Management (PM)": processCode = "PM"; break
    case "Project Knowledge Management (PKM)": processCode = "PKM"; break
    case "Project Portfolio Management (PPM)": processCode = "PPM"; break
    case "Project Management (PRM)": processCode = "PRM"; break
    case "Risk management (RM)": processCode = "RM"; break
    case "Service Availability and Continuity Management (SACM)": processCode = "SACM"; break
    case "Supplier Relationship Management (SUPPM)": processCode = "SUPPM"; break
    case "Service Level Management (SLM)": processCode = "SLM"; break
    case "Service Portfolio Management (SPM)": processCode = "SPM"; break
    case "Service Reporting Management (SRM)": processCode = "SRM"; break
}

if(ownerChanged && null != processCode) {
    def processOwnerGroup = "${processCode.toLowerCase()}-process-owner"
    setUsersInGroup(processOwnerGroup, [[ accountId: processOwner, displayName: processOwnerName ]])
}

if(managerChanged && null != processCode) {
    def processManagerGroup = "${processCode.toLowerCase()}-process-manager"
    setUsersInGroup(processManagerGroup, [[ accountId: processManager, displayName: processManager ]])
}

// update the process code
def result = put("/rest/api/2/issue/${issue.key}") 
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (processCodeId): processCode,
            (processOldId): process,
            (processOwnerOldId): processOwner,
            (processManagerOldId): processManager,
        ],
    ])
    .asString()

logger.info("Returned: ${result.status}")
