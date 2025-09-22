// workflow: Key Performance Indicator Workflow
// on transition: Active -> EscalatedToProcessOwner
// run as: ScriptRunner add-on user
// conditions: true

import java.util.Date
import java.text.SimpleDateFormat

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

// get the actual process owner
def projectKey = issue.fields.project?.key as String
def processOwnerGroup = "${projectKey.toLowerCase()}-process-owner"
def processOwners = getUsersInGroup(processOwnerGroup)
def processOwner = processOwners?.find()

// get custom fields
def customFields = get("/rest/api/3/field")
    .header("Accept", "application/json")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

def escalatedOnId = customFields.find { it.name == 'Escalated on' }?.id?.toString()

// record escalation datetime and assign to process owner
def dateTimeFormatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ")
def now = new Date()

def assignee = null != issue.fields.assignee ? [ accountId: issue.fields.assignee.accountId ] : null

if(null != processOwner)
    assignee = [ accountId: processOwner.id ]

def result = put("/rest/api/3/issue/${issue.key}")
    .header("Content-Type", "application/json")
    .body([
        fields: [
            assignee: assignee,
            (escalatedOnId): dateTimeFormatter.format(now),
        ]
    ])
    .asString()

if(result.status < 200 || result.status > 204)
    logger.info("Could not update KPI ${issue.key} (${result.status})")

// add a comment about escalation
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
                        text: "This KPI has been escalated to process owner ${processOwner.name}.",
                    ],
                ]
            ]]
        ]
    ])
    .asString()

if(result.status < 200 || result.status > 204)
    logger.info("Could not add comment to KPI ${issue.key} (${result.status})")
