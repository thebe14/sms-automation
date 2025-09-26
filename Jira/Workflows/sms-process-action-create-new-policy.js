// workflow: Process Workflow
// on transition: Implementation -> Implementation (Create new policy)
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
 * @returns the page details { id, content, parentId, spaceId }, null on error
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

    return [ notFound: true ] // no results
}

/***
 * Copy a confluence page under a destination page
 * @param sourcePage is the (template) page to copy
 * @param pageTitle is the title of the new page
 * @returns the new page's details, null on error
 */
def copyPage(sourcePage, parentPageId, pageTitle) {
    def result = post("/wiki/rest/api/content/${sourcePage.id}/copy")
        .header("Content-Type", "application/json")
        .body([
            destination: [
                type: "parent_page",
                value: parentPageId,
            ],
            pageTitle: pageTitle,
            copyAttachments: false,
            copyPermissions: false,
            copyProperties: true,
            copyLabels: false,
            copyCustomContents: true,
            body: [
                storage: [
                    value: sourcePage.content.value,
                    representation: sourcePage.content.representation,
                ]
            ]
        ])
        .asObject(Map)

    if(result.status < 200 || result.status >= 300) {
        logger.info("Could not copy page ${sourcePage.id} under page ${parentPageId} (${result.status})")
        return null
    }

    return result.body
}

// get custom fields
def customFields = get("/rest/api/3/field")
    .header("Accept", "application/json")
    .asObject(List)
    .body
    .findAll { (it as Map).custom } as List<Map>

def processOwnerId = customFields.find { it.name == 'Process owner' }?.id?.toString()
def processHomepageId = customFields.find { it.name == 'Process homepage' }?.id?.toString()

def policyTitleId = customFields.find { it.name == 'Policy title' }?.id?.toString()
def policyCodeId = customFields.find { it.name == 'Policy code' }?.id?.toString()
def policyHomepageId = customFields.find { it.name == 'Policy homepage' }?.id?.toString()

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
def policyTitle = issue.fields[policyTitleId] as String
def policyCode = issue.fields[policyCodeId] as String
def processOwner = issue.fields[processOwnerId]?.accountId as String

// find the template policy page
def templatePage = findPage("Policy Template")
if(null == templatePage || templatePage.notFound) {
    logger.info("Could not find [olicy] homepage template")
    return
}

// determine where to create the homepage for the new policy
Matcher matcher = processHomepage =~ ~/https\:\/\/(.+)\/wiki\/spaces\/(.+)\/pages\/([0-9a-zA-Z]+)/
if(matcher.find()) {
    hostname = matcher.group(1)
    spaceKey = matcher.group(2)
    processPageId = matcher.group(3)
}
def policiesPageTitle = "${processCode} Policies"
def policiesPage = findPage(policiesPageTitle)
if(null == policiesPage)
    return
if(policiesPage.notFound) {
    // this process has no policies page
    logger.info("Could not find page <${policiesPageTitle}>")
    
    def templatePolicies = findPage("Policies Template")
    if(null == templatePolicies || templatePolicies.notFound) {
        logger.info("Could not find policies page template")
        return
    }

    // in the content we got from the template page, replace dummy process references with ones to this process
    if(null != templatePolicies.content.value)
        templatePolicies.content.value = templatePolicies.content.value.replaceAll("XXX", "${processCode}")

    // copy policies page template to the right place
    policiesPage = copyPage(templatePolicies, processPageId, policiesPageTitle)
    if(null == policiesPage)
        return

    policiesPage.parentId = processPageId

    logger.info("Created new ${processCode} policies page ${policiesPage.id}")
}

if(policiesPage.parentId != processPageId)
    // should be directly under the process homepage
    logger.warn("Page <${policiesPageTitle}> not under homepage of process ${processCode}")

// create new policy ticket
def result = post("/rest/api/3/issue")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            project: [ key: processCode ],
            issuetype: [ name: "Policy" ],
            summary: "${policyCode} ${policyTitle}",
            assignee: null != processOwner ? [ accountId: processOwner ] : null,
            (policyCodeId): policyCode,
        ],
    ])
    .asObject(Map)

if(result.status < 200 || result.status >= 300) {
    logger.info("Could not create policy for process ${processCode} (${result.status})")
    return
}

def newTicket = result.body as Map
logger.info("Created policy ${newTicket.key} for process ${processCode}")

// clear the policy details from the process ticket, so new policies can be created clean
result = put("/rest/api/3/issue/${issue.key}")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (policyTitleId): null,
            (policyCodeId): null,
        ],
    ])
    .asString()

if(result.status < 200 || result.status >= 300)
    logger.warn("Could not clear policy details from process ${processCode} ${issue.key} (${result.status})")

// add a comment about the new policy that was created
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
                        text: "New policy ${policyCode} has been created for this process, see ",
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

// in the content we got from the template page, replace dummy ticket references with ones to new policy ticket
if(null != templatePage.content.value) {
    templatePage.content.value = templatePage.content.value.replaceAll("XXX-67733", newTicket.key)
    templatePage.content.value = templatePage.content.value.replaceAll("XXX", "${processCode}")
}

// copy policy homepage template to the right place
def newPage = copyPage(templatePage, policiesPage.id, "${policyCode} ${policyTitle}")
if(null == newPage)
    return

logger.info("Created new policy page ${newPage.id}")

// store the link to the new page as the homepage of the new policy
def policyHomepage = "https://${hostname}/wiki/spaces/${spaceKey}/${newPage.id}"

result = put("/rest/api/3/issue/${newTicket.key}")
    .header("Content-Type", "application/json")
    .body([
        fields:[
            (policyHomepageId): policyHomepage,
        ],
    ])
    .asString()

if(result.status < 200 || result.status >= 300)
    logger.info("Could not update policy ${newTicket.key} (${result.status})")
