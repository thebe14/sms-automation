// Validation message: All linked projects must be finalized and at least one must be in production before the customer can become active
issue.links
     .filter(link => link.type.name == "Project" &&
             !["Canceled", "In Production", "Decommissioned"].includes(link?.outwardIssue?.status?.name))
     .length == 0 &&
issue.links
     .filter(link => link.type.name == "Project" &&
             ["In Production"].includes(link?.outwardIssue?.status?.name))
     .length > 0