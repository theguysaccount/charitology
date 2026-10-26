---
title: Forecasting Platform
group: For everyone
order: 3
summary: Predict what will happen in the charity system, put a number on it and get scored when the answer arrives. Forecasts are pull requests, so the record is public and permanent.
status: live
conditions: [missing-feedback-loop, short-horizon]
help:
  - Add a forecast to any open question with a pull request.
  - Propose a new question with clear resolution criteria in src/content/forecasts/.
  - Resolve a closed question by citing the source that settles it.
related: [/programs/forecasting-tournaments/, /open-problems/the-question-of-questions/]
---

## How it works

Each question has a precise resolution rule and a closing date. To forecast, add your GitHub handle, a probability and the date to the question’s file. The tool on this page writes the exact lines for you. When a question resolves, every forecaster’s latest forecast is scored.

## Scoring

Forecasts are scored with the **Brier score**: the square of the difference between your probability and what happened, where YES counts as 1 and NO as 0. Lower is better. A perfect forecast scores 0. Always saying 50 percent scores 0.25. Being confidently wrong scores close to 1. The leaderboard averages each forecaster’s scores across resolved questions.

## Why forecasting belongs in charitology

Charity has almost no feedback loop: predictions about what will work are rarely written down, so nobody learns whose judgment to trust. Public, scored forecasts are a cheap way to build that track record, a small treatment for [the Missing Feedback Loop](/diagnosis/missing-feedback-loop/).

## What it isn’t

It isn’t a betting market. No money changes hands, and no personal data is collected beyond the handle you choose to publish.
