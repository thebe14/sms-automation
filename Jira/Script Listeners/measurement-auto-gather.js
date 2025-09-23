// on events: IssueCreated
// in projects: all
// run as: ScriptRunner add-on user
// conditions:
// ['Measurement'].includes(issue.issueType.name)

import java.math.BigDecimal
import java.util.Date
import java.text.SimpleDateFormat
import java.util.regex.Matcher
import java.util.regex.Pattern
import java.util.regex.PatternSyntaxException

def summary = issue.fields.summary as String
def ticketType = issue.fields.issuetype?.name?.toLowerCase()
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${ticketType} ${issue.key}")
    return
}

def status = issue.fields['status']?.name as String
if(!status.equalsIgnoreCase("Received")) {
    logger.info("Measurement ${issue.key} not new")
    return
}

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

// get all the fields of the linked KPI ticket
def result = get("/rest/api/3/issue/${kpi.key}")
    .header("Accept", "application/json")
    .asObject(Map)
if(result.status < 200 || result.status > 204) {
    logger.info("Could not get KPI ${issue.key} (${result.status})")
    return
}

kpi = result.body as Map

/***
 * Fetches member of an object according to a path expression
 * @param object is the object to get field value from
 * @param path is a path expresson, such as "field1.fields[0].field3"
 *        Path expressions "field[0]" and "field.[0]" are equivalent
 *        If there is an array in the root, use path expressions like "[0].field1.field2"
 * @returns field value, null on error (e.g. if any field in the path expression does not exist)
 */
def resolveObjectPath(object, String path) {
    if(!object || !path)
        return null

    Matcher matcher = null
    def parts = []
    def tokens = path.tokenize('.')
    
    for(def token in tokens) {
        // split tokens like "field[0]" into two tokens "field" and "[0]"
        matcher = token =~ /^([a-zA-Z0-9_]+)(\[\d+\])$/
        if(matcher.find()) {
            // this is an index into a property that is (supposedly) an array
            parts.add(matcher.group(1))
            parts.add(matcher.group(2))
            continue
        }

        parts.add(token)
    }

    return parts.inject(object, { obj, prop ->
        matcher = prop =~ /^\[(\d+)\]$/
        if(matcher.find()) {
            // property is an array index
            prop = matcher.group(1)
            if(!prop?.isInteger()) {
                logger.warn("Path expression index <${prop}> is not a valid array index")
                return null
            }

            return obj ? obj.getAt(Integer.parseInt(prop)) : null
        }

        return obj ? obj[prop] : null
    })
}

/***
 * Expand placeholders in a JQL query with actual values from the linked KPI ticket's fields
 * @param query is a JQL query that contains placeholders enclosed in braces {}. Supported placeholders are:
 *          {lastMeasurementDate} is the date from KPI field "Last measured on"
 *          {lastMeasurementDateTime} is the datetime from KPI field "Last measured on"
 * @param kpi is the linked KPI ticket
 * @param customFields are all the fields defined in Jira
 * @returns modified JQL with all supported placeholders replaced with actual values
 */
def expandQuery(String query, kpi, List<Map> customFields) {
    if(null == query || query.isEmpty() || null == kpi)
        return query

    def dateTimeFormatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ")
    def dateFormatter = new SimpleDateFormat("yyyy-MM-dd")
    def timeFormatter = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss")

    def lastMeasuredOnId = customFields.find { it.name == 'Last measured on' }?.id?.toString()
    def lastMeasuredOn = kpi.fields[lastMeasuredOnId] as String
    def lastMeasuredDate = null != lastMeasuredOn ? dateTimeFormatter.parse(lastMeasuredOn) : null as Date

    def lastMeasurementDate = null != lastMeasuredDate ? dateFormatter.format(lastMeasuredDate) : null as String
    def lastMeasurementDateTime = null != lastMeasuredDate ? timeFormatter.format(lastMeasuredDate) : null as String

    def expandedQuery = query
    if(null != lastMeasurementDate)
        expandedQuery = expandedQuery.replaceAll(/\{lastMeasurementDate\}/, lastMeasurementDate)
    
    if(null != lastMeasurementDateTime)
        expandedQuery = expandedQuery.replaceAll(/\{lastMeasurementDateTime\}/, "'${lastMeasurementDateTime}'")

    return expandedQuery
}

/***
 * Count the tickets that match the JQL query
 * @param query is a JQL query that contains placeholders enclosed in braces {}
 * @param kpi is the linked KPI ticket
 * @param customFields are all the fields defined in Jira
 * @returns tuple { success, count, result } where result is the Jira API response
 */
