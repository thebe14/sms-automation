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
 * Fetch and return the tickets matching a specific JQL query
 * @param jql is the JQL query to use to search
 * @param fieldsToFetch is array with Ids of the fields to return, or null to get everything
 * @param maxResults is the maximum number of tickets to return
 * @returns array of tickets (1K at most), null or error
 */
def findTickets(jql, fieldsToFetch, maxResults = 1000) {
    // find the ticket of 
    def result = post("/rest/api/3/search/jql") 
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .body([
                fields: null != fieldsToFetch ? fieldsToFetch : [ "*all" ],
                jql: jql,
                maxResults: maxResults
            ])
            .asObject(Map)

    if(result.status < 200 || result.status > 204) {
        logger.info("Could not search for tickets (${result.status})")
        return null
    }

    if(null == result.body.issues || result.body.issues.isEmpty()) {
        logger.info("Could not find tickets (${result.status})")
        return []
    }

    return result.body.issues
}

/***
 * Fetch and return the correct Process ticket for a Jira project
 * @param processCode is the SMS process code
 * @param fieldsToFetch is array with Ids of the fields to return, or null to get everything
 * @returns Process ticket, null or error
 */
def getProcess(processCode, fieldsToFetch) {
    // find the Process ticket of the specified SMS process
    def tickets = findTickets("project=SMS and issuetype='Process ${processCode}'", fieldsToFetch, 1)
    if(null == tickets || tickets.isEmpty())
        return null;
    
    return tickets[0]
}

// get custom fields
def customFields = get("/rest/api/3/field")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

def processOwnerId = customFields.find { it.name == 'Process owner' }?.id?.toString()
def processManagerId = customFields.find { it.name == 'Process manager' }?.id?.toString()
def dbReviewGuideId = customFields.find { it.name == 'Database review guide' }?.id?.toString()
def focusCustomersId = customFields.find { it.name == 'Focus on customers' }?.id?.toString()
def customerNameId = customFields.find { it.name == 'Customer name' }?.id?.toString()
def customerPriorityId = customFields.find { it.name == 'Customer priority' }?.id?.toString()
def customerOwnerId = customFields.find { it.name == 'Customer owner' }?.id?.toString()

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

// find high priority customers
def focusCustomers = null
def jql = "project=CRM and issuetype=Customer and 'Customer priority[Dropdown]' in ('Strategic community', 'Community with high number of users', 'Politically important growing community')"
def customers = findTickets(jql, ["key", "summary", customerOwnerId, customerNameId, customerPriorityId])
if(null != customers) {
    focusCustomers = [
        type: "doc",
        version: 1,
        content: [
            [
                type: "paragraph",
                content: [[
                    type: "text",
                    text: "These are the most important customers:",
                ]]
            ],
            [
                type: "bulletList",
                content: []
            ]
        ]
    ]

    for(def customer in customers) {
        def customerName = customer.fields[customerNameId] as String
        def customerPriority = customer.fields[customerPriorityId]?.value as String

        def listItem = [
            type: "listItem",
            content: [
                [
                    type: "paragraph",
                    content: [
                        [
                            type: "text",
                            text: customerName,
                            marks: [[
                                type: "link",
                                attrs: [ href: "/browse/${customer.key}" ]
                            ]]
                        ],
                        [
                            type: "text",
                            text: " is a ${customerPriority.toLowerCase()}"
                        ]
                    ]
                ]
            ]
        ]

        focusCustomers.content[1].content.add(listItem)
    }
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
            (focusCustomersId): focusCustomers
        ],
    ])
    .asString()

if(result.status < 200 || result.status > 204)
    logger.info("Could not initialize ${ticketType} ${issue.key} (${result.status})")
