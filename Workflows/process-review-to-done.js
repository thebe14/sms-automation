// workflow: Process Review Workflow
// on transition: InProgress -> Done
// run as: ScriptRunner add-on user
// conditions: true

def summary = issue.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${issue.fields.issuetype.name.toLowerCase()} ${issue.key}")
    return
}

def processes = []
def links = issue.fields.issuelinks as Map

for(def link : links)
    if(link?.type.name.equals("Review") && null != link?.inwardIssue)
        processes.add(link.inwardIssue)

if(processes.isEmpty()) {
    logger.info("Warning: Review ${issue.key} not linked to a process")
    return
}
if(processes.size() > 1)
    logger.info("Warning: Review ${issue.key} linked to multiple processes")

def process = processes[0]

// if we don't have the status of the process, get it
if(null == process.fields?.status) {
    def result = get("/rest/api/3/issue/${process.key}")
        .header("Content-Type", "application/json")
        .asObject(Map)

    if(result.status < 200 || result.status > 204) {
        logger.info("Could not get process ${process.key} (${result.status})")
        return
    }

    process = result.body
}

// if the process is in status InReview
if(process.fields?.status?.name.equals("In Review")) {
    // get the possible transitions on the process
    def transitions = [:]
    def result = get("/rest/api/3/issue/${process.key}/transitions")
        .header("Accept", "application/json")
        .asObject(Map)

    if(result.status < 200 || result.status > 204) {
        logger.info("Could not get transitions of ${process.key} (${result.status})")
        return
    }

    for(def transition in result.body?.transitions)
        transitions[transition.name] = transition.id

    def transName = "Implement changes"
    def transId = transitions[transName]

    if(null == transId) {
        logger.info("${transName} transition not available on ${process.key}")
        return
    }

    // transition process to status Implementation
    result = post("/rest/api/3/issue/${process.key}/transitions")
        .header("Content-Type", "application/json")
        .body([
            transition: [
                id: transId,
            ]
        ])
        .asString()

    if(result.status < 200 || result.status > 204) {
        logger.info("Could not transition process ${process.key} via ${transName} (${result.status})")
        return
    }

    logger.info("Sent process ${process.key} to status Implementation")

    // add comment to process about finished review
    result = post("/rest/api/3/issue/${process.key}/comment")
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
                            text: "Process review ",
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
        logger.info("Could not add comment to process ${process.key} (${result.status})")
}
