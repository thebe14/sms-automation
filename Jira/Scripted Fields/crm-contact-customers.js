// scripted field: Contact for customers
// description: The customers represented by this contact
// type: short text

// check and only calculate this field for Contact tickets
def type = issue.fields.issuetype?.name as String
if(null == type || type.isEmpty() || !type.equalsIgnoreCase("Contact"))
    return ""

// find the Customer tickets linked with an inward "is contact for" relationship
def links = issue.fields['issuelinks'] as List
def customers = ""

for(def link : links) {
    def linkTypeName = link?.type?.name as String
    def linkedCustomer = link?.inwardIssue
    if(null != linkTypeName && null != linkedCustomer && linkTypeName.equalsIgnoreCase("Contact")) {
        // found a linked ticket
        if(null == customers || customers.isEmpty())
            customers = linkedCustomer.key
        else
            customers = "${customers}\n${linkedCustomer.key}"
    }
}

return customers