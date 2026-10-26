---
title: AI Charitologist
group: For everyone
order: 1
summary: Ask any question about giving and get answers drawn only from what Charitology has published, grouped by where they come from, with every passage linked.
status: live
statusNote: Live as retrieval over the Record. The generative layer is designed and will cite the Record for every sentence.
conditions: [missing-profession, measurement-gap]
help:
  - Report a question it answered badly in an issue labeled question.
  - Write the missing entry when it says the Record has no answer.
  - Help build the generative layer to the rules below.
related: [/search/, /record/encyclopedia/, /open-problems/]
---

## How it works today

Your question is matched against every page in the Record, the Diagnosis, the Method, the Programs and the Tools, and the best passages come back grouped by section, each linked to its page. Nothing is generated, so nothing is made up. When the Record has little to say, the tool says so and asks you to help fill the gap.

The search index is built when the site is built and runs in your browser. Your question isn’t sent anywhere.

## The generative layer (designed)

A language model will eventually write short answers on top of these passages. It will be held to rules stricter than most AI systems:

1. **Answer only from the Record.** No outside knowledge, and no guessing.
2. **Cite every sentence** with a link to the passage it came from.
3. **Say “unknown” when it is unknown**, and point to the open problem.
4. **Keep the evidence labels**: a hypothesis is never presented as established.
5. **No ratings or recommendations of named charities.**

Until a model can meet those rules reliably, and that has been tested in public, the tool stays retrieval-only.

## What it isn’t

It isn’t financial, legal or tax advice, and it isn’t a recommendation to give to any organization.
