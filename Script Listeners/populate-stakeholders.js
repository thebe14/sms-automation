// conditions:
// [  'Meeting',
//    'Deliverable',
//    'Report',
//    'Change',
//    'Problem',
//    'Known Error',
//    'Risk',
//    'Vulnerability',
//    'Improvement Suggestion',
//    'Handover',
//    'Software Update',
//    'Managed Software Update',
//    'Infrastructure Software Update',
//    'Issue',
//    'Incident',
//    'Data Protection Incident',
//    'Security Incident',
//    'Restore',
//    'Disaster',
//    'Task'
// ].includes(issue.issueType.name)

if(issue == null) {
    logger.info("No issue")
    return
}

def summary = issue.fields['summary'] as String
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test ticket")
    return
}

// get custom fields
def customFields = get("/rest/api/2/field")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

def serviceId = customFields.find { it.name == 'Service' }?.id?.toString()
def servicesId = customFields.find { it.name == 'Services' }?.id?.toString()
def lotsId = customFields.find { it.name == 'Procurement lot' }?.id?.toString()
def serviceOldId = customFields.find { it.name == 'Service old' }?.id?.toString()
def servicesOldId = customFields.find { it.name == 'Services old' }?.id?.toString()
def lotsOldId = customFields.find { it.name == 'Procurement lot old' }?.id?.toString()
def stakeholdersId = customFields.find { it.name == 'Stakeholders' }?.id?.toString()
def stakeholdersOld = issue.fields[stakeholdersId] as List<Map>

def ticketType = issue.fields.issuetype.name as String
def service = issue.fields[serviceId]?.value as String
def serviceOld = issue.fields[serviceOldId] as String
def services = issue.fields[servicesId]?.value as Set<String>
def servicesOld = issue.fields[servicesOldId] as String
def lots = issue.fields[lotsId]?.value as Set<String>
def lotsOld = issue.fields[lotsOldId] as String
def stakeholders = [:]

if(null != service && !service.isEmpty())
    logger.info("Service: ${service}")
if(null != services && !services.isEmpty())
    logger.info("Services: ${services}")
if(null != lots && !lots.isEmpty())
    logger.info("Procurement lots: ${lots}")

if(null != stakeholdersOld && !stakeholdersOld.isEmpty()) {
    // check if the field Service, Services, or Procurement lot have changed
    def serviceChanged  = (null == service) != (null == serviceOld) || // both null or non-null
                          (null != service && 0 != service.compareTo(serviceOld))                          
    def servicesChanged = (null == services) != (null == servicesOld) || // both null or non-null
                          (null != services && 0 != services.toString().compareTo(servicesOld))
    def lotChanged      = (null == lots) != (null == lotsOld) || // both null or non-null
                          (null != lots && 0 != lots.toString().compareTo(lotsOld))

    def changes = new ArrayList<String>()
    if(serviceChanged)
        changes.add("service")
    if(servicesChanged)
        changes.add("services")
    if(lotChanged)
        changes.add("procurement lot")
    if(changes.isEmpty()) {
        logger.info("No relevant changes for ${issue.key}")
        return
    }

    logger.info("Updating stakeholders for ${issue.key}:")

    // we already have stakeholders, keep them
    logger.info("Current stakeholders:")
    for(def user : stakeholdersOld) {
        logger.info("   ${user.displayName}")
        stakeholders[user.accountId] = user.displayName
    }
}
else
    logger.info("Initializing stakeholders for ${issue.key}:")

// select the groups to add members from as stakeholders
// first build a list of all services involved
def servicesUnique = [] as Set<String>

if(null != service && !service.isEmpty())
    servicesUnique.add(service)
if(null != services)
    for(def s : services)
        servicesUnique.add(s)

if(servicesUnique.isEmpty() && null != lots) {
    // no services mentioned on the ticket, check if the lot is mentioned
    for(def l : lots)
        if(!l.equals("EC"))
            servicesUnique.add(l)
}

if(servicesUnique.isEmpty())
    // no services or lots mentioned on the ticket, fallback to emergency group
    servicesUnique.add("Fallback")

//logger.info("Service set: ${servicesUnique}")

