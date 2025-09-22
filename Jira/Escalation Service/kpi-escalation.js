// schedule: Every hour, every day
// jql: issuetype="Key Performance Indicator" AND status = "Escalated to Process Owner" AND "Escalated on[Time stamp]" != EMPTY ORDER BY cf[11081] ASC
// run as: LF

import java.util.Date
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

if(issue == null) {
    logger.info("No issue")
    return
}

def result = get("/rest/api/3/issue/${issue.key}")
    .header("Content-Type", "application/json")
    .asObject(Map)

if(result.status < 200 || result.status > 204) {
    logger.info("Could not get KPI ${issue.key} (${result.status})")
    return
}

def kpi = result.body
def summary = kpi.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test KPI ${kpi.key}")
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
 * @returns process ticket, null or error
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
    .header("Accept", "application/json")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

def escalateAfterId = customFields.find { it.name == 'Escalate KPI to SMS owner after' }?.id?.toString()
def escalateUnitsId = customFields.find { it.name == 'Escalate KPI units' }?.id?.toString()
def escalatedOnId = customFields.find { it.name == 'Escalated on' }?.id?.toString()

// get the SMS process
def process = getProcess("SMS", ["key", escalateAfterId, escalateUnitsId, escalatedOnId])
if(null == process)
    return

long escalateAfter = process.fields[escalateAfterId] as Number
def escalateUnits = process.fields[escalateUnitsId]?.value as String

if(null == escalateAfter || null == escalateUnits) {
    // escalation period not defined, noting to do
    return
}

def dateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSZ")
def escalatedOn = kpi.fields[escalatedOnId] as String
def escalatedOnDate = null != escalatedOn ? LocalDateTime.parse(escalatedOn, dateTimeFormatter) : null as LocalDateTime
def now = LocalDateTime.now()

switch(escalateUnits) {
    case "Months":
        escalatedOnDate = escalatedOnDate.plusMonths(escalateAfter)
        break

    case "Weeks":
        escalatedOnDate = escalatedOnDate.plusDays(escalateAfter * 7)
        break

    case "Days":
        escalatedOnDate = escalatedOnDate.plusDays(escalateAfter)
        break

    case "Hours":
        escalatedOnDate = escalatedOnDate.plusHours(escalateAfter)
        break
}

if(escalatedOnDate > now)
    // Not yet time to escalate further
    return

// get the possible transitions on the KPI
def transitions = [:]
result = get("/rest/api/3/issue/${kpi.key}/transitions")
    .header("Accept", "application/json")
    .asObject(Map)

if(result.status < 200 || result.status > 204) {
    logger.info("Could not get transitions of ${kpi.key} (${result.status})")
    return
}

for(def transition in result.body?.transitions)
    transitions[transition.name] = transition.id

def transName = "Escalate to SMS owner"
def transId = transitions[transName]

if(null == transId) {
    logger.info("${transName} transition not available on ${kpi.key}")
    return
}

// escalate KPI
result = post("/rest/api/3/issue/${kpi.key}/transitions")
    .header("Content-Type", "application/json")
    .body([
        transition: [
            id: transId,
        ]
    ])
    .asString()

if(result.status < 200 || result.status > 204) {
    logger.info("Could not transition KPI ${kpi.key} via ${transName} (${result.status})")
    return
}

logger.info("Escalated KPI ${kpi.key} to SMS owner")
