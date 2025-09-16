// scripted field: Customer in achievement
// description: The customer that is subject of the linked satisfaction review
// type: short text

// check and only calculate this field for Achievement tickets
def type = issue.fields.issuetype?.name as String
if(null == type || type.isEmpty() || !type.equalsIgnoreCase("Achievement"))
    return ""

// find the Customer Satisfaction Review ticket linked with an inward "is achievement for" relationship
def reviews = []
def links = issue.fields.issuelinks as Map

for(def link : links)
    if(link?.type.name.equals("Achievement") && null != link?.inwardIssue)
        reviews.add(link.inwardIssue)

if(reviews.isEmpty())
    return ""

if(reviews.size() > 1)
    logger.warn("Warning: Achievement review ${issue.key} linked to multiple satisfaction reviews")

def review = reviews[0]

// found a linked satisfaction review, fetch its fields
def result = get("/rest/api/3/issue/${review.key}?").asObject(Map)
if(result.status < 200 || result.status > 204) {
    logger.info("Could not get satisfaction review ${review.key} (${result.status})")
    return ""
}

review = result.body as Map

// find the Customer ticket linked with an inward "is review for" relationship
def customers = []
links = review.fields.issuelinks as Map

for(def link : links)
    if(link.type.name.equals("Review") && null != link.inwardIssue) {
        // found a linked customer, fetch its fields
        result = get("/rest/api/3/issue/${link.inwardIssue.key}").asObject(Map)
        if(result.status < 200 || result.status > 204) {
            logger.info("Could not get customer ${link.key} (${result.status})")
            continue
        }

        def customer = result.body as Map

        // check if it really is a customer
        def customerType = customer.fields.issuetype?.name as String
        if(null != customerType && !customerType.equals("Customer")) {
            logger.warn("Warning: Satisfaction review ${review.key} linked as review to wrong ${customerType} ticket ${customer.key}")
            continue
        }

        customers.add(customer)
    }

if(customers.isEmpty())
    return ""

if(customers.size() > 1)
    logger.warn("Warning: Satisfaction review ${review.key} linked to multiple customers")

def customer = customers[0]

return "${customer.key}"
