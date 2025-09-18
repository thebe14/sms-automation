// on events: IssueCreated
// in projects: all
// run as: ScriptRunner add-on user
// conditions:
// ['Customer Database Review'].includes(issue.issueType.name)

def summary = issue.fields['summary'] as String
def ticketType = issue.fields.issuetype?.name?.toLowerCase()
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${ticketType} ${issue.key}")
    return
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

// get custom fields
def customFields = get("/rest/api/3/field")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

def processOwnerId = customFields.find { it.name == 'Process owner' }?.id?.toString()
def processManagerId = customFields.find { it.name == 'Process manager' }?.id?.toString()
def dbReviewGuideId = customFields.find { it.name == 'Database review guide' }?.id?.toString()

// find and fetch the correct process ticket
def process = getProcess("CRM", ["key", processOwnerId, processManagerId, dbReviewGuideId])
if(null == process)
    return

// get field values
def dbReviewGuide = process.fields[dbReviewGuideId]
def processOwner = process.fields[processOwnerId]?.accountId as String
def processManager = process.fields[processManagerId]?.accountId as String

def assignee = issue.fields.assignee
if(null == assignee) {
    if(null != processOwner)
        assignee = [ accountId: processOwner ]
    else if(null != processManager)
        assignee = [ accountId: processManager ]
}

// store the customer satisfaction review frequency on the customer ticket
def result = put("/rest/api/3/issue/${issue.key}")
    .queryString("overrideScreenSecurity", Boolean.TRUE)
    .header("Content-Type", "application/json")
    .body([
        fields:[
            assignee: assignee,
            (processOwnerId): [ accountId: processOwner ],
            (processManagerId): [ accountId: processManager ],
            description: dbReviewGuide,
        ],
    ])
    .asString()

if(result.status < 200 || result.status > 204)
    logger.info("Could not initialize ${ticketType} ${issue.key} (${result.status})")
