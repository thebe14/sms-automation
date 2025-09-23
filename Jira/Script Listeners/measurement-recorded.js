// on events: IssueUpdated
// in projects: all
// run as: ScriptRunner add-on user
// conditions:
// ['Measurement'].includes(issue.issueType.name)

import java.util.Date
import java.text.SimpleDateFormat

def summary = issue.fields.summary as String
def ticketType = issue.fields.issuetype?.name?.toLowerCase()
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${ticketType} ${issue.key}")
    return
}

// get custom fields
def customFields = get("/rest/api/3/field")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

// get field values
def statusOldId = customFields.find { it.name == 'Status old' }?.id?.toString()
def measuredValueId = customFields.find { it.name == 'Measured value' }?.id?.toString()
def measuredValueOldId = customFields.find { it.name == 'Measured value old' }?.id?.toString()

def status = issue.fields.status.name as String
def statusOld = issue.fields[statusOldId] as String
def measuredValue = issue.fields[measuredValueId] as String
def measuredValueOld = issue.fields[measuredValueOldId] as String

def statusChanged = (null == status) != (null == statusOld) || // both null or non-null
                    (null != status && !status.equalsIgnoreCase(statusOld))

def measurementChanged = (null == measuredValue) != (null == measuredValueOld) || // both null or non-null
                         (null != measuredValue && !measuredValue.equalsIgnoreCase(measuredValueOld))

def changes = new ArrayList<String>()
if(statusChanged)
    changes.add("status")
if(measurementChanged)
    changes.add("measurement")
if(changes.isEmpty()) {
    logger.info("No relevant changes for ${issue.key}")
    return
}

logger.info("Changed ${String.join(', ', changes)} for ${issue.key}")

logger.info("${statusOld} -> ${status}")
logger.info("${measuredValueOld} -> ${measuredValue}")

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

def targetId = customFields.find { it.name == 'Target' }?.id?.toString()
def targetValueId = customFields.find { it.name == 'Target value' }?.id?.toString()
def result = null;

if(null != kpi) {
    result = get("/rest/api/3/issue/${kpi.key}?fields=key,${targetId}")
        .header("Content-Type", "application/json")
        .asObject(Map)

    if(result.status < 200 || result.status > 204)
        logger.info("Could not get KPI ${kpi.key} (${result.status})")
    else
        kpi = result.body
}

def target = null != kpi ? kpi.fields[targetId] : null as Number

// store field backups on the ticket
result = put("/rest/api/3/issue/${issue.key}") 
    .queryString("overrideScreenSecurity", Boolean.TRUE)
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (statusOldId): status,
            (measuredValueOldId): measuredValue,
            (targetValueId): null != target ? ((target % 1 != 0) ? target.toString() : target.toLong().toString()) : null,
        ],
    ])
    .asString()

if(result.status < 200 || result.status > 204)
    logger.info("Could not save measurement backup to ${issue.key} (${result.status})")

if(null == kpi) {
    logger.info("Measurement ${issue.key} not linked to KPI ticket")
    return
}

// update the "Last measured value" and "Last measured on" fields of the linked KPI ticket
def lastMeasuredValueId = customFields.find { it.name == 'Last measured value' }?.id?.toString()
def lastMeasuredOnId = customFields.find { it.name == 'Last measured on' }?.id?.toString()

def dateTimeFormatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ")
def now = new Date()

result = put("/rest/api/3/issue/${kpi.key}?returnIssue=true")
    .header("Content-Type", "application/json")
    .body([
        fields: [
            (lastMeasuredValueId): measuredValue,
            (lastMeasuredOnId): dateTimeFormatter.format(now)
        ]
    ])
    .asObject(Map)

if(result.status >= 200 && result.status <= 204)
    kpi = result.body
else
    logger.info("Could not update KPI ${kpi.key} (${result.status})")

// check if the KPI can be escalated
def kpiStatus = kpi.fields.status?.name as String
if(status.equals("Validated") && null != kpiStatus && kpiStatus.equals("Active")) {
    // KPI not escalated yet, check if it should be escalated
    def escalateConditionId = customFields.find { it.name == 'Condition of escalation' }?.id?.toString()
    def escalateCondition = kpi.fields[escalateConditionId] as String
    def targetIncluded = escalateCondition.contains("{target}")
    def measuredValueExpression = measuredValue.isNumber() ? "${measuredValue}" : "\"${measuredValue}\""
    def escalateExpression = targetIncluded ? escalateCondition.replaceAll(/\{target\}/, "${target}") : "${measuredValueExpression} ${escalateCondition}"

    escalateExpression = escalateExpression.replaceAll(/[^a-zA-Z\d\.\+\-\*\/\(\)\%\<\>\=\&\|\!\'\" ]/, "")

    logger.info("Escalate condition: ${escalateExpression}")
    def escalateNow = evaluate(escalateExpression)
    if(!escalateNow)
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

    def transName = "Escalate to process owner"
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

    logger.info("Escalated KPI ${kpi.key} to process owner")

    // add a comment about escalation
    result = post("/rest/api/3/issue/${kpi.key}/comment")
        .header("Content-Type", "application/json")
        .body([
            body: [
                type: "doc",
                version: 1,
                content: [
                    [
                        type: "paragraph",
                        content: [
                            [
                                type: "text",
                                text: "Validated measurement of ${measuredValue} recorded on work item ",
                            ],
                            [
                                type: "text",
                                text: "${issue.key}",
                                marks: [[
                                    type: "link",
                                    attrs: [ href: "/browse/${issue.key}" ]
                                ]]
                            ],
                            [
                                type: "text",
                                text: " requires escalation.",
                            ],
                        ]
                    ],
                    [
                        type: "paragraph",
                        content: [
                            [
                                type: "text",
                                text: "Condition of escalation is: ",
                            ],
                            [
                                type: "text",
                                text: "${escalateCondition}",
                                marks: [[ type: "strong" ]]
                            ]
                        ]
                    ],
                ]
            ]
        ])
        .asString()

    if(result.status < 200 || result.status > 204)
        logger.info("Could not add comment to KPI ${kpi.key} (${result.status})")
}
