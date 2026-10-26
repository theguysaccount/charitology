---
title: Moral Frameworks Program
group: Research
order: 2
summary: Compares how eight moral frameworks rank the same causes, so givers can see where values agree, where they part and what each one leaves out.
status: seeded
statusNote: Eight frameworks and 17 cause areas are sketched in an open data file that drives the Values Compass and the Portfolio Builder. Each sketch still needs review by people who hold that view.
conditions: [single-lens]
firstMilestone: Every framework sketch reviewed by at least two people who hold that framework, with their changes merged and credited.
help:
  - Review the framework closest to your own values in src/data/frameworks.json and open a pull request explaining any score you would change.
  - Open an issue labeled program proposing a framework or tradition the file leaves out.
  - Write up a disagreement between two frameworks for the Disagreement Register.
related: [/tools/values-compass/, /tools/portfolio-builder/, /record/disagreements/, /open-problems/moral-parliament-in-practice/]
---

## What it is

Ask a welfare-minded giver, a justice-minded giver and a giver guided by faith to rank the same causes, and you get three different lists. The Moral Frameworks Program studies those differences on purpose. It maintains `src/data/frameworks.json`, the open file behind the [Values Compass](/tools/values-compass/) and the [Portfolio Builder](/tools/portfolio-builder/).

## How it works

The file describes eight frameworks: welfare, rights and duties, justice, care, faith and tradition, future generations, all life and flourishing. For each one it records the question the framework asks, a few thinkers associated with it and a priority from 0 to 5 for each of 17 cause areas.

Those numbers are editorial sketches, not measurements, and the file says so. Real philosophers disagree inside every framework. So the program’s main work is review. People who hold a framework check its sketch, argue about the scores in public and change them by pull request with their reasons attached. Where two frameworks reach opposite conclusions about the same gift, the program writes the disagreement up for the [Disagreement Register](/record/disagreements/).

## Why it matters for the system

The [Single Lens](/diagnosis/single-lens/) is the condition Charitology was founded to treat: considering several frameworks may reveal choices that one lens misses. This is a hypothesis, not a measured claim about most givers. A shared, public map of the frameworks turns an invisible lens into a visible choice. A giver can see their own priorities, see how the same money looks through the other seven lenses and decide knowing both. The map also gives researchers a common starting point for [Open Problem 16, Moral Parliament in Practice](/open-problems/moral-parliament-in-practice/), which asks how to allocate money when you aren’t sure which framework is right.

## Risks and limits

A score from 0 to 5 can flatten a tradition that took centuries to build, and it can look more precise than it is. The file already labels its scores as sketches. The program would add who reviewed each sketch and keep the reasoning next to the number. Eight frameworks are also not all of them, and the list can grow whenever someone makes a good case for a missing one.

## What success looks like

Within three years, every framework has been reviewed by people who hold it and the sketches have changed because of that review. The tools built on them show the reasoning and reviewers behind each score.
