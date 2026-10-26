---
title: Cost-effectiveness analysis
summary: Estimating how much good a program produces per dollar, so that options can be compared. The estimates are rough, and the differences they reveal can be enormous.
aliases: [CEA, cost per outcome, cost per DALY, cost per life saved]
conditions: [overhead-myth, measurement-gap]
related: [/tools/cost-effectiveness-model-kit/, /tools/impact-calculator/, /record/encyclopedia/expected-value/, /open-problems/the-exchange-rate-problem/, /record/lexicon/#cost-effectiveness]
sources:
  - title: The Moral Imperative toward Cost-Effectiveness in Global Health
    publisher: Toby Ord, Center for Global Development
    year: 2013
    url: https://cgdev.org/sites/default/files/1427016_file_moral_imperative_cost_effectiveness.pdf
  - title: Cost-Effectiveness
    publisher: GiveWell
    year: 2025
    url: https://www.givewell.org/how-we-work/our-criteria/cost-effectiveness
  - title: How Much Does It Cost to Save a Life?
    publisher: GiveWell
    year: 2024
    url: https://www.givewell.org/how-much-does-it-cost-to-save-a-life
  - title: Errors in DCP2 cost-effectiveness estimate for deworming
    publisher: The GiveWell Blog
    year: 2011
    url: https://blog.givewell.org/2011/09/29/errors-in-dcp2-cost-effectiveness-estimate-for-deworming/
  - title: Why we can’t take expected value estimates literally (even when they’re unbiased)
    publisher: Holden Karnofsky, The GiveWell Blog
    year: 2011
    url: https://blog.givewell.org/2011/08/18/why-we-cant-take-expected-value-estimates-literally-even-when-theyre-unbiased/
---

**Cost-effectiveness analysis** estimates the cost of producing one unit of a result: a life saved, a case of blindness cured, a year of healthy life added or a year of extra income. It answers the question in the [Giver’s Checklist](/method/#checklist): is this the cheapest way to get this result?

## Why it matters

Because the differences can be huge. In a 2013 essay for the Center for Global Development, the philosopher Toby Ord looked at 108 health interventions costed in *Disease Control Priorities in Developing Countries*, a standard reference. Their estimated cost-effectiveness ranged from 0.02 to 300 disability-adjusted life years (DALYs) per $1,000, with a median of 5. Moving money from the least to the most cost-effective would produce about 15,000 times the benefit, and moving it from the median to the best about 60 times. Ord noted that real differences may be smaller than the estimates, and argued that even a much smaller spread would still matter morally.

A **DALY** counts the years of life lost to a condition plus the years lived with a disability, weighted by how severe the disability is.

## How it is used

GiveWell calls cost-effectiveness the single most important input in its evaluations, but says it does not judge programs on it alone. Strength of evidence and track record also carry weight. Its models of its top charities have typically estimated an average cost of $3,000 to $5,500 to save a life, and it expects that cost to rise over time.

## How it goes wrong

- **Errors.** In 2011 GiveWell found five errors in the spreadsheet behind the same reference’s estimate for deworming. Together they overstated its cost-effectiveness by a factor of about 100.
- **Guessed inputs.** An estimate built from many rough guesses can be far off even when no single guess is biased. Holden Karnofsky argued that such estimates should be adjusted toward what similar programs usually achieve, more so the less certain they are. See [expected value](/record/encyclopedia/expected-value/).
- **Hidden values.** Every model has to say how much one outcome is worth against another, such as income against a death averted. GiveWell calls these *moral weights* and says donors may disagree with its choices.

## The limits

Cost-effectiveness works best when options share a unit. Comparing a life saved with a law changed or a species protected needs an exchange rate, and each candidate rate carries a moral framework. That is [Open Problem 2](/open-problems/the-exchange-rate-problem/). Source-level work is hardest of all to cost, because its effects are diffuse and slow. That is [Open Problem 3](/open-problems/measuring-the-source/). To build your own model, start with the [Cost-Effectiveness Model Kit](/tools/cost-effectiveness-model-kit/).
