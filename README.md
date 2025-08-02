# SMS Jira Automations

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/thebe14/sms-script-listeners?color=darkcyan&label=Release&include_prereleases)
![GitHub issues](https://img.shields.io/github/issues/thebe14/sms-script-listeners?label=Issues)
![GitHub issue custom search in repo](https://img.shields.io/github/issues-search/thebe14/sms-script-listeners?label=Bugs&color=red&query=is%3Aopen%20label%3Abug)

This repository contains the Groovy scrips that automate the various Jira
work types that support the entities of the processes in the Service Management
System (SMS).

You can find these in the _Jira Admin Settings_ of the Jira site where SMS is
deployed, section **Apps**, then navigate to _ScriptRunner/Script Listeners_.

[ScriptRunner for Jira Cloud](https://docs.adaptavist.com/sr4jc/latest/get-started)
must the added to the Jira site for these Groovy scripts to function. 

> Note that the automations that power the work types (aka ticket types) in the
> SMS Jira are either implemented with **Jira-native rules** (see the
> _Jira Admin Settings_ of the Jira site where SMS is deployed, section
> **System**, then navigate to _Automation/Global automation_), or
> **Groovy scripts** for the cases where more advanced processing wass required
> than what was feasible to build in the Jira-native visual rule builder.