// transform service list to group list
def groups = [] as Set<String>
for(def s : servicesUnique) {
    switch(s) {
        case "Lot 1 - Front Office": groups.add("lot1-ops-front-office"); break
        case "Lot 1 - User Space": groups.add("lot1-ops-user-space"); break
        case "Lot 1 - Admin Dashboard": groups.add("lot1-ops-admin-dashboard"); break
        case "Lot 1 - Resource Hub": groups.add("lot1-ops-resource-hub"); break
        case "Lot 1 - Learning Management System": groups.add("lot1-ops-lms"); break
        case "Lot 1 - Knowledge Graph": groups.add("lot1-ops-knowledge-graph"); break
        case "Lot 1 - Recommendation System": groups.add("lot1-ops-recommendation-system"); break
        case "Lot 1 - Contributor Dashboard": groups.add("lot1-ops-contrib-dashboard"); break
        case "Lot 1 - Interoperability Framework Registry": groups.add("lot1-ops-if-registry"); break
        case "Lot 1 - Services Catalogue": groups.add("lot1-ops-services-catalogue"); break
        case "Lot 1 - Tools Catalogue": groups.add("lot1-ops-tools-catalogue"); break
        case "Lot 1 - Trainings Catalogue": groups.add("lot1-ops-trainings-catalogue"); break
        case "Lot 1 - Data Curation Hub": groups.add("lot1-ops-data-curation-hub"); break
        case "Lot 1 - Persistent Identifiers": groups.add("lot1-ops-pids"); break
        case "Lot 1 - Tools Market": groups.add("lot1-ops-tools-market"); break
        case "Lot 1 - Application Management Layer": groups.add("lot1-ops-aml"); break
        case "Lot 1 - Configuration Management Database": groups.add("lot1-ops-cmdb"); break
        case "Lot 1 - Authentication and Authorization Infrastructure": groups.add("lot1-ops-aai"); break
        case "Lot 1 - Accounting for Research Products": groups.add("lot1-ops-acc-research-products"); break
        case "Lot 1 - Accounting for Services": groups.add("lot1-ops-acc-services"); break
        case "Lot 1 - Messaging": groups.add("lot1-ops-messaging"); break
        case "Lot 1 - Monitoring": groups.add("lot1-ops-monitoring"); break
        case "Lot 1 - Order Management": groups.add("lot1-ops-order-management"); break
        case "Lot 1 - Credit Management": groups.add("lot1-ops-credit-management"); break
        case "Lot 1 - Service Management System": groups.add("lot1-ops-sms"); break
        case "Lot 1 - Helpdesk": groups.add("lot1-ops-helpdesk"); break
        case "Lot 1 - Collaboration Tools": groups.add("lot1-ops-collab-tools"); break
        case "Lot 1 - Security Coordination": groups.add("lot1-ops-security-coord"); break
        case "Lot 1 - Quality Validation": groups.add("lot1-ops-quality-validation"); break
        case "Lot 2 - Container Platform": groups.add("lot2-ops-managed-containers"); break
        case "Lot 2 - Compute Infrastructure": groups.add("lot2-ops-managed-compute-infra"); break
        case "Lot 2 - Bulk Data Transfer": groups.add("lot2-ops-bulk-data-transfer"); break
        case "Lot 3 - File Synchronization and Sharing": groups.add("lot3-ops-file-sync-sharing"); break
        case "Lot 3 - Interactive Notebooks": groups.add("lot3-ops-interactive-notebooks"); break
        case "Lot 3 - Large File Transfer": groups.add("lot3-ops-large-file-transfer"); break
        case "Lot 3 - Security Coordination": groups.add("lot3-ops-security-coord"); break
        case "Lot 1": groups.add("lot1-ops"); break
        case "Lot 2": groups.add("lot2-ops"); break
        case "Lot 3": groups.add("lot3-ops"); break
        case "Fallback":
        default:
            groups.add("fallback-ops"); break
    }
}

// check if this is an EUNODEOPS ticket, and if so include the group ec-qa-team
def opsTicketTypes = [
    'Software Update',
    'Managed Software Update',
    'Infrastructure Software Update',
    'Issue',
    'Incident',
    'Data Protection Incident',
    'Security Incident',
    'Restore',
    'Disaster'
] as Set<String>
if(opsTicketTypes.contains(ticketType))
    groups.add("ec-qa-team")

logger.info("Groups: ${groups}")

// loop through all the identified groups and extract their members
for(def groupName : groups) {
    // get the group Id
    //logger.info("Group name: ${groupName}")

    def result = get("/rest/api/2/groups/picker?query=${groupName}")
        .header("Content-Type", "application/json")
        .asObject(Map)

    if(result.status < 200 || result.status > 204) {
        logger.info("Could not get Id of group ${groupName} (${result.status})")
        continue
    }

    def groupInfo = result.body as Map
    def groupId = null as String
    for(def group : groupInfo.groups) {
        if(groupName.equals(group["name"])) {
            groupId = group["groupId"]
            break
        }
    }

    if(!groupId) {
        logger.info("Could not extract Id of group ${groupName}")
        continue
    }

    //logger.info("Group Id: ${groupId}")

    // get the members of the group
    result = get("/rest/api/3/group/member?groupname=${groupName}&includeInactiveUsers=false")
        .header("Content-Type", "application/json")
        .asObject(Map)

    if(result.status < 200 || result.status > 204) {
        logger.info("Could not get members of group ${groupName} (${result.status})")
        return
    }

    def groupMembers = result.body as Map

    def newUsers = false
    for(def user : groupMembers.values) {
        def accountId = user["accountId"]
        if(accountId && !stakeholders.containsKey(accountId)) {    
            if(!newUsers) {
                newUsers = true
                logger.info("New stakeholders (${groupName}):")
            }

            logger.info("   ${user["displayName"]}")
            stakeholders[accountId] = user["displayName"]
        }
    }
}

def jiraStakeholders = []
for(def s : stakeholders)
    jiraStakeholders.add([id: s.key])

logger.info("stakeholdersId ${stakeholdersId}")
logger.info("serviceOldId ${serviceOldId}")
logger.info("servicesOldId ${servicesOldId}")
logger.info("lotsOldId ${lotsOldId}")

// update the Stakeholders field
def result = put("/rest/api/2/issue/${issue.key}") 
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (stakeholdersId): jiraStakeholders,
            (serviceOldId): service,
            (servicesOldId): services ? services.toString() : null,
            (lotsOldId): lots ? lots.toString() : null,
        ],
    ])
    .asString()

logger.info("Returned: ${result.status}")

