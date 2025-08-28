// workflow: Project Workflow
// on transition: ProductionReady -> InProduction
// run as: ScriptRunner add-on user
// conditions: true

def summary = issue.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ${issue.fields.issuetype.name.toLowerCase()} ${issue.key}")
    return
}

// find linked customer ticket(s)
def customers = []
def links = issue.fields.issuelinks as Map

for(def link : links)
    if(link?.type.name.equals("Customer-Project") && null != link?.inwardIssue)
        customers.add(link.inwardIssue)

// for all linked customers...
for(def customer : customers) {
    // if we don't have the status of the customer, get it
    if(null == customer.fields?.status) {
        def result = get("/rest/api/3/issue/${customer.key}")
            .header("Content-Type", "application/json")
            .asObject(Map)

        if(result.status < 200 || result.status > 204) {
            logger.info("Could not get customer ${customer.key} (${result.status})")
            continue
        }

        customer = result.body
    }

    // if the customer is in status In Progress
    if(customer.fields?.status?.name.equals("In Progress")) {
        // try to transition the customer to Active
        // this may still fail if the customer has other projects that are not yet finalized
        def transitions = [:]
        def result = get("/rest/api/3/issue/${customer.key}/transitions")
            .header("Accept", "application/json")
            .asObject(Map)

        if(result.status < 200 || result.status > 204) {
            logger.info("Could not get transitions of ${customer.key} (${result.status})")
            continue
        }

        for(def transition in result.body?.transitions)
            transitions[transition.name] = transition.id

        def transName = "Activate"
        def transId = transitions[transName]

        if(null == transId) {
            logger.info("${transName} transition not available on ${customer.key}")
            continue
        }

        // transition customer to status Active
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

        logger.info("Activated customer ${customer.key}")
    }
}
