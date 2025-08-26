// scripted field: Use cases
// description: The number of use cases this project addresses
// type: number

// check and only calculate this field for Project tickets
def type = issue.fields['issuetype']?.name as String
if(null == type || type.isEmpty() || !type.equalsIgnoreCase("Project"))
    return 0

// find the Use Case tickets linked with a outward "has use case" relationship
def links = issue.fields['issuelinks'] as List
def useCases = 0

for(def link : links) {
    def linkTypeName = link?.type?.name as String
    def linkedUseCase = link?.outwardIssue
    if(null != linkTypeName && null != linkedUseCase && linkTypeName.equalsIgnoreCase("Project-Use Case"))
        // found a linked use case
        useCases++
}

return useCases