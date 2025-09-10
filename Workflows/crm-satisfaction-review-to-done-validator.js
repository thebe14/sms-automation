// Validation message: All linked achievements must be finalized before the satisfaction review can be concluded
issue.links
     .filter(link => link.type.name == "Achievement" &&
             !["Done"].includes(link?.outwardIssue?.status?.name))
     .length == 0