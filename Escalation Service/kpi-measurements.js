// schedule: Every hour, every day
// jql: issuetype="Key Performance Indicator" AND status in (Active, "Escalated to Process Owner", "Escalated to SMS owner") AND "Next measurement[Time stamp]" < now() ORDER BY cf[10161] ASC
// run as: LF

import java.util.Date
import java.time.LocalDate
import java.text.SimpleDateFormat

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

// create new Measurement ticket
def now = LocalDate.now()
result = post("/rest/api/3/issue")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            project: [ key: kpi.fields["project"]?.key ],
            issuetype: [ name: "Measurement" ],
            summary: "${summary} at ${now.year}.${String.format('%02d', now.monthValue)}.${String.format('%02d', now.dayOfMonth)}",
        ],
        update:[
            issuelinks: [[
                add: [
                    type: [ name: "KPI-Measurement" ],
                    inwardIssue: [ key: kpi.key ]
                ]
            ]]
        ],
    ])
    .asObject(Map)

if(result.status < 200 || result.status >= 300) {
    logger.info("Could not create measurement for KPI ${kpi.key} (${result.status})")
    return
}

logger.info("Created measurement ${result.body.key} for KPI ${summary}")

// get custom fields
def customFields = get("/rest/api/3/field")
    .header("Accept", "application/json")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

def dateTimeFormatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ")

def frequencyId = customFields.find { it.name == 'Measurement frequency' }?.id?.toString()
def nextMeasurementId = customFields.find { it.name == 'Next measurement' }?.id?.toString()

def frequency = kpi.fields[frequencyId]?.value as String
def nextMeasurement = kpi.fields[nextMeasurementId] as String
def nextMeasurementDate = null != nextMeasurement ? dateTimeFormatter.parse(nextMeasurement) : null as Date

logger.info("frequency ${frequency}")

// update the "Next measurement" field of the KPI ticket
if(null != nextMeasurementDate) {
    if(null == frequency)
        // clear the "Next measurement" field, as we took a measurement on this datetime already
        nextMeasurementDate = null;
    else
        switch(frequency.toLowerCase()) {
            case "daily":
                nextMeasurementDate.setDate(nextMeasurementDate.getDate() + 1)
                break

            case "weekly":
                nextMeasurementDate.setDate(nextMeasurementDate.getDate() + 7)
                break

            case "monthly":
                nextMeasurementDate.setMonth(nextMeasurementDate.getMonth() + 1)
                break

            case "quarterly":
                nextMeasurementDate.setMonth(nextMeasurementDate.getMonth() + 3)
                break

            case "semiannually":
                nextMeasurementDate.setMonth(nextMeasurementDate.getMonth() + 6)
                break

            case "annually":
                nextMeasurementDate.setYear(nextMeasurementDate.getYear() + 1)
                break
        }
}

result = put("/rest/api/3/issue/${kpi.key}")
    .header("Content-Type", "application/json")
    .body([
        fields: [
            (nextMeasurementId): null != nextMeasurementDate ? dateTimeFormatter.format(nextMeasurementDate) : null,
        ]
    ])
    .asString()

if(result.status < 200 || result.status > 204) {
    logger.info("Could not update KPI ${kpi.key} (${result.status})")
    return
}

if(null != nextMeasurementDate)
    logger.info("Scheduled next measurement for ${issue.key} to ${nextMeasurementDate}")
else
    logger.info("Cleared next measurement for ${issue.key}")
