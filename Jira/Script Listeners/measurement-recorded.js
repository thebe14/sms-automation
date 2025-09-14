// on events: IssueUpdated
// in projects: all
// run as: ScriptRunner add-on user
// conditions:
// ['Measurement'].includes(issue.issueType.name)

import java.util.Date
import java.text.SimpleDateFormat

def summary = issue.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${issue.fields.issuetype.name.toLowerCase()} ${issue.key}")
    return
}

// get custom fields
def customFields = get("/rest/api/3/field")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

// get field values
def measuredValueId = customFields.find { it.name == 'Measured value' }?.id?.toString()
def measuredValueOldId = customFields.find { it.name == 'Measured value old' }?.id?.toString()

def measuredValue = issue.fields[measuredValueId] as String
def measuredValueOld = issue.fields[measuredValueOldId] as String

def measurementChanged = (null == measuredValue) != (null == measuredValueOld) || // both null or non-null
                         (null != measuredValue && !measuredValue.equalsIgnoreCase(measuredValueOld))

def changes = new ArrayList<String>()
if(measurementChanged)
    changes.add("measurement")
if(changes.isEmpty()) {
    logger.info("No relevant changes for ${issue.key}")
    return
}

logger.info("Changed ${String.join(', ', changes)} for ${issue.key}")

// find the KPI ticket linked with inward "is measurement for" relationship
def links = issue.fields['issuelinks'] as List
def kpi = null
for(def link : links) {
    def linkTypeName = link?.type?.name as String
    def linkedKPI = link?.inwardIssue
    if(null != linkTypeName && null != linkedKPI && linkTypeName.equalsIgnoreCase("Measurement")) {
        // found a linked KPI ticket
        kpi = linkedKPI
        break // ignore all but the first
    }
}

if(null == kpi) {
    logger.info("Measurement ${issue.key} not linked to KPI ticket")
    return
}

// store field backups on the ticket
def result = put("/rest/api/3/issue/${issue.key}") 
    .queryString("overrideScreenSecurity", Boolean.TRUE)
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (measuredValueOldId): measuredValue,
        ],
    ])
    .asString()

if(result.status < 200 || result.status > 204)
    logger.info("Could not save measurement backup to ${issue.key} (${result.status})")

// update the "Last measured value" and "Last measured on" fields of the linked KPI ticket
def lastMeasuredValueId = customFields.find { it.name == 'Last measured value' }?.id?.toString()
def lastMeasuredOnId = customFields.find { it.name == 'Last measured on' }?.id?.toString()

def dateTimeFormatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ")

result = put("/rest/api/3/issue/${kpi.key}")
    .header("Content-Type", "application/json")
    .body([
        fields: [
            (lastMeasuredValueId): measuredValue.toString(),
            (lastMeasuredOnId): dateTimeFormatter.format(new Date())
        ]
    ])
    .asObject(Map)

if(result.status < 200 || result.status > 204)
    logger.info("Could not update KPI ${issue.key} (${result.status})")
