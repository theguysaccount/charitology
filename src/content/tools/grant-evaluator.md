---
title: Grant Evaluator
group: For nonprofits and funders
order: 3
summary: Review a proposal on nine dimensions, from source depth to risk of harm, keep unknowns as unknowns, compare your saved proposals side by side and export a review memo.
status: live
conditions: [symptom-trap, missing-voice, restriction-reflex]
help:
  - Improve a scoring guide with a pull request to src/lib/client/rubric.ts that explains what the change fixes.
  - Test the rubric on past grants whose results are now known, and report in an issue whether the scores tracked what happened.
  - Propose a way to decide when a grant should be restricted, under Open Problem 8, the Optimal Restriction.
related: [/tools/cost-effectiveness-model-kit/, /diagnosis/restriction-reflex/, /diagnosis/missing-voice/, /open-problems/the-optimal-restriction/]
---

## How it works

Score a proposal on nine dimensions:

1. **Source depth:** where the work acts, from relief to source, on the [depth scale](/record/encyclopedia/symptoms-and-sources/)
2. **Evidence:** how well we know this kind of work does what the proposal claims
3. **Counterfactual:** whether it would happen anyway without this grant
4. **Feedback and learning:** whether the applicant measures what changes and changes course
5. **Voice of the people served:** whether the people the work serves shape what it does
6. **Cost-effectiveness:** how much good per dollar, compared with other ways to reach the goal
7. **Durability:** how long results last after the money stops
8. **Team and track record:** whether this team can do what it proposes
9. **Risk of harm:** scored so that higher means safer

Each dimension takes a score from 0 to 4, with a one-line guide for every score, or “unknown”. Each has a notes field for your reasoning. You can save as many proposals as you like in your browser, compare them in one table and download a review memo in Markdown or the full record as JSON.

## Unknown stays unknown

A form that demands a number in every box makes a reviewer who doesn’t know guess, and the guess disappears into the total. Here, unknown is an answer.

The weighted result is a range. Its low end counts every unknown as 0 and its high end counts every unknown as 4. With nothing unknown, the range closes to a single value. This is a missing-data range, not a confidence interval: it shows how much the answer could move once the missing facts are in, not how sure you are of the scores you gave. The unknowns are listed as the questions to ask before deciding.

Weights start equal and you can change them. The same weights apply to every saved proposal, so the comparison table compares like with like.

## Why these dimensions

Each one checks for a condition in the [Diagnosis](/diagnosis/). Source depth makes the choice between relief and source work visible, against [the Symptom Trap](/diagnosis/symptom-trap/). Voice of the people served asks who decides, against [the Missing Voice](/diagnosis/missing-voice/). Feedback, counterfactual and cost-effectiveness ask what the money changes, not how it is spent.

Depth describes; it doesn’t grade. Every level of work is needed. Weight depth by how far upstream you want a particular grant to reach.

## What it isn’t

It isn’t a rating of any organization, and its scores aren’t measurements. The guides are editorial judgments, published in `src/lib/client/rubric.ts` for anyone to challenge. A rubric can’t replace talking with the applicant and the people they serve.

It doesn’t tell you how to fund. A strong review is a reason to trust a team’s judgment, and tying the grant to line items and short timelines can undo that. Read [the Restriction Reflex](/diagnosis/restriction-reflex/) before you set conditions. When restriction helps is still [Open Problem 8](/open-problems/the-optimal-restriction/).

Everything stays in your browser. Nothing is sent to a server, and clearing your browser’s storage removes your saved proposals, so download the JSON to keep a copy.
