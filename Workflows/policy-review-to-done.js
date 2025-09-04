// workflow: Policy Review Workflow
// on transition: InProgress -> Done
// run as: ScriptRunner add-on user
// conditions: true

def summary = issue.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${issue.fields.issuetype?name?toLowerCase()} ${issue.key}")
    return
}

def policies = []
def links = issue.fields.issuelinks as Map

for(def link : links)
    if(link?.type.name.equals("Review") && null != link?.inwardIssue)
        policies.add(link.inwardIssue)

if(policies.isEmpty()) {
    logger.info("Warning: Review ${issue.key} not linked to a policy")
    return
}
if(policies.size() > 1)
    logger.info("Warning: Review ${issue.key} linked to multiple policies")

def policy = policies[0]

// if we don't have the status of the policy, get it
if(null == policy.fields?.status) {
    def result = get("/rest/api/3/issue/${policy.key}")
        .header("Content-Type", "application/json")
        .asObject(Map)

    if(result.status < 200 || result.status > 204) {
        logger.info("Could not get policy ${policy.key} (${result.status})")
        return
    }

    policy = result.body
}

// if the policy is in status InReview
if(policy.fields?.status?.name.equals("In Review")) {
    // get the possible transitions on the policy
    def transitions = [:]
    def result = get("/rest/api/3/issue/${policy.key}/transitions")
        .header("Accept", "application/json")
        .asObject(Map)

    if(result.status < 200 || result.status > 204) {
        logger.info("Could not get transitions of ${policy.key} (${result.status})")
        return
    }

    for(def transition in result.body?.transitions)
        transitions[transition.name] = transition.id

    def transName = "Implement changes"
    def transId = transitions[transName]

    if(null == transId) {
        logger.info("${transName} transition not available on ${policy.key}")
        return
    }

    // transition policy to status Implementation
    result = post("/rest/api/3/issue/${policy.key}/transitions")
        .header("Content-Type", "application/json")
        .body([
            transition: [
                id: transId,
            ]
        ])
        .asString()

    if(result.status < 200 || result.status > 204) {
        logger.info("Could not transition policy ${policy.key} via ${transName} (${result.status})")
        return
    }

    logger.info("Sent policy ${policy.key} to status Implementation")

    // add comment to policy about finished review
    result = post("/rest/api/3/issue/${policy.key}/comment")
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
                            text: "Policy review ",
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
        logger.info("Could not add comment to policy ${policy.key} (${result.status})")
}
