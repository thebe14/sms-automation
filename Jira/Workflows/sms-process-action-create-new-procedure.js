// workflow: Process Workflow
// on transition: Implementation -> Implementation (Create new procedure)
// run as: ScriptRunner add-on user
// conditions: true

import java.util.regex.Matcher
import java.net.URLEncoder

def summary = issue.fields.summary as String
def issueType = issue.fields.issuetype?.name
if(summary.toLowerCase().trim() == "test") {
    logger.info("Ignore test process ${issue.key}")
    return
}

/***
 * Find a confluence page
 * @param title is the title of the page
 * @returns the page details { id, content, parentId, spaceId }, null on error or if page not found
 */
def findPage(String title) {
    if(null == title || title.isBlank())
        return null

    // escape the title
    def escapedTitle = URLEncoder.encode(title, "UTF-8")
    
    // find processes page of this process
    def result = get("/wiki/api/v2/pages?body-format=storage&title=${escapedTitle}").asObject(Map)

    if(result.status < 200 || result.status >= 300) {
        logger.info("Could not search for page <${title}> (${result.status})")
        return null
    }

    def results = result.body.results
    for(def page in results)
        if(page.id && page.parentId && page.spaceId)
            return [ id: page.id, content: page.body.storage, parentId: page.parentId, spaceId: page.spaceId ]

    return null // no results
}

// get custom fields
def customFields = get("/rest/api/3/field")
    .header("Accept", "application/json")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

def procedureTitleId = customFields.find { it.name == 'Procedure title' }?.id?.toString()
def procedureCodeId = customFields.find { it.name == 'Procedure code' }?.id?.toString()
def processOwnerId = customFields.find { it.name == 'Process owner' }?.id?.toString()
def processHomepageId = customFields.find { it.name == 'Process homepage' }?.id?.toString()
def procedureHomepageId = customFields.find { it.name == 'Procedure homepage' }?.id?.toString()

// get field values
def hostname = null
def spaceKey = null
def processPageId = null
def processCode = null as String
switch(issueType) {
    case "Process BA": processCode = "BA"; break
    case "Process BDS": processCode = "BDS"; break
    case "Process CAPM": processCode = "CAPM"; break
    case "Process ChaRDM": processCode = "CHARDM"; break
    case "Process COM": processCode = "COM"; break
    case "Process CONFM": processCode = "CONFM"; break
    case "Process CSI": processCode = "CSI"; break
    case "Process CRM": processCode = "CRM"; break
    case "Process FA": processCode = "FA"; break
    case "Process PROF": processCode = "PROF"; break
    case "Process HR": processCode = "HR"; break
    case "Process ISM": processCode = "ISM"; break
    case "Process ISRM": processCode = "ISRM"; break
    case "Process PM": processCode = "PM"; break
    case "Process PKM": processCode = "PKM"; break
    case "Process PPM": processCode = "PPM"; break
    case "Process PRM": processCode = "PRM"; break
    case "Process RM": processCode = "RM"; break
    case "Process SACM": processCode = "SACM"; break
    case "Process SUPPM": processCode = "SUPPM"; break
    case "Process SLM": processCode = "SLM"; break
    case "Process SPM": processCode = "SPM"; break
    case "Process SRM": processCode = "SRM"; break
    case "Process SMS": processCode = "SMS"; break
}

def processHomepage = issue.fields[processHomepageId] as String
def procedureTitle = issue.fields[procedureTitleId] as String
def procedureCode = issue.fields[procedureCodeId] as String
def processOwner = issue.fields[processOwnerId]?.accountId as String

// find the template procedure page
def templatePage = findPage("Procedure Homepage Template")
if(null == templatePage) {
    logger.info("Could not find procedure homepage template")
    return
}

