// scripted field: Customer in complaint
// description: The customer that is subject of the complaint
// type: short text

// check and only calculate this field for Complaint tickets
def type = issue.fields['issuetype']?.name as String
if(null == type || type.isEmpty() || !type.equalsIgnoreCase("Complaint"))
    return ""

// find the first Customer ticket linked with an inward "is complaint from" relationship
def links = issue.fields['issuelinks'] as List

for(def link : links) {
    def linkTypeName = link?.type?.name as String
    def linkedCustomer = link?.inwardIssue
    if(null != linkTypeName && null != linkedCustomer && linkTypeName.equalsIgnoreCase("Complaint")) {
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