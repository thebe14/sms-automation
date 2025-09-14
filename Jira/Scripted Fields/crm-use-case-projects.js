// scripted field: Projects for use case
// description: The projects(s) implementing this use case
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

// find the Project tickets linked with a inward "is use case for" relationship
def links = issue.fields['issuelinks'] as List
def projects = ""

for(def link : links) {
    def linkTypeName = link?.type?.name as String
    def linkedProject = link?.inwardIssue
    if(null != linkTypeName && null != linkedProject && linkTypeName.equalsIgnoreCase("Use Case")) {
        // found a linked ticket, fetch its fields
        def result = get("/rest/api/3/issue/${linkedProject.key}").asObject(Map)
        def project = result.body as Map

        // get the name of project
        def projectNameId = customFields.find { it.name == 'Project name' }?.id?.toString()
        def projectName = project.fields[projectNameId] as String
        if(null == projects || projects.isEmpty())
            projects = projectName
        else
            projects = "${projects}, ${projectName}"
    }
}

return projects