// scripted field: Customer in complaint
// description: The customer that is subject of the complaint
// type: short text

// check and only calculate this field for Complaint tickets
def type = issue.fields['issuetype']?.name as String
if(null == type || type.isEmpty() || !type.equalsIgnoreCase("Complaint"))
    return ""

// find the first Customer ticket linked with a inward "is complaint from" relationship
def links = issue.fields['issuelinks'] as List

for(def link : links) {
    def linkTypeName = link?.type?.name as String
    def linkedCustomer = link?.inwardIssue
    if(null != linkTypeName && null != linkedCustomer && linkTypeName.equalsIgnoreCase("Complaint")) {
        // found a linked customer
        return linkedCustomer.key
    }
}

return ""