def countTickets(String query, kpi, List<Map> customFields) {
    def expandedQuery = expandQuery(query, kpi, customFields)
    if(null == expandedQuery)
        return [ success: false ]

    def result = post("/rest/api/3/search/approximate-count") 
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .body([
            jql: expandedQuery,
        ])
        .asObject(Map)

    def success = result.status >= 200 && result.status < 300
    if(!success) {
        logger.info("Query: ${expandedQuery}")
        logger.info("Could not count tickets (${result.status})")
    }

    def response = [:]
    response.result = result
    response.success = success
    if(success) {
        response.count = result?.body?.count
        logger.info("Query: ${expandedQuery}")
        logger.info("Count: ${response.count}")
    }

    return response
}

/***
 * Sums specific field of the tickets that match the JQL query. Ignores empty (null) fields.
 * @param query is a JQL query that contains placeholders enclosed in braces {}
 * @param fieldName is the name of the field to sum values from
 * @param kpi is the linked KPI ticket
 * @param customFields are all the fields defined in Jira
 * @returns tuple { success, sum, result } where result is the Jira API response
 */
def sumTickets(String query, String fieldName, kpi, List<Map> customFields) {

    if(null == fieldName || fieldName.isBlank()) {
        logger.info("Summation field not specified")
        return [ success: false ]
    }

    def expandedQuery = expandQuery(query, kpi, customFields)
    if(null == expandedQuery)
        return [ success: false ]

    fieldName = fieldName.trim()
    def fieldId = customFields.find { it.name == fieldName }?.id?.toString()
    if(null == fieldId) {
        logger.info("No field named '${fieldName}'")
        return [ success: false ]
    }

    def sum = 0 as BigDecimal
    def success = false
    def result = null
    def pageToken = null

    while(true) {
        result = post("/rest/api/3/search/jql") 
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .body([
                fields: [ "key", fieldId ],
                jql: expandedQuery,
                maxResults: 2,
                nextPageToken: pageToken,
            ])
            .asObject(Map)

        success = result.status >= 200 && result.status < 300
        if(!success) {
            logger.info("Query: ${expandedQuery}")
            logger.info("Could not search for tickets (${result.status})")
            break
        }

        for(def issue in result.body.issues) {
            def fieldValue = issue.fields[fieldId] as String
            logger.info(fieldValue)

            if(null != fieldValue && fieldValue.isBigDecimal())
                sum += fieldValue.toBigDecimal()
        }

        if(result.body?.isLast || null == result.body?.nextPageToken)
            // last page
            break

        pageToken = result.body.nextPageToken
    }

    def response = [:]
    response.result = result
    response.success = success
    if(success) {
        response.sum = sum
        logger.info("Query: ${expandedQuery}")
        logger.info("Sum: ${response.sum}")
    }

    return response
}

// get custom fields
def customFields = get("/rest/api/3/field")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

// get field values
def targetId = customFields.find { it.name == 'Target' }?.id?.toString()
def lastMeasuredValueId = customFields.find { it.name == 'Last measured value' }?.id?.toString()
def lastMeasuredOnId = customFields.find { it.name == 'Last measured on' }?.id?.toString()

def targetValueId = customFields.find { it.name == 'Target value' }?.id?.toString()
def measuredValueId = customFields.find { it.name == 'Measured value' }?.id?.toString()
def measurementTypeId = customFields.find { it.name == 'Measurement type' }?.id?.toString()
def measurementQueryId = customFields.find { it.name == 'Measurement query' }?.id?.toString()
def measurementSumFieldId = customFields.find { it.name == 'Measurement summation field' }?.id?.toString()
def measurementWebRequestId = customFields.find { it.name == 'Measurement web request' }?.id?.toString()
def measurementJsonFieldId = customFields.find { it.name == 'Measurement JSON field' }?.id?.toString()
def measurementRegExId = customFields.find { it.name == 'Measurement regular expression' }?.id?.toString()

// get target value and measurement configuration
def targetValue = kpi.fields[targetId] as Number
def measuredValue = null as String
def measurementType = kpi.fields[measurementTypeId]?.value as String

