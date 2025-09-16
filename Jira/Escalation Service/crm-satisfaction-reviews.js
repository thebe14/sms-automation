// schedule: Every day
// jql: project=CRM and issuetype=Customer AND status=Active AND "Customer satisfaction review frequency[Dropdown]" != EMPTY AND "Next review[Date]" < now()
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
    logger.info("Could not get customer ${issue.key} (${result.status})")
    return
}

def customer = result.body

// get the possible transitions on the customer
def transitions = [:]
result = get("/rest/api/3/issue/${issue.key}/transitions")
    .header("Accept", "application/json")
    .asObject(Map)

if(result.status < 200 || result.status > 204) {
    logger.info("Could not get transitions of ${issue.key} (${result.status})")
    return
}

for(def transition in result.body?.transitions)
    transitions[transition.name] = transition.id

def transName = "Start customer satisfaction review"
def transId = transitions[transName]

if(null == transId) {
    logger.info("${transName} transition not available on ${issue.key}")
    return
}

// transition customer to start a new satisfaction review (loop tansition)
result = post("/rest/api/3/issue/${issue.key}/transitions")
    .header("Content-Type", "application/json")
    .body([
        transition: [
            id: transId,
        ]
    ])
    .asString()

if(result.status < 200 || result.status > 204) {
    logger.info("Could not transition customer ${issue.key} via ${transName} (${result.status})")
    return
}

logger.info("Started satisfaction review of customer ${issue.key}")

// get custom fields
def customFields = get("/rest/api/3/field")
    .header("Accept", "application/json")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

def reviewFrequencyId = customFields.find { it.name == 'Customer satisfaction review frequency' }?.id?.toString()
def nextReviewId = customFields.find { it.name == 'Next review' }?.id?.toString()

def dateTimeFormatter = new SimpleDateFormat("yyyy-MM-dd")
def reviewFrequency = customer.fields[reviewFrequencyId]?.value as String
def nextReview = customer.fields[nextReviewId] as String
def nextReviewDate = null != nextReview ? dateTimeFormatter.parse(nextReview) : null as Date

// update next review date of the customer
if(null != nextReviewDate) {
    if(null == reviewFrequency)
        // clear next review date, as a satisfaction review was already started on this date and we cannot determine the next one
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

result = put("/rest/api/3/issue/${issue.key}")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (nextReviewId): null != nextReviewDate ? dateTimeFormatter.format(nextReviewDate) : null,
        ],
    ])
    .asString()

if(result.status < 200 || result.status >= 300) {
    logger.info("Could not update customer ${issue.key} (${result.status})")
    return
}

if(null != nextReviewDate)
    logger.info("Scheduled next review for ${issue.key} to ${nextReviewDate}")
else
    logger.info("Cleared next review for ${issue.key}")
