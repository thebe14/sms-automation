// workflow: CRM Achievement Workflow
// on transition: InProgress -> Done
// run as: ScriptRunner add-on user
// conditions: true

def summary = issue.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${issue.fields.issuetype.name.toLowerCase()} ${issue.key}")
    return
}

def satisfactionReviews = []
def links = issue.fields.issuelinks as Map

for(def link : links)
    if(link?.type.name.equals("Achievement") && null != link?.inwardIssue)
        satisfactionReviews.add(link.inwardIssue)

if(satisfactionReviews.isEmpty()) {
    logger.warn("Warning: Achievement ${issue.key} not linked to a satisfaction reivew")
    return
}
if(satisfactionReviews.size() > 1)
    logger.warn("Warning: Achievement ${issue.key} linked to multiple satisfaction reviews")

def satisfactionReview = satisfactionReviews[0]

// add comment to satisfaction review about finalized achievement
def result = post("/rest/api/3/issue/${satisfactionReview.key}/comment")
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
                        text: "Achievement ",
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
                        text: " has been finalized.",
                    ],
                ]
            ]]
        ]
    ])
    .asString()

if(result.status < 200 || result.status > 204)
    logger.info("Could not add comment to satisfaction review ${satisfactionReview.key} (${result.status})")
