// schedule: Every day at 2am
// jql: project=SMS AND issuetype in ('Process BA','Process BDS','Process CAPM','Process ChaRDM','Process COM','Process CONFM','Process CSI','Process CRM','Process FA','Process PROF','Process HR','Process ISM','Process ISRM','Process PM','Process PKM','Process PPM','Process PRM','Process RM','Process SACM','Process SUPPM','Process SLM','Process SPM','Process SRM','Process SMS') AND status=Active AND "Review process[Dropdown]" != null AND "Next review[Date]" < now()
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

// get the possible transitions on the process
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

def transName = "Start review"
def transId = transitions[transName]

if(null == transId) {
    logger.info("${transName} transition not available on ${issue.key}")
    return
}

// transition process to status In Review
result = post("/rest/api/3/issue/${issue.key}/transitions")
    .header("Content-Type", "application/json")
    .body([
        transition: [
            id: transId,
        ]
    ])
    .asString()

if(result.status < 200 || result.status > 204) {
    logger.info("Could not transition process ${issue.key} via ${transName} (${result.status})")
    return
}

logger.info("Started review of process ${issue.key}")

// get custom fields
def customFields = get("/rest/api/3/field")
    .header("Accept", "application/json")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

def reviewFrequencyId = customFields.find { it.name == 'Review process' }?.id?.toString()
def nextReviewId = customFields.find { it.name == 'Next review' }?.id?.toString()

def dateTimeFormatter = new SimpleDateFormat("yyyy-MM-dd")
def reviewFrequency = process.fields[reviewFrequencyId]?.value as String
def nextReview = process.fields[nextReviewId] as String
def nextReviewDate = null != nextReview ? dateTimeFormatter.parse(nextReview) : null as Date

// update next review datetime of the process
if(null != nextReviewDate) { 
    if(null == reviewFrequency)
        // clear next review date, as a review was already started on this datetime and we cannot determine the next one
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
    logger.info("Could not update process ${issue.key} (${result.status})")
    return
}

if(null != nextReviewDate)
    logger.info("Scheduled next review for ${issue.key} to ${nextReviewDate}")
else
    logger.info("Cleared next review for ${issue.key}")
