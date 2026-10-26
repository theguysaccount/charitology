---
title: Impact Measurement Toolkit
group: For nonprofits and funders
order: 1
summary: Build a theory of change from the problem and its source to outcomes and indicators, with feedback from the people served, a comparison plan and a stop rule. Keep several drafts and export them as Markdown or JSON.
status: live
conditions: [measurement-gap, missing-feedback-loop, missing-voice, symptom-trap]
help:
  - Share a real, published theory of change that others could learn from, with a pull request or an idea issue.
  - Improve the prompts for what is still missing, in src/lib/client/theory-of-change.ts, with a source for each.
  - Help with Open Problem 3, Measuring the Source, by proposing indicators for structure- and source-level work.
related: [/tools/due-diligence-checklist/, /diagnosis/measurement-gap/, /open-problems/measuring-the-source/]
sources:
  - title: What is Theory of Change?
    publisher: Center for Theory of Change
    year: 2026
    url: https://www.theoryofchange.org/what-is-theory-of-change/
    note: Undated page, accessed October 2026.
  - title: Logic Model Development Guide
    publisher: W.K. Kellogg Foundation
    year: 2004
    url: https://www.naccho.org/uploads/downloadable-resources/Programs/Public-Health-Infrastructure/KelloggLogicModelGuide_161122_162808.pdf
    note: Defines outputs, outcomes and impact. Copy hosted by NACCHO.
  - title: Introduction to randomized evaluations
    publisher: Abdul Latif Jameel Poverty Action Lab (J-PAL)
    year: 2023
    url: https://www.povertyactionlab.org/resource/introduction-randomized-evaluations
  - title: Realizing the Promise of High-Quality Feedback
    publisher: Juan Clavijo and Melinda Tuan, Feedback Labs
    year: 2021
    url: https://feedbacklabs.org/news-and-insights/realizing-the-promise-of-high-quality-feedback/
  - title: Closing the Feedback Loop
    publisher: Kristine Wong, Stanford Social Innovation Review
    year: 2016
    url: https://ssir.org/articles/entry/closing_the_feedback_loop
  - title: Instructions for Form 990, Return of Organization Exempt From Income Tax (2025)
    publisher: Internal Revenue Service
    year: 2025
    url: https://www.irs.gov/instructions/i990
    note: Part III asks for accomplishments in measures such as clients served.
  - title: Outcome and evidence planner
    publisher: Systemic Altruism
    year: 2026
    url: https://charities.systemicaltruism.com/toolkit/
    note: Accessed October 2026.
---

## How it works

Fill in the parts of a theory of change in any order and watch the chain build itself in the preview: the problem people experience, the source that produces it, what the program does, what that produces, and what should change in the short, medium and long term. Then add the parts that keep a plan honest: indicators with a baseline and a target, the assumptions the chain rests on, how the people served will give feedback, how you will compare results with what would have happened anyway, the result that would make you change course, and who reviews it.

The preview lists what is still missing, as prompts rather than a score. Drafts are saved only in this browser. Keep as many as you like, and export any of them as Markdown to share or JSON to import again later. **Load example** adds a fictional program, Millbrook Reading Circles, as a separate draft, so you can see how the parts fit together.

## The method

A theory of change starts from the long-term goal and works backward through the conditions that must hold for it to happen, as the Center for Theory of Change describes. This toolkit adds a step before that: separating the **problem** people experience from its **source**, and asking where on the [depth scale](/method/#depth) your work acts. Relief and source work are both needed. The point is to know which one you are doing, the treatment for [the Symptom Trap](/diagnosis/symptom-trap/).

It keeps **outputs** and **outcomes** apart. In the W.K. Kellogg Foundation’s logic model guide, outputs are the direct products of activities, and outcomes are changes in participants’ behavior, knowledge, skills, status or level of functioning. Outputs are easier to count. Even the Form 990 asks charities to describe accomplishments in measures such as clients served. The distance between the two is [the Measurement Gap](/diagnosis/measurement-gap/).

Three guardrails keep the plan honest. A **comparison** is needed because a program’s effect is the difference between what happened and what would have happened without it, which J-PAL calls the counterfactual. **Feedback from the people served** treats them as experts on their own lives. Listen4Good’s five-step model ends by reporting back to the people who answered, which is how [the Missing Feedback Loop](/diagnosis/missing-feedback-loop/) starts to close and [the Missing Voice](/diagnosis/missing-voice/) starts to count. A **stop rule**, written before the results arrive, makes it easier to act on them honestly.

For a second view of the same questions, Systemic Altruism’s [outcome and evidence planner](https://charities.systemicaltruism.com/toolkit/) is a related open tool. It adds an optional cost scenario.

## What it isn’t

It isn’t an evaluation, and it doesn’t judge whether a plan is good. A complete-looking theory of change can still be wrong, which is why the assumptions, the comparison and the reviewer matter. The prompts are suggestions, and a small program may reasonably leave some parts simple. Nothing you write leaves your browser unless you download it.
