// on events: IssueCreated, IssueUpdated
// in projects: SMS
// run as: ScriptRunner add-on user
// conditions:
// ['Process BA', 'Process BDS', 'Process CAPM', 'Process ChaRDM', 'Process COM',
//  'Process CONFM', 'Process CSI', 'Process CRM', 'Process FA', 'Process PROF',
//  'Process HR', 'Process ISM', 'Process ISRM', 'Process PM', 'Process PKM',
//  'Process PPM', 'Process PRM', 'Process RM', 'Process SACM', 'Process SUPPM',
//  'Process SLM', 'Process SPM', 'Process SRM', 'Process SMS'
// ].includes(issue.issueType.name)

String summary = issue.fields['summary']
String issueType = issue.fields?.issuetype?.name
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${issueType.toLowerCase()} ${issue.key}")
    return
}

def jiraUser = "myuser@mydomain.org"
def jiraToken = "mytoken"

/***
 * Replace members of a Jira group
 * @param groupName is the name of a user group in Jira
 * @param users is a map of the new group members, having accountID as key and displayName as value
 * @param jiraUser is the email address of a Jira user with permissions to add/remove users to/from groups
 * @param jiraToken is an access token for the Jira user
 * @returns true on success
 */
boolean setUsersInGroup(String groupName, Map users, String jiraUser, String jiraToken) {
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
        if(groupName?.equalsIgnoreCase(group["name"])) {
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
                    continue
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

/***
 * Get the users from a multi-user picker field
 * @param process is the process ticket
 * @param fieldId is the ID of a multi-user picker field
 * @returns map of users, having accountID as key and displayName as value
 */
Map getUsersInField(process, fieldId, logGroupUsers = false) {
    if(null == process || null == fieldId)
        return null

    if(logGroupUsers)
        logger.info("Users in field ${fieldId}:")

    def users = [:]
    def usersField = process?.fields[fieldId] as Map
    if(null != usersField) {
        for(def user : usersField) {
            if(null == user || null == user?.accountId || null == user?.displayName)
                continue

            users.put(user.accountId, user.displayName)

            if(logGroupUsers)
                logger.info("${user.displayName}")
        }

        return users
    }

    return null
}

/***
 * Get the users from a multi-user picker field
 * @param process is the process ticket
 * @param fieldId is the ID of a multi-user picker field
 * @returns map of users, having accountID as key and displayName as value
 */
def duplicateMultiUserField(process, fieldId) {
    if(null == process || null == fieldId)
        return null

    def users = []
    def usersField = process.fields[fieldId] as Map
    if(null != usersField) {
        for(def user : usersField) {
            if(null == user || null == user?.accountId)
                continue

            users.push([ accountId: user.accountId ])
        }

        return users
    }

    return null
}

/***
 * Compare two multi-user picker fields
 * @param process is the process ticket
 * @param groupOne is the ID a multi-user picker field
 * @param groupTwo is the ID of another multi-user picker field
 * @returns true if members in the two fields are the same (order does not matter)
 */
def groupCompositionChanged(process, groupOneId, groupTwoId, logGroupUsers = false) {
    def groupOne = getUsersInField(process, groupOneId, logGroupUsers)
    def groupTwo = getUsersInField(process, groupTwoId, logGroupUsers)

    if((null == groupOne) != (null == groupTwo))
        // one group is empty, the other is not
        return true

    if(null == groupOne)
        // both groups are empty
        return false

    // both groups non empty
    for(def user : groupOne) {
        if(!groupTwo.containsKey(user.key))
            return true
    }
    for(def user : groupTwo) {
        if(!groupOne.containsKey(user.key))
            return true
    }

    return false
}

// get custom fields
def customFields = get("/rest/api/2/field")
    .header("Accept", "application/json")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

// get field values
def processCode = null as String
switch(issueType) {
    case "Process BA": processCode = "BA"; break
    case "Process BDS": processCode = "BDS"; break
    case "Process CAPM": processCode = "CAPM"; break
    case "Process ChaRDM": processCode = "CHARDM"; break
    case "Process COM": processCode = "COM"; break
    case "Process CONFM": processCode = "CONFM"; break
    case "Process CSI": processCode = "CSI"; break
    case "Process CRM": processCode = "CRM"; break
    case "Process FA": processCode = "FA"; break
    case "Process PROF": processCode = "PROF"; break
    case "Process HR": processCode = "HR"; break
    case "Process ISM": processCode = "ISM"; break
    case "Process ISRM": processCode = "ISRM"; break
    case "Process PM": processCode = "PM"; break
    case "Process PKM": processCode = "PKM"; break
    case "Process PPM": processCode = "PPM"; break
    case "Process PRM": processCode = "PRM"; break
    case "Process RM": processCode = "RM"; break
    case "Process SACM": processCode = "SACM"; break
    case "Process SUPPM": processCode = "SUPPM"; break
    case "Process SLM": processCode = "SLM"; break
    case "Process SPM": processCode = "SPM"; break
    case "Process SRM": processCode = "SRM"; break
    case "Process SMS": processCode = "SMS"; break
}

def processCodeId = customFields.find { it.name == 'Process code' }?.id?.toString()
def smsOwnerId = customFields.find { it.name == 'SMS owner' }?.id?.toString()
def processOwnerId = customFields.find { it.name == 'Process owner' }?.id?.toString()
def processOwnerOldId = customFields.find { it.name == 'Process owner old' }?.id?.toString()
def smsManagerId = customFields.find { it.name == 'SMS manager' }?.id?.toString()
def processManagerId = customFields.find { it.name == 'Process manager' }?.id?.toString()
def processManagerOldId = customFields.find { it.name == 'Process manager old' }?.id?.toString()
def processStaffId = customFields.find { it.name == 'Process staff' }?.id?.toString()
def processStaffOldId = customFields.find { it.name == 'Process staff old' }?.id?.toString()

def smsProcess = (null != processCode) && processCode.equals("SMS")
def smsCoordinationTeamId = smsProcess ? customFields.find { it.name == 'SMS coordination team' }?.id?.toString() : null
def smsCoordinationTeamOldId = smsProcess ? customFields.find { it.name == 'SMS coordination team old' }?.id?.toString() : null
def ictManagerId = smsProcess ? customFields.find { it.name == 'ICT manager' }?.id?.toString() : null
def ictManagerOldId = smsProcess ? customFields.find { it.name == 'ICT manager old' }?.id?.toString() : null
def supportStaffId = smsProcess ? customFields.find { it.name == 'IT support staff' }?.id?.toString() : null
def supportStaffOldId = smsProcess ? customFields.find { it.name == 'IT support staff old' }?.id?.toString() : null

def hrProcess = (null != processCode) && processCode.equals("HR")
def financeControlManagerId = hrProcess ? customFields.find { it.name == 'Finance and control manager' }?.id?.toString() : null
def financeControlManagerOldId = hrProcess ? customFields.find { it.name == 'Finance and control manager old' }?.id?.toString() : null
def hrAdminAssistantId = hrProcess ? customFields.find { it.name == 'HR administrative assistant' }?.id?.toString() : null
def hrAdminAssistantOldId = hrProcess ? customFields.find { it.name == 'HR administrative assistant old' }?.id?.toString() : null
def hrSpecialistsId = hrProcess ? customFields.find { it.name == 'HR specialists' }?.id?.toString() : null
def hrSpecialistsOldId = hrProcess ? customFields.find { it.name == 'HR specialists old' }?.id?.toString() : null

def ismProcess = (null != processCode) && processCode.equals("ISM")
def infosecRiskManagerId = ismProcess ? customFields.find { it.name == 'Information security risk manager' }?.id?.toString() : null
def infosecRiskManagerOldId = ismProcess ? customFields.find { it.name == 'Information security risk manager old' }?.id?.toString() : null
def dataProtectionOfficerId = ismProcess ? customFields.find { it.name == 'Data protection officer' }?.id?.toString() : null
def dataProtectionOfficerOldId = ismProcess ? customFields.find { it.name == 'Data protection officer old' }?.id?.toString() : null

def processOwner = issue.fields[smsProcess ? smsOwnerId : processOwnerId]?.accountId as String
def processOwnerOld = issue.fields[processOwnerOldId] as String
def processManager = issue.fields[smsProcess ? smsManagerId : processManagerId]?.accountId as String
def processManagerOld = issue.fields[processManagerOldId] as String
def financeControlManager = hrProcess ? issue.fields[financeControlManagerId]?.accountId : null as String
def financeControlManagerOld = hrProcess ? issue.fields[financeControlManagerOldId] : null as String
def hrAdminAssistant = hrProcess ? issue.fields[hrAdminAssistantId]?.accountId : null as String
def hrAdminAssistantOld = hrProcess ? issue.fields[hrAdminAssistantOldId] : null as String
def infosecRiskManager = ismProcess ? issue.fields[infosecRiskManagerId]?.accountId : null as String
def infosecRiskManagerOld = ismProcess ? issue.fields[infosecRiskManagerOldId] : null as String
def dataProtectionOfficer = ismProcess ? issue.fields[dataProtectionOfficerId]?.accountId : null as String
def dataProtectionOfficerOld = ismProcess ? issue.fields[dataProtectionOfficerOldId] : null as String
def ictManager = ismProcess ? issue.fields[ictManagerId]?.accountId : null as String
def ictManagerOld = ismProcess ? issue.fields[ictManagerOldId] : null as String

def staffChanged = false
def ownerChanged = (null == processOwner) != (null == processOwnerOld) || // both null or non-null
                   (null != processOwner && !processOwner.equals(processOwnerOld))

def managerChanged = (null == processManager) != (null == processManagerOld) || // both null or non-null
                     (null != processManager && !processManager.equals(processManagerOld))

def changes = new ArrayList<String>()
if(ownerChanged)
    changes.add("owner")
if(managerChanged)
    changes.add("manager")
if(!smsProcess && groupCompositionChanged(issue, processStaffId, processStaffOldId)) {
    changes.add("staff")
    staffChanged = true
}

def smsCoordTeamChanged = false
def ictManagerChanged = false
def supportStaffChanged = false
def financeControlManagerChanged = false
def hrSpecialistsChanged = false
def hrAdminAssistantChanged = false
def infosecRiskManagerChanged = false
def dataProtectionOfficerChanged = false
switch(processCode) {
    case "SMS":
        if(groupCompositionChanged(issue, smsCoordinationTeamId, smsCoordinationTeamOldId)) {
            smsCoordTeamChanged = true
            changes.add("SMS coord team")
        }
        if((null == ictManager) != (null == ictManagerOld) || // both null or non-null
           (null != ictManager && !ictManager.equals(ictManagerOld))) {
            ictManagerChanged = true
            changes.add("ICT manager")
        }
        if(groupCompositionChanged(issue, supportStaffId, supportStaffOldId)) {
            supportStaffChanged = true
            changes.add("IT support staff")
        }
        break

    case "HR":
        if((null == financeControlManager) != (null == financeControlManagerOld) || // both null or non-null
           (null != financeControlManager && !financeControlManager.equals(financeControlManagerOld))) {
            financeControlManagerChanged = true
            changes.add("finance control manager")
        }
        if(groupCompositionChanged(issue, hrSpecialistsId, hrSpecialistsOldId)) {
            hrSpecialistsChanged = true
            changes.add("HR specialists")
        }
        if((null == hrAdminAssistant) != (null == hrAdminAssistantOld) || // both null or non-null
           (null != hrAdminAssistant && !hrAdminAssistant.equals(hrAdminAssistantOld))) {
            hrAdminAssistantChanged = true
            changes.add("HR admin assistant")
        }
        break

    case "ISM":
        if((null == infosecRiskManager) != (null == infosecRiskManagerOld) || // both null or non-null
           (null != infosecRiskManager && !infosecRiskManager.equals(infosecRiskManagerOld))) {
            infosecRiskManagerChanged = true
            changes.add("infosec risk manager")
        }
        if((null == dataProtectionOfficer) != (null == dataProtectionOfficerOld) || // both null or non-null
           (null != dataProtectionOfficer && !dataProtectionOfficer.equals(dataProtectionOfficerOld))) {
            dataProtectionOfficerChanged = true
            changes.add("data protection officer")
        }
        break
}

if(changes.isEmpty()) {
    logger.info("No relevant changes for ${issue.key}")
    return
}

logger.info("Changed ${String.join(', ', changes)} for ${issue.key}")

def fieldsUpdate = [:]
fieldsUpdate[(processCodeId)] = processCode
fieldsUpdate[(processStaffOldId)] = duplicateMultiUserField(issue, processStaffId)

if(ownerChanged && null != processCode) {
    def processOwnerGroup = "${processCode.toLowerCase()}-${smsProcess ? '' : 'process-'}owner"
    def processOwnerName = issue.fields[smsProcess ? smsOwnerId : processOwnerId]?.displayName as String
    def users = [:]
    users[processOwner] = processOwnerName
    setUsersInGroup(processOwnerGroup, users, jiraUser, jiraToken)
    fieldsUpdate[(processOwnerOldId)] = processOwner
}

if(managerChanged && null != processCode) {
    def processManagerGroup = "${processCode.toLowerCase()}-${smsProcess ? '' : 'process-'}manager"
    def processManagerName = issue.fields[smsProcess ? smsManagerId : processManagerId]?.displayName as String
    def users = [:]
    users[processManager] = processManagerName
    setUsersInGroup(processManagerGroup, users, jiraUser, jiraToken)
    fieldsUpdate[(processManagerOldId)] = processManager
}

if(staffChanged &&  null != processCode) {
    def processStaffGroup = "${processCode.toLowerCase()}-process-staff"
    def users = getUsersInField(issue, processStaffId)
    setUsersInGroup(processStaffGroup, users, jiraUser, jiraToken)
    fieldsUpdate[(processStaffOldId)] = duplicateMultiUserField(issue, processStaffId)
}

switch(processCode) {
    case "SMS":
        if(smsCoordTeamChanged) {
            def users = getUsersInField(issue, smsCoordinationTeamId)
            setUsersInGroup("sms-coordination-team", users, jiraUser, jiraToken)
            fieldsUpdate[(smsCoordinationTeamOldId)] = duplicateMultiUserField(issue, smsCoordinationTeamId)

            // always set the process owner and process manager fields too, even if they are not visible on the Process SMS ticket
            fieldsUpdate[(processOwnerId)] = processOwner
            fieldsUpdate[(processManagerId)] = processManager
        }
        if(ictManagerChanged) {
            def ictManagerName = issue.fields[ictManagerId]?.displayName as String
            def users = [:]
            users[ictManager] = ictManagerName
            setUsersInGroup("ict-manager", users, jiraUser, jiraToken)
            fieldsUpdate[(ictManagerOldId)] = ictManager
        }
        if(supportStaffChanged) {
            def users = getUsersInField(issue, supportStaffId)
            setUsersInGroup("it-support", users, jiraUser, jiraToken)
            fieldsUpdate[(supportStaffOldId)] = duplicateMultiUserField(issue, supportStaffId)
        }
        break

    case "HR":
        if(financeControlManagerChanged) {
            def financeControlManagerName = issue.fields[financeControlManagerId]?.displayName as String
            def users = [:]
            users[financeControlManager] = financeControlManagerName
            setUsersInGroup("hr-finance-and-control-manager", users, jiraUser, jiraToken)
            fieldsUpdate[(financeControlManagerOldId)] = financeControlManager
        }
        if(hrSpecialistsChanged) {
            def users = getUsersInField(issue, hrSpecialistsId)
            setUsersInGroup("hr-specialists", users, jiraUser, jiraToken)
            fieldsUpdate[(hrSpecialistsOldId)] = duplicateMultiUserField(issue, hrSpecialistsId)
        }
        if(hrAdminAssistantChanged) {
            def hrAdminAssistantName = issue.fields[hrAdminAssistantId]?.displayName as String
            def users = [:]
            users[hrAdminAssistant] = hrAdminAssistantName
            setUsersInGroup("hr-admin-assistant", users, jiraUser, jiraToken)
            fieldsUpdate[(hrAdminAssistantOldId)] = hrAdminAssistant
        }
        break

    case "ISM":
        if(infosecRiskManagerChanged) {
            def infosecRiskManagerName = issue.fields[infosecRiskManagerId]?.displayName as String
            def users = [:]
            users[infosecRiskManager] = infosecRiskManagerName
            setUsersInGroup("ism-security-risk-manager", users, jiraUser, jiraToken)
            fieldsUpdate[(infosecRiskManagerOldId)] = infosecRiskManager
        }
        if(dataProtectionOfficerChanged) {
            def dataProtectionOfficerName = issue.fields[dataProtectionOfficerId]?.displayName as String
            def users = [:]
            users[dataProtectionOfficer] = dataProtectionOfficerName
            setUsersInGroup("ism-data-protection-officer", users, jiraUser, jiraToken)
            fieldsUpdate[(dataProtectionOfficerOldId)] = dataProtectionOfficer
        }
        break
}

// update the process code and save backups for the role fields
def result = put("/rest/api/3/issue/${issue.key}")
    .queryString("overrideScreenSecurity", Boolean.TRUE)
    .header("Content-Type", "application/json")
    .body([
        fields: fieldsUpdate,
    ])
    .asString()

if(result.status < 200 || result.status > 204)
    logger.info("Could not update ${issue.key} (${result.status})")
