---
title: Cost-Effectiveness Model Kit
group: For nonprofits and funders
order: 2
summary: Build a cost-per-outcome model with a low, likely and high value for every input, run 5,000 simulated draws in your browser, and see the range of results and which inputs drive them.
status: live
conditions: [measurement-gap, overhead-myth]
help:
  - Share a model for a type of program, with a source for every low, likely and high value, in an issue tagged tools.
  - Propose a simple way to let inputs move together, such as cost and people reached, and explain how to check it.
  - Check the math in src/lib/client/models.ts and src/lib/client/montecarlo.ts and report anything wrong.
related: [/tools/impact-calculator/, /tools/grant-evaluator/, /open-problems/measuring-the-source/, /open-problems/discounting-the-future/]
---

## How it works

A cost-effectiveness model asks one question: how much does each unit of good cost? The kit breaks that question into parts you can reason about, and asks for a low, likely and high value for each:

- total program cost
- people reached
- the chance the program works as intended
- the effect per person, per year, in an outcome unit you name
- how many years the effect lasts
- the share of the outcome that would have happened anyway

One more input, the annual discount rate, takes a single value.

The kit then runs the model 5,000 times. Each run, or draw, picks every input at random between its low and high values, most often near likely. The spread of the 5,000 answers shows how uncertain the result is, given what you entered.

You can save models in your browser, load them again, download the inputs and results as a CSV file, or start from a clearly fictional example.

## The method

**The formula.** Cost per outcome = total cost ÷ (people reached × chance it works × effect per person per year × discounted years × the share that would not have happened anyway).

**Discounting.** The first year of effect counts in full. Each later year counts 1 ÷ (1 + rate) as much as the one before, so at 4% the second year counts about 96% as much as the first. A rate of 0 counts every year the same. Whether future outcomes should count less at all is [Open Problem 13, Discounting the Future](/open-problems/discounting-the-future/).

**The draws.** Each input follows a triangular distribution: it never falls below low or above high, and it is most likely near likely. Draws come from a seeded random number generator, so the same inputs and seed always give exactly the same results, and anyone can reproduce your numbers. Changing the seed shows how much the results move by chance alone.

**The outputs.** The headline is the median cost per outcome, the middle of the 5,000 draws, with a 90% interval: 90% of draws fall between its two ends. The histogram shows how the draws spread. The sensitivity chart takes one input at a time from its low to its high value, with every other input at likely, and shows how far the cost per outcome moves. The longest bar is the input where better evidence would help most.

## What it isn’t

It isn’t a measurement. The model can only be as good as its inputs, and the interval only reflects the uncertainty you put in. Ranges that are too narrow give results that look surer than they are.

It makes simplifications you should know about. Inputs are drawn independently, though in real programs some move together. The chance of working is treated as a scaling factor, so the result is an expected value that hides the real chance of achieving nothing. It counts one outcome, so side effects, harms and spillovers to other people are left out.

A cost per outcome also isn’t the whole picture. Overhead ratios tell you even less, which is [the Overhead Myth](/diagnosis/overhead-myth/), but cost-effectiveness favors what can be counted. Work at the source end of the depth scale rarely fits a model like this one. That is [the Measurement Gap](/diagnosis/measurement-gap/) at its widest, and [Open Problem 3, Measuring the Source](/open-problems/measuring-the-source/).
