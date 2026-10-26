---
title: One-Click Split
group: For donors
order: 9
summary: Split one giving decision across several charities, with whole-dollar amounts that add up exactly and a step-by-step list of where to give.
status: live
statusNote: The split planner is live. True one-click payment needs a licensed donation partner.
conditions: [single-lens, restriction-reflex]
help:
  - Know a regulated donation partner that could make the payment step real? Start a discussion, and say which licenses or registrations it holds.
  - Suggest a clearer step list or another export format in an issue.
related: [/tools/portfolio-builder/, /tools/giving-dashboard/, /diagnosis/restriction-reflex/]
sources:
  - title: Money Services Business (MSB) Registration
    publisher: Financial Crimes Enforcement Network, U.S. Department of the Treasury
    url: https://www.fincen.gov/money-services-business-msb-registration
  - title: Money Services Business Definition
    publisher: Financial Crimes Enforcement Network, U.S. Department of the Treasury
    url: https://www.fincen.gov/money-services-business-definition
  - title: Modernization of Money Transmission Laws
    publisher: Heidi Wicker and Audrey Carroll, Stinson LLP
    year: 2023
    url: https://www.stinson.com/newsroom-publications-modernization-of-money-transmission-laws
    note: Reports that every state except Montana requires a license to act as a money transmitter.
  - title: The Money Transmission Modernization Act
    publisher: Conference of State Bank Supervisors
    year: 2023
    url: https://www.csbs.org/node/408066
  - title: Charitable solicitation, state requirements
    publisher: Internal Revenue Service
    url: https://www.irs.gov/charities-non-profits/charitable-organizations/charitable-solicitation-state-requirements
  - title: PCI Data Security Standard (PCI DSS)
    publisher: PCI Security Standards Council
    url: https://www.pcisecuritystandards.org/standards/pci-dss/
  - title: Donor-advised funds
    publisher: Internal Revenue Service
    url: https://www.irs.gov/charities-non-profits/charitable-organizations/donor-advised-funds
  - title: Donation Delivery Policy
    publisher: PayPal Giving Fund
    year: 2025
    url: https://www.paypal.com/us/paypal-giving-fund/policies/donation-delivery-policy
    note: An example of a donation platform that is itself a charity and grants each gift to the charity the donor recommends. Cited to show the model, not as a recommendation.
---

## How it works

Start from the portfolio you built in the [Portfolio Builder](/tools/portfolio-builder/), or from a blank plan. Enter a total, then add a row for each charity: its cause, its name, the address of its own donation page and its share. The planner turns the shares into whole-dollar amounts and a numbered list of steps. Each step has its own **Open donation page** button and a **Done** box, so you can give to one charity at a time and pick up where you left off. The plan is saved in this browser, and you can download it as CSV or Markdown.

There is deliberately no button that opens every page at once. One gift at a time is easier to check, and a page full of new tabs is easy to lose track of.

## How the amounts add up

The shares must add up to exactly 100 percent. The planner rounds each amount down to whole dollars, then hands the dollars left over to the charities that lost the most in rounding, one dollar each. This is the largest remainder method. However the shares fall, the amounts always add up to your total.

A portfolio usually spreads money across several causes, often through more than one moral lens, which is the treatment for [the Single Lens](/diagnosis/single-lens/). The donation pages you choose decide whether each gift is restricted. Where a charity lets you choose, an unrestricted gift lets it fix what it learns is broken, the treatment for [the Restriction Reflex](/diagnosis/restriction-reflex/).

## Why payment isn’t built in

A true one-click split would take your money once and pay several charities. Doing that is a regulated business, and Charitology is a research project that runs in the open, not a payments company.

- **Licensing.** A business that accepts money from one person to pass it to another is generally a money transmitter. In the United States, a money services business has to register with the Treasury’s Financial Crimes Enforcement Network (FinCEN), with few exceptions. State regulators license and supervise money transmitters too, and as of 2023 every state except Montana required a license.
- **Fundraising rules.** Many states require organizations to register before asking their residents for donations, and add rules for paid solicitors.
- **Consumer protection.** Anyone who stores, processes or transmits card details has to meet the payment card industry’s security standard, PCI DSS. Donors also need refunds when something goes wrong, receipts, and confidence that the money arrives.

The honest route is a regulated partner. A donor-advised fund already works like a split: you give once to a sponsoring charity, which takes legal control of the money, and you advise it which charities to grant it to. Some donation platforms work the same way, as charities that receive your gift and grant it to the charity you recommend. One-click payment will come to Charitology only through a partner like that, chosen in the open. Until then, the planner does the arithmetic and you give on each charity’s own page.

## What it isn’t

It isn’t a payment service, and it never sees your card or bank details. Charitology doesn’t check donation page addresses beyond requiring a secure https address, so make sure each one belongs to the charity before you give. Nothing you type is sent anywhere.
