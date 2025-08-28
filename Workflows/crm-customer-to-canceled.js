// workflow: CRM Customer Workflow
// on transition: InProgress -> Canceled
// run as: Initiating user
// conditions: true

def summary = issue.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${issue.fields.issuetype.name.toLowerCase()} ${issue.key}")
    return
}

// find all linked projects
def projects = []
def links = issue.fields.issuelinks as Map

for(def link : links)
    if(link?.type.name.equals("Customer-Project") && null != link?.outwardIssue)
        projects.add(link.outwardIssue)

// for all linked projects...
for(def project : projects) {
    // if we don't have the status of the project, get it
    if(null == project.fields?.status) {
        def result = get("/rest/api/3/issue/${project.key}")
            .header("Content-Type", "application/json")
            .asObject(Map)

        if(result.status < 200 || result.status > 204) {
            logger.info("Could not get project ${project.key} (${result.status})")
            continue
        }

        project = result.body
    }

    // if the project is not in status In Production (or later)
    if(!['In Production', 'Handover', 'Decommissioned'].contains(project.fields?.status?.name)) {
        // get the possible transitions on the project
        def transitions = [:]
        def result = get("/rest/api/3/issue/${project.key}/transitions")
            .header("Accept", "application/json")
            .asObject(Map)

        if(result.status < 200 || result.status > 204) {
            logger.info("Could not get transitions of ${project.key} (${result.status})")
            continue
        }

        for(def transition in result.body?.transitions)
            transitions[transition.name] = transition.id

        def transName = "Cancel"
        def transId = transitions[transName]

        if(null == transId) {
            logger.info("${transName} transition not available on ${project.key}")
            continue
        }

        // transition project to status Canceled
        result = post("/rest/api/3/issue/${project.key}/transitions")
            .header("Content-Type", "application/json")
            .body([
                transition: [
                    id: transId,
                ]
            ])
            .asString()

        if(result.status < 200 || result.status > 204)
            logger.info("Could not transition project ${project.key} via ${transName} (${result.status})")

        logger.info("Canceled project ${project.key}")
    }
}