// determine where to create the homepage for the new procedure
Matcher matcher = processHomepage =~ ~/https\:\/\/(.+)\/wiki\/spaces\/(.+)\/pages\/([0-9a-zA-Z]+)/
if(matcher.find()) {
    hostname = matcher.group(1)
    spaceKey = matcher.group(2)
    processPageId = matcher.group(3)
}

def proceduresPage = findPage("${processCode} Procedures")
if(null == proceduresPage) {
    logger.info("Could not find page <${"${processCode} Procedures"}>")
    return
}
if(proceduresPage.parentId != processPageId)
    // should be directly under the process homepage
    logger.warn("Page <${"${processCode} Procedures"}> not under homepage of process ${processCode}")

// create new procedure ticket
def result = post("/rest/api/3/issue")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            project: [ key: processCode ],
            issuetype: [ name: "Procedure" ],
            summary: "${procedureCode} ${procedureTitle}",
            assignee: null != processOwner ? [ accountId: processOwner ] : null,
            (procedureCodeId): procedureCode,
        ],
    ])
    .asObject(Map)

if(result.status < 200 || result.status >= 300) {
    logger.info("Could not create procedure for process ${processCode} (${result.status})")
    return
}

def newTicket = result.body as Map
logger.info("Created procedure ${newTicket.key} for process ${processCode}")

// clear the procedure details from the process ticket, so new procedures can be created clean
result = put("/rest/api/3/issue/${issue.key}")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (procedureTitleId): null,
            (procedureCodeId): null,
        ],
    ])
    .asString()

if(result.status < 200 || result.status >= 300)
    logger.info("Could not clear procedure details from process ${processCode} ${issue.key} (${result.status})")

// add a comment about the new procedure that was created
result = post("/rest/api/3/issue/${issue.key}/comment") 
    .header("Content-Type", "application/json")
    .body([
        body: [
            type: "doc",
            version: 1,
            content: [[
                type: "paragraph",
                content: [
                    [
                        type: "text",
                        text: "New procedure ${procedureCode} has been created for this process, see ",
                    ],
                    [
                        type: "text",
                        text: "${newTicket.key}",
                        marks: [[
                            type: "link",
                            attrs: [ href: "/browse/${newTicket.key}" ]
                        ]]
                    ]
                ]
            ]]
        ]
    ])
    .asString()

if(result.status < 200 || result.status > 204)
    logger.info("Could not add comment to process ${processCode} ${issue.key} (${result.status})")

// in the content we got from the template page, replace dummy ticket references with ones to new procedure ticket
if(null != templatePage.content.value) {
    templatePage.content.value = templatePage.content.value.replaceAll("XXX-99115", newTicket.key)
    templatePage.content.value = templatePage.content.value.replaceAll("XXX", "${processCode}")
}

// copy procedure homepage template to the right place
result = post("/wiki/rest/api/content/${templatePage.id}/copy")
    .header("Content-Type", "application/json")
    .body([
        destination: [
            type: "parent_page",
            value: proceduresPage.id,
        ],
        pageTitle: "${procedureCode} ${procedureTitle}",
        copyAttachments: false,
        copyPermissions: false,
        copyProperties: true,
        copyLabels: false,
        copyCustomContents: true,
        body: [
            storage: [
                value: templatePage.content.value,
                representation: templatePage.content.representation,
            ]
        ]
    ])
    .asObject(Map)

if(result.status < 200 || result.status >= 300) {
    logger.info("Could not copy page ${templatePage.id} under page ${proceduresPage.id} (${result.status})")
    return
}

def newPage = result.body as Map

logger.info("Created new procedure page ${newPage.id}")

// store the link to the new page as the homepage of the new procedure
def procedureHomepage = "https://${hostname}/wiki/spaces/${spaceKey}/${newPage.id}"

result = put("/rest/api/3/issue/${newTicket.key}")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (procedureHomepageId): procedureHomepage,
        ],
    ])
    .asString()

if(result.status < 200 || result.status >= 300)
    logger.info("Could not update procedure ${newTicket.key} (${result.status})")
