# Changelog

All notable changes to this project will be documented in this file.

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.0
- Initialize Process/Policy/Procedure Review tickets on creation, setting process type and code based on Jira project, and process owner and process manager based on Jira groups
- Initialize Process Review tickets on creation, based on Jira project
- Create Process Review ticket when transitioning Process ticket to InReview, with prepared sections listing defined policies, procedures, and KPIs
- Create Policy Review ticket when transitioning Policy ticket to InReview
- Create Procedure Review ticket when transitioning Procedure ticket to InReview
- Create Measurement ticket linked to the KPI ticket when next measurement datetime has passed for active KPIs
- Implemented automatic measurement in Measurement tickets linked to KPI tickets where the field Measurement type is anything but Manual
- Added Confluence macros to count Jira tickets and to list group members
