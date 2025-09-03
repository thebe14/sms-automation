// scripted field: Linked customer count
// description: Counts the number of linked Customer tickets
// type: number

// check and only calculate this field for Complaint tickets
def type = issue.fields['issuetype']?.name as String
if(null == type || type.isEmpty() || 0 != type.compareToIgnoreCase("Complaint"))
    return ""

// count Customer tickets linked with an inward "is complaint from" relationship
def linkedCustomers = 0
def links = issue.fields['issuelinks'] as List

for(def link : links) {
    def linkTypeName = link?.type?.name as String
    def linkedCustomer = link?.inwardIssue
    if(null != linkTypeName && null != linkedCustomer && 0 == linkTypeName.compareToIgnoreCase("Complaint"))
        linkedCustomers++
}

return linkedCustomers