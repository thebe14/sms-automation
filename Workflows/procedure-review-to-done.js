// workflow: Procedure Review Workflow
// on transition: InProgress -> Done
// run as: ScriptRunner add-on user
// conditions: true

def summary = issue.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${issue.fields.issuetype.name.toLowerCase()} ${issue.key}")
    return
}

def procedures = []
def links = issue.fields.issuelinks as Map

for(def link : links)
    if(link?.type.name.equals("Review") && null != link?.inwardIssue)
        procedures.add(link.inwardIssue)

if(procedures.isEmpty()) {
    logger.info("Warning: Review ${issue.key} not linked to a procedure")
    return
}
if(procedures.size() > 1)
    logger.info("Warning: Review ${issue.key} linked to multiple procedures")

def procedure = procedures[0]

// if we don't have the status of the procedure, get it
if(null == procedure.fields?.status) {
    def result = get("/rest/api/3/issue/${procedure.key}")
        .header("Content-Type", "application/json")
        .asObject(Map)

    if(result.status < 200 || result.status > 204) {
        logger.info("Could not get procedure ${procedure.key} (${result.status})")
        return
    }

    procedure = result.body
}

// if the procedure is in status InReview
if(procedure.fields?.status?.name.equals("In Review")) {
    // get the possible transitions on the procedure
    def transitions = [:]
    def result = get("/rest/api/3/issue/${procedure.key}/transitions")
        .header("Accept", "application/json")
        .asObject(Map)

    if(result.status < 200 || result.status > 204) {
        logger.info("Could not get transitions of ${procedure.key} (${result.status})")
        return
    }

    for(def transition in result.body?.transitions)
        transitions[transition.name] = transition.id

    def transName = "Implement changes"
    def transId = transitions[transName]

    if(null == transId) {
        logger.info("${transName} transition not available on ${procedure.key}")
        return
    }

    // transition procedure to status Implementation
    result = post("/rest/api/3/issue/${procedure.key}/transitions")
        .header("Content-Type", "application/json")
        .body([
            transition: [
                id: transId,
            ]
        ])
        .asString()

    if(result.status < 200 || result.status > 204) {
        logger.info("Could not transition procedure ${procedure.key} via ${transName} (${result.status})")
        return
    }

    logger.info("Sent procedure ${procedure.key} to status Implementation")

    // add comment to procedure about finished review
    result = post("/rest/api/3/issue/${procedure.key}/comment")
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
                            text: "Procedure review ",
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
                            text: " has concluded, please implement the requested changes and perform the actions linked to the review or to this policy.",
                        ],
                    ]
                ]]
            ]
        ])
        .asString()

    if(result.status < 200 || result.status > 204)
        logger.info("Could not add comment to procedure ${procedure.key} (${result.status})")
}
