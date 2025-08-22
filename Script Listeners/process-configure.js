// on events: IssueCreated, IssueUpdated
// in projects: SMS
// run as: ScriptRunner add-on user
// conditions:
// ['Process',
//  'Process BA', 'Process BDS', 'Process CAPM', 'Process ChaRDM', 'Process COM',
//  'Process CONFM', 'Process CSI', 'Process CRM', 'Process FA', 'Process PROF',
//  'Process HR', 'Process ISM', 'Process ISRM', 'Process PM', 'Process PKM',
//  'Process PPM', 'Process PRM', 'Process RM', 'Process SACM', 'Process SUPPM',
//  'Process SLM', 'Process SPM', 'Process SRM', 'Process SMS'
// ].includes(issue.issueType.name)

if(issue == null) {
    logger.info("No issue")
    return
}

def summary = issue.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test process ${issue.key}")
    return
}

def jiraUser = "myuser@mydomain.org"
def jiraToken = "mytoken"

/***
 * Replace members of a Jira group
 * @param groupName is the name of a user group in Jira
 * @param users is a map of the new group members, having accountIDs as key and displayNames as value
 * @param jiraUser is the email address of a Jira user with permissions to add/remove users to/from groups
 * @param jiraToken is an access token for the Jira user
 * @returns true on success
 */
def setUsersInGroup(groupName, Map users, String jiraUser, String jiraToken) {
    // first, get the group Id
    def result = get("/rest/api/3/groups/picker?query=${groupName}")
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

            // check if this current member is also included in the new member list
            if(users.containsKey(member.accountId)) {
                // yes, remove from the list of users to add to the group (is already a member)
                users.remove(member.accountId)
                logger.info("User ${member.displayName} is already a member of group ${groupName}")
            }
            else {
                // nope, remove user from the group
                def accountId = member.accountId
                result = delete("/rest/api/3/group/user?groupId=${groupId}&accountId=${accountId}")
                            .basicAuth(jiraUser, jiraToken)
                            .asString()

                if(result.status < 200 || result.status > 204) {
                    logger.info("Could not remove user ${member.displayName} from group ${groupName} (${result.status})")
                    return false
                }

                logger.info("Removed user ${member.displayName} from group ${groupName}")
            }
        }

    // add the new members into the group
    for(def user in users) {
        if(null == user.key || null == user.value)
            continue

        result = post("/rest/api/3/group/user?groupId=${groupId}")
            .header("Content-Type", "application/json")
            .basicAuth(jiraUser, jiraToken)
            .body([ accountId: user.key ])
            .asString()

        if(result.status < 200 || result.status > 204) {
            logger.info("Could not add user ${user.value} to group ${groupName} (${result.status})")
            return false
        }

        logger.info("Added user ${user.value} to group ${groupName}")
    }

    return true
}

// get custom fields
def customFields = get("/rest/api/2/field")
    .header("Accept", "application/json")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

// get field values
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
    case "Risk Management (RM)": processCode = "RM"; break
    case "Service Availability and Continuity Management (SACM)": processCode = "SACM"; break
    case "Supplier Relationship Management (SUPPM)": processCode = "SUPPM"; break
    case "Service Level Management (SLM)": processCode = "SLM"; break
    case "Service Portfolio Management (SPM)": processCode = "SPM"; break
    case "Service Reporting Management (SRM)": processCode = "SRM"; break
    case "Management System (SMS)": processCode = "SMS"; break
}

if(ownerChanged && null != processCode) {
    def processOwnerGroup = "${processCode.toLowerCase()}-process-owner"
    def users = [:]
    users[processOwner] = processOwnerName
    setUsersInGroup(processOwnerGroup, users, jiraUser, jiraToken)
}

if(managerChanged && null != processCode) {
    def processManagerGroup = "${processCode.toLowerCase()}-process-manager"
    def users = [:]
    users[processManager] = processManagerName
    setUsersInGroup(processManagerGroup, users, jiraUser, jiraToken)
}

// update the process code
def result = put("/rest/api/3/issue/${issue.key}")
    .queryString("overrideScreenSecurity", Boolean.TRUE)
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

if(result.status < 200 || result.status > 204)
    logger.info("Could not update ${issue.key} (${result.status})")
