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
        def customer = result.body as Map

        // get name of customer from custom field
        def customFields = get("/rest/api/3/field")
            .header("Accept", "application/json")
            .asObject(List)
            .body
            .findAll { (it as Map).custom } as List<Map>

        def customerNameId = customFields.find { it.name == 'Customer name' }?.id?.toString()
        def customerName = customer.fields[customerNameId] as String
        if(null != customerName)
            return customerName
    }
}

return ""
