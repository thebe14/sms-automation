# Changelog

All notable changes to this project will be documented in this file.

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.3
- Added auto-escalation of active KPIs when the escalation condition is true on validated Measurement
- Automatically escalate KPIs higher to SMS owner after period configured on the Process SMS ticket
- Moved the init of a Process Review ticket from the workflow transition handler to the script listener for ticket creation
- Moved the assignment of a Process/Procedure/Policy Review ticket from the workflow transition handler to the script listener for ticket creation
- Automatically create Customer Satisfaction Review tickets according to configured schedule
- Automatically create Customer Database Review tickets according to configured schedule
- Overhauled all scripted fields that return linked entities to return ticket key(s) instead
- Added entity diagram

## 1.0.2
- Added Customer ticket action to register complaint
- Added Project ticket action to create new use case
- Move clear resolution on reopening tickets from rule to a Script Listener
- Init Customer ticket by copying satisfaction review frequency from Process CRM ticket
- Fix create and link Procedure Review ticket when a Procedure enters status InReview
- Fix create and link Policy Review ticket when a Policy enters status InReview
- Cancel all linked Projects that are not finalized when Customer is canceled
- Cancel all linked Use Cases when Project is canceled
- Activate linked Client(s) when a Project goes to InProduction
- Attempt to deactivate Customer when Project canceled or decommissioned
- Automatically create Process/Procedure/Policy Review tickets according to configured schedule
- Added validators to Customer transitions to Active/Inactive
- Added safeguards to Process/Procedure/Policy tickets with set next review but with empty review frequency
- Move Process/Procedure/Policy to status Implementation when linked review ticket enters status Done
- Added mechanism to sync multi-user picker field with Jira group (used in process role management)
- Renamed all relationships in Jira to only the entity name that is linked to
- Added process scripted field Process name, determined from process ticket type
- Added action to active Customer tickets to start customer satisfaction review
- Added action to Customer Satisfaction Review tickets in status InProgress to record an achievement
- Added action to Customer Satisfaction Review tickets in status InProgress to suggest an improvement
- Added action to Achievement tickets in status InProgress to record a scientific publication
- Init Customer Satisfaction Review tickets with linked Achievement tickets for all projects of the client that are not canceled or decommissioned
- Set invisible Process owner and Process manager on Process SMS ticket
- Added validator to ensure all Achievements linked to a Customer Satisfaction Review are finalized before the review can be concluded
- Add comment to Customer Satisfaction Review when a linked Achievement is done
- Add comment to Client when a linked Customer Satisfaction Review is concluded
- Separate Jira and Confluence scripts


## 1.0.0
- Initialize Process/Policy/Procedure Review tickets on creation, setting process type and code based on Jira project, and process owner and process manager based on Jira groups
- Initialize Process Review tickets on creation, based on Jira project
- Create Process Review ticket when transitioning Process ticket to InReview, with prepared sections listing defined policies, procedures, and KPIs
- Create Policy Review ticket when transitioning Policy ticket to InReview
- Create Procedure Review ticket when transitioning Procedure ticket to InReview
- Create Measurement ticket linked to the KPI ticket when next measurement datetime has passed for active KPIs
- Implemented automatic measurement in Measurement tickets linked to KPI tickets where the field Measurement type is anything but Manual
- Added Confluence macros to count Jira tickets and to list group members
- Added Customer ticket actions to start a project and create a contact
