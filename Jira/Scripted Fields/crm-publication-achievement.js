// scripted field: Achievement in publication
// description: The achievement that was mentioned in the scientific publication
// type: short text

// check and only calculate this field for Publication tickets
def type = issue.fields.issuetype?.name as String
if(null == type || type.isEmpty() || !type.equalsIgnoreCase("Publication"))
    return ""

// find the first Achievement ticket linked with a "relates to" relationship
def links = issue.fields['issuelinks'] as List

for(def link : links) {
    def linkTypeName = link?.type?.name as String
    def linkedTicket = link?.inwardIssue
    if(null == linkedTicket)
        linkedTicket = link?.outwardIssue
    if(null != linkTypeName && null != linkedTicket && linkTypeName.equalsIgnoreCase("Relates")) {
        // found a linked ticket, fetch its fields
        def result = get("/rest/api/3/issue/${linkedTicket.key}").asObject(Map)
        if(result.status < 200 || result.status > 204) {
            logger.info("Could not get achievement ${linkedTicket.key} (${result.status})")
            continue
        }
        
        def achievement = result.body as Map
        if(!achievement || !achievement.fields.issuetype?.name?.equals("Achievement"))
            // linked ticket is not an Achievement
            continue

        return achievement.key
    }
}

return ""