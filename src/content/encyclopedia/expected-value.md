---
title: Expected value
summary: The probability-weighted average of an action’s possible results. It is the standard way to compare a sure thing with a long shot, and it misleads when the probabilities are guesses.
aliases: [EV, expected impact, probability-weighted value]
conditions: [measurement-gap, short-horizon]
related: [/record/encyclopedia/moral-uncertainty/, /record/encyclopedia/cost-effectiveness-analysis/, /tools/forecasting-platform/, /programs/forecasting-tournaments/, /record/lexicon/#expected-value]
sources:
  - title: Why we can’t take expected value estimates literally (even when they’re unbiased)
    publisher: Holden Karnofsky, The GiveWell Blog
    year: 2011
    url: https://blog.givewell.org/2011/08/18/why-we-cant-take-expected-value-estimates-literally-even-when-theyre-unbiased/
  - title: Moral Uncertainty
    publisher: William MacAskill, Krister Bykvist and Toby Ord, Oxford University Press
    year: 2020
    url: https://doi.org/10.1093/oso/9780198722274.001.0001
  - title: 'Stop the Robot Apocalypse: The New Utilitarians'
    publisher: Amia Srinivasan, London Review of Books 37(18)
    year: 2015
    url: https://www.lrb.co.uk/the-paper/v37/n18/amia-srinivasan/stop-the-robot-apocalypse
  - title: A framework for comparing global problems in terms of expected impact
    publisher: Robert Wiblin, 80,000 Hours
    year: 2016
    url: https://80000hours.org/articles/problem-framework/
---

The **expected value** of an action is what you get if you multiply each possible result by its probability and add them up. A program that has a 10 percent chance of helping 10,000 people has an expected value of helping 1,000 people, the same as a program certain to help 1,000. Expected value lets a giver compare a sure thing with a long shot on one scale.

## Why it matters for giving

Much of the most ambitious work in charity is a long shot: research that may find nothing, advocacy that may lose, a campaign to change a norm that may take decades or fail. Without some way to weigh probability against size, a giver can only choose between “certain” and “hopeful.” Expected value turns that into a question with numbers in it.

## Three cautions

**The inputs are often guesses.** Holden Karnofsky of GiveWell argued in 2011 that an explicit expected-value estimate, built from many rough inputs, should not be taken literally even when its errors are not biased in either direction. It should be combined with a prior view of what similar actions usually achieve. The less certain the estimate, the more it should be pulled toward that prior, so a dramatic but weakly supported claim counts for little.

**Tiny chances of huge stakes can take over.** If a result is large enough, even a very small probability can dominate the sum. Philosophers call the extreme version of this *fanaticism*, and MacAskill, Bykvist and Ord treat it as a central problem for anyone deciding under [moral uncertainty](/record/encyclopedia/moral-uncertainty/). The philosopher Amia Srinivasan has argued that expected-value reasoning about speculative risks can end up justifying whatever its users already favored.

**It ignores attitudes to risk.** Maximizing expected value treats a sure good and a gamble with the same average as equal. 80,000 Hours calls ignoring risk aversion a reasonable approximation for its own purposes. Many givers reasonably prefer some certainty. A portfolio can hold both.

## Getting the probabilities right

Expected value is only as good as its probabilities. Forecasters can be scored, for example with a [Brier score](/record/lexicon/#brier-score), and a forecaster whose 70 percent predictions come true about 70 percent of the time is [calibrated](/record/lexicon/#calibration). Charitology’s [Forecasting Platform](/tools/forecasting-platform/) and [Forecasting Tournaments](/programs/forecasting-tournaments/) are meant to make the probabilities in giving decisions testable.
