// on events: IssueCreated
// in projects: all
// run as: ScriptRunner add-on user
// conditions:
// ['Customer'].includes(issue.issueType.name)

def summary = issue.fields.summary as String
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

def reviewFrequencyId = customFields.find { it.name == 'Customer satisfaction review frequency' }?.id?.toString()

// find and fetch the correct process ticket
def process = getProcess("CRM", ["key", reviewFrequencyId])
if(null == process)
    return

// store the customer satisfaction review frequency on the customer ticket
def reviewFrequency = process.fields[reviewFrequencyId]?.value as String

def result = put("/rest/api/3/issue/${issue.key}")
    .queryString("overrideScreenSecurity", Boolean.TRUE)
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (reviewFrequencyId): [ value: reviewFrequency ],
        ],
    ])
    .asString()

if(result.status < 200 || result.status > 204)
    logger.info("Could not initialize ${ticketType} ${issue.key} (${result.status})")
