---
title: AI Charitologist
group: For everyone
order: 1
summary: Search Charitology’s published Record with a question, then read matching passages grouped by section and linked to their pages. This version retrieves text rather than generating answers.
status: live
statusNote: Browser retrieval over the Record is available. Conversational AI and provider activation are deferred; no language-model backend is connected.
conditions: [missing-profession, measurement-gap]
help:
  - Report a question it answered badly in an issue labeled question.
  - Write the missing entry when it says the Record has no answer.
  - Help build the generative layer to the rules below.
related: [/search/, /record/encyclopedia/, /open-problems/]
---

## How it works today

Your question is matched against the site’s search index, and matching passages come back grouped by section, each linked to its page. Nothing is generated. The passages can still contain errors or unreviewed claims, so follow their evidence labels and sources. When few passages match, the tool asks you to help fill the gap.

The search index is built when the site is built and runs in your browser. Your question isn’t sent anywhere.

## A future conversational version (deferred)

A conversational version would need a separately configured provider and tests of its actual answers. The owner has deferred that setup. Before activation, it must satisfy these proposed requirements:

1. **Answer only from the Record.** No outside knowledge, and no guessing.
2. **Cite every sentence** with a link to the passage it came from.
3. **Say “unknown” when it is unknown**, and point to the open problem.
4. **Keep the evidence labels**: a hypothesis is never presented as established.
5. **No ratings or recommendations of named charities.**

These are acceptance requirements, not claims that a model has passed them. The current tool stays retrieval-only; no model credentials or conversation backend are provisioned by using it.

## What it isn’t

It isn’t financial, legal or tax advice, and it isn’t a recommendation to give to any organization.
