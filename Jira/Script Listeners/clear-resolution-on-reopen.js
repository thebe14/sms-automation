// on events: IssueUpdated
// in projects: All
// run as: ScriptRunner add-on user
// conditions:
// ['To Do', 'Initial Assessment',
//  'In Progress', 'In Review',
//  'Escalated to Process Owner', 'Escalated to SMS Owner',
//  'Received'].includes(issue.status.name) && issue.resolution != null

def summary = issue.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${issue.fields.issuetype.name.toLowerCase()} ${issue.key}")
    return
}

// update the resolution
def result = put("/rest/api/3/issue/${issue.key}")
    .queryString("overrideScreenSecurity", Boolean.TRUE)
    .header("Content-Type", "application/json")
    .body([
        fields:[
            resolution: null,
        ],
    ])
    .asString()

if(result.status < 200 || result.status > 204)
    logger.info("Could not clear resolution of ${issue.key} (${result.status})")
else
    logger.info("Cleared resolution of ${issue.key} in status ${issue.fields.status.name}")
