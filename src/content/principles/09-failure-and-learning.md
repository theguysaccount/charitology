---
title: Failure and learning
chapter: 9
summary: A field learns most from what doesn’t work, and charity rarely says what doesn’t work. This chapter covers why failure stays silent, what the silence costs, and the practices that turn failure into shared knowledge, from failure reports to replication, red teams and scored forecasts.
sources:
  - title: '“Scared Straight” and other juvenile awareness programs for preventing juvenile delinquency'
    publisher: Anthony Petrosino and colleagues, Cochrane Database of Systematic Reviews
    year: 2022
    url: https://www.cochrane.org/evidence/CD002796_scared-straight-and-other-juvenile-awareness-programs-preventing-juvenile-delinquency
  - title: 'Failure Reports: A how to guide'
    publisher: Fail Forward, via the National Center for Family Philanthropy
    year: 2016
    url: https://www.ncfp.org/knowledge/failure-reports-a-how-to-guide
  - title: Our Mistakes
    publisher: GiveWell
    url: https://www.givewell.org/about/our-mistakes
  - title: Errors in DCP2 cost-effectiveness estimate for deworming
    publisher: The GiveWell Blog
    year: 2011
    url: https://blog.givewell.org/2011/09/29/errors-in-dcp2-cost-effectiveness-estimate-for-deworming/
  - title: Estimating the reproducibility of psychological science
    publisher: Open Science Collaboration, Science 349
    year: 2015
    url: https://doi.org/10.1126/science.aac4716
  - title: On the Reproducibility of Psychological Science
    publisher: Valen E. Johnson and colleagues, Journal of the American Statistical Association
    year: 2016
    url: https://pmc.ncbi.nlm.nih.gov/articles/PMC5976261/
  - title: 'Revisiting and Rethinking the Identifiable Victim Effect: Replication and Extension of Small, Loewenstein, and Slovic (2007)'
    publisher: 'Maximilian Maier, Yik Chun Wong and Gilad Feldman, Collabra: Psychology 9(1)'
    year: 2024
    url: https://doi.org/10.1525/collabra.90203
  - title: Brier score tutorial
    publisher: scores (Python package documentation), citing Glenn W. Brier, Monthly Weather Review 78(1), 1950
    url: https://scores.readthedocs.io/en/0.9.3/tutorials/Brier_Score.html
---

## The most valuable data nobody publishes

In medicine, a failed drug trial can be published as a result in its own right, and the next team learns from it. In charity, a published failure can cost the next grant. So the safe move is silence. Programs that don’t work tend to fade quietly from annual reports, and when someone tries the same idea a few years later, they start from zero. That is [the Silence About Failure](/diagnosis/silence-about-failure/), and it costs the field the data it most needs: what doesn’t work, and why.

Nobody is to blame for this. People’s jobs, and the people they serve, depend on the next grant. The incentive is the problem, not the people facing it.

## When good intentions do harm

The cost of silence is not only wasted money. Some programs do harm, and only careful comparison reveals it. “Scared Straight” programs take young people at risk of offending on organized visits to prisons, to deter them from crime. The idea sounds sensible. A Cochrane review of nine trials found that the programs increased offending compared with doing nothing. See [the case study](/record/case-studies/scared-straight/), and the [Historical Case Studies](/record/case-studies/) for other cases worth learning from, such as [PlayPumps](/record/case-studies/playpumps/) and [D.A.R.E.](/record/case-studies/dare/)

When does charity cause harm, and through what mechanisms? That is [Open Problem 20, When Charity Harms](/open-problems/when-charity-harms/).

## When the evidence itself fails

Failure is not only something programs do. Studies fail too.

In 2015 the Open Science Collaboration repeated 100 published psychology studies. Ninety-seven percent of the originals had reported statistically significant results, but only 36 percent of the replications did, and the effects found were on average about half as large. Some findings that shape how charities raise money are now being retested. A pre-registered replication published in 2024 found no support for the [identifiable victim effect](/record/encyclopedia/identifiable-victim-effect/), one of the best-known findings about giving.

Estimates fail as well. In 2011 GiveWell found five errors in the spreadsheet behind a standard global health reference’s cost-effectiveness estimate for deworming. Together they overstated it by a factor of about 100. Nobody has systematically checked how often charity impact findings hold up when tested again. That is [Open Problem 10, the Replication Rate](/open-problems/the-replication-rate/), and the [Replication Program](/programs/replication-program/) is meant to work on it.

## Organizations that publish their failures

A few organizations have shown that admitting failure is possible. Engineers Without Borders Canada has published failure reports since 2008, and a how-to guide based on its process, written by Fail Forward, helps other organizations do the same. GiveWell keeps a public page listing its own mistakes in research, grantmaking, strategy and operations, and the lessons it drew from them. Whether disclosure like this costs or earns trust, and funding, has not been measured. That is [Open Problem 9, the Failure Commons](/open-problems/the-failure-commons/). Charitology’s [Failure Archive](/record/failure-archive/) is the commons in seed form. See also the [Failure Lab](/programs/failure-lab/).

## Practices that turn failure into learning

Science has developed habits that make failure useful. Each has a place in charity.

- **Pre-registration.** State in advance what you will measure and what would count as success, so a disappointing result can’t be quietly redefined. The 2024 replication above was pre-registered.
- **Red teams.** Ask people whose job is to find the flaws to attack a claim before it is published. Charitology publishes no ratings of named charities until its method has passed public [red-team](/programs/red-team/) review.
- **Scored forecasts.** Before funding a program, write down how likely you think it is to work, then check. A [Brier score](/record/lexicon/#brier-score) measures how close probability forecasts come to what happened, from 0 for perfect to 1 for the worst possible. Over many forecasts, it shows whether a funder’s confidence is [calibrated](/record/lexicon/#calibration). See the [Forecasting Platform](/tools/forecasting-platform/).
- **Failure reports.** Publish what didn’t work, what was learned and what changed, on a regular schedule, so that disclosure becomes routine rather than an admission.

## Charitology’s own failures

A field that asks others to admit failure has to do it first. Every Charitology page links to a prefilled issue for corrections and red-team challenges. Mistakes are fixed in the open, and significant ones are noted when they are fixed. Its own founding claims are labeled hypotheses, and some of them may turn out to be wrong. When the [Depth Census](/open-problems/the-depth-census/) or any other test contradicts a condition in the Diagnosis, the condition should come off the list, in public. That is what would make Charitology a science rather than a set of opinions.
