# Changelog

All notable changes to this project will be documented in this file.

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.3
- CRM: Automatically create Customer Satisfaction Review tickets according to configured schedule
- CRM: Automatically create Customer Database Review tickets according to configured schedule
- Added auto-escalation of active KPIs to process owner when the escalation condition is true on validated Measurement
- Added auto-escalation KPIs to SMS owner after being escalated to process owner for longer than configured on the Process SMS work item
- Automatically escalate KPIs higher to SMS owner after period configured on the Process SMS ticket
- Moved the init of a Process Review ticket from the workflow transition handler to the script listener for ticket creation
- Moved the assignment of a Process/Procedure/Policy Review ticket from the workflow transition handler to the script listener for ticket creation
- Overhauled all scripted fields that return linked entities to return ticket key(s) instead
- Added entity diagram

## 1.0.2
- CRM: Added Customer ticket action to register complaint
- CRM: Added Project ticket action to create new use case
- CRM: Init Customer ticket by copying satisfaction review frequency from Process CRM ticket
- CRM: Cancel all linked Projects that are not finalized when Customer is canceled
- CRM: Cancel all linked Use Cases when Project is canceled
- CRM: Activate linked Client(s) when a Project goes to _In Production_
- CRM: Attempt to deactivate Customer when Project canceled or decommissioned
- CRM: Added validators to Customer transitions to _Active_/_Inactive_
- CRM: Added action to active Customer tickets to start customer satisfaction review
- CRM: Added action to Customer Satisfaction Review tickets in status _In Progress_ to record an achievement
- CRM: Added action to Customer Satisfaction Review tickets in status _In Progress_ to suggest an improvement
- CRM: Added action to Achievement tickets in status _In Progress_ to record a scientific publication
- CRM: Init Customer Satisfaction Review tickets with linked Achievement tickets for all projects of the client that are not canceled or decommissioned
- CRM: Added validator to ensure all Achievements linked to a Customer Satisfaction Review are finalized before the review can be concluded
- CRM: Add comment to Customer Satisfaction Review when a linked Achievement is done
- CRM: Add comment to Customer when a linked Customer Satisfaction Review is concluded
- SMS: Added mechanism to sync multi-user picker field with Jira group (used in process role management)
- SMS: Added process scripted field Process name, determined from process ticket type
- SMS: Set invisible Process owner and Process manager on Process SMS ticket
- Fix create and link Procedure Review ticket when a Procedure enters status _In Review_
- Fix create and link Policy Review ticket when a Policy enters status _In Review_
- Move clear resolution on reopening tickets from rule to a script listener
- Automatically create Process/Procedure/Policy Review tickets according to configured schedule
- Added safeguards to Process/Procedure/Policy tickets with set next review but with empty review frequency
- Move Process/Procedure/Policy to status Implementation when linked review ticket enters status _Done_
- Renamed all relationships in Jira to only the entity name that is linked to
- Separate Jira and Confluence scripts

## 1.0.0
- CRM: Added Customer ticket actions to start a project and create a contact
- Initialize Process/Policy/Procedure Review tickets on creation, setting process type and code based on Jira project, and process owner and process manager based on Jira groups
- Initialize Process Review tickets on creation, based on Jira project
- Create Process Review ticket when transitioning Process ticket to _In Review_, with prepared sections listing defined policies, procedures, and KPIs
- Create Policy Review ticket when transitioning Policy ticket to _In Review_
- Create Procedure Review ticket when transitioning Procedure ticket to _In Review_
- Create Measurement ticket linked to the KPI ticket when next measurement datetime has passed for active KPIs
- Implemented automatic measurement in Measurement tickets linked to KPI tickets where the field Measurement type is anything but Manual
- Added Confluence macros to count Jira tickets and to list group members
