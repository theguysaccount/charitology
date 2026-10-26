---
title: Charitology Wrapped
group: For donors
order: 8
summary: Turn a year of logged gifts into a card you can share, showing where your giving acted and the kind of giver it makes you, with or without the dollar amounts.
status: live
conditions: [prestige-economy, story-bias]
help:
  - Propose a new archetype, or warmer wording for one, in an issue. The text lives in src/lib/client/archetype.ts.
  - Share your card, then tell us in a discussion whether it started a conversation. That is early evidence for Open Problem 15.
  - Design a second card layout that works at 1080 × 1350 and propose it in a pull request.
related: [/tools/giving-dashboard/, /open-problems/the-status-flip/, /diagnosis/prestige-economy/]
---

## How it works

Wrapped reads the gifts you log in the [Giving Dashboard](/tools/giving-dashboard/). Pick a year and it builds a card: your total, how many organizations you gave to, your top cause, your mix across the five depth levels, your source share and a giving archetype. Download the card as a 1080 × 1350 image, sized for phone screens and social posts, or copy a plain-text summary. With no gifts logged, you can try it on fictional sample data.

**Hide dollar amounts** swaps every amount for shares and counts. A card about where your giving acted doesn’t need to say how much it was.

The card is a small experiment toward [Open Problem 15, the Status Flip](/open-problems/the-status-flip/). Charitology’s working hypothesis, [the Prestige Economy](/diagnosis/prestige-economy/), is that status in giving follows a gift’s size and visibility rather than what it achieved. Can a card that shows *how* you gave, across many needs rather than one story, become something people are proud to post? Nobody has tested that yet. The card also leads with a mix of causes and depths instead of a single face, a gentle push against [the Story Bias](/diagnosis/story-bias/).

## The archetypes

Your archetype comes from your depth mix, measured in dollars. When one level carries at least 40 percent of your giving and leads the next level by at least five points, it names you:

| Most of your giving at | Your archetype |
| --- | --- |
| Relief | The First Responder |
| Repair | The Rebuilder |
| Prevention | The Protector |
| Structure | The Architect |
| Source | The Root-Seeker |

When no level leads like that, you are the Balancer. Each archetype comes with one line about what that kind of giving does and one next frontier, a suggestion for something to try next year. No archetype is better than another. Depth describes where a gift acts. It doesn’t grade it, and every level is needed.

## What it isn’t

It isn’t a measure of impact. The card shows where your money went and where you placed each gift on the depth scale, not what the gifts achieved. Archetypes are labels for a mix, not judgments of a person. The card is drawn in your browser, and nothing is uploaded unless you share the image yourself.
