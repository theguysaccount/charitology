---
title: Forecasting Tournaments
group: Research
order: 10
summary: People predict which interventions and policies will work before the results are in, and every forecast is scored with a Brier score when its question resolves.
status: live
statusNote: Questions and forecasts are added by pull request and shown on the Forecasting Platform. Each forecast is scored when its question resolves.
conditions: [missing-feedback-loop, short-horizon]
firstMilestone: The first ten questions resolved and scored, with the scores published and a short report on what the forecasts got right and wrong.
help:
  - Add your forecast to an open question with a pull request to src/content/forecasts/, giving a probability and a short rationale.
  - Open an issue labeled program:forecasting proposing a question that will resolve clearly by a stated date.
  - When a question closes, help resolve it by finding the source that settles it.
related: [/tools/forecasting-platform/, /open-problems/the-question-of-questions/, /open-problems/measuring-the-source/, /programs/replication-program/]
sources:
  - title: Verification of forecasts expressed in terms of probability
    publisher: Glenn W. Brier, Monthly Weather Review 78(1)
    year: 1950
    url: https://web.archive.org/web/20171023012737/https://docs.lib.noaa.gov/rescue/mwr/078/mwr-078-01-0001.pdf
    note: Scan of the original article, archived from the NOAA Central Library.
  - title: A new measure of forecast skill using the Brier score
    publisher: Richard P. McNulty, National Weather Service Central Region Technical Attachment 88-26
    year: 1988
    url: https://repository.library.noaa.gov/view/noaa/33800/noaa_33800_DS1.pdf
    note: States the common form of the score used by the National Weather Service.
  - title: Social Science Prediction Platform
    publisher: Social Science Prediction Platform
    url: https://socialscienceprediction.org/
    note: Stefano DellaVigna and Eva Vivalt are listed as principal investigators on the platform’s About page.
---

## What it is

Before a study reports or a policy takes effect, people already expect something. Forecasting Tournaments writes those expectations down and checks them. Each question asks for the probability that something specific will happen by a stated date, such as a trial finding a measurable effect or a program reaching its target. When the date comes, every forecast is scored.

## How it works

Questions and forecasts live in the repository and appear on the [Forecasting Platform](/tools/forecasting-platform/). Anyone can add a forecast by pull request: a probability between 0 and 1, a date and, ideally, a short rationale. Each question states in advance exactly what will count as yes.

Forecasts are scored with the Brier score, which Glenn Brier of the U.S. Weather Bureau proposed in 1950 for weather forecasts given as probabilities. In its common form, the score is the squared gap between the probability a forecaster gave and what happened, counted as 1 if it happened and 0 if it didn’t, averaged over questions. Lower is better, and 0 is perfect. Brier was looking for a scheme that “cannot influence the forecaster in any undesirable way.”

Researchers already do a version of this. The Social Science Prediction Platform, led by Stefano DellaVigna and Eva Vivalt, collects expert forecasts of the effects of social programs before they are tested. Charitology applies the same idea to giving.

## Why it matters for the system

The [Missing Feedback Loop](/diagnosis/missing-feedback-loop/) means a giver rarely learns whether their judgment was right. A scored forecast is a small, fast loop: you say what you expect, the world answers and the score tells you how well you judged. Over many questions, the scores show whose judgment holds up.

Forecasting also pushes against the [Short Horizon](/diagnosis/short-horizon/). A question can run for ten years, which puts slow work on the record so the field can later learn from the gap between what it expected and what happened.

## Risks and limits

Questions that resolve quickly and cleanly are the easiest to write, which can pull the tournament toward short-term, measurable outcomes. The program should keep long-range questions in the mix on purpose. With few forecasters, scores are noisy, so any score should be read alongside the number of questions behind it.

## What success looks like

Within three years, hundreds of forecasts have been scored and forecasters’ track records are public. Funders look at the forecasts before backing new programs.
