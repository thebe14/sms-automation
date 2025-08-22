// name: Count work items
// description: Returns number of work items matching a query
// body type: None
// output type: Inline
// params:
//      query - string, required - JQL query to search for work items
//      bold - boolean - Whether to make the returned string bold

def bold = parameters.bold as boolean
if(null == bold)
    bold = false

if(null == parameters.query || parameters.query.isBlank())
    return bold ? "<strong>-</strong>" : "-"


/***
 * Count the tickets that match the JQL query
 * @param query is a JQL query that contains placeholders enclosed in braces {}
 * @param kpi is the linked KPI ticket
 * @param customFields are all the fields defined in Jira
 * @returns tuple { success, count, result } where result is the Jira API response
 */
def countTickets(String query) {
    if(null == query)
        return [ success: false ]

    def result = post("/rest/api/3/search/approximate-count") 
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .body([
            jql: query,
        ])
        .asObject(Map)

    def success = result.status >= 200 && result.status < 300
    if(!success) {
        logger.info("Query: ${query}")
        logger.info("Could not count tickets (${result.status})")
    }

    def response = [:]
    response.result = result
    response.success = success
    if(success) {
        response.count = result?.body?.count
        logger.info("Query: ${query}")
        logger.info("Count: ${response.count}")
    }

    return response
}

def text = "" as String
def result = countTickets(parameters.query)

if(null != result && result.success)
    text = result.count.toString()

return bold ? "<strong>${text}</strong>" : text
