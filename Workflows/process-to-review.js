// workflow: SMS Process Workflow
// on transition: Active -> UnderReview
// run as: ScriptRunner add-on user
// conditions: true

if(issue == null) {
    logger.info("No issue")
    return
}

def summary = issue.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ticket ${issue.key}")
    return
}

def eventIssue = Issues.getByKey(issue.key as String)

// get custom fields
def customFields = get("/rest/api/2/field")
    .header("Accept", "application/json")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

def processCodeId = customFields.find { it.name == 'Process code' }?.id?.toString()

def processCode = issue.fields[processCodeId] as String

if(null == processCode) {
    logger.info("No process code")
    return
}

logger.info("process code: ${processCode}")

