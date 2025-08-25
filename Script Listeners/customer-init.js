// on events: IssueCreated
// in projects: all
// run as: ScriptRunner add-on user
// conditions:
// ['Customer'].includes(issue.issueType.name)

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
def projectKey = issue.fields.project.key as String
def reviewFrequencyId = customFields.find { it.name == 'Customer satisfaction review frequency' }?.id?.toString()

// find the CRM process work item
def result = post("/rest/api/3/search/jql") 
    .header("Content-Type", "application/json")
    .header("Accept", "application/json")
    .body([
        fields: [ "key", reviewFrequencyId ],
        jql: "project=SMS and issuetype='Process ${projectKey}'",
        maxResults: 1
    ])
    .asObject(Map)

if(result.status < 200 || result.status > 204) {
    logger.info("Could not find the ${projectKey} process (${result.status})")
    return
}

def crmProcess = result.body?.issues?.first()
if(null == crmProcess) {
    logger.info("Oops, no ${projectKey} process?")
    return
}

// store the customer satisfaction review frequency on the customer ticket
def reviewFrequency = crmProcess.fields[reviewFrequencyId]?.value
result = put("/rest/api/3/issue/${issue.key}")
    .queryString("overrideScreenSecurity", Boolean.TRUE)
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (reviewFrequencyId): [ value: reviewFrequency ],
        ],
    ])
    .asObject(Map)

if(result.status < 200 || result.status > 204)
    logger.info("Could not initialize customer ${issue.key} (${result.status})")
