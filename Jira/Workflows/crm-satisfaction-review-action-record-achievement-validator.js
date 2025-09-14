// Validation message: Please link this satisfaction review to an active Customer work item and appoint a review owner before you record achievements
// customfield_10619 is Review owner
//null != issue.customfield_10619?.accountId &&
issue.links
     .filter(link => link.type.name == "Review" &&
            ["Active"].includes(link?.inwardIssue?.status?.name))
     .length == 1