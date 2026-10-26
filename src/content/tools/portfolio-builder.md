---
title: Portfolio Builder
group: For donors
order: 2
summary: Split a giving budget across causes when you aren’t sure which moral framework is right, compare two ways of doing it, and see how much they agree.
status: live
conditions: [single-lens, symptom-trap]
help:
  - Propose a better allocation method in an issue tagged open-problem, citing Open Problem 16.
  - Improve the framework priorities in src/data/frameworks.json with a pull request that explains your reasoning.
related: [/tools/values-compass/, /tools/one-click-split/, /open-problems/moral-parliament-in-practice/]
---

## Why a portfolio

Most people give as if one moral framework were certainly right. Few are that sure. If you think welfare matters most but justice and future generations count too, your giving can reflect all three in proportion. Philosophers call this acting under [moral uncertainty](/record/encyclopedia/moral-uncertainty/).

## The two methods

**Each lens spends its share.** Every framework gets a slice of your budget equal to your credence in it and spends that slice on its own top causes. This resembles a *moral parliament*, where each view gets seats in proportion to your confidence in it. It tends to spread money widely.

**Best on average.** Each cause gets a score: its priority under each framework, weighted by your credence. The money then goes to the five highest-scoring causes. This resembles maximizing *expected choice-worthiness*. It tends to concentrate money.

When the two disagree, your answer depends on the method as much as on your values. Nobody has settled which method is right. That is [Open Problem 16](/open-problems/moral-parliament-in-practice/), and the builder shows you where it bites.

## Relief or sources

The slider shifts money toward causes whose work tends to sit deeper on the [depth scale](/method/#depth), or toward relief. Neither end is correct. The point is to choose your mix on purpose, which is the treatment for [the Symptom Trap](/diagnosis/symptom-trap/).

## What it isn’t

The builder allocates across cause areas, not charities. To turn a portfolio into gifts, take it to [One-Click Split](/tools/one-click-split/). The framework priorities are editorial judgments, published in `src/data/frameworks.json` for anyone to challenge.
