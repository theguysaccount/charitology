---
title: Impact Calculator
group: For donors
order: 5
summary: See what a gift could achieve, as a range, for interventions with a published cost per outcome, and see which interventions have no reliable per-dollar estimate at all.
status: live
conditions: [measurement-gap, missing-feedback-loop]
help:
  - Add a sourced cost field to an intervention in src/content/interventions/, with the outcome it counts, an as-of date and a note on what the range covers.
  - Propose a way to put per-dollar numbers on source-level work under Open Problem 3, Measuring the Source.
  - Suggest a better way to explain the share that would have happened anyway, in an issue tagged tools.
related: [/tools/compare-tool/, /tools/cost-effectiveness-model-kit/, /open-problems/measuring-the-source/, /open-problems/the-counterfactual-problem/]
---

## How it works

Pick an intervention from the [Intervention Database](/record/interventions/), enter what you want to give and say how much of it you think would have happened anyway. The calculator shows what the gift could pay for as a range, such as “between 0.18 and 0.33 lives saved”, with the source, its date and its caveats next to it.

Only entries that publish a cost per outcome allow this math. Every other entry is listed as having no reliable per-dollar estimate published. That list is a finding in its own right: it shows [the Measurement Gap](/diagnosis/measurement-gap/), the distance between what charities do and what anyone has measured.

If you have a figure from a source you trust, switch to your own numbers: name the outcome and enter its cost, low and high.

## The math

Only the share of your gift that would not have happened anyway counts as yours:

- **Counted as yours** = amount × (1 − share that would have happened anyway)
- **Fewest outcomes** = counted ÷ high cost per outcome
- **Most outcomes** = counted ÷ low cost per outcome

The range comes straight from the source’s own low and high costs. The calculator never narrows it, never picks a point inside it and never fills in a number that hasn’t been published.

The “would have happened anyway” share is what economists call the counterfactual. Your gift might replace money the charity would have raised elsewhere, or work another funder would have paid for. Nobody knows that share for most gifts. Estimating it cheaply is [Open Problem 4, the Counterfactual Problem](/open-problems/the-counterfactual-problem/). Some published cost figures already allow for it, so read the source’s method before you set the slider, or you may count it twice.

## What it isn’t

It isn’t a rating of any charity, and it isn’t a promise about your gift. A cost per outcome is an average from a model. It can’t say whether a particular charity can use more money well right now.

Its biggest blind spot is built in. Work near the source end of the [depth scale](/record/encyclopedia/symptoms-and-sources/), such as changing a story, a norm or an institution, rarely has per-dollar numbers, because its effects are diffuse, shared and delayed. A calculator like this one will always favor what can be counted. Treat a missing number as unmeasured, not as small. [Open Problem 3, Measuring the Source](/open-problems/measuring-the-source/) is the work of closing that gap.

Everything runs in your browser. A share link stores your inputs in the link itself, not on any server.
