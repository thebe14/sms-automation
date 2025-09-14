// workflow: CRM Customer Satisfaction Review Workflow
// on transition: InProgress -> Done
// run as: ScriptRunner add-on user
// conditions: true

def summary = issue.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${issue.fields.issuetype.name.toLowerCase()} ${issue.key}")
    return
}

def clients = []
def links = issue.fields.issuelinks as Map

for(def link : links)
    if(link?.type.name.equals("Review") && null != link?.inwardIssue)
        clients.add(link.inwardIssue)

if(clients.isEmpty()) {
    logger.warn("Warning: Satisfaction review ${issue.key} not linked to a client")
    return
}
if(clients.size() > 1)
    logger.warn("Warning: Satisfaction review ${issue.key} linked to multiple clients")

def client = clients[0]

// add comment to client about finalized concluded satisfaction review
def result = post("/rest/api/3/issue/${client.key}/comment")
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
                        text: "Customer satisfaction review ",
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
                        text: " has been concluded.",
                    ],
                ]
            ]]
        ]
    ])
    .asString()

if(result.status < 200 || result.status > 204)
    logger.info("Could not add comment to client ${client.key} (${result.status})")
