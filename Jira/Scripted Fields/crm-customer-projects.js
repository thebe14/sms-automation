// scripted field: Projects
// description: The number of projects the customer is involved in
// type: number

// check and only calculate this field for Customer tickets
def type = issue.fields['issuetype']?.name as String
if(null == type || type.isEmpty() || !type.equalsIgnoreCase("Customer"))
    return 0

// find the Project tickets linked with a outward "has project" relationship
def links = issue.fields['issuelinks'] as List
def projects = 0

for(def link : links) {
    def linkTypeName = link?.type?.name as String
    def linkedProject = link?.outwardIssue
    if(null != linkTypeName && null != linkedProject && linkTypeName.equalsIgnoreCase("Project"))
        // found a linked project
        projects++
}

return projects