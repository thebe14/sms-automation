// Validation message: You cannot deactivate a customer while it has linked project that are still running
issue.links
     .filter(link => link.type.name == "Customer-Project" &&
             !["Canceled", "Decommissioned"].includes(link?.outwardIssue?.status?.name))
     .length == 0
