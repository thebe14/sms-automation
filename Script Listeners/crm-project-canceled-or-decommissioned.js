// on events: IssueUpdated
// in projects: CRM
// run as: ScriptRunner add-on user
// conditions:
// ['Project'].includes(issue.issueType.name)

def summary = issue.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${issue.fields.issuetype.name.toLowerCase()} ${issue.key}")
    return
}

// get custom fields
def customFields = get("/rest/api/3/field")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

// get field values
def statusOldId = customFields.find { it.name == 'Status old' }?.id?.toString()

def status = issue.fields.status.name as String
def statusOld = issue.fields[statusOldId] as String

def statusChanged = (null == status) != (null == statusOld) || // both null or non-null
                    (null != status && 0 != status.compareTo(statusOld))

def changes = new ArrayList<String>()
if(statusChanged)
    changes.add("status")
if(changes.isEmpty()) {
    logger.info("No relevant changes for ${issue.key}")
    return
}

logger.info("Changed ${String.join(', ', changes)} for ${issue.key}")

// store status backup
def result = put("/rest/api/3/issue/${issue.key}")
    .queryString("overrideScreenSecurity", Boolean.TRUE)
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (statusOldId): status,
        ],
    ])
    .asString()

if(result.status < 200 || result.status > 204)
    logger.info("Could not update ${issue.key} (${result.status})")

if(status.equals("Canceled")) {
    // project canceled, cancel all linked usecases
    logger.info("Project ${issue.key} was just canceled (from status ${statusOld})")
    def usecases = []
    def links = issue.fields.issuelinks as Map

    for(def link : links)
        if(link?.type.name.equals("Project-Use Case") && null != link?.outwardIssue)
            usecases.add(link.outwardIssue)

    // for all linked usecases...
    for(def usecase : usecases) {
        // if we don't have the status of the usecase, get it
        if(null == usecase.fields?.status) {
            result = get("/rest/api/3/issue/${usecase.key}")
                .header("Content-Type", "application/json")
                .asObject(Map)

            if(result.status < 200 || result.status > 204) {
                logger.info("Could not get usecase ${usecase.key} (${result.status})")
                continue
            }

            usecase = result.body
        }

        // if the usecase is not in status Done
        if(!usecase.fields?.status?.name.equals("Done")) {
            // get the possible transitions on the usecase
            def transitions = [:]
            result = get("/rest/api/3/issue/${usecase.key}/transitions")
                .header("Accept", "application/json")
                .asObject(Map)

            if(result.status < 200 || result.status > 204) {
                logger.info("Could not get transitions of ${usecase.key} (${result.status})")
                continue
            }

            for(def transition in result.body?.transitions)
                transitions[transition.name] = transition.id

            def transName = "Cancel"
            def transId = transitions[transName]

            if(null == transId) {
                logger.info("${transName} transition not available on ${usecase.key}")
                continue
            }

            // transition usecase to status Canceled
            result = post("/rest/api/3/issue/${usecase.key}/transitions")
                .header("Content-Type", "application/json")
                .body([
                    transition: [
                        id: transId,
                    ]
                ])
                .asString()

            if(result.status < 200 || result.status > 204)
                logger.info("Could not transition usecase ${usecase.key} via ${transName} (${result.status})")

            logger.info("Canceled usecase ${usecase.key}")
        }
    }
}

if(status.equals("Canceled") || status.equals("Decommissioned")) {
    // project canceled or decommissioned, deactivate customer(s)
    def customers = []
    def links = issue.fields.issuelinks as Map

    for(def link : links)
        if(link?.type.name.equals("Customer-Project") && null != link?.inwardIssue)
            customers.add(link.inwardIssue)

    // for all linked customers...
    for(def customer : customers) {
        // if we don't have the status of the customer, get it
        if(null == customer.fields?.status) {
            result = get("/rest/api/3/issue/${customer.key}")
                .header("Content-Type", "application/json")
                .asObject(Map)

            if(result.status < 200 || result.status > 204) {
                logger.info("Could not get custoemr ${customer.key} (${result.status})")
                continue
            }

            customer = result.body
        }

        // if the customer is in status Active
        if(!customer.fields?.status?.name.equals("Active")) {
            // get the possible transitions on the customer
            def transitions = [:]
            result = get("/rest/api/3/issue/${customer.key}/transitions")
                .header("Accept", "application/json")
                .asObject(Map)

            if(result.status < 200 || result.status > 204) {
                logger.info("Could not get transitions of ${customer.key} (${result.status})")
                continue
            }

            for(def transition in result.body?.transitions)
                transitions[transition.name] = transition.id

            def transName = "Deactivate"
            def transId = transitions[transName]

            if(null == transId) {
                logger.info("${transName} transition not available on ${customer.key}")
                continue
            }

            // transition customer to status Inactive
            result = post("/rest/api/3/issue/${customer.key}/transitions")
                .header("Content-Type", "application/json")
                .body([
                    transition: [
                        id: transId,
                    ]
                ])
                .asString()

            if(result.status < 200 || result.status > 204)
                logger.info("Could not transition customer ${customer.key} via ${transName} (${result.status})")

            logger.info("Deactivated customer ${customer.key}")
        }
    }    
}
