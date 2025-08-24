// Validation message: All linked projects must be finalized before the customer can become active
issue.links
     .filter(link => link.type.name == "Customer-Project" &&
             !["Canceled", "In Production", "Decommissioned"].includes(link?.outwardIssue?.status?.name))
     .length == 0