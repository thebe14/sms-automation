// workflow: Key Performance Indicator Workflow
// on transition: EscalatedToProcessOwner -> EscalatedToSMSOwner
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
 * Calculate how many months, weeks, days, and hours between two dates
 * @param fromDateTime is the start of the period
 * @param toDateTime is the end of the period
 * @returns periods since passed in date as { months, weeks, days, hours, text }, null or error
 */
def dateTimeDiff(Date fromDateTime, Date toDateTime = new Date()) {
    if(null == fromDateTime || null == toDateTime)
        return null

    if(fromDateTime > toDateTime) {
        def temp = fromDateTime
        fromDateTime = toDateTime
        toDateTime = temp
    }

    long oneHourMs = 1000 * 60 * 60 
    long oneDayMs = oneHourMs * 24
    long diffMs = toDateTime.getTime() - fromDateTime.getTime()
    double diffHours = Math.floor(diffMs / oneHourMs)
    double diffDays = Math.floor(diffMs / oneDayMs)
    int years = Math.floor(diffDays / 365)
    int months = Math.floor(diffDays / 30.44) % 12
    int days = Math.floor(diffDays - (years * 365) - (Math.floor(months * 30.44)))
    int hours = Math.floor(diffHours - (years * 365 * 24) - (Math.floor(months * 30.44 * 24)) - (days * 24))

    String text = ""
    if(years > 0)
        text = "${years} year${years > 1 ? "s" : ""}"

    if(months > 0) {
        def isLast = 0 == days || 0 == hours
        text = "${text}${isLast ? " and " : (text.isEmpty() ? "" : ", ")}${months} month${months > 1 ? "s" : ""}"
    }

    if(days > 0) {
        def isLast = 0 == hours
        text = "${text}${isLast ? " and " : (text.isEmpty() ? "" : ", ")}${days} day${days > 1 ? "s" : ""}"
    }

    if(hours > 0)
        text = "${text}${text.isEmpty() ? "" : " and "}${hours} hour${hours > 1 ? "s" : ""}"
    
    return [ years: years, months: months, days: days, hours: hours, text: text ]
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

def smsOwnerId = customFields.find { it.name == 'SMS owner' }?.id?.toString()
def escalateUnitsId = customFields.find { it.name == 'Escalate KPI units' }?.id?.toString()
def escalatedOnId = customFields.find { it.name == 'Escalated on' }?.id?.toString()

// get the SMS process
def process = getProcess("SMS", ["key", smsOwnerId, escalatedOnId, escalateUnitsId])
if(null == process)
    return

def smsOwner = process.fields[smsOwnerId]?.accountId as String
def smsOwnerName = process.fields[smsOwnerId]?.displayName as String

// assign to SMS owner
def assignee = null != issue.fields.assignee ? [ accountId: issue.fields.assignee.accountId ] : null

if(null != smsOwner)
    assignee = [ accountId: smsOwner ]

def result = put("/rest/api/3/issue/${issue.key}")
    .header("Content-Type", "application/json")
    .body([
        fields: [
            assignee: assignee,
        ]
    ])
    .asString()

if(result.status < 200 || result.status > 204)
    logger.info("Could not update KPI ${issue.key} (${result.status})")

// add a comment about escalation
def dateTimeFormatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ")
def escalateUnits = process.fields[escalateUnitsId]?.value as String
def escalatedOn = issue.fields[escalatedOnId] as String
def escalatedOnDate = null != escalatedOn ? dateTimeFormatter.parse(escalatedOn) : null as Date
def since = dateTimeDiff(escalatedOnDate)

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
                        text: "This KPI has been escalated to SMS owner ${smsOwnerName} after being escalated to process owner for ${since.text}.",
                    ],
                ]
            ]]
        ]
    ])
    .asString()

if(result.status < 200 || result.status > 204)
    logger.info("Could not add comment to KPI ${issue.key} (${result.status})")
