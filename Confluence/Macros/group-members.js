// name: List group members
// description: Return the name of users that are member in a group, one per line
// body type: None
// output type: Block
// params:
//      groupName - string, required - The name of the group whose members to list

if(null == parameters.groupName || parameters.groupName.isBlank())
    return ""

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

def text = "" as String
def users = getUsersInGroup(parameters.groupName)

if(null != users)
    for(def user in users)
        text = "${text}${text.isBlank() ? "" : "<br/>"}${user.name}"

return text