// check if we should auto gather the measurement
def manualMeasurement = true
def autoMeasurementFailed = false
switch(measurementType?.toLowerCase()) {
    case "work item count":
        def measurementQuery = kpi.fields[measurementQueryId] as String
        autoMeasurementFailed = true
        manualMeasurement = false
        if(null != measurementQuery) {
            // Count tickets for measurement value
            result = countTickets(measurementQuery, kpi, customFields)

            if(null != result && result.success) {
                measuredValue = result.count
                autoMeasurementFailed = false
            }
        }
        break

    case "work item summation":
        def measurementQuery = kpi.fields[measurementQueryId] as String
        def measurementSumField = kpi.fields[measurementSumFieldId] as String
        autoMeasurementFailed = true
        manualMeasurement = false
        if(null != measurementQuery && null != measurementSumField) {
            // Sum field of tickets for measurement value
            result = sumTickets(measurementQuery, measurementSumField, kpi, customFields)

            if(null != result && result.success) {
                measuredValue = result.sum
                autoMeasurementFailed = false
            }
        }
        break

    case "web request returning json":
        def measurementWebRequest = kpi.fields[measurementWebRequestId] as String
        def measurementJsonField = kpi.fields[measurementJsonFieldId] as String
        autoMeasurementFailed = true
        manualMeasurement = false
        if(null != measurementWebRequest && null != measurementJsonField) {
            // Fetch JSON and get field from it
            result = get(measurementWebRequest)
                .header("Accept", "application/json")
                .asObject(Object)

            if(result.status >= 200 && result.status <= 204) {
                def json = result.body
                measuredValue = resolveObjectPath(json, measurementJsonField)
                if(null != measuredValue)
                    autoMeasurementFailed = false
            }
        }
        break

    case "web request with regular expression":
        def measurementWebRequest = kpi.fields[measurementWebRequestId] as String
        def measurementRegEx = kpi.fields[measurementRegExId] as String
        autoMeasurementFailed = true
        manualMeasurement = false
        if(null != measurementWebRequest && null != measurementRegEx) {
            // Fetch string and dig in it with a regular expression
            result = get(measurementWebRequest)
                .asString()

            if(result.status >= 200 && result.status <= 204) {
                def text = result.body

                Pattern pattern = null
                Matcher matcher = null
                try {
                    pattern = ~"${measurementRegEx}"
                    matcher = text =~ pattern
                }
                catch(PatternSyntaxException ex) {
                    logger.warn("Invalid regular expression")
                    logger.warn(ex.getMessage())
                    pattern = null
                    matcher = null
                }

                if(null != matcher && matcher.find()) {
                    if(matcher.groupCount() > 0)
                        measuredValue = matcher.group(1)
                    else
                        measuredValue = matcher.group() // the entire matched substring
                }

                logger.info("measuredValue ${measuredValue}")

                if(null != measuredValue)
                    autoMeasurementFailed = false
            }
        }
        break
}

// update the "Target value" and "Measured value" fields of the measurement ticket
def fields = [:]
if(null != targetValue) {
    def targetValueString = (targetValue % 1 != 0) ? targetValue.toString() : targetValue.toLong().toString()
    fields[targetValueId] = targetValueString
    logger.info("Target: ${targetValueString}")
}
if(null != measuredValue) {
    fields[measuredValueId] = measuredValue.toString()
    logger.info("Measured: ${measuredValue}")
}
if(manualMeasurement || autoMeasurementFailed) {
    // if auto measurement failed, assign measurement to the KPI owner
    def kpiOwnerId = customFields.find { it.name == 'KPI owner' }?.id?.toString()
    def kpiOwner = kpi.fields[kpiOwnerId]?.accountId as String
    if(null != kpiOwner)
        fields["assignee"] = [ accountId: kpiOwner ]
}

if(!fields.isEmpty()) {
    result = put("/rest/api/3/issue/${issue.key}")
        .header("Content-Type", "application/json")
        .body([
            fields: fields,
        ])
        .asObject(Map)

    if(result.status < 200 || result.status > 204) {
        if(!manualMeasurement)
            autoMeasurementFailed = true
        logger.info("Could not update measurement ${issue.key} (${result.status})")
    }
}

// for auto measurements, transition the ticket to Validated or Auto Measure Failed, as needed
if(!manualMeasurement) {
    // get the transitions possible on the ticket
    def transitions = [:]
    result = get("/rest/api/3/issue/${issue.key}/transitions")
        .header("Accept", "application/json")
        .asObject(Map)
    if(result.status < 200 || result.status > 204) {
        logger.info("Could not get transitions of ${issue.key} (${result.status})")
        return
    }

    for(def transition in result.body?.transitions)
        transitions[transition.name] = transition.id

    def transName = autoMeasurementFailed ? "Measurement failure" : "Validate"
    def transId = transitions[transName]

    // transition ticket
    result = post("/rest/api/3/issue/${issue.key}/transitions")
        .header("Content-Type", "application/json")
        .body([
            transition: [
                id: transId,
            ]
        ])
        .asString()

    if(result.status < 200 || result.status > 204)
        logger.info("Could not transition ${issue.key} via ${transName} (${result.status})")
}
