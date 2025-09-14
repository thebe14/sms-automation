// Validation message: When the review frequency is not "Together with process review" you must specify the date of the next review
// customfield_10096 is Next review
// customfield_10389 is Review frequency
issue.customfield_10389?.value == "Together with process review" || 
(null != issue.customfield_10389?.value && null != issue.customfield_10096)
