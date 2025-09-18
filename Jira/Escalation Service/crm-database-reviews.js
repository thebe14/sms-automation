// schedule: Every day
// jql: project=SMS and issuetype="Process CRM" AND status=Active AND "Customer database review frequency[Dropdown]" != EMPTY AND "Next database review[Date]" < now()
// run as: LF

import java.util.Date
import java.text.SimpleDateFormat

if(issue == null) {
    logger.info("No issue")
    return
}

def result = get("/rest/api/3/issue/${issue.key}")
    .header("Content-Type", "application/json")
    .asObject(Map)

if(result.status < 200 || result.status > 204) {
    logger.info("Could not get process ${issue.key} (${result.status})")
    return
}

def process = result.body

// get custom fields
def customFields = get("/rest/api/3/field")
    .header("Accept", "application/json")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

// create new Customer Database Review ticket
def reviewFrequencyId = customFields.find { it.name == 'Customer database review frequency' }?.id?.toString()
def nextReviewId = customFields.find { it.name == 'Next database review' }?.id?.toString()

def dateTimeFormatter = new SimpleDateFormat("yyyy-MM-dd")
def reviewFrequency = process.fields[reviewFrequencyId]?.value as String
def nextReview = process.fields[nextReviewId] as String
def nextReviewDate = null != nextReview ? dateTimeFormatter.parse(nextReview) : null as Date

def now = Calendar.instance
def reviewDate = null

switch(reviewFrequency.toLowerCase()) {
    case "quarterly":
        def month = 1 + now.get(Calendar.MONTH)
        def quarter = 1
        if(month >= 4 && month <= 6)
            quarter = 2
        else if(month >= 7 && month <= 9)
            quarter = 3
        else if(month >= 10)
            quarter = 4
        reviewDate = "${now.get(Calendar.YEAR)}.Q${quarter}"
        break

    case "semiannually":
        def month = 1 + now.get(Calendar.MONTH)
        def half = month < 7 ? 1 : 2
        reviewDate = "${now.get(Calendar.YEAR)}-${half}"
        break

    case "annually":
        reviewDate = "${now.get(Calendar.YEAR)}"
        break

    case "monthly":
    default:
        reviewDate = "${now.get(Calendar.YEAR)}.${String.format('%02d', 1 + now.get(Calendar.MONTH))}"
        break
}

result = post("/rest/api/3/issue")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            project: [ key: "CRM" ],
            issuetype: [ name: "Customer Database Review" ],
            summary: "Customer database review on ${reviewDate}",
        ],
    ])
    .asString()

if(result.status < 200 || result.status >= 300) {
    logger.info("Could not create database review (${result.status})")
    return
}

// update next database review date
if(null != nextReviewDate) {
    if(null == reviewFrequency)
        // clear next database review date, as a database review was
        // already started on this date and we cannot determine the next one
        nextReviewDate = null
    else
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

result = put("/rest/api/3/issue/${process.key}")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (nextReviewId): null != nextReviewDate ? dateTimeFormatter.format(nextReviewDate) : null,
        ],
    ])
    .asString()

if(result.status < 200 || result.status >= 300) {
    logger.info("Could not update process ${process.key} (${result.status})")
    return
}

if(null != nextReviewDate)
    logger.info("Scheduled next database review for ${issue.key} to ${nextReviewDate}")
else
    logger.info("Cleared next database review for ${issue.key}")
