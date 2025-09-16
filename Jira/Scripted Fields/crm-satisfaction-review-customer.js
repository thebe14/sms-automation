// scripted field: Customer in review
// description: The customer that is the subject of the customer satisfaction review
// type: short text

// check and only calculate this field for Customer Satisfaction Review tickets
def type = issue.fields['issuetype']?.name as String
if(null == type || type.isEmpty() || !type.equalsIgnoreCase("Customer Satisfaction Review"))
    return ""

// find the first Customer Satisfaction Review ticket linked with a inward "is review" relationship
def links = issue.fields['issuelinks'] as List

for(def link : links) {
    def linkTypeName = link?.type?.name as String
    def linkedCustomer = link?.inwardIssue
    if(null != linkTypeName && null != linkedCustomer && linkTypeName.equalsIgnoreCase("Review")) {
        // found a linked customer, fetch its fields
        def result = get("/rest/api/3/issue/${linkedCustomer.key}").asObject(Map)
        if(result.status < 200 || result.status > 204) {
            logger.info("Could not get customer ${linkedCustomer.key} (${result.status})")
            continue
        }

        def customer = result.body as Map
        if(!customer || !customer.fields.issuetype?.name?.equals("Customer"))
            // linked ticket is not a Customer
            continue

        return customer.key
    }
}

return ""
