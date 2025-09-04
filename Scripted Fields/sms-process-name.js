// scripted field: Process name
// description: The name of the SMS process
// type: short text

def issueType = issue.fields['issuetype']?.name as String
if(null == issueType || issueType.isEmpty())
    return ""

switch(issueType) {
    case "Process BA": return "Budgeting and Accounting"
    case "Process BDS": return "Business Ddevelopment and Stakeholder"
    case "Process CAPM": return "Capacity Management"
    case "Process ChaRDM": return "Change and Release Deployment Management"
    case "Process COM": return "Communications Management"
    case "Process CONFM": return "Configuration Management"
    case "Process CSI": return "Continual Improvement"
    case "Process CRM": return "Customer Relationship Management"
    case "Process FA": return "Finance Administration"
    case "Process PROF": return "Project Finance"
    case "Process HR": return "Human Resources"
    case "Process ISM": return "Information Security Management"
    case "Process ISRM": return "Incident and Service Request Management"
    case "Process PM": return "Problem Management"
    case "Process PKM": return "Project Knowledge Management"
    case "Process PPM": return "Project Portfolio Management"
    case "Process PRM": return "Project Management"
    case "Process RM": return "Risk Management"
    case "Process SACM": return "Service Availability and Continuity Management"
    case "Process SUPPM": return "Supplier Relationship Management"
    case "Process SLM": return "Service Level Management"
    case "Process SPM": return "Service Portfolio Management"
    case "Process SRM": return "Service Reportin Management"
    case "Process SMS": return "Management System"
}

return ""
