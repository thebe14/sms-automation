// scripted field: Customers for use case
// description: The customer(s) from the linked Customer ticket(s)
// type: short text

// check and only calculate this field for Use Case tickets
def type = issue.fields['issuetype']?.name as String
if(null == type || type.isEmpty() || !type.equalsIgnoreCase("Use Case"))
    return ""

// get all custom fields
def customFields = get("/rest/api/3/field")
    .header("Accept", "application/json")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

// find the Customer tickets linked with a inward "is use case for" relationship
def links = issue.fields['issuelinks'] as List
def customers = ""

for(def link : links) {
    def linkTypeName = link?.type?.name as String
    def linkedCustomer = link?.inwardIssue
    if(null != linkTypeName && null != linkedCustomer && linkTypeName.equalsIgnoreCase("Customer-Use Case")) {
        // found a linked customer, fetch its fields
        def result = get("/rest/api/3/issue/${linkedCustomer.key}").asObject(Map)
        def customer = result.body as Map

        // get name of customer owner from custom field
        def customerNameId = customFields.find { it.name == 'Customer name' }?.id?.toString()
        def customerName = customer.fields[customerNameId] as String
        if(null == customers || customers.isEmpty())
            customers = customerName
        else
            customers = "${customers}, ${customerName}"
    }
}

return customers