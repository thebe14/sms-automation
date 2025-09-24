// workflow: Customer Workflow
// on transition: InProgress -> Active
// run as: ScriptRunner add-on user
// conditions: true

import java.util.Date
import java.text.SimpleDateFormat

def summary = issue.fields.summary as String
def ticketType = issue.fields.issuetype?.name?.toLowerCase()
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${ticketType} ${issue.key}")
    return
}

// get custom fields
def customFields = get("/rest/api/3/field")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

def reviewFrequencyId = customFields.find { it.name == 'Customer satisfaction review frequency' }?.id?.toString()
def nextReviewId = customFields.find { it.name == 'Next review' }?.id?.toString()

// set the date of the next satisfaction review
def dateFormatter = new SimpleDateFormat("yyyy-MM-dd")
def reviewFrequency = issue.fields[reviewFrequencyId]?.value as String
def nextReviewDate = null as Date

if(null != reviewFrequency) {
    nextReviewDate = new Date()
    switch(reviewFrequency.toLowerCase()) {
        case "monthly":
            nextReviewDate.setMonth(nextReviewDate.getMonth() + 1)
            break

        case "quarterly":
            nextReviewDate.setMonth(nextReviewDate.getMonth() + 3)
            break

        case "semiannually":
            nextReviewDate.setMonth(nextReviewDate.getMonth() + 6)
            break

        case "annually":
            nextReviewDate.setYear(nextReviewDate.getYear() + 1)
            break
    }
}

def result = put("/rest/api/3/issue/${issue.key}")
    .queryString("overrideScreenSecurity", Boolean.TRUE)
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (nextReviewId): null != nextReviewDate ? dateFormatter.format(nextReviewDate) : null
        ],
    ])
    .asString()

if(result.status < 200 || result.status > 204)
    logger.info("Could not update ${ticketType} ${issue.key} (${result.status})")
