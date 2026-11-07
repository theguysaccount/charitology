// src/data/causes.json
var causes_default = {
  _note: "Cause areas used by the Values Compass, the Portfolio Builder and the Cause Atlas. Dimension positions run from 0 to 1 and are editorial judgments, not measurements. Challenge any of them with a pull request that explains why.",
  dimensions: {
    horizon: "0 = helps people alive now, 1 = protects people not yet born",
    circle: "0 = centered on humans, 1 = all living things",
    reach: "0 = local, 1 = global",
    certainty: "0 = proven and measurable, 1 = speculative with large upside",
    depth: "0 = most work is relief, 1 = most work targets structures and sources"
  },
  causes: [
    {
      id: "global-health",
      name: "Global health",
      summary: "Preventing and treating disease where health systems are weakest.",
      dims: { horizon: 0.2, circle: 0.1, reach: 0.9, certainty: 0.15, depth: 0.45 },
      problems: ["disease"],
      upstream: ["coordination"]
    },
    {
      id: "extreme-poverty",
      name: "Extreme poverty",
      summary: "Raising the incomes and security of people living on the least.",
      dims: { horizon: 0.3, circle: 0.1, reach: 0.9, certainty: 0.3, depth: 0.5 },
      problems: ["poverty", "inequality", "hunger"],
      upstream: ["status", "coordination"]
    },
    {
      id: "hunger",
      name: "Hunger and food security",
      summary: "Making sure people have enough to eat, today and through bad years.",
      dims: { horizon: 0.2, circle: 0.1, reach: 0.6, certainty: 0.3, depth: 0.35 },
      problems: ["hunger"],
      upstream: ["coordination"]
    },
    {
      id: "climate",
      name: "Climate change",
      summary: "Cutting emissions and helping people adapt to a warming world.",
      dims: { horizon: 0.8, circle: 0.5, reach: 1, certainty: 0.6, depth: 0.75 },
      problems: ["climate", "pollution"],
      upstream: ["vision", "coordination"]
    },
    {
      id: "nature",
      name: "Nature and biodiversity",
      summary: "Protecting species, ecosystems, water and land.",
      dims: { horizon: 0.8, circle: 0.9, reach: 0.8, certainty: 0.6, depth: 0.65 },
      problems: ["biodiversity", "water", "pollution"],
      upstream: ["vision", "story"]
    },
    {
      id: "animals",
      name: "Animal welfare",
      summary: "Reducing the suffering of animals, wild and farmed.",
      dims: { horizon: 0.4, circle: 1, reach: 0.7, certainty: 0.5, depth: 0.6 },
      problems: [],
      upstream: ["story", "status"]
    },
    {
      id: "education",
      name: "Education",
      summary: "Helping people learn, from early childhood to adult skills.",
      dims: { horizon: 0.5, circle: 0.1, reach: 0.5, certainty: 0.35, depth: 0.55 },
      problems: ["education", "inequality"],
      upstream: ["gatekeepers", "vision"]
    },
    {
      id: "mental-health",
      name: "Mental health",
      summary: "Treating and preventing mental illness, loneliness and addiction.",
      dims: { horizon: 0.3, circle: 0.1, reach: 0.4, certainty: 0.45, depth: 0.4 },
      problems: ["mental", "loneliness", "addiction"],
      upstream: ["attention", "story"]
    },
    {
      id: "housing",
      name: "Housing and homelessness",
      summary: "Keeping people housed and making homes affordable.",
      dims: { horizon: 0.3, circle: 0.1, reach: 0.2, certainty: 0.35, depth: 0.45 },
      problems: ["housing", "poverty"],
      upstream: ["coordination", "gatekeepers"]
    },
    {
      id: "democracy",
      name: "Democracy and good government",
      summary: "Fair elections, honest institutions, a healthy information ecosystem.",
      dims: { horizon: 0.6, circle: 0.1, reach: 0.5, certainty: 0.7, depth: 0.85 },
      problems: ["corruption", "polarization", "distrust", "misinformation"],
      upstream: ["attention", "story", "gatekeepers"]
    },
    {
      id: "peace",
      name: "Peace and security",
      summary: "Preventing war and violence and helping people recover from them.",
      dims: { horizon: 0.6, circle: 0.2, reach: 0.8, certainty: 0.7, depth: 0.7 },
      problems: ["war"],
      upstream: ["story", "coordination"]
    },
    {
      id: "catastrophic-risk",
      name: "Catastrophic risks",
      summary: "Reducing the chance of pandemics, nuclear war and other disasters that could set civilization back.",
      dims: { horizon: 1, circle: 0.3, reach: 1, certainty: 0.9, depth: 0.8 },
      problems: ["war", "disease"],
      upstream: ["coordination", "vision"]
    },
    {
      id: "science",
      name: "Science and knowledge",
      summary: "Research, open data and the public understanding of what is true.",
      dims: { horizon: 0.8, circle: 0.3, reach: 1, certainty: 0.75, depth: 0.8 },
      problems: ["misinformation", "disease", "education"],
      upstream: ["gatekeepers", "vision"]
    },
    {
      id: "community",
      name: "Local community",
      summary: "The neighborhood institutions that make a place work.",
      dims: { horizon: 0.2, circle: 0.1, reach: 0, certainty: 0.3, depth: 0.35 },
      problems: ["loneliness", "distrust"],
      upstream: ["coordination"]
    },
    {
      id: "arts",
      name: "Arts and culture",
      summary: "The stories, art and shared culture a society uses to understand itself.",
      dims: { horizon: 0.5, circle: 0.1, reach: 0.3, certainty: 0.5, depth: 0.6 },
      problems: ["loneliness", "distrust"],
      upstream: ["story", "vision"]
    },
    {
      id: "faith",
      name: "Faith and spiritual life",
      summary: "Religious communities and the care they provide.",
      dims: { horizon: 0.4, circle: 0.2, reach: 0.2, certainty: 0.4, depth: 0.6 },
      problems: ["loneliness"],
      upstream: ["story", "status"]
    },
    {
      id: "charity-system",
      name: "The charity system itself",
      summary: "Research, infrastructure and incentives that change where all the other money goes.",
      dims: { horizon: 0.7, circle: 0.5, reach: 1, certainty: 0.7, depth: 1 },
      problems: ["all"],
      upstream: ["story", "coordination", "vision", "attention", "status", "gatekeepers"]
    }
  ],
  problems: [
    { id: "climate", label: "Climate change" },
    { id: "war", label: "War" },
    { id: "poverty", label: "Poverty" },
    { id: "hunger", label: "Hunger" },
    { id: "disease", label: "Disease" },
    { id: "water", label: "Water scarcity" },
    { id: "pollution", label: "Pollution" },
    { id: "biodiversity", label: "Biodiversity loss" },
    { id: "housing", label: "Housing" },
    { id: "education", label: "Education gaps" },
    { id: "inequality", label: "Inequality" },
    { id: "corruption", label: "Corruption" },
    { id: "distrust", label: "Distrust" },
    { id: "polarization", label: "Polarization" },
    { id: "misinformation", label: "Misinformation" },
    { id: "loneliness", label: "Loneliness" },
    { id: "mental", label: "Mental health" },
    { id: "addiction", label: "Addiction" }
  ]
};

// src/data/due-diligence.json
var due_diligence_default = {
  _note: "Items for the Due Diligence Checklist. Each link is a {ref} to a name in ecosystem.json, an internal {path}, or an external {url}. Every factual claim is sourced in src/content/tools/due-diligence-checklist.md. Improve an item with a pull request that cites a source.",
  groups: [
    {
      id: "legitimacy",
      name: "Legitimacy",
      intro: "Is it what it says it is?",
      items: [
        {
          id: "irs-status",
          question: "Is it on the IRS list of organizations that can receive tax-deductible gifts?",
          why: "The list confirms that the IRS recognizes it as tax-exempt. It says nothing about how well it works. Some eligible groups aren’t listed: churches don’t have to apply for recognition, and groups covered by a parent organization’s group ruling aren’t listed separately.",
          how: "Search its name or EIN in Tax Exempt Organization Search. If it isn’t there, ask for its IRS exemption letter.",
          links: [{ ref: "IRS Tax Exempt Organization Search" }]
        },
        {
          id: "filing",
          question: "Has it kept filing its annual return with the IRS?",
          why: "An organization that doesn’t file for three years in a row automatically loses its tax-exempt status. The returns are also the fullest public record of what it does with its money.",
          how: "Tax Exempt Organization Search shows revocations and recent returns, and ProPublica Nonprofit Explorer shows the filings. Organizations whose gross receipts are normally $50,000 or less may file only a short electronic notice, the e-Postcard.",
          links: [{ ref: "IRS Tax Exempt Organization Search" }, { ref: "ProPublica Nonprofit Explorer" }]
        },
        {
          id: "state",
          question: "Is it registered with your state’s charity regulator, if your state requires that?",
          why: "Registration rules differ from state to state. The FTC suggests checking that both the charity and any fundraiser asking on its behalf are registered with your state.",
          how: "Find your state’s charity office in the National Association of State Charity Officials directory.",
          links: [{ label: "State charity offices (NASCO)", url: "https://www.nasconet.org/resources/state-government/" }]
        },
        {
          id: "governance",
          question: "Does it have an independent board and written conflict-of-interest and whistleblower policies?",
          why: "These are how an organization checks itself. Form 990 asks about each one in Part VI.",
          how: "Read Part VI of its latest Form 990: line 1b counts independent board members, line 12a asks about a conflict-of-interest policy and line 13 about a whistleblower policy. U.S. exempt organizations must let the public see their annual returns for three years.",
          links: [{ ref: "ProPublica Nonprofit Explorer" }]
        }
      ]
    },
    {
      id: "money",
      name: "Money",
      intro: "Where does the money go, and where does it come from?",
      items: [
        {
          id: "spending",
          question: "Do you know what its spending buys?",
          why: "How costs split between programs, management and fundraising says little about results. In 2013 the leaders of GuideStar, Charity Navigator and the BBB Wise Giving Alliance told donors that overhead is a poor measure of performance.",
          how: "Charity Impact Media shows Form 990 spending for U.S. charities with $10 million or more in revenue. For a charity that files the full Form 990, Part IX splits its expenses into programs, management and fundraising.",
          links: [{ ref: "Charity Impact Media" }, { ref: "ProPublica Nonprofit Explorer" }, { label: "The Overhead Myth", path: "/diagnosis/overhead-myth/" }]
        },
        {
          id: "invest",
          question: "Does it invest in what results depend on, such as skilled staff, good systems and evaluation?",
          why: "Charities that starve these to keep overhead low can end up less effective. Ann Goggins Gregory and Don Howard called the pattern the nonprofit starvation cycle.",
          how: "Ask what it would fix first if it had more flexible money.",
          links: [{ label: "The Nonprofit Starvation Cycle (SSIR)", url: "https://ssir.org/articles/entry/the_nonprofit_starvation_cycle" }]
        },
        {
          id: "audit",
          question: "Are its financial statements compiled, reviewed or audited by an independent accountant?",
          why: "It is an outside check on the books. Form 990 asks about it in Part XII.",
          how: "Read Part XII, line 2, of its latest Form 990, or ask for its latest audit or review.",
          links: [{ ref: "ProPublica Nonprofit Explorer" }]
        },
        {
          id: "funders",
          question: "Do you know who else funds it?",
          why: "If large funders already cover the work, your gift might do more elsewhere. If one funder pays for most of it, ask what happens when that money ends.",
          how: "WHOFUNDS shows what U.S. private foundations reported paying it, from their Form 990-PF filings.",
          links: [{ ref: "WHOFUNDS search", label: "WHOFUNDS" }]
        },
        {
          id: "pay",
          question: "Is leadership pay set by people without a conflict of interest?",
          why: "The question isn’t whether pay is high or low. It is whether independent people set it and compare it with similar organizations.",
          how: "Form 990 asks about the process in Part VI, line 15, and lists pay for officers, directors and key employees in Part VII.",
          links: [{ ref: "ProPublica Nonprofit Explorer" }]
        }
      ]
    },
    {
      id: "results",
      name: "Results",
      intro: "What changes because it exists?",
      items: [
        {
          id: "outcomes",
          question: "Does it report what changed for people, not only what it did?",
          why: "Outputs count activity, such as meals served. Outcomes are changes in people’s lives, such as fewer hungry days. Form 990 asks for accomplishments in measures such as clients served, which are outputs, so you usually have to ask for outcomes.",
          how: "Ask which outcomes it tracks and how it measures them.",
          links: [{ label: "The Measurement Gap", path: "/diagnosis/measurement-gap/" }, { label: "Impact Measurement Toolkit", path: "/tools/impact-measurement-toolkit/" }]
        },
        {
          id: "evidence",
          question: "What is the strongest evidence that its approach works?",
          why: "A careful study of the same approach somewhere else is useful. A careful study of this program, in this place, tells you more.",
          how: "Ask for the best study it knows of and who did it. Independent evaluators publish research on some causes.",
          links: [{ ref: "GiveWell" }, { ref: "Giving Green" }, { ref: "Animal Charity Evaluators" }]
        },
        {
          id: "cost",
          question: "Does it know what one result costs?",
          why: "Programs with the same goal can cost very different amounts per result. Cost per result tells you more than an overhead ratio.",
          how: "Ask for its cost per outcome, such as the cost per child who learns to read, and how it was worked out.",
          links: [{ label: "The Giver’s Checklist", path: "/method/#checklist" }]
        }
      ]
    },
    {
      id: "learning",
      name: "Learning",
      intro: "Does it find out, and act on what it finds?",
      items: [
        {
          id: "failure",
          question: "Does it publish what didn’t work?",
          why: "A published failure lets others avoid repeating it, and an organization that names its mistakes shows it is looking for them. Some publish them openly, such as Engineers Without Borders Canada with its failure reports and GiveWell with its public list of mistakes.",
          how: "Look for a failure report, a mistakes page or lessons learned in its annual report.",
          links: [
            { label: "GiveWell: Our mistakes", url: "https://www.givewell.org/about/our-mistakes" },
            { label: "EWB Canada failure report", url: "https://www.ewb.ca/wp-content/uploads/2018/08/EWB_FAILURE-REPORT_EN_03-08-2018-pages.pdf" },
            { label: "The Silence About Failure", path: "/diagnosis/silence-about-failure/" }
          ]
        },
        {
          id: "changed",
          question: "Can it name something it changed because of what it learned?",
          why: "Learning shows up as programs that change, not only as reports.",
          how: "Ask for one example from the last few years."
        },
        {
          id: "stop-rule",
          question: "Does it know what result would make it change course?",
          why: "A program with no stop rule can keep running whatever its results. Deciding in advance keeps the later decision honest.",
          how: "Ask what result would make it redesign or stop the program.",
          links: [{ label: "Impact Measurement Toolkit", path: "/tools/impact-measurement-toolkit/" }]
        },
        {
          id: "feedback",
          question: "Does it ask the people it serves for feedback, and tell them what changed as a result?",
          why: "The people served are the first to know whether help is working. Listen4Good, a feedback program for nonprofits, ends its five-step loop by reporting back to the people who answered.",
          how: "Ask how often it collects feedback, and for one change it made because of it.",
          links: [
            { label: "Realizing the Promise of High-Quality Feedback", url: "https://feedbacklabs.org/news-and-insights/realizing-the-promise-of-high-quality-feedback/" },
            { label: "The Missing Feedback Loop", path: "/diagnosis/missing-feedback-loop/" }
          ]
        }
      ]
    },
    {
      id: "system",
      name: "The system lens",
      intro: "Where does it sit in the larger system?",
      items: [
        {
          id: "depth",
          question: "Do you know where on the depth scale its work acts?",
          why: "Relief, repair, prevention, structure or source. Every level is needed. Know which one you are paying for.",
          how: "Ask what would have to change for the problem to stop coming back, and whether its work changes that.",
          links: [{ label: "The depth scale", path: "/method/#depth" }]
        },
        {
          id: "counterfactual",
          question: "What would happen without this work, or without your gift?",
          why: "A program’s effect is the difference between what happened and what would have happened anyway. If the work would be funded without you, your gift’s real effect lands somewhere else.",
          how: "Ask how it compares its results with people or places it doesn’t serve, and whether another funder would fill the gap.",
          links: [
            { label: "J-PAL: Introduction to randomized evaluations", url: "https://www.povertyactionlab.org/resource/introduction-randomized-evaluations" },
            { label: "The Counterfactual Problem", path: "/open-problems/the-counterfactual-problem/" }
          ]
        },
        {
          id: "coordination",
          question: "Does it work with others on the same problem?",
          why: "Organizations that work alone on a shared problem can duplicate each other’s costs and compete for the same donors.",
          how: "Ask who else works on this problem nearby and how they divide the work.",
          links: [{ label: "The Fragmentation Problem", path: "/diagnosis/fragmentation/" }]
        },
        {
          id: "voice",
          question: "Do the people it serves help decide what it does?",
          why: "The people closest to a problem often know which fix will last.",
          how: "Ask whether people it serves sit on its board, its advisory groups or the panels that decide where money goes.",
          links: [{ label: "The Missing Voice", path: "/diagnosis/missing-voice/" }, { label: "Fund for Shared Insight", url: "https://fundforsharedinsight.org/" }]
        }
      ]
    },
    {
      id: "red-flags",
      name: "Red flags",
      intro: "Warning signs the FTC describes. Here, yes means you saw it. Seeing one doesn’t prove a scam, but it is a reason to stop and check.",
      flag: true,
      items: [
        {
          id: "rush",
          question: "Did anyone pressure you to give right away?",
          why: "The FTC says scammers rush people so they can’t stop to research. A real charity will still welcome your gift after you have checked it.",
          links: [{ label: "FTC: Before giving to a charity", url: "https://consumer.ftc.gov/articles/giving-charity" }]
        },
        {
          id: "payment",
          question: "Were you asked to pay only by cash, gift card, wire transfer, cryptocurrency or a payment app?",
          why: "The FTC says a charity that only accepts these is likely a scam, and that a credit card or check is the safest way to give.",
          links: [{ label: "FTC: Before giving to a charity", url: "https://consumer.ftc.gov/articles/giving-charity" }]
        },
        {
          id: "soundalike",
          question: "Did the name sound like a better-known charity, or were you thanked for a pledge you don’t remember making?",
          why: "The FTC says some scammers use names that sound like real charities, or claim you already pledged, so you feel you should give.",
          links: [{ label: "FTC: Before giving to a charity", url: "https://consumer.ftc.gov/articles/giving-charity" }]
        },
        {
          id: "vague",
          question: "Was the appeal emotional but vague about how the money would be used?",
          why: "The FTC advises caution when a moving story comes with few specifics about where the money goes.",
          links: [{ label: "FTC: Before giving to a charity", url: "https://consumer.ftc.gov/articles/giving-charity" }]
        },
        {
          id: "prize",
          question: "Were you promised a prize, or told a gift is tax-deductible when you couldn’t confirm it?",
          why: "The FTC says a promise that you will win something for giving is a scam. You can check deductibility yourself.",
          how: "Search the organization in Tax Exempt Organization Search.",
          links: [{ ref: "IRS Tax Exempt Organization Search" }]
        }
      ]
    }
  ]
};

// src/data/frameworks.json
var frameworks_default = {
  _note: "Moral frameworks used by the Values Compass and the Portfolio Builder. Priorities run from 0 (not a concern of this framework) to 5 (a central concern) and are editorial sketches of how each framework tends to rank causes. Real philosophers disagree inside every framework. Improve these with a pull request that cites your reasoning.",
  frameworks: [
    {
      id: "welfare",
      name: "Welfare",
      question: "What reduces the most suffering and adds the most wellbeing?",
      summary: "Counts everyone’s wellbeing equally and looks for the gift that does the most good per dollar.",
      thinkers: ["Jeremy Bentham", "John Stuart Mill", "Peter Singer"],
      priorities: {
        "global-health": 5,
        "extreme-poverty": 5,
        hunger: 4,
        climate: 3,
        nature: 2,
        animals: 5,
        education: 3,
        "mental-health": 4,
        housing: 3,
        democracy: 2,
        peace: 3,
        "catastrophic-risk": 3,
        science: 3,
        community: 1,
        arts: 1,
        faith: 1,
        "charity-system": 4
      }
    },
    {
      id: "rights",
      name: "Rights and duties",
      question: "What do we owe each other, whatever the cost?",
      summary: "Some things are owed to every person: rescue from danger, basic dignity, freedom. Giving secures them.",
      thinkers: ["Immanuel Kant", "W. D. Ross", "Onora O’Neill"],
      priorities: {
        "global-health": 4,
        "extreme-poverty": 4,
        hunger: 5,
        climate: 3,
        nature: 2,
        animals: 2,
        education: 4,
        "mental-health": 3,
        housing: 4,
        democracy: 5,
        peace: 5,
        "catastrophic-risk": 2,
        science: 2,
        community: 3,
        arts: 2,
        faith: 3,
        "charity-system": 3
      }
    },
    {
      id: "justice",
      name: "Justice",
      question: "What is unfair, and how do we fix it rather than soften it?",
      summary: "Looks at who holds power and how institutions distribute advantage, and gives to change them.",
      thinkers: ["John Rawls", "Iris Marion Young"],
      priorities: {
        "global-health": 4,
        "extreme-poverty": 5,
        hunger: 4,
        climate: 4,
        nature: 2,
        animals: 2,
        education: 5,
        "mental-health": 3,
        housing: 5,
        democracy: 5,
        peace: 3,
        "catastrophic-risk": 1,
        science: 2,
        community: 3,
        arts: 2,
        faith: 1,
        "charity-system": 5
      }
    },
    {
      id: "care",
      name: "Care",
      question: "Who depends on me, and how do I show up for them?",
      summary: "Starts from relationships. The people and places close to us have a real claim on our care.",
      thinkers: ["Carol Gilligan", "Nel Noddings", "Virginia Held"],
      priorities: {
        "global-health": 3,
        "extreme-poverty": 3,
        hunger: 4,
        climate: 2,
        nature: 2,
        animals: 3,
        education: 3,
        "mental-health": 5,
        housing: 4,
        democracy: 1,
        peace: 2,
        "catastrophic-risk": 1,
        science: 1,
        community: 5,
        arts: 3,
        faith: 4,
        "charity-system": 2
      }
    },
    {
      id: "tradition",
      name: "Faith and tradition",
      question: "What does my tradition ask me to give, and to whom?",
      summary: "Zakat, tzedakah, dāna, tithing and seva carry centuries of thought about who to give to and how.",
      thinkers: ["Maimonides", "Religious and community traditions worldwide"],
      priorities: {
        "global-health": 3,
        "extreme-poverty": 5,
        hunger: 5,
        climate: 2,
        nature: 2,
        animals: 2,
        education: 3,
        "mental-health": 2,
        housing: 4,
        democracy: 1,
        peace: 3,
        "catastrophic-risk": 1,
        science: 1,
        community: 4,
        arts: 2,
        faith: 5,
        "charity-system": 2
      }
    },
    {
      id: "future",
      name: "Future generations",
      question: "What protects the people who aren’t born yet?",
      summary: "Most people who will ever live haven’t been born. Protecting their future may be the largest good available.",
      thinkers: ["Derek Parfit", "Hans Jonas", "Toby Ord"],
      priorities: {
        "global-health": 2,
        "extreme-poverty": 2,
        hunger: 1,
        climate: 5,
        nature: 4,
        animals: 2,
        education: 3,
        "mental-health": 1,
        housing: 1,
        democracy: 4,
        peace: 4,
        "catastrophic-risk": 5,
        science: 5,
        community: 1,
        arts: 2,
        faith: 1,
        "charity-system": 4
      }
    },
    {
      id: "nature",
      name: "All life",
      question: "What protects animals and the living world for their own sake?",
      summary: "Widens the circle of concern beyond humans to animals, species and ecosystems.",
      thinkers: ["Aldo Leopold", "Arne Næss"],
      priorities: {
        "global-health": 2,
        "extreme-poverty": 2,
        hunger: 2,
        climate: 5,
        nature: 5,
        animals: 5,
        education: 2,
        "mental-health": 1,
        housing: 1,
        democracy: 2,
        peace: 2,
        "catastrophic-risk": 3,
        science: 3,
        community: 2,
        arts: 2,
        faith: 2,
        "charity-system": 3
      }
    },
    {
      id: "flourishing",
      name: "Flourishing",
      question: "What helps people become who they could be?",
      summary: "Good lives need more than survival: health, learning, meaning, culture and the freedom to choose.",
      thinkers: ["Aristotle", "Amartya Sen", "Martha Nussbaum"],
      priorities: {
        "global-health": 4,
        "extreme-poverty": 4,
        hunger: 3,
        climate: 2,
        nature: 2,
        animals: 1,
        education: 5,
        "mental-health": 4,
        housing: 3,
        democracy: 3,
        peace: 3,
        "catastrophic-risk": 2,
        science: 4,
        community: 4,
        arts: 5,
        faith: 3,
        "charity-system": 3
      }
    }
  ]
};

// src/lib/compass.ts
var CAUSES = causes_default.causes;
var FRAMEWORKS = frameworks_default.frameworks;

// src/lib/client/donor-recovery-schemas.ts
var D1_KEYS = Object.freeze([
  "gifts",
  "portfolio",
  "legacy",
  "gift-card",
  "ce-models",
  "due-diligence",
  "grant-proposals",
  "grant-weights",
  "grant-draft",
  "impact-drafts",
  "split",
  "compass",
  "disaster-plan",
  "wrapped"
]);
var D1_GRANT_KEYS = Object.freeze([
  "grant-proposals",
  "grant-weights",
  "grant-draft"
]);
var D1_GRANT_DIMENSIONS = Object.freeze([
  "depth",
  "evidence",
  "counterfactual",
  "feedback",
  "voice",
  "cost",
  "durability",
  "team",
  "harm"
]);
var D1_FRAMEWORKS = Object.freeze([
  "welfare",
  "rights",
  "justice",
  "care",
  "tradition",
  "future",
  "nature",
  "flourishing"
]);
var D1_DIMENSIONS = Object.freeze([
  "horizon",
  "circle",
  "reach",
  "certainty",
  "depth"
]);
var CAUSES2 = Object.freeze(causes_default.causes.map((c) => c.id));
var GIFT_CAUSES = Object.freeze([...CAUSES2, "other"]);
var QUESTIONS = Object.freeze(
  due_diligence_default.groups.flatMap((g) => g.items.map((i) => i.id))
);
var REASONS = Object.freeze([
  "depth",
  "counterfactual",
  "evidence",
  "feedback",
  "voice",
  "cost",
  "strings",
  "durability",
  "story",
  "neglect"
]);
var RANGED = Object.freeze([
  "cost",
  "people",
  "works",
  "effect",
  "years",
  "anyway"
]);
var IMPACT_TEXT = Object.freeze([
  "name",
  "problem",
  "source",
  "activities",
  "outputs",
  "outcomeShort",
  "outcomeMedium",
  "outcomeLong",
  "assumptions",
  "feedbackMethod",
  "feedbackFrequency",
  "comparison",
  "stopRule",
  "reviewer",
  "reviewDate"
]);
var INDICATOR_KEYS = Object.freeze([
  "what",
  "how",
  "when",
  "baseline",
  "target"
]);
var D1DataError = class extends Error {
  code;
  path;
  constructor(message, path = "$", code = "invalid_data") {
    super(`${message} (${path})`);
    this.name = "D1DataError";
    this.code = code;
    this.path = path;
  }
};
function fail(message, path = "$") {
  throw new D1DataError(message, path);
}
function isD1Key(key) {
  return typeof key === "string" && D1_KEYS.includes(key);
}
function requireKey(key) {
  if (!isD1Key(key)) fail("Unknown donor tool key");
}
function freezeD1(value) {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) freezeD1(value[key]);
    Object.freeze(value);
  }
  return value;
}
function optionalUndefined(key, path) {
  if (key === "grant-bundle")
    return path.length === 5 && path[0] === "members" && path[1] === 0 && path[2] === "value" && typeof path[3] === "number" && path[4] === "savedAt" || path.length === 4 && path[0] === "members" && path[1] === 2 && path[2] === "value" && path[3] === "savedAt";
  if (key === "legacy" || key === "split" || key === "grant-draft")
    return path.length === 1 && path[0] === "savedAt";
  if (key === "portfolio")
    return path.length === 1 && ["alternative", "state", "method", "savedAt"].includes(path[0]);
  if (key === "grant-proposals")
    return path.length === 2 && typeof path[0] === "number" && path[1] === "savedAt";
  return key === "gifts" && path.length === 2 && typeof path[0] === "number" && (path[1] === "note" || path[1] === "sample");
}
function copyD1Plain(input, maxBytes = 24008192, optionalKey) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 24008192)
    fail("Invalid input bound");
  if (optionalKey !== void 0 && optionalKey !== "grant-bundle")
    requireKey(optionalKey);
  let bytes = 0;
  const active = /* @__PURE__ */ new Set();
  const encoder3 = new TextEncoder();
  function charge(count, path) {
    bytes += count;
    if (bytes > maxBytes)
      throw new D1DataError(
        "Donor input exceeds its byte limit",
        path,
        "input_limit"
      );
  }
  function stringBytes(value, path) {
    if (value.length > maxBytes)
      throw new D1DataError(
        "Donor text exceeds its byte limit",
        path,
        "input_limit"
      );
    charge(encoder3.encode(JSON.stringify(value)).byteLength, path);
  }
  function visit(value, path, depth, segments) {
    if (depth > 32)
      throw new D1DataError("Donor JSON exceeds depth 32", path, "input_limit");
    if (value === null) {
      charge(4, path);
      return null;
    }
    if (typeof value === "string") {
      stringBytes(value, path);
      return value;
    }
    if (typeof value === "boolean") {
      charge(value ? 4 : 5, path);
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value))
        fail("Only finite numbers are supported", path);
      charge(String(value).length, path);
      return value;
    }
    if (!value || typeof value !== "object")
      fail("Only plain JSON data is supported", path);
    if (active.has(value)) fail("Cyclic donor data is unsupported", path);
    const array = Array.isArray(value);
    const proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null)
      fail("Custom prototypes are unsupported", path);
    if (array && Object.getOwnPropertyDescriptor(value, "length")?.value > maxBytes / 2)
      throw new D1DataError(
        "Donor array exceeds its byte limit",
        path,
        "input_limit"
      );
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    for (const key of ownKeys) {
      if (typeof key !== "string")
        fail("Symbol properties are unsupported", path);
      const d = descriptors[key];
      if (!Object.hasOwn(d, "value") || !d.enumerable && !(array && key === "length"))
        fail("Accessors and hidden fields are unsupported", path);
    }
    active.add(value);
    charge(2, path);
    let result;
    if (array) {
      const length = descriptors.length?.value;
      if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 || ownKeys.length !== length + 1)
        fail("Sparse or decorated arrays are unsupported", path);
      if (length > maxBytes / 2)
        throw new D1DataError(
          "Donor array exceeds its byte limit",
          path,
          "input_limit"
        );
      const out = [];
      for (let i = 0; i < length; i++) {
        const d = descriptors[String(i)];
        if (!d) fail("Sparse arrays are unsupported", path);
        if (i) charge(1, path);
        out.push(visit(d.value, `${path}[${i}]`, depth + 1, [...segments, i]));
      }
      result = out;
    } else {
      const out = {};
      let count = 0;
      for (const key of ownKeys) {
        const d = descriptors[key];
        const next = `${path}.${key}`;
        const nextSegments = [...segments, key];
        if (d.value === void 0 && optionalUndefined(optionalKey, nextSegments))
          continue;
        if (count++) charge(1, path);
        stringBytes(key, next);
        charge(1, next);
        Object.defineProperty(out, key, {
          value: visit(d.value, next, depth + 1, nextSegments),
          enumerable: true,
          configurable: true,
          writable: true
        });
      }
      result = out;
    }
    active.delete(value);
    return result;
  }
  return visit(input, "$", 0, []);
}
function object(v, required, optional = [], path = "$") {
  if (!v || typeof v !== "object" || Array.isArray(v))
    fail("Expected an object", path);
  const r = v;
  for (const key of required)
    if (!Object.hasOwn(r, key)) fail(`Missing ${key}`, path);
  for (const key of Object.keys(r))
    if (!required.includes(key) && !optional.includes(key))
      fail(`Unknown field ${key}`, path);
  return r;
}
function text(v, path, max = Infinity, nonempty = false) {
  if (typeof v !== "string" || v.length > max || nonempty && !v)
    fail("Invalid text", path);
}
function num(v, path, min = -Infinity, max = Infinity, integer = false) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max || integer && !Number.isInteger(v))
    fail("Invalid number", path);
}
function bool(v, path) {
  if (typeof v !== "boolean") fail("Expected a boolean", path);
}
function one(v, values, path) {
  if (!values.includes(v)) fail("Unknown choice", path);
}
function list(v, path, min = 0, max = Infinity) {
  if (!Array.isArray(v) || v.length < min || v.length > max)
    fail("Invalid collection size", path);
  return v;
}
function timestamp(v, path) {
  text(v, path);
  if (Number.isNaN(Date.parse(v))) fail("Invalid timestamp", path);
}
function optionalStamp(r, max) {
  if (Object.hasOwn(r, "savedAt")) text(r.savedAt, "$.savedAt", max, true);
}
function identity(v, path, max = Infinity, slug = false) {
  text(v, path, max, true);
  if (slug && !/^[A-Za-z0-9_-]{1,64}$/.test(v)) fail("Invalid identity", path);
}
function unique(rows, path) {
  const seen = /* @__PURE__ */ new Set();
  for (const row of rows) {
    const id = row.id;
    if (seen.has(id)) fail("Duplicate saved identity", path);
    seen.add(id);
  }
}
function map(r, keys, path, check, complete2 = true) {
  const o = object(r, complete2 ? keys : [], complete2 ? [] : keys, path);
  for (const key of Object.keys(o)) check(o[key], `${path}.${key}`);
  return o;
}
function cleaned(v, path, max, required = false) {
  text(v, path, max, required);
  if (v !== v.replace(/\s+/g, " ").trim())
    fail("Saved text would require cleaning", path);
}
function gifts(value) {
  const rows = list(value, "$");
  for (const [i, v] of rows.entries()) {
    const p = `$[${i}]`;
    const r = object(
      v,
      ["id", "date", "organization", "amount", "cause", "depth"],
      ["note", "sample"],
      p
    );
    cleaned(r.id, `${p}.id`, 64, true);
    cleaned(r.organization, `${p}.organization`, 120, true);
    text(r.date, `${p}.date`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || Number.isNaN(Date.parse(`${r.date}T00:00:00Z`)) || (/* @__PURE__ */ new Date(`${r.date}T00:00:00Z`)).toISOString().slice(0, 10) !== r.date)
      fail("Invalid calendar day", `${p}.date`);
    num(r.amount, `${p}.amount`, Number.MIN_VALUE, 1e10);
    if (r.amount >= 1e10 || Math.round(r.amount * 100) / 100 !== r.amount)
      fail("Invalid gift amount", `${p}.amount`);
    one(r.cause, GIFT_CAUSES, `${p}.cause`);
    if (r.depth !== null) num(r.depth, `${p}.depth`, 0, 4, true);
    if (Object.hasOwn(r, "note")) cleaned(r.note, `${p}.note`, 200, true);
    if (Object.hasOwn(r, "sample") && r.sample !== true)
      fail("Sample must be true or omitted", `${p}.sample`);
  }
  unique(rows, "$");
}
function portfolio(value) {
  const r = object(
    value,
    ["allocation", "budget"],
    ["alternative", "state", "method", "savedAt"]
  );
  const allocation = (v, p) => {
    const o = map(v, CAUSES2, p, (n, q) => num(n, q, 0, 1), false);
    if (!Object.keys(o).length) fail("Empty allocation", p);
  };
  allocation(r.allocation, "$.allocation");
  num(r.budget, "$.budget", 0);
  if (Object.hasOwn(r, "alternative"))
    allocation(r.alternative, "$.alternative");
  if (Object.hasOwn(r, "state")) {
    const s = object(r.state, ["w", "b", "t"], [], "$.state");
    list(s.w, "$.state.w", 8, 8).forEach(
      (v, i) => num(v, `$.state.w[${i}]`, 0, 100)
    );
    num(s.b, "$.state.b", 0);
    num(s.t, "$.state.t", -100, 100);
  }
  if (Object.hasOwn(r, "method")) text(r.method, "$.method", Infinity, true);
  if (Object.hasOwn(r, "savedAt")) text(r.savedAt, "$.savedAt", Infinity, true);
}
function legacy(value) {
  const r = object(
    value,
    ["name", "place", "gifts", "flexible", "notes"],
    ["savedAt"]
  );
  text(r.name, "$.name", 100);
  text(r.place, "$.place", 100);
  text(r.notes, "$.notes", 2e3);
  bool(r.flexible, "$.flexible");
  optionalStamp(r, 40);
  const rows = list(r.gifts, "$.gifts", 1);
  rows.forEach((v, i) => {
    const p = `$.gifts[${i}]`;
    const g = object(
      v,
      [
        "id",
        "charity",
        "legal",
        "ein",
        "type",
        "amount",
        "percent",
        "condition",
        "purpose",
        "purposeText"
      ],
      [],
      p
    );
    identity(g.id, `${p}.id`, 64, true);
    for (const [key, max] of Object.entries({
      charity: 120,
      legal: 200,
      ein: 20,
      amount: 30,
      percent: 10,
      condition: 200,
      purposeText: 200
    }))
      text(g[key], `${p}.${key}`, max);
    one(g.type, ["specific", "percent", "residue", "contingent"], `${p}.type`);
    one(g.purpose, ["unrestricted", "restricted"], `${p}.purpose`);
  });
  unique(rows, "$.gifts");
}
function card(value) {
  const r = object(value, [
    "to",
    "from",
    "charity",
    "does",
    "message",
    "reasons",
    "style"
  ]);
  for (const [key, max] of Object.entries({
    to: 60,
    from: 60,
    charity: 80,
    does: 220,
    message: 420
  }))
    text(r[key], `$.${key}`, max);
  one(r.style, ["classic", "modern", "seal"], "$.style");
  list(r.reasons, "$.reasons", 0, 3).forEach(
    (v, i) => one(v, REASONS, `$.reasons[${i}]`)
  );
}
function ce(value) {
  const rows = list(value, "$");
  rows.forEach((v, i) => {
    const p = `$[${i}]`;
    const r = object(
      v,
      ["id", "name", "unit", "discount", "seed", "savedAt", "values"],
      [],
      p
    );
    identity(r.id, `${p}.id`);
    for (const key of ["name", "unit", "discount", "seed"])
      text(r[key], `${p}.${key}`);
    timestamp(r.savedAt, `${p}.savedAt`);
    map(
      r.values,
      RANGED,
      `${p}.values`,
      (v2, q) => list(v2, q, 3, 3).forEach((n, j) => text(n, `${q}[${j}]`))
    );
  });
  unique(rows, "$");
}
function diligence(value) {
  const r = object(value, ["v", "current", "orgs"]);
  if (r.v !== 1) fail("Unsupported diligence version");
  text(r.current, "$.current");
  const rows = list(r.orgs, "$.orgs", 0, 100);
  rows.forEach((v, i) => {
    const p = `$.orgs[${i}]`;
    const o = object(
      v,
      ["id", "name", "answers", "notes", "createdAt", "updatedAt"],
      [],
      p
    );
    identity(o.id, `${p}.id`, 80);
    text(o.name, `${p}.name`, 160);
    map(
      o.answers,
      QUESTIONS,
      `${p}.answers`,
      (v2, q) => one(v2, ["yes", "no", "unknown", "na"], q),
      false
    );
    map(o.notes, QUESTIONS, `${p}.notes`, (v2, q) => text(v2, q, 2e3), false);
    timestamp(o.createdAt, `${p}.createdAt`);
    timestamp(o.updatedAt, `${p}.updatedAt`);
  });
  unique(rows, "$.orgs");
  if (r.current !== "" && !rows.some((o) => o.id === r.current))
    fail("Unknown current organization", "$.current");
}
function proposal(value, allowEmpty, p = "$") {
  const r = object(value, ["id", "name", "scores", "notes"], ["savedAt"], p);
  text(r.id, `${p}.id`, Infinity, !allowEmpty);
  text(r.name, `${p}.name`, 120);
  if (Object.hasOwn(r, "savedAt")) text(r.savedAt, `${p}.savedAt`);
  map(r.scores, D1_GRANT_DIMENSIONS, `${p}.scores`, (v, q) => {
    if (v !== null) num(v, q, 0, 4, true);
  });
  map(r.notes, D1_GRANT_DIMENSIONS, `${p}.notes`, (v, q) => text(v, q, 4e3));
}
function impact(value) {
  const r = object(value, ["v", "current", "drafts"]);
  if (r.v !== 1) fail("Unsupported measurement version");
  text(r.current, "$.current");
  const rows = list(r.drafts, "$.drafts", 1, 50);
  rows.forEach((v, i) => {
    const p = `$.drafts[${i}]`;
    const d = object(
      v,
      [
        "id",
        ...IMPACT_TEXT,
        "depth",
        "indicators",
        "example",
        "createdAt",
        "updatedAt"
      ],
      [],
      p
    );
    identity(d.id, `${p}.id`, 80);
    for (const key of IMPACT_TEXT) text(d[key], `${p}.${key}`, 5e3);
    if (d.reviewDate !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(d.reviewDate))
      fail("Invalid review date shape", `${p}.reviewDate`);
    if (d.depth !== null) num(d.depth, `${p}.depth`, 0, 4, true);
    list(d.indicators, `${p}.indicators`, 0, 30).forEach((v2, j) => {
      const q = `${p}.indicators[${j}]`;
      const row = object(v2, INDICATOR_KEYS, [], q);
      for (const key of INDICATOR_KEYS) text(row[key], `${q}.${key}`, 5e3);
    });
    bool(d.example, `${p}.example`);
    timestamp(d.createdAt, `${p}.createdAt`);
    timestamp(d.updatedAt, `${p}.updatedAt`);
  });
  unique(rows, "$.drafts");
  if (!rows.some((d) => d.id === r.current))
    fail("Unknown current measurement draft", "$.current");
}
function split(value) {
  const r = object(value, ["total", "rows", "source"], ["savedAt"]);
  if (r.total !== null) {
    num(r.total, "$.total", 1, 1e10, true);
    if (r.total >= 1e10) fail("Total is too large", "$.total");
  }
  text(r.source, "$.source", 200);
  optionalStamp(r, 40);
  const rows = list(r.rows, "$.rows", 1);
  rows.forEach((v, i) => {
    const p = `$.rows[${i}]`;
    const row = object(
      v,
      ["id", "cause", "name", "url", "share", "done"],
      [],
      p
    );
    identity(row.id, `${p}.id`, 64, true);
    one(row.cause, GIFT_CAUSES, `${p}.cause`);
    text(row.name, `${p}.name`, 120);
    text(row.url, `${p}.url`, 2e3);
    if (row.share !== null) num(row.share, `${p}.share`, 0);
    bool(row.done, `${p}.done`);
  });
  unique(rows, "$.rows");
}
function compass(value) {
  const r = object(value, ["weights", "position", "answers", "savedAt"]);
  const a = object(r.answers, ["d", "s"], [], "$.answers");
  list(a.d, "$.answers.d", 5, 5).forEach(
    (v, i) => num(v, `$.answers.d[${i}]`, 0, 100)
  );
  list(a.s, "$.answers.s", 8, 8).forEach(
    (v, i) => num(v, `$.answers.s[${i}]`, 0, 4, true)
  );
  const w = map(
    r.weights,
    D1_FRAMEWORKS,
    "$.weights",
    (v, p) => num(v, p, 0, 4, true)
  );
  const pos = map(
    r.position,
    D1_DIMENSIONS,
    "$.position",
    (v, p) => num(v, p, 0, 1)
  );
  D1_FRAMEWORKS.forEach((id, i) => {
    if (w[id] !== a.s[i])
      fail("Weights differ from answers", `$.weights.${id}`);
  });
  D1_DIMENSIONS.forEach((id, i) => {
    if (pos[id] !== a.d[i] / 100)
      fail("Position differs from answers", `$.position.${id}`);
  });
  timestamp(r.savedAt, "$.savedAt");
}
function disaster(value) {
  const r = object(value, ["amount", "shares", "what"]);
  num(r.amount, "$.amount", 0);
  text(r.what, "$.what", 120);
  const shares = map(
    r.shares,
    ["relief", "recovery", "preparedness"],
    "$.shares",
    (v, p) => num(v, p, 0, 100, true)
  );
  if (shares.relief + shares.recovery + shares.preparedness !== 100)
    fail("Disaster shares must total 100", "$.shares");
}
var CHECKS = {
  gifts,
  portfolio,
  legacy,
  "gift-card": card,
  "ce-models": ce,
  "due-diligence": diligence,
  "grant-proposals": (value) => {
    const rows = list(value, "$");
    rows.forEach((v, i) => proposal(v, false, `$[${i}]`));
    unique(rows, "$");
  },
  "grant-weights": (value) => {
    map(value, D1_GRANT_DIMENSIONS, "$", (v, p) => num(v, p, 0, 10, true));
  },
  "grant-draft": (value) => {
    if (value !== null) proposal(value, true);
  },
  "impact-drafts": impact,
  split,
  compass,
  "disaster-plan": disaster,
  wrapped: (value) => {
    const r = object(value, ["year", "hide"]);
    text(r.year, "$.year");
    bool(r.hide, "$.hide");
  }
};
Object.freeze(CHECKS);
function validateD1Value(key, input) {
  requireKey(key);
  const owned = copyD1Plain(input, 8e6, key);
  CHECKS[key](owned);
  return freezeD1(owned);
}

// src/data/program-graph-adapters.ts
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
var PROGRAM_GRAPH_ADAPTERS = freeze([
  {
    id: "partner-the-charitology-fund-v1",
    version: 1,
    program: "the-charitology-fund",
    context: [
      {
        key: "name",
        label: "Fund plan title",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "scope",
        label: "Purpose, populations, moral lenses and allocation boundaries",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "period",
        label: "Planning period or review cycle",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "authority",
        label: "Who could authorize operation, and what is not authorized here?",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "privacy",
        label: "Public-information boundaries, access and deletion plan",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "budget",
        label: "Optional hypothetical planning envelope",
        kind: "number",
        optional: true,
        options: [],
        min: 0,
        max: 1e12,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "currency",
        label: "Currency for that envelope",
        kind: "text",
        optional: true,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "publicSummary",
        label: "Public purpose and readiness summary",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      }
    ],
    collections: [
      {
        key: "proposals",
        label: "Grant proposals",
        singular: "proposal",
        description: "Describe a public activity and its evidence. A pipeline stage does not approve a grant.",
        fields: [
          {
            key: "title",
            label: "Public activity or proposal code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "mechanism",
            label: "Intended outcome, mechanism and counterfactual",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "depth",
            label: "Activity depth, a hypothesis never a grade",
            kind: "select",
            optional: false,
            options: [
              "Unclassified",
              "0 Relief",
              "1 Repair",
              "2 Prevention",
              "3 Structure",
              "4 Source",
              "Several levels"
            ],
            min: null,
            max: null,
            value: "Unclassified",
            hint: null,
            maxLength: 500
          },
          {
            key: "amount",
            label: "Requested planning amount; blank unknown",
            kind: "number",
            optional: true,
            options: [],
            min: 0,
            max: 1e12,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "currency",
            label: "Currency or unit",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Use public evidence, never private documents or personal records.",
            maxLength: 500
          },
          {
            key: "evidence",
            label: "Evidence, uncertainty and strongest objection",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "voice",
            label: "Affected community input, authority and missing perspectives",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Proposal stage",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Evidence gathering",
              "Discussion",
              "Not proceeding",
              "Conditional allocation proposed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "conflicts",
        label: "Conflicts and recusals",
        singular: "conflict disclosure",
        description: "Use roles and proposal codes. A local record is not an independent clearance.",
        fields: [
          {
            key: "title",
            label: "Disclosure reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "proposal",
            label: "Proposal or allocation reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "role",
            label: "Review role; no private personal information",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "connection",
            label: "Relevant public connection or explicit unknown",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "response",
            label: "Recusal, separation of duties and independent check needed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "allocations",
        label: "Conditional allocation decisions",
        singular: "allocation",
        description: "These are reversible local records, never a transfer instruction or promise to a recipient.",
        fields: [
          {
            key: "title",
            label: "Allocation reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "proposal",
            label: "Proposal reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "amount",
            label: "Conditional amount; blank unknown",
            kind: "number",
            optional: true,
            options: [],
            min: 0,
            max: 1e12,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "currency",
            label: "Currency or unit",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "rationale",
            label: "Public reasoning, alternatives and dissent",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "conditions",
            label: "Unmet readiness, evidence and authorization conditions",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "date",
            label: "Local review date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Decision record",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Conditional recommendation",
              "Locally recorded authorization",
              "Declined",
              "Withdrawn"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "ledger",
        label: "Nonpayment authorization ledger",
        singular: "ledger entry",
        description: "Track planned authorizations separately from gifts received, cash balances and payments. This ledger records none of those.",
        fields: [
          {
            key: "title",
            label: "Ledger reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "allocation",
            label: "Allocation reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "amount",
            label: "Planned authorization amount; blank unknown",
            kind: "number",
            optional: true,
            options: [],
            min: 0,
            max: 1e12,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "currency",
            label: "Currency or unit",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Planning entry state",
            kind: "select",
            optional: false,
            options: ["Planned", "Conditional", "Cancelled"],
            min: null,
            max: null,
            value: "Planned",
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Public explanation and unresolved conditions",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Use public evidence, never private documents or personal records.",
            maxLength: 500
          }
        ]
      },
      {
        key: "readiness",
        label: "Institutional readiness and outside authorization",
        singular: "readiness check",
        description: "Track prerequisites separately from the working software. A local checkbox or record is not legal, funding, ethical or independent approval.",
        fields: [
          {
            key: "title",
            label: "Requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Readiness record",
            kind: "select",
            optional: false,
            options: [
              "Not established",
              "Needs outside review",
              "Evidence recorded locally",
              "Needs revision"
            ],
            min: null,
            max: null,
            value: "Not established",
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "date",
            label: "Next check",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Evidence, authority and what remains unconfirmed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      }
    ],
    hash: "6c35d45e777bb1f972c177d579330ce6733c60a3972886cfcab7adbc2ae61d2d"
  },
  {
    id: "partner-charity-incubator-v1",
    version: 1,
    program: "charity-incubator",
    context: [
      {
        key: "name",
        label: "Incubator cycle title",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "scope",
        label: "Scope, populations and what would count as a genuine gap",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "period",
        label: "Planning period or review cycle",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "authority",
        label: "Who could authorize operation, and what is not authorized here?",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "privacy",
        label: "Public-information boundaries, access and deletion plan",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      }
    ],
    collections: [
      {
        key: "gaps",
        label: "Gap and existing-work checks",
        singular: "gap check",
        description: "Missing from this notebook never means nobody is doing the work.",
        fields: [
          {
            key: "title",
            label: "Gap question",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "need",
            label: "Need, coverage and evidence limitations",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "search",
            label: "Public registries, search terms, dates and community-led sources",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "existing",
            label: "Existing work, partnership options and duplication risk",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Use public evidence, never private documents or personal records.",
            maxLength: 500
          },
          {
            key: "next",
            label: "Next independent check and who should shape it",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "projects",
        label: "Cohort projects and stages",
        singular: "project",
        description: "Track project codes and role needs, not sensitive founder profiles.",
        fields: [
          {
            key: "title",
            label: "Project code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "gap",
            label: "Gap reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "model",
            label: "Theory of change, alternative delivery routes and stop rule",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Cohort stage",
            kind: "select",
            optional: false,
            options: [
              "Discovery",
              "Existing partner search",
              "Design",
              "Pilot proposed",
              "Learning",
              "Hand-off",
              "Closed"
            ],
            min: null,
            max: null,
            value: "Discovery",
            hint: null,
            maxLength: 500
          },
          {
            key: "roles",
            label: "Role placeholders, capacity and support needed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "governance",
            label: "Decision authority, conflicts, access and consent",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "date",
            label: "Next review",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "experiments",
        label: "Experiments and learning",
        singular: "experiment",
        description: "Write decision rules before results. Negative and inconclusive observations belong in the record.",
        fields: [
          {
            key: "title",
            label: "Experiment reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "project",
            label: "Project reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "hypothesis",
            label: "Hypothesis and causal link to test",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "design",
            label: "Population, comparison, outcome, consent and safeguards",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "threshold",
            label: "Success, stop and revision rules; limits of detection",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "finding",
            label: "Observed result, uncertainty or explicitly not run",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Use public evidence, never private documents or personal records.",
            maxLength: 500
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "milestones",
        label: "Milestones and hand-off",
        singular: "milestone",
        description: "Describe a deliverable and the evidence needed to accept it.",
        fields: [
          {
            key: "title",
            label: "Milestone",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "project",
            label: "Project reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "acceptance",
            label: "Public deliverable and acceptance evidence",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "date",
            label: "Review date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Milestone state",
            kind: "select",
            optional: false,
            options: [
              "Planned",
              "In progress",
              "Needs review",
              "Accepted locally",
              "Closed"
            ],
            min: null,
            max: null,
            value: "Planned",
            hint: null,
            maxLength: 500
          },
          {
            key: "next",
            label: "Hand-off, merger or closure plan",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      },
      {
        key: "readiness",
        label: "Institutional readiness and outside authorization",
        singular: "readiness check",
        description: "Track prerequisites separately from the working software. A local checkbox or record is not legal, funding, ethical or independent approval.",
        fields: [
          {
            key: "title",
            label: "Requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Readiness record",
            kind: "select",
            optional: false,
            options: [
              "Not established",
              "Needs outside review",
              "Evidence recorded locally",
              "Needs revision"
            ],
            min: null,
            max: null,
            value: "Not established",
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "date",
            label: "Next check",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Evidence, authority and what remains unconfirmed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      }
    ],
    hash: "eded5ab6727d9def42321ff1551fa22329f2281863ffdb60bb95a6efde697656"
  },
  {
    id: "partner-question-bounties-v1",
    version: 1,
    program: "question-bounties",
    context: [
      {
        key: "name",
        label: "Bounty planning cycle",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "scope",
        label: "Open problem, public value and what the question leaves out",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "period",
        label: "Planning period or review cycle",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "authority",
        label: "Who could authorize operation, and what is not authorized here?",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "privacy",
        label: "Public-information boundaries, access and deletion plan",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      }
    ],
    collections: [
      {
        key: "specifications",
        label: "Question specifications",
        singular: "specification",
        description: "Make partial, negative and disputed results legible before any public call.",
        fields: [
          {
            key: "title",
            label: "Bounty question code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "question",
            label: "Exact question and open-problem link",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "acceptance",
            label: "Evidence, reproducibility and acceptance criteria",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "partial",
            label: "Partial-result and null-result rules",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "appeal",
            label: "Conflicts, appeal, withdrawal and correction process",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "amount",
            label: "Illustrative target amount; blank unknown",
            kind: "number",
            optional: true,
            options: [],
            min: 0,
            max: 1e12,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "currency",
            label: "Currency or unit",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Use public evidence, never private documents or personal records.",
            maxLength: 500
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "pledges",
        label: "Unverified conditional pledges",
        singular: "pledge record",
        description: "A pledge is not money received, available cash or a payment obligation.",
        fields: [
          {
            key: "title",
            label: "Pledge reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "bounty",
            label: "Bounty code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "role",
            label: "Public institution or role placeholder",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "amount",
            label: "Conditional amount; blank unknown",
            kind: "number",
            optional: true,
            options: [],
            min: 0,
            max: 1e12,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "currency",
            label: "Currency or unit",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "conditions",
            label: "Conditions and verification still needed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Pledge state",
            kind: "select",
            optional: false,
            options: [
              "Illustrative only",
              "Unverified conditional",
              "Withdrawn"
            ],
            min: null,
            max: null,
            value: "Illustrative only",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "claims",
        label: "Evidence submissions and claims",
        singular: "claim",
        description: "Use public work or project codes; do not collect personal applications.",
        fields: [
          {
            key: "title",
            label: "Claim code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "bounty",
            label: "Bounty code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Use public evidence, never private documents or personal records.",
            maxLength: 500
          },
          {
            key: "result",
            label: "Claim, methods and reproducible materials or explicitly not supplied",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "limits",
            label: "Limits, objections, missing perspectives and permissions",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "decisions",
        label: "Review and conditional awards",
        singular: "decision packet",
        description: "Record reasons against published criteria. There is no automatic eligibility, winner score or payment.",
        fields: [
          {
            key: "title",
            label: "Decision reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "claim",
            label: "Claim and bounty references",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "criteria",
            label: "Criteria applied, public evidence and unresolved disagreements",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "conflicts",
            label: "Reviewer-role interests, recusals and independent checks",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "amount",
            label: "Conditional award proposal; blank unknown",
            kind: "number",
            optional: true,
            options: [],
            min: 0,
            max: 1e12,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "currency",
            label: "Currency or unit",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "conditions",
            label: "Unmet legal, funding and appeal conditions",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Local decision state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "More evidence needed",
              "Conditional recommendation",
              "No award proposed",
              "Withdrawn"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "readiness",
        label: "Institutional readiness and outside authorization",
        singular: "readiness check",
        description: "Track prerequisites separately from the working software. A local checkbox or record is not legal, funding, ethical or independent approval.",
        fields: [
          {
            key: "title",
            label: "Requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Readiness record",
            kind: "select",
            optional: false,
            options: [
              "Not established",
              "Needs outside review",
              "Evidence recorded locally",
              "Needs revision"
            ],
            min: null,
            max: null,
            value: "Not established",
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "date",
            label: "Next check",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Evidence, authority and what remains unconfirmed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      }
    ],
    hash: "ae04bedb847405ebed5513309da655f5c1f0021c7f67649faed2f49d0559a212"
  },
  {
    id: "partner-the-charitology-prize-v1",
    version: 1,
    program: "the-charitology-prize",
    context: [
      {
        key: "name",
        label: "Prize planning cycle",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "scope",
        label: "Purpose, public-work categories and recognition hypothesis",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "period",
        label: "Planning period or review cycle",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "authority",
        label: "Who could authorize operation, and what is not authorized here?",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "privacy",
        label: "Public-information boundaries, access and deletion plan",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      }
    ],
    collections: [
      {
        key: "criteria",
        label: "Categories and criteria",
        singular: "criterion",
        description: "Test the criteria before using them. Criteria can remain disputed.",
        fields: [
          {
            key: "title",
            label: "Criterion or category",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "definition",
            label: "What evidence would satisfy it?",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "risks",
            label: "Gaming, excluded work and fairness risks",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "challenge",
            label: "Strongest objection and revision process",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "nominations",
        label: "Public work nominations",
        singular: "nomination",
        description: "Nominate research, methods, tools or failure reports. Do not rank people or whole organizations.",
        fields: [
          {
            key: "title",
            label: "Public work title or nomination code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "category",
            label: "Proposed category",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Use public evidence, never private documents or personal records.",
            maxLength: 500
          },
          {
            key: "contribution",
            label: "What the published work adds, with evidence and limits",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "voice",
            label: "Consent, attribution, missing voices and community protections",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "objection",
            label: "Strongest case against recognition",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "conflicts",
        label: "Jury interests and recusals",
        singular: "recusal record",
        description: "Use roles and public connections, not personal profiles.",
        fields: [
          {
            key: "title",
            label: "Conflict check code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "nomination",
            label: "Nomination reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "role",
            label: "Proposed jury role",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "connection",
            label: "Relevant connection or explicit unknown",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "response",
            label: "Recusal, independent check and record of dissent",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "deliberations",
        label: "Jury deliberation packets",
        singular: "deliberation",
        description: "Prepare reasons and dissent for a human process. A local status does not confer an award.",
        fields: [
          {
            key: "title",
            label: "Deliberation reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "nomination",
            label: "Nomination and criterion references",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "evidence",
            label: "Evidence considered and unresolved checks",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "reasons",
            label: "Reasoning, counterarguments and alternatives",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "dissent",
            label: "Dissent and response, including unknown",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "authorization",
            label: "Who would authorize publication, appeal and correction?",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Packet state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "More evidence requested",
              "Ready for independent discussion",
              "Locally recorded proposal",
              "Withdrawn"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "readiness",
        label: "Institutional readiness and outside authorization",
        singular: "readiness check",
        description: "Track prerequisites separately from the working software. A local checkbox or record is not legal, funding, ethical or independent approval.",
        fields: [
          {
            key: "title",
            label: "Requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Readiness record",
            kind: "select",
            optional: false,
            options: [
              "Not established",
              "Needs outside review",
              "Evidence recorded locally",
              "Needs revision"
            ],
            min: null,
            max: null,
            value: "Not established",
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "date",
            label: "Next check",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Evidence, authority and what remains unconfirmed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      }
    ],
    hash: "292cc4b7776c5845b64dc1caaa66d41b652ae854902dd965ada283af97b9d25b"
  },
  {
    id: "partner-charitology-fellowship-v1",
    version: 1,
    program: "charitology-fellowship",
    context: [
      {
        key: "name",
        label: "Fellowship planning cycle",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "scope",
        label: "Open questions, intended outputs and support model",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "period",
        label: "Planning period or review cycle",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "authority",
        label: "Who could authorize operation, and what is not authorized here?",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "privacy",
        label: "Public-information boundaries, access and deletion plan",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      }
    ],
    collections: [
      {
        key: "projects",
        label: "Project proposals and scope",
        singular: "project proposal",
        description: "Describe the work, evidence and support needs. Do not create personal applicant profiles.",
        fields: [
          {
            key: "title",
            label: "Anonymous project code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "question",
            label: "Open problem and proposed contribution",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "method",
            label: "Methods, access, limitations and ethics questions",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "output",
            label: "Public output, license and reproducibility plan",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "support",
            label: "Supervision roles and resources, without private personal details",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Use public evidence, never private documents or personal records.",
            maxLength: 500
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "curriculum",
        label: "Curriculum and facilitated sessions",
        singular: "learning session",
        description: "Plan learning goals and activities rather than claiming professional accreditation.",
        fields: [
          {
            key: "title",
            label: "Unit title",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "objective",
            label: "Question and learning objective",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "activity",
            label: "Reading, practice and facilitated discussion",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "output",
            label: "Worked output and feedback method",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "role",
            label: "Facilitating role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "date",
            label: "Provisional session date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Session state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Materials prepared",
              "Discussion planned",
              "Local learning notes recorded"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "milestones",
        label: "Project milestones and supervision",
        singular: "milestone",
        description: "Milestones are project records, not credential or hiring decisions.",
        fields: [
          {
            key: "title",
            label: "Milestone",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "project",
            label: "Project code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "deliverable",
            label: "Deliverable and review criteria",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "feedback",
            label: "Feedback, uncertainty and revisions or explicitly not reviewed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "date",
            label: "Provisional review date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Milestone state",
            kind: "select",
            optional: false,
            options: [
              "Planned",
              "In progress",
              "Needs discussion",
              "Locally recorded completion",
              "Closed"
            ],
            min: null,
            max: null,
            value: "Planned",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "reviews",
        label: "Public-project review and fairness notes",
        singular: "review note",
        description: "Human discussion of public project work only. No automatic selection or sensitive applicant attributes.",
        fields: [
          {
            key: "title",
            label: "Review reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "project",
            label: "Project code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "criteria",
            label: "Prepublished work-related criteria and evidence",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "access",
            label: "Accessible process, missing perspectives and alternatives",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "conflicts",
            label: "Reviewer-role connections, recusals and independent check",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "reasoning",
            label: "Reasons, dissent and questions; no automated selection",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "next",
            label: "Responsible human decision and correction process still required",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "readiness",
        label: "Institutional readiness and outside authorization",
        singular: "readiness check",
        description: "Track prerequisites separately from the working software. A local checkbox or record is not legal, funding, ethical or independent approval.",
        fields: [
          {
            key: "title",
            label: "Requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Readiness record",
            kind: "select",
            optional: false,
            options: [
              "Not established",
              "Needs outside review",
              "Evidence recorded locally",
              "Needs revision"
            ],
            min: null,
            max: null,
            value: "Not established",
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "date",
            label: "Next check",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Evidence, authority and what remains unconfirmed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      }
    ],
    hash: "f7ab921a507d504981d40f8b31641aacdc6f47f90461c1747f1db742bcdce46b"
  },
  {
    id: "partner-charitology-summit-v1",
    version: 1,
    program: "charitology-summit",
    context: [
      {
        key: "name",
        label: "Summit planning title",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "scope",
        label: "Shared questions, intended participants and concrete outputs",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "period",
        label: "Planning period or review cycle",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "authority",
        label: "Who could authorize operation, and what is not authorized here?",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "privacy",
        label: "Public-information boundaries, access and deletion plan",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      }
    ],
    collections: [
      {
        key: "sessions",
        label: "Provisional sessions and agenda",
        singular: "session",
        description: "Use UTC date and time. A row or calendar export does not announce a real event.",
        fields: [
          {
            key: "title",
            label: "Working session title",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "date",
            label: "Provisional UTC date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "start",
            label: "Provisional UTC start, HH:MM",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "minutes",
            label: "Duration in minutes; blank unknown",
            kind: "number",
            optional: true,
            options: [],
            min: 1,
            max: 1440,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "question",
            label: "Open problem or disagreement",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "format",
            label: "Facilitation, participation and disagreement format",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "output",
            label: "Written output and follow-up owner role",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Planning state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs host",
              "Tentative internal plan",
              "Cancelled"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "roles",
        label: "Speaker and facilitation role placeholders",
        singular: "role requirement",
        description: "Keep names and invitations outside the planning example. A placeholder is not a confirmed speaker.",
        fields: [
          {
            key: "title",
            label: "Role placeholder",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "session",
            label: "Session reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "contribution",
            label: "Perspective or expertise to seek",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "access",
            label: "Participation support, consent and recording needs",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Role planning state",
            kind: "select",
            optional: false,
            options: [
              "Placeholder only",
              "Invitation process needed",
              "Response not recorded",
              "Role no longer needed"
            ],
            min: null,
            max: null,
            value: "Placeholder only",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "production",
        label: "Access and production checks",
        singular: "production check",
        description: "A checklist is a plan; verify access and consent through the actual host.",
        fields: [
          {
            key: "title",
            label: "Production or access requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "plan",
            label: "Action, alternatives and contingency",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "date",
            label: "Review date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Production state",
            kind: "select",
            optional: false,
            options: [
              "Not started",
              "Planning",
              "Needs outside confirmation",
              "Locally checked"
            ],
            min: null,
            max: null,
            value: "Not started",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "followup",
        label: "Working outputs and follow-up",
        singular: "follow-up record",
        description: "Record what is actually produced or explicitly state that no session has occurred.",
        fields: [
          {
            key: "title",
            label: "Output or action reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "session",
            label: "Session reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "output",
            label: "Public output, uncertainty and dissent or not yet held",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "action",
            label: "Next research action and responsible role",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "date",
            label: "Provisional follow-up",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Use public evidence, never private documents or personal records.",
            maxLength: 500
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "readiness",
        label: "Institutional readiness and outside authorization",
        singular: "readiness check",
        description: "Track prerequisites separately from the working software. A local checkbox or record is not legal, funding, ethical or independent approval.",
        fields: [
          {
            key: "title",
            label: "Requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Readiness record",
            kind: "select",
            optional: false,
            options: [
              "Not established",
              "Needs outside review",
              "Evidence recorded locally",
              "Needs revision"
            ],
            min: null,
            max: null,
            value: "Not established",
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "date",
            label: "Next check",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Evidence, authority and what remains unconfirmed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      }
    ],
    hash: "5bdd5fbdbae4c21f85a7c02d2df85c57e32551b89c29ad37047050a79bdcece9"
  },
  {
    id: "partner-donor-advisory-v1",
    version: 1,
    program: "donor-advisory",
    context: [
      {
        key: "name",
        label: "Plan title or project alias",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "decision",
        label: "Decision to prepare and who has authority to decide",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "values",
        label: "Values, moral lenses and disagreements to preserve",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "constraints",
        label: "Commitments, access needs, restrictions and nonnegotiable constraints",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "amount",
        label: "Optional hypothetical planning amount; blank means unknown",
        kind: "number",
        optional: true,
        options: [],
        min: 0,
        max: 1e12,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "currency",
        label: "Currency or planning unit",
        kind: "text",
        optional: true,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "horizon",
        label: "Giving period and decision checkpoint",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "privacy",
        label: "What may be recorded or shared, and when to delete it",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "conflicts",
        label: "Potential conflicts, referral interests and who must review them",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      }
    ],
    collections: [
      {
        key: "questions",
        label: "Intake and unresolved choices",
        singular: "intake question",
        description: "Start with what the donor wants to understand. A recorded answer is the user’s account, not independent verification or consent from other decision-makers.",
        fields: [
          {
            key: "title",
            label: "Question",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "topic",
            label: "Topic",
            kind: "select",
            optional: false,
            options: [
              "Values and disagreement",
              "Timing",
              "Near and far",
              "Restrictions and flexibility",
              "Decision authority",
              "Privacy and access",
              "Professional referral"
            ],
            min: null,
            max: null,
            value: "Values and disagreement",
            hint: null,
            maxLength: 500
          },
          {
            key: "answer",
            label: "Current answer, including unknowns",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "alternatives",
            label: "Other perspectives or choices still open",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "next",
            label: "What would resolve the question, and whose input is needed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "options",
        label: "Alternative giving scenarios",
        singular: "scenario",
        description: "Scenarios are alternatives, not allocations to add together. No score, optimal portfolio, payout rule or named-charity ranking is calculated.",
        fields: [
          {
            key: "title",
            label: "Scenario title",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "mechanism",
            label: "Proposed activity, who may benefit and how change might happen",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "depth",
            label: "Activity depth (hypothesis, never a grade)",
            kind: "select",
            optional: false,
            options: [
              "Unclassified",
              "0 Relief",
              "1 Repair",
              "2 Prevention",
              "3 Structure",
              "4 Source",
              "Several levels"
            ],
            min: null,
            max: null,
            value: "Unclassified",
            hint: null,
            maxLength: 500
          },
          {
            key: "place",
            label: "Near/far scope and reason for choosing it",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "amount",
            label: "Hypothetical amount for this scenario; blank means unknown",
            kind: "number",
            optional: true,
            options: [],
            min: 0,
            max: 1e12,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "timing",
            label: "Timing and conditions before committing",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "fit",
            label: "How it fits the stated values and constraints",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "tradeoffs",
            label: "What it displaces, possible harms and the strongest objection",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "unknowns",
            label: "Missing evidence and what could change the choice",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "evidence",
        label: "Evidence and due-diligence questions",
        singular: "evidence note",
        description: "Attach a specific claim to its source and scope. A public report does not verify an entire organization. No private due-diligence files belong here.",
        fields: [
          {
            key: "title",
            label: "Claim or question",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "scenario",
            label: "Related scenario",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "evidence",
            label: "Basis of this claim",
            kind: "select",
            optional: false,
            options: [
              "Unknown or not checked",
              "Public description only",
              "Observational evidence",
              "Causal study",
              "Mixed or disputed",
              "Hypothesis"
            ],
            min: null,
            max: null,
            value: "Unknown or not checked",
            hint: null,
            maxLength: 500
          },
          {
            key: "finding",
            label: "What the source supports, or what remains to be found",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "limits",
            label: "Population, period, counterfactual, conflicts and transfer limits",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "checked",
            label: "Date you checked the source",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "next",
            label: "Next check or question for a qualified reviewer",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      },
      {
        key: "followup",
        label: "Decisions and follow-up",
        singular: "decision checkpoint",
        description: "Record a decision in the user’s own words and how it will be revisited. “Recorded decision” is a local label; it is no payment authorization, advisor approval or external commitment.",
        fields: [
          {
            key: "title",
            label: "Decision or checkpoint",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "decision",
            label: "Choice, reasons and dissent; state explicitly if still undecided",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "conditions",
            label: "Evidence or professional checks required before action",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "owner",
            label: "Responsible role, without a personal name",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "date",
            label: "Next review date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "learning",
            label: "Feedback sought, possible unwanted effects and change/stop rule",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "readiness",
        label: "Institutional readiness and outside authorization",
        singular: "readiness check",
        description: "Track prerequisites separately from the working software. A local checkbox or record is not legal, funding, ethical or independent approval.",
        fields: [
          {
            key: "title",
            label: "Requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Readiness record",
            kind: "select",
            optional: false,
            options: [
              "Not established",
              "Needs outside review",
              "Evidence recorded locally",
              "Needs revision"
            ],
            min: null,
            max: null,
            value: "Not established",
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "date",
            label: "Next check",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Evidence, authority and what remains unconfirmed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      }
    ],
    hash: "25b0f881b40775eff925c3907b08223a277762993838881bbeb1439b218e5e56"
  },
  {
    id: "partner-nonprofit-advisory-v1",
    version: 1,
    program: "nonprofit-advisory",
    context: [
      {
        key: "name",
        label: "Project alias",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "activity",
        label: "Activity and population in scope, without personal details",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "decision",
        label: "Decision the learning plan must inform",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "change",
        label: "Proposed change pathway, from resources to outcomes",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "baseline",
        label: "What might happen without the activity or change",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "capacity",
        label: "Staff time, skills, access and reporting constraints",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "voice",
        label: "How affected people could shape the questions and challenge conclusions",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "privacy",
        label: "Public-information boundary, access and retention plan",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "period",
        label: "Planning period and review checkpoint",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      }
    ],
    collections: [
      {
        key: "diagnostics",
        label: "Diagnostic questions",
        singular: "diagnostic note",
        description: "Inspect the system around an activity. A gap in this notebook does not prove that an organization lacks the practice, and no organizational score is produced.",
        fields: [
          {
            key: "title",
            label: "Decision-relevant question",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "area",
            label: "Area",
            kind: "select",
            optional: false,
            options: [
              "Outcomes and causal pathway",
              "Evidence and comparison",
              "Full costs and capacity",
              "Voice and access",
              "Reporting burden",
              "Governance and incentives"
            ],
            min: null,
            max: null,
            value: "Outcomes and causal pathway",
            hint: null,
            maxLength: 500
          },
          {
            key: "current",
            label: "Current practice and basis for describing it",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "gap",
            label: "Unknowns, rival explanations or constraints",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "consequence",
            label: "How this affects the decision and who might bear the cost",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "depth",
            label: "Activity depth (hypothesis, never a grade)",
            kind: "select",
            optional: false,
            options: [
              "Unclassified",
              "0 Relief",
              "1 Repair",
              "2 Prevention",
              "3 Structure",
              "4 Source",
              "Several levels"
            ],
            min: null,
            max: null,
            value: "Unclassified",
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "evidence",
        label: "Evidence and full-cost notebook",
        singular: "evidence note",
        description: "Keep effects, outputs and costs separate. Cost entries need a period, currency and allocation basis; overhead shares are not an outcome score.",
        fields: [
          {
            key: "title",
            label: "Evidence question or cost item",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "type",
            label: "Record type",
            kind: "select",
            optional: false,
            options: [
              "Outcome evidence",
              "Output description",
              "Cost or capacity assumption",
              "Feedback and access",
              "Rival explanation"
            ],
            min: null,
            max: null,
            value: "Outcome evidence",
            hint: null,
            maxLength: 500
          },
          {
            key: "measure",
            label: "Measure, unit, denominator and period",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "finding",
            label: "Finding or assumption, explicitly stating unknowns",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "evidence",
            label: "Basis of this claim",
            kind: "select",
            optional: false,
            options: [
              "Unknown or not checked",
              "Public description only",
              "Observational evidence",
              "Causal study",
              "Mixed or disputed",
              "Hypothesis"
            ],
            min: null,
            max: null,
            value: "Unknown or not checked",
            hint: null,
            maxLength: 500
          },
          {
            key: "method",
            label: "Source, comparison or allocation method; whose time and costs count",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "limits",
            label: "Missing costs, bias, consent and limits on interpretation",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "checked",
            label: "Source checked on",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "actions",
        label: "Proportionate action plan",
        singular: "action",
        description: "Choose changes that serve a stated decision. Record the burden and an observable completion criterion; a local “Done” label is not an independent sign-off.",
        fields: [
          {
            key: "title",
            label: "Action",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "diagnostic",
            label: "Diagnostic question addressed",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "date",
            label: "Review date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "steps",
            label: "Smallest feasible next step, dependencies and support needed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "burden",
            label: "Time, cost, access and reporting burden; what will be stopped to make room",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "complete",
            label: "Completion evidence and who should review it",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Task status",
            kind: "select",
            optional: false,
            options: ["To do", "In progress", "Blocked", "Done"],
            min: null,
            max: null,
            value: "To do",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "learning",
        label: "Learning and adaptation checkpoints",
        singular: "learning checkpoint",
        description: "Plan what evidence would support continuing, adapting or stopping. Before/after differences and positive feedback alone do not establish causation.",
        fields: [
          {
            key: "title",
            label: "Learning decision",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "outcome",
            label: "Outcome, population, unit and time horizon",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "method",
            label: "Proportionate method, comparison and alternative explanations",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "rule",
            label: "What would support continuing, changing or stopping; how uncertainty affects the rule",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "feedback",
            label: "How aggregate feedback, disagreement and possible harm will be considered",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "result",
            label: "What is known now, and the next question",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "date",
            label: "Review date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "readiness",
        label: "Institutional readiness and outside authorization",
        singular: "readiness check",
        description: "Track prerequisites separately from the working software. A local checkbox or record is not legal, funding, ethical or independent approval.",
        fields: [
          {
            key: "title",
            label: "Requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Readiness record",
            kind: "select",
            optional: false,
            options: [
              "Not established",
              "Needs outside review",
              "Evidence recorded locally",
              "Needs revision"
            ],
            min: null,
            max: null,
            value: "Not established",
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "date",
            label: "Next check",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Evidence, authority and what remains unconfirmed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      }
    ],
    hash: "8092fd8b1de272db6d1bfc1318066b058cc8b8dedbd17fc5d0e0ca8c0b71fc87"
  },
  {
    id: "partner-field-verification-v1",
    version: 1,
    program: "field-verification",
    context: [
      {
        key: "name",
        label: "Protocol title and version",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "question",
        label: "Reported claim and verification question",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "scope",
        label: "Site types, period and boundaries; omit identifying locations",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "sampling",
        label: "Sampling frame, selection rule, exclusions and limits of coverage",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "method",
        label: "Checks, comparison sources and what they could establish",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "independence",
        label: "Local partner roles, funding, conflicts and independence",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "consent",
        label: "Consent, access, ethics review and stop conditions still required",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "publication",
        label: "Aggregate publication, correction, right of response and retention plan",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "status",
        label: "Local workflow state",
        kind: "select",
        optional: false,
        options: [
          "Draft",
          "Needs evidence",
          "Ready for discussion",
          "Recorded decision",
          "Closed"
        ],
        min: null,
        max: null,
        value: "Draft",
        hint: null,
        maxLength: 500
      }
    ],
    collections: [
      {
        key: "checks",
        label: "Claim and evidence checklist",
        singular: "planned check",
        description: "A check must state both what it could establish and what remains outside its reach. No checklist entry means an actual site has been visited or a claim verified.",
        fields: [
          {
            key: "title",
            label: "Check identifier and title",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "claim",
            label: "Specific reported claim, unit and period",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "method",
            label: "Evidence sought and how it would be checked",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "sampling",
            label: "Eligible sites, selection rule, exclusions and nonresponse",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "limits",
            label: "What this check could not establish; rival explanations",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "stop",
            label: "Access, consent or safety condition that stops the check",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Check state",
            kind: "select",
            optional: false,
            options: [
              "Planned only",
              "Blocked pending safeguards",
              "User note entered — unverified",
              "Needs further check",
              "Closed locally"
            ],
            min: null,
            max: null,
            value: "Planned only",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "findings",
        label: "Findings and uncertainty log",
        singular: "finding note",
        description: "Use aggregate, nonidentifying notes only. “User note entered” is never an independent finding by Charitology. Keep observations, reported accounts and interpretations separate.",
        fields: [
          {
            key: "title",
            label: "Finding identifier and title",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "check",
            label: "Related check identifier",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "kind",
            label: "Basis",
            kind: "select",
            optional: false,
            options: [
              "No observation — planning example",
              "Aggregate user-entered observation",
              "Public document comparison",
              "Conflicting sources",
              "Unable to check"
            ],
            min: null,
            max: null,
            value: "No observation — planning example",
            hint: null,
            maxLength: 500
          },
          {
            key: "observed",
            label: "What was observed or found; explicitly state if nothing was checked",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "interpretation",
            label: "Interpretation, competing explanations and confidence limits",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "coverage",
            label: "Scope, missingness and who or what is not represented",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "date",
            label: "Observation or source-check date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Review state",
            kind: "select",
            optional: false,
            options: [
              "Draft — unverified",
              "Needs evidence",
              "Awaiting response",
              "Ready for discussion",
              "Closed locally"
            ],
            min: null,
            max: null,
            value: "Draft — unverified",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "safeguards",
        label: "Safeguards and unresolved permissions",
        singular: "safeguard",
        description: "This log prepares a review. Marking a safeguard complete records the user’s statement; it does not supply ethical approval, lawful authority, informed consent or safety clearance.",
        fields: [
          {
            key: "title",
            label: "Risk or permission to resolve",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "risk",
            label: "Who could bear a burden or face harm; use no identifying detail",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "control",
            label: "Preventive measure, accessible alternative and escalation route",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "stop",
            label: "Stop rule and who may invoke it without penalty",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "owner",
            label: "Responsible qualified role",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "evidence",
            label: "Evidence of review or why it remains unresolved; no confidential attachments",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Safeguard state",
            kind: "select",
            optional: false,
            options: [
              "Unresolved — do not proceed",
              "Under review",
              "User records a resolution",
              "Needs recheck"
            ],
            min: null,
            max: null,
            value: "Unresolved — do not proceed",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "responses",
        label: "Response and correction log",
        singular: "response note",
        description: "Plan a fair opportunity to respond and correct errors. Enter only public or explicitly shareable aggregate text; this software does not contact anyone or publish a response.",
        fields: [
          {
            key: "title",
            label: "Response or correction identifier",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "finding",
            label: "Related finding identifier",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "question",
            label: "Claim, uncertainty or correction to put to the relevant role",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "response",
            label: "Public/shareable response, or explicit statement that none has been sought",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "provenance",
            label: "How the response is attributed and permission to quote checked; no private identities",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "change",
            label: "What changes, what remains disputed and what could resolve it",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "date",
            label: "Agreed response checkpoint",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Response state",
            kind: "select",
            optional: false,
            options: [
              "Not sought",
              "Planned",
              "User-entered response — unverified",
              "Correction pending",
              "Closed locally"
            ],
            min: null,
            max: null,
            value: "Not sought",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "actions",
        label: "Corrective actions and rechecks",
        singular: "action",
        description: "Track a proposed change, the role responsible and the evidence needed to close it. No external task, reminder, enforcement or follow-up visit is created.",
        fields: [
          {
            key: "title",
            label: "Task or unresolved requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "date",
            label: "Review date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Task status",
            kind: "select",
            optional: false,
            options: ["To do", "In progress", "Blocked", "Done"],
            min: null,
            max: null,
            value: "To do",
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Evidence of completion or next step",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      },
      {
        key: "readiness",
        label: "Institutional readiness and outside authorization",
        singular: "readiness check",
        description: "Track prerequisites separately from the working software. A local checkbox or record is not legal, funding, ethical or independent approval.",
        fields: [
          {
            key: "title",
            label: "Requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Readiness record",
            kind: "select",
            optional: false,
            options: [
              "Not established",
              "Needs outside review",
              "Evidence recorded locally",
              "Needs revision"
            ],
            min: null,
            max: null,
            value: "Not established",
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "date",
            label: "Next check",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Evidence, authority and what remains unconfirmed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      }
    ],
    hash: "86c84be22a760c535af0e888a2ddacedce9190bba5af4a4bae9e0552c1f4f56e"
  }
]);

// src/lib/client/remaining-record-recovery-schemas.ts
var RRDataError = class extends Error {
  code;
  path;
  constructor(message, path = "$", code = "invalid_data") {
    super(`${message} (${path})`);
    this.name = "RRDataError";
    this.code = code;
    this.path = path;
  }
};
function rrFail(message, path = "$") {
  throw new RRDataError(message, path);
}
var RR_KEYS = Object.freeze([
  "charitology.research-program.moral-frameworks-program.v1",
  "charitology.research-program.methods-lab.v1",
  "charitology.research-program.cause-census.v1",
  "charitology.research-program.evidence-reviews.v1",
  "charitology.research-program.replication-program.v1",
  "charitology.research-program.failure-lab.v1",
  "charitology.research-program.history-of-charity.v1",
  "charitology-manuscript-v1",
  "charitology-nominations-v1",
  "charitology-depth-census-v1",
  "charitology-country-notes-v1",
  "charitology.partner-workspace-v1.the-charitology-fund",
  "charitology.partner-workspace-v1.charity-incubator",
  "charitology.partner-workspace-v1.question-bounties",
  "charitology.partner-workspace-v1.the-charitology-prize",
  "charitology.partner-workspace-v1.charitology-fellowship",
  "charitology.partner-workspace-v1.charitology-summit",
  "charitology.partner-workspace-v1.donor-advisory",
  "charitology.partner-workspace-v1.nonprofit-advisory",
  "charitology.partner-workspace-v1.field-verification"
]);
function isRemainingRecordKey(key) {
  return typeof key === "string" && RR_KEYS.includes(key);
}
function requireRemainingRecordKey(key) {
  if (!isRemainingRecordKey(key)) rrFail("Unknown remaining-record key");
}
function remainingRecordCapacity(key) {
  requireRemainingRecordKey(key);
  const nativeBytes = key.startsWith("charitology.research-program.") ? 32e6 : key.startsWith("charitology.partner-workspace-v1.") ? 8e6 : key === "charitology-manuscript-v1" ? 1e6 : key === "charitology-nominations-v1" ? 24e6 : key === "charitology-depth-census-v1" ? 32e6 : 48e6;
  return Object.freeze({
    nativeBytes,
    rawArchiveBytes: 128e6,
    formArchiveBytes: 1e6,
    jsonDepth: 32,
    fileReadTimeoutMs: 3e4,
    autosaveDelayMs: 250
  });
}
var RR_RESEARCH_SCHEMAS = freezeOwned({
  "moral-frameworks-program": {
    freeze: false,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "first",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: [
          "global-health",
          "extreme-poverty",
          "hunger",
          "climate",
          "nature",
          "animals",
          "education",
          "mental-health",
          "housing",
          "democracy",
          "peace",
          "catastrophic-risk",
          "science",
          "community",
          "arts",
          "faith",
          "charity-system"
        ]
      },
      {
        key: "second",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: [
          "global-health",
          "extreme-poverty",
          "hunger",
          "climate",
          "nature",
          "animals",
          "education",
          "mental-health",
          "housing",
          "democracy",
          "peace",
          "catastrophic-risk",
          "science",
          "community",
          "arts",
          "faith",
          "charity-system"
        ]
      },
      {
        key: "weight_welfare",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0,
        max: 5
      },
      {
        key: "weight_rights",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0,
        max: 5
      },
      {
        key: "weight_justice",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0,
        max: 5
      },
      {
        key: "weight_care",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0,
        max: 5
      },
      {
        key: "weight_tradition",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0,
        max: 5
      },
      {
        key: "weight_future",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0,
        max: 5
      },
      {
        key: "weight_nature",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0,
        max: 5
      },
      {
        key: "weight_flourishing",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0,
        max: 5
      },
      {
        key: "reasons",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "disagreement",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "source",
        kind: "url",
        required: false,
        maxLength: 8e3
      },
      {
        key: "correction",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      }
    ]
  },
  "methods-lab": {
    freeze: false,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "problem",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "unit",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "horizon",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "currency",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "method",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: [
          "cash",
          "advocacy",
          "research",
          "mutual-aid",
          "volunteering",
          "investing",
          "prizes"
        ]
      },
      {
        key: "chain",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "costLow",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0
      },
      {
        key: "costHigh",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0
      },
      {
        key: "probabilityLow",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0,
        max: 100
      },
      {
        key: "probabilityHigh",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0,
        max: 100
      },
      {
        key: "unitsLow",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0
      },
      {
        key: "unitsHigh",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0
      },
      {
        key: "assumptions",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "source",
        kind: "url",
        required: false,
        maxLength: 8e3
      },
      {
        key: "harm",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "next",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      }
    ]
  },
  "cause-census": {
    freeze: false,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "cause",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: [
          "global-health",
          "extreme-poverty",
          "hunger",
          "climate",
          "nature",
          "animals",
          "education",
          "mental-health",
          "housing",
          "democracy",
          "peace",
          "catastrophic-risk",
          "science",
          "community",
          "arts",
          "faith",
          "charity-system"
        ]
      },
      {
        key: "scope",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "metric",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: ["scale", "spending", "solvability", "depth", "other"]
      },
      {
        key: "value",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0
      },
      {
        key: "unit",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "year",
        kind: "number",
        required: true,
        maxLength: 8e3,
        min: 1900,
        max: 2200,
        integer: true
      },
      {
        key: "uncertainty",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "source",
        kind: "url",
        required: true,
        maxLength: 8e3
      },
      {
        key: "location",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "framework",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "depth",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      },
      {
        key: "check",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      }
    ]
  },
  "evidence-reviews": {
    freeze: false,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "population",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "intervention",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "outcome",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "search",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "inclusion",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "selection",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      },
      {
        key: "source",
        kind: "url",
        required: true,
        maxLength: 8e3
      },
      {
        key: "design",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: [
          "randomized",
          "quasi",
          "observational",
          "qualitative",
          "systematic",
          "other"
        ]
      },
      {
        key: "sample",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      },
      {
        key: "effect",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "bias",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "transfer",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      },
      {
        key: "conflicts",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      },
      {
        key: "synthesis",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "next",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      }
    ]
  },
  "replication-program": {
    freeze: true,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "source",
        kind: "url",
        required: true,
        maxLength: 8e3
      },
      {
        key: "claim",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "kind",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: ["reproduce", "reanalyse", "direct", "context"]
      },
      {
        key: "change",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "hypotheses",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "sample",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "outcome",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "estimand",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "analysis",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "missing",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "multiple",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "access",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "ethics",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "review",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "due",
        kind: "date",
        required: false,
        maxLength: 8e3
      },
      {
        key: "amendments",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      }
    ]
  },
  "failure-lab": {
    freeze: false,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "source",
        kind: "url",
        required: true,
        maxLength: 8e3
      },
      {
        key: "intent",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "timeline",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "observed",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "counterfactual",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "mechanism",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: [
          "causal-chain",
          "implementation",
          "context",
          "incentives",
          "displacement",
          "measurement",
          "unknown"
        ]
      },
      {
        key: "confidence",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: ["hypothesis", "documented", "debated"]
      },
      {
        key: "lesson",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "action",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "owner",
        kind: "text",
        required: false,
        maxLength: 8e3
      },
      {
        key: "due",
        kind: "date",
        required: false,
        maxLength: 8e3
      },
      {
        key: "verification",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "result",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      }
    ]
  },
  "history-of-charity": {
    freeze: false,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "first",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: [
          "carnegie-libraries",
          "dare",
          "green-revolution",
          "haiti-earthquake-reconstruction",
          "hookworm-campaign",
          "ice-bucket-challenge",
          "one-laptop-per-child",
          "oral-rehydration-therapy-spread",
          "playpumps",
          "polio-eradication",
          "rosenwald-schools",
          "scared-straight",
          "smallpox-eradication"
        ]
      },
      {
        key: "second",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: [
          "carnegie-libraries",
          "dare",
          "green-revolution",
          "haiti-earthquake-reconstruction",
          "hookworm-campaign",
          "ice-bucket-challenge",
          "one-laptop-per-child",
          "oral-rehydration-therapy-spread",
          "playpumps",
          "polio-eradication",
          "rosenwald-schools",
          "scared-straight",
          "smallpox-eradication"
        ]
      },
      {
        key: "question",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "source",
        kind: "url",
        required: true,
        maxLength: 8e3
      },
      {
        key: "similar",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "different",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "missing",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "lesson",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "next",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      }
    ]
  }
});
var RR_COUNTRY_CODES = Object.freeze([
  "AFG",
  "ALB",
  "DZA",
  "ASM",
  "AND",
  "AGO",
  "ATG",
  "ARG",
  "ARM",
  "ABW",
  "AUS",
  "AUT",
  "AZE",
  "BHS",
  "BHR",
  "BGD",
  "BRB",
  "BLR",
  "BEL",
  "BLZ",
  "BEN",
  "BMU",
  "BTN",
  "BOL",
  "BIH",
  "BWA",
  "BRA",
  "VGB",
  "BRN",
  "BGR",
  "BFA",
  "BDI",
  "CPV",
  "KHM",
  "CMR",
  "CAN",
  "CYM",
  "CAF",
  "TCD",
  "CHI",
  "CHL",
  "CHN",
  "COL",
  "COM",
  "COD",
  "COG",
  "CRI",
  "CIV",
  "HRV",
  "CUB",
  "CUW",
  "CYP",
  "CZE",
  "DNK",
  "DJI",
  "DMA",
  "DOM",
  "ECU",
  "EGY",
  "SLV",
  "GNQ",
  "ERI",
  "EST",
  "SWZ",
  "ETH",
  "FRO",
  "FJI",
  "FIN",
  "FRA",
  "PYF",
  "GAB",
  "GMB",
  "GEO",
  "DEU",
  "GHA",
  "GIB",
  "GRC",
  "GRL",
  "GRD",
  "GUM",
  "GTM",
  "GIN",
  "GNB",
  "GUY",
  "HTI",
  "HND",
  "HKG",
  "HUN",
  "ISL",
  "IND",
  "IDN",
  "IRN",
  "IRQ",
  "IRL",
  "IMN",
  "ISR",
  "ITA",
  "JAM",
  "JPN",
  "JOR",
  "KAZ",
  "KEN",
  "KIR",
  "PRK",
  "KOR",
  "XKX",
  "KWT",
  "KGZ",
  "LAO",
  "LVA",
  "LBN",
  "LSO",
  "LBR",
  "LBY",
  "LIE",
  "LTU",
  "LUX",
  "MAC",
  "MDG",
  "MWI",
  "MYS",
  "MDV",
  "MLI",
  "MLT",
  "MHL",
  "MRT",
  "MUS",
  "MEX",
  "FSM",
  "MDA",
  "MCO",
  "MNG",
  "MNE",
  "MAR",
  "MOZ",
  "MMR",
  "NAM",
  "NRU",
  "NPL",
  "NLD",
  "NCL",
  "NZL",
  "NIC",
  "NER",
  "NGA",
  "MKD",
  "MNP",
  "NOR",
  "OMN",
  "PAK",
  "PLW",
  "PAN",
  "PNG",
  "PRY",
  "PER",
  "PHL",
  "POL",
  "PRT",
  "PRI",
  "QAT",
  "ROU",
  "RUS",
  "RWA",
  "WSM",
  "SMR",
  "STP",
  "SAU",
  "SEN",
  "SRB",
  "SYC",
  "SLE",
  "SGP",
  "SXM",
  "SVK",
  "SVN",
  "SLB",
  "SOM",
  "ZAF",
  "SSD",
  "ESP",
  "LKA",
  "KNA",
  "LCA",
  "MAF",
  "VCT",
  "SDN",
  "SUR",
  "SWE",
  "CHE",
  "SYR",
  "TJK",
  "TZA",
  "THA",
  "TLS",
  "TGO",
  "TON",
  "TTO",
  "TUN",
  "TUR",
  "TKM",
  "TCA",
  "TUV",
  "UGA",
  "UKR",
  "ARE",
  "GBR",
  "USA",
  "URY",
  "UZB",
  "VUT",
  "VEN",
  "VNM",
  "VIR",
  "PSE",
  "YEM",
  "ZMB",
  "ZWE"
]);
var RR_PARTNER_SCHEMAS = PROGRAM_GRAPH_ADAPTERS;
var RR_MANUSCRIPT_FIELDS = Object.freeze([
  "title",
  "author",
  "summary",
  "kind",
  "question",
  "methods",
  "results",
  "limits",
  "sources"
]);
var RR_MANUSCRIPT_LIMITS = Object.freeze([
  200,
  150,
  1500,
  100,
  1e4,
  2e4,
  2e4,
  1e4,
  1e4
]);
var RR_MANUSCRIPT_KINDS = Object.freeze([
  "Proposed method",
  "Research result",
  "Replication",
  "Null result or failure report",
  "Essay"
]);
var RR_NOMINATION_FIELDS = Object.freeze([
  "title",
  "subject",
  "depth",
  "mechanism",
  "lenses",
  "evidence",
  "funding",
  "voice",
  "objection",
  "conflicts"
]);
var RR_NOMINATION_LIMITS = Object.freeze([
  180,
  180,
  100,
  5e3,
  5e3,
  1e4,
  5e3,
  5e3,
  5e3,
  3e3
]);
var RR_NOMINATION_DEPTHS = Object.freeze([
  "unknown",
  "0 · Relief",
  "1 · Repair",
  "2 · Prevention",
  "3 · Structure",
  "4 · Source",
  "Multiple levels; explain below"
]);
function freezeOwned(v) {
  if (v && typeof v === "object") {
    for (const k of Object.keys(v))
      freezeOwned(v[k]);
    Object.freeze(v);
  }
  return v;
}
var encoder = new TextEncoder();
function copyRemainingRecordPlain(input, maxBytes = 128e6) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 128e6)
    rrFail("Invalid input bound");
  let charged = 0;
  const active = /* @__PURE__ */ new Set();
  const charge = (n, p) => {
    charged += n;
    if (charged > maxBytes)
      throw new RRDataError(
        "Remaining-record input exceeds its complete byte limit",
        p,
        "input_limit"
      );
  };
  const visit = (v, p, depth) => {
    if (depth > 32)
      throw new RRDataError(
        "Remaining-record JSON exceeds depth 32",
        p,
        "input_limit"
      );
    if (v === null) {
      charge(4, p);
      return null;
    }
    if (typeof v === "string") {
      if (v.length > maxBytes)
        throw new RRDataError("Text exceeds input bound", p, "input_limit");
      charge(encoder.encode(JSON.stringify(v)).length, p);
      return v;
    }
    if (typeof v === "boolean") {
      charge(v ? 4 : 5, p);
      return v;
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v)) rrFail("Nonfinite number", p);
      charge(String(v).length, p);
      return v;
    }
    if (!v || typeof v !== "object") rrFail("Expected plain JSON data", p);
    if (active.has(v)) rrFail("Cyclic data", p);
    active.add(v);
    try {
      if (Array.isArray(v)) {
        const length = Object.getOwnPropertyDescriptor(v, "length")?.value;
        if (!Number.isSafeInteger(length) || length < 0 || length > 2e3)
          rrFail("Array exceeds the closed producer collection bound", p);
      }
      let proto, descriptors;
      try {
        proto = Object.getPrototypeOf(v);
        descriptors = Object.getOwnPropertyDescriptors(v);
      } catch {
        return rrFail("Object cannot be inspected as plain data", p);
      }
      const keys = Reflect.ownKeys(descriptors);
      if (Array.isArray(v)) {
        if (proto !== Array.prototype) rrFail("Unsupported array prototype", p);
        const n = descriptors.length?.value;
        if (!Number.isSafeInteger(n) || n < 0 || n > maxBytes / 2)
          rrFail("Invalid array length", p);
        if (keys.length !== n + 1)
          rrFail("Sparse or decorated arrays are unsupported", p);
        charge(2 + Math.max(0, n - 1), p);
        const out2 = [];
        for (let i = 0; i < n; i++) {
          const d = descriptors[String(i)];
          if (!d || !("value" in d) || !d.enumerable)
            rrFail("Array index must be own data", `${p}[${i}]`);
          out2.push(visit(d.value, `${p}[${i}]`, depth + 1));
        }
        return out2;
      }
      if (proto !== Object.prototype) rrFail("Unsupported object prototype", p);
      const out = {};
      charge(2 + Math.max(0, keys.length - 1), p);
      for (const k of keys) {
        if (typeof k !== "string") rrFail("Symbol fields are unsupported", p);
        const d = descriptors[k];
        if (!d || !("value" in d) || !d.enumerable)
          rrFail("Object field must be own enumerable data", `${p}.${k}`);
        charge(encoder.encode(JSON.stringify(k)).length + 1, p);
        Object.defineProperty(out, k, {
          value: visit(d.value, `${p}.${k}`, depth + 1),
          enumerable: true,
          writable: true,
          configurable: true
        });
      }
      return out;
    } finally {
      active.delete(v);
    }
  };
  return freezeOwned(visit(input, "$", 0));
}
function rrObject(value, fields, path = "$") {
  if (!value || typeof value !== "object" || Array.isArray(value))
    rrFail("Expected an object", path);
  const v = value, keys = Object.keys(v);
  if (keys.length !== fields.length || fields.some((k) => !Object.hasOwn(v, k)) || keys.some((k) => !fields.includes(k)))
    rrFail("Unknown or missing field", path);
  return v;
}
function text2(value, max, path, required = false) {
  if (typeof value !== "string" || value.length > max || required && !value.trim())
    rrFail("Text is missing or exceeds its field limit", path);
  return value;
}
function choice(value, choices, path) {
  if (typeof value !== "string" || !choices.includes(value))
    rrFail("Unknown exact choice", path);
}
function realDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
}
function rrCanonicalInstant(v, p = "$") {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v)
    rrFail("Invalid canonical UTC timestamp", p);
}
function safeUrl(s, p) {
  if (/[\u0000-\u001f\u007f-\u009f\\]/.test(s))
    rrFail("URL contains unsupported control or backslash", p);
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || !u.hostname || u.username || u.password)
      throw Error();
  } catch {
    rrFail("Use credential-free HTTPS", p);
  }
}
function researchForRemainingKey(key) {
  requireRemainingRecordKey(key);
  return key.startsWith("charitology.research-program.") ? key.slice(29, -3) : null;
}
function partnerForRemainingKey(key) {
  requireRemainingRecordKey(key);
  return key.startsWith("charitology.partner-workspace-v1.") ? key.slice(33) : null;
}
function remainingRecordPartnerSchema(key) {
  const program = partnerForRemainingKey(key), spec = RR_PARTNER_SCHEMAS.find((s) => s.program === program);
  if (!spec) rrFail("Key has no partner schema");
  return spec;
}
function researchField(v, f, p, draft) {
  const s = text2(v, f.maxLength, p), t = s.trim();
  if (draft) return;
  if (!t) {
    if (f.required) rrFail("Required saved field is blank", p);
    return;
  }
  if (f.kind === "select") choice(s, f.options ?? [], p);
  if (f.kind === "date" && !realDate(s))
    rrFail("A real exact calendar date is required", p);
  if (f.kind === "url") safeUrl(s, p);
  if (f.kind === "number") {
    const n = Number(s);
    if (!Number.isFinite(n) || f.min !== void 0 && n < f.min || f.max !== void 0 && n > f.max || f.integer && !Number.isInteger(n))
      rrFail("Number is outside its declared bounds", p);
  }
}
function researchValue(input, program) {
  const v = rrObject(input, [
    "version",
    "program",
    "records",
    "draft",
    "editing"
  ]);
  if (v.version !== 1 || v.program !== program)
    rrFail("Wrong research version or program");
  const spec = RR_RESEARCH_SCHEMAS[program], fields = spec.fields;
  if (!Array.isArray(v.records) || v.records.length > 200)
    rrFail("Research exceeds 200 records", "$.records");
  const ids = /* @__PURE__ */ new Set();
  for (const [i, row] of v.records.entries()) {
    const p = `$.records[${i}]`, r = rrObject(row, ["id", "createdAt", "updatedAt", "values"], p), id = text2(r.id, 100, p + ".id");
    if (!id || ids.has(id))
      rrFail("Invalid or duplicate research ID", p + ".id");
    ids.add(id);
    rrCanonicalInstant(r.createdAt, p + ".createdAt");
    rrCanonicalInstant(r.updatedAt, p + ".updatedAt");
    const values = rrObject(
      r.values,
      fields.map((f) => f.key),
      p + ".values"
    );
    for (const f of fields)
      researchField(values[f.key], f, p + ".values." + f.key, false);
    if (["moral-frameworks-program", "history-of-charity"].includes(program) && values.first !== "" && values.first === values.second)
      rrFail("Comparison identities must differ", p + ".values");
    if (program === "methods-lab") {
      for (const [low, high] of [
        ["costLow", "costHigh"],
        ["probabilityLow", "probabilityHigh"],
        ["unitsLow", "unitsHigh"]
      ])
        if (values[low] !== "" && values[high] !== "" && Number(values[low]) > Number(values[high]))
          rrFail("Lower bound exceeds upper bound", p + ".values");
    }
  }
  if (!v.draft || typeof v.draft !== "object" || Array.isArray(v.draft))
    rrFail("Research draft must be an object", "$.draft");
  for (const [key, value] of Object.entries(v.draft)) {
    const f = fields.find((f2) => f2.key === key);
    if (!f) rrFail("Unknown research draft field", "$.draft." + key);
    researchField(value, f, "$.draft." + key, true);
  }
  if (v.editing !== null && (typeof v.editing !== "string" || !ids.has(v.editing) || spec.freeze))
    rrFail("Editing must refer to an existing unfrozen row", "$.editing");
}
function partnerFields(input, fields, path, context = false) {
  const v = rrObject(
    input,
    fields.map((f) => f.key),
    path
  );
  for (const f of fields) {
    const p = path + "." + f.key, s = text2(v[f.key], f.maxLength, p), t = s.trim();
    if (!t) {
      if (!context && !f.optional) rrFail("Required saved field is blank", p);
      continue;
    }
    if (f.kind === "number") {
      const n = Number(t);
      if (!Number.isFinite(n) || n < (f.min ?? 0) || n > Math.min(f.max ?? 1e9, 1e9) || ["amount", "budget"].includes(f.key) && !/^(?:\d+|\d*\.\d{1,2})$/.test(t) || f.key === "minutes" && !Number.isInteger(n))
        rrFail("Number is outside existing partner bounds", p);
    }
    if (f.kind === "date" && !realDate(s))
      rrFail("A real exact calendar date is required", p);
    if (f.kind === "select") choice(s, f.options, p);
    if (f.kind === "url") safeUrl(s, p);
    if (f.key === "start" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s))
      rrFail("UTC start must be exact HH:MM", p);
  }
}
function partnerValue(input, key) {
  const v = rrObject(input, [
    "version",
    "program",
    "updated",
    "context",
    "records"
  ]), spec = remainingRecordPartnerSchema(key);
  if (v.version !== 1 || v.program !== spec.program)
    rrFail("Wrong partner version or program");
  const updated = text2(v.updated, 100, "$.updated");
  if (updated && !Number.isFinite(Date.parse(updated)))
    rrFail("Invalid retained partner timestamp", "$.updated");
  partnerFields(v.context, spec.context, "$.context", true);
  const records = rrObject(
    v.records,
    spec.collections.map((c) => c.key),
    "$.records"
  ), ids = /* @__PURE__ */ new Set();
  let count = 0;
  for (const c of spec.collections) {
    const rows = records[c.key];
    if (!Array.isArray(rows) || rows.length > 250)
      rrFail("Collection exceeds 250 records", "$.records." + c.key);
    for (const [i, row] of rows.entries()) {
      const p = `$.records.${c.key}[${i}]`, r = rrObject(row, ["id", "values"], p), id = text2(r.id, 100, p + ".id");
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || ids.has(id))
        rrFail("Invalid or duplicate partner ID", p + ".id");
      ids.add(id);
      if (++count > 500) rrFail("Partner workspace exceeds 500 records");
      partnerFields(r.values, c.fields, p + ".values");
    }
  }
}
function otherValue(key, own) {
  if (key === "charitology-manuscript-v1") {
    const v = rrObject(own, RR_MANUSCRIPT_FIELDS);
    RR_MANUSCRIPT_FIELDS.forEach(
      (f, i) => text2(v[f], RR_MANUSCRIPT_LIMITS[i], "$." + f)
    );
    choice(v.kind, RR_MANUSCRIPT_KINDS, "$.kind");
    return;
  }
  if (key === "charitology-nominations-v1") {
    if (!Array.isArray(own) || own.length > 100)
      rrFail("Nomination array exceeds 100 packets");
    const ids = /* @__PURE__ */ new Set();
    for (const [i, row] of own.entries()) {
      const p = `$[${i}]`, v = rrObject(row, ["id", ...RR_NOMINATION_FIELDS], p), id = text2(v.id, 99, p + ".id");
      if (!id || ids.has(id))
        rrFail("Invalid or duplicate nomination ID", p + ".id");
      ids.add(id);
      RR_NOMINATION_FIELDS.forEach(
        (f, i2) => text2(v[f], RR_NOMINATION_LIMITS[i2], p + "." + f, true)
      );
      choice(v.depth, RR_NOMINATION_DEPTHS, p + ".depth");
    }
    return;
  }
  if (key === "charitology-depth-census-v1") {
    const v = rrObject(own, ["currency", "rows"]);
    if (typeof v.currency !== "string" || !/^[A-Z]{3}$/.test(v.currency))
      rrFail("Currency must be three uppercase letters", "$.currency");
    if (!Array.isArray(v.rows) || v.rows.length > 1e3)
      rrFail("Depth sample exceeds 1000 rows", "$.rows");
    const ids = /* @__PURE__ */ new Set();
    for (const [i, row] of v.rows.entries()) {
      const p = `$.rows[${i}]`, r = rrObject(row, ["id", "activity", "amount", "depth", "source"], p), id = text2(r.id, 99, p + ".id");
      if (!id || ids.has(id))
        rrFail("Invalid or duplicate activity ID", p + ".id");
      ids.add(id);
      text2(r.activity, 200, p + ".activity", true);
      text2(r.source, 5e3, p + ".source", true);
      const n = r.amount;
      if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1e9 || Math.abs(n * 100 - Math.round(n * 100)) >= 1e-4)
        rrFail(
          "Amount must retain existing cent precision and bounds",
          p + ".amount"
        );
      choice(r.depth, ["unknown", "0", "1", "2", "3", "4"], p + ".depth");
    }
    return;
  }
  if (key === "charitology-country-notes-v1") {
    if (!own || typeof own !== "object" || Array.isArray(own))
      rrFail("Country notes must be a bare map");
    for (const [code, row] of Object.entries(own)) {
      if (!RR_COUNTRY_CODES.includes(code))
        rrFail("Unknown country identity", "$." + code);
      const r = rrObject(row, ["voices", "institutions", "gaps"], "$." + code);
      for (const f of ["voices", "institutions", "gaps"])
        text2(r[f], 1e4, "$." + code + "." + f);
    }
    return;
  }
  rrFail("Unknown native family");
}
function validateRemainingRecordValue(key, input) {
  requireRemainingRecordKey(key);
  const cap = remainingRecordCapacity(key).nativeBytes, own = copyRemainingRecordPlain(input, cap), research = researchForRemainingKey(key), partner = partnerForRemainingKey(key);
  if (research) researchValue(own, research);
  else if (partner) partnerValue(own, key);
  else otherValue(key, own);
  const pretty = JSON.stringify(own, null, 2), reserve = partner ? Math.max(0, 24 - own.updated.length) : 0;
  if (encoder.encode(pretty).byteLength + reserve > cap)
    throw new RRDataError(
      "Complete native backup exceeds its byte limit",
      "$",
      "input_limit"
    );
  return own;
}

// src/lib/client/remaining-record-recovery-formats.ts
var REMAINING_RECORD_LIMITS = Object.freeze({
  rawArchiveBytes: 128e6,
  formArchiveBytes: 1e6,
  jsonDepth: 32,
  fileReadTimeoutMs: 3e4,
  autosaveDelayMs: 250,
  pendingFullReplacements: 1
});
var encoder2 = new TextEncoder();
function invalid(message, path = "$") {
  return rrFail(message, path);
}
function freezeOwned2(value) {
  if (value && typeof value === "object") {
    for (const k of Object.keys(value)) freezeOwned2(value[k]);
    Object.freeze(value);
  }
  return value;
}
function boundText(text3, maxBytes) {
  if (text3.length > maxBytes || encoder2.encode(text3).byteLength > maxBytes)
    throw new RRDataError(
      "File exceeds its complete byte limit",
      "$",
      "input_limit"
    );
}
var typedPrototype = Object.getPrototypeOf(Uint8Array.prototype);
var nativeBuffer = Object.getOwnPropertyDescriptor(
  typedPrototype,
  "buffer"
).get;
var nativeLength = Object.getOwnPropertyDescriptor(
  typedPrototype,
  "byteLength"
).get;
var nativeArrayBufferLength = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength"
).get;
var nativeResizable = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "resizable"
)?.get;
function inputText(raw, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > REMAINING_RECORD_LIMITS.rawArchiveBytes)
    invalid("Invalid file bound");
  if (typeof raw === "string") {
    boundText(raw, maxBytes);
    const owned2 = encoder2.encode(raw);
    if (new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      owned2
    ) !== raw)
      invalid("Raw input string cannot be represented exactly as UTF-8");
    return raw;
  }
  let length, backing;
  try {
    if (!ArrayBuffer.isView(raw))
      return invalid("Expected genuine Uint8Array bytes");
    backing = nativeBuffer.call(raw);
    length = nativeLength.call(raw);
    nativeArrayBufferLength.call(backing);
    if (nativeResizable?.call(backing))
      invalid("Resizable byte storage is unsupported");
  } catch {
    return invalid("Expected stable plain Uint8Array bytes");
  }
  if (Object.getPrototypeOf(raw) !== Uint8Array.prototype || Object.getPrototypeOf(backing) !== ArrayBuffer.prototype)
    invalid("Expected plain Uint8Array bytes");
  if (length > maxBytes)
    throw new RRDataError(
      "File exceeds its complete byte limit",
      "$",
      "input_limit"
    );
  const owned = new Uint8Array(length);
  try {
    Uint8Array.prototype.set.call(owned, raw);
  } catch {
    return invalid("Detached byte storage is unsupported");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      owned
    );
  } catch {
    return invalid("File is not valid UTF-8");
  }
}
function strictRemainingRecordJson(raw, maxBytes) {
  const source = inputText(raw, maxBytes);
  let at = 0;
  function ws() {
    while (at < source.length && (source[at] === " " || source[at] === "\n" || source[at] === "\r" || source[at] === "	"))
      at++;
  }
  function str() {
    const start = at++;
    while (at < source.length) {
      const c = source.charCodeAt(at++);
      if (c === 34) {
        try {
          return JSON.parse(source.slice(start, at));
        } catch {
          return invalid("Invalid JSON string");
        }
      }
      if (c < 32) invalid("Unescaped JSON control character");
      if (c === 92) {
        if (at >= source.length) invalid("Unterminated JSON escape");
        const escaped = source[at++];
        if (escaped === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(source.slice(at, at + 4)))
            invalid("Invalid Unicode escape");
          at += 4;
        } else if (!['"', "\\", "/", "b", "f", "n", "r", "t"].includes(escaped))
          invalid("Invalid JSON escape");
      }
    }
    return invalid("Unterminated JSON string");
  }
  function value(depth) {
    if (depth > REMAINING_RECORD_LIMITS.jsonDepth)
      throw new RRDataError(
        "Remaining-record JSON exceeds depth 32",
        "$",
        "input_limit"
      );
    ws();
    const c = source[at];
    if (c === '"') return str();
    if (c === "{") {
      at++;
      ws();
      const out = {};
      const names = /* @__PURE__ */ new Set();
      if (source[at] === "}") {
        at++;
        return out;
      }
      for (; ; ) {
        ws();
        if (source[at] !== '"') invalid("Expected JSON object name");
        const name = str();
        if (names.has(name)) invalid("Duplicate JSON object name");
        names.add(name);
        ws();
        if (source[at++] !== ":") invalid("Expected JSON colon");
        Object.defineProperty(out, name, {
          value: value(depth + 1),
          enumerable: true,
          configurable: true,
          writable: true
        });
        ws();
        const end = source[at++];
        if (end === "}") return out;
        if (end !== ",") invalid("Expected JSON comma");
      }
    }
    if (c === "[") {
      at++;
      ws();
      const out = [];
      if (source[at] === "]") {
        at++;
        return out;
      }
      for (; ; ) {
        out.push(value(depth + 1));
        ws();
        const end = source[at++];
        if (end === "]") return out;
        if (end !== ",") invalid("Expected JSON comma");
      }
    }
    for (const [literal, decoded2] of [
      ["null", null],
      ["true", true],
      ["false", false]
    ]) {
      if (source.startsWith(literal, at)) {
        at += literal.length;
        return decoded2;
      }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      source.slice(at)
    );
    if (!number) return invalid("Invalid JSON value");
    at += number[0].length;
    const decoded = Number(number[0]);
    if (!Number.isFinite(decoded)) invalid("Nonfinite JSON number");
    return decoded;
  }
  const result = value(0);
  ws();
  if (at !== source.length) invalid("Trailing JSON content");
  return freezeOwned2(result);
}
function remainingRecordBackup(key, native) {
  const own = validateRemainingRecordValue(key, native), out = JSON.stringify(own, null, 2);
  boundText(out, remainingRecordCapacity(key).nativeBytes);
  return out;
}
function parseRemainingRecordBackup(raw, key) {
  requireRemainingRecordKey(key);
  const parsed = strictRemainingRecordJson(
    raw,
    remainingRecordCapacity(key).nativeBytes
  );
  return validateRemainingRecordValue(key, parsed);
}

// services/charity-os/node_modules/@noble/hashes/_u64.js
var fromNumH = (n) => n / 2 ** 32 | 0;
var fromNumL = (n) => n >>> 0;
function setU64FromNum(view, byteOffset, n, isLE) {
  const h = fromNumH(n);
  const l = fromNumL(n);
  view.setUint32(byteOffset, isLE ? l : h, isLE);
  view.setUint32(byteOffset + 4, isLE ? h : l, isLE);
}

// services/charity-os/node_modules/@noble/hashes/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
var atitle = (title) => title ? `"${title}" ` : "";
function anumber(n, title = "") {
  if (typeof n !== "number")
    throw new TypeError(atitle(title) + "expected number, got " + typeof n);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError(atitle(title) + "expected integer >= 0, got " + n);
  return n;
}
function abytes(value, length, title = "") {
  if (isBytes(value) && (length === void 0 || value.length === length))
    return value;
  if (length !== void 0)
    anumber(length, "length");
  const bytes = isBytes(value);
  const ofLen = length !== void 0 ? ` of length ${length}` : "";
  const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
  const message = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got;
  if (!bytes)
    throw new TypeError(message);
  throw new RangeError(message);
}
var aobject = (value, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError((label === "object" ? "" : `"${label}" `) + "expected object, got type=" + typeof value);
};
var aopts = (value, label) => {
  aobject(value, label);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null)
    throw new TypeError(`"${label}" expected plain object`);
  if (Object.hasOwn(value, "__proto__"))
    throw new TypeError(`"${label}.__proto__" is not allowed`);
};
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("hash was destroyed");
  if (checkFinished && instance.finished)
    throw new Error("digest() was already called");
}
function aoutput(out, instance) {
  abytes(out, void 0, "output");
  const min = instance.outputLen;
  if (!(out.length >= min)) {
    throw new RangeError('"output" expected length >= ' + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
var hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
function checkOpts(defaults, opts, title = "opts") {
  aopts(defaults, "defaults");
  if (opts !== void 0)
    aopts(opts, title);
  const merged = Object.assign(/* @__PURE__ */ Object.create(null), defaults, opts);
  return merged;
}
function createHasher(hashCons, info = {}) {
  if (typeof hashCons !== "function")
    throw new TypeError('"hashCons" expected function, got type=' + typeof hashCons);
  info = checkOpts({}, info, "info");
  const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
  const tmp = hashCons(void 0);
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.canXOF = tmp.canXOF;
  hashC.create = (opts) => hashCons(opts);
  Object.assign(hashC, info);
  return Object.freeze(hashC);
}
var oidNist = (suffix) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
});

// services/charity-os/node_modules/@noble/hashes/_md.js
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class {
  blockLen;
  outputLen;
  canXOF = false;
  padOffset;
  isLE;
  // For partial updates less than block size
  buffer;
  view;
  finished = false;
  length = 0;
  pos = 0;
  destroyed = false;
  constructor(blockLen, outputLen, padOffset, isLE) {
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    let processed = false;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        processed = true;
        continue;
      }
      buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
        processed = true;
      }
    }
    this.length += data.length;
    if (processed)
      this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    buffer.fill(0, pos);
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      buffer.fill(0);
    }
    setU64FromNum(view, blockLen - 8, this.length * 8, isLE);
    this.process(view, 0);
    this.roundClean();
    const oview = out === buffer ? view : createView(out);
    const len = this.outputLen;
    const outLen = len / 4;
    const state = this.get();
    if (len % 4 || outLen > state.length)
      throw new Error("invalid outputLen");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneIntoMeta(to) {
    const { buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (pos)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);

// services/charity-os/node_modules/@noble/hashes/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA2_32B = class extends HashMD {
  // We cannot use array here since array allows indexing by variable
  // which means optimizer/compiler cannot use registers.
  // Numeric initializers matter: starting the fields as `undefined` changes
  // V8's field representation and makes sha256 3x slower (measured).
  A = 0;
  B = 0;
  C = 0;
  D = 0;
  E = 0;
  F = 0;
  G = 0;
  H = 0;
  constructor(outputLen, IV) {
    super(64, outputLen, 8, false);
    this.A = IV[0] | 0;
    this.B = IV[1] | 0;
    this.C = IV[2] | 0;
    this.D = IV[3] | 0;
    this.E = IV[4] | 0;
    this.F = IV[5] | 0;
    this.G = IV[6] | 0;
    this.H = IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  _cloneInto(to) {
    (to ||= new this.constructor()).set(...this.get());
    return this._cloneIntoMeta(to);
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.destroyed = true;
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var _SHA256 = class extends SHA2_32B {
  constructor() {
    super(32, SHA256_IV);
  }
};
var sha256 = /* @__PURE__ */ createHasher(
  () => new _SHA256(),
  /* @__PURE__ */ oidNist(1)
);

// services/charity-os/lib/learning-transport.mjs
var LearningError = class extends Error {
  constructor(code, message, field = "", status = 422) {
    super(message);
    this.name = "LearningError";
    this.status = status;
    this.code = code;
    if (field) this.issues = [{ field, message }];
  }
};
var learningFail = (code, message = "Use the documented learning fields.", field = "", status = 422) => {
  throw new LearningError(code, message, field, status);
};
var reserved = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
function learningRepresentable(s) {
  if (s.includes("\0")) return false;
  for (let i = 0; i < s.length; i++) {
    const n = s.charCodeAt(i);
    if (n >= 55296 && n <= 56319) {
      const next = s.charCodeAt(++i);
      if (!(next >= 56320 && next <= 57343)) return false;
    } else if (n >= 56320 && n <= 57343) return false;
  }
  return true;
}
function learningCanonical(value, { nativeStrings = false, maxBytes = 64 * 1024 * 1024 } = {}) {
  const seen = /* @__PURE__ */ new Set();
  let nodes = 0;
  const walk = (v, depth) => {
    if (++nodes > maxBytes || depth > 32)
      learningFail(
        "learning_limit",
        "Learning JSON exceeds its depth or work bound."
      );
    if (v === null || typeof v === "boolean") return JSON.stringify(v);
    if (typeof v === "string") {
      if (!nativeStrings && !learningRepresentable(v))
        learningFail(
          "learning_text_unsupported",
          "This text is unsupported by the hosted bridge."
        );
      return JSON.stringify(v);
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v))
        learningFail("learning_json", "Use finite JSON numbers.");
      return JSON.stringify(v);
    }
    if (!v || typeof v !== "object" || seen.has(v) || Object.getOwnPropertySymbols(v).length)
      learningFail("learning_json", "Use bounded acyclic plain JSON.");
    seen.add(v);
    let out;
    if (Array.isArray(v)) {
      if (Object.getPrototypeOf(v) !== Array.prototype || Object.getOwnPropertyNames(v).length !== v.length + 1 || Object.keys(v).length !== v.length)
        learningFail(
          "learning_json",
          "Sparse or decorated arrays are unsupported."
        );
      const cells = [];
      for (let i = 0; i < v.length; i++) {
        const d = Object.getOwnPropertyDescriptor(v, String(i));
        if (!d || !Object.hasOwn(d, "value"))
          learningFail("learning_json", "Accessors are unsupported.");
        cells.push(walk(d.value, depth + 1));
      }
      out = "[" + cells.join(",") + "]";
    } else {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Object.getOwnPropertyNames(v).length !== Object.keys(v).length)
        learningFail("learning_json", "Use plain enumerable objects.");
      out = "{" + Object.keys(v).sort().map((k) => {
        if (reserved.has(k) || !nativeStrings && !learningRepresentable(k))
          learningFail("learning_key", "Unsupported object key.");
        const d = Object.getOwnPropertyDescriptor(v, k);
        if (!d || !Object.hasOwn(d, "value"))
          learningFail("learning_json", "Accessors are unsupported.");
        return JSON.stringify(k) + ":" + walk(d.value, depth + 1);
      }).join(",") + "}";
    }
    seen.delete(v);
    return out;
  };
  const result = walk(value, 1);
  if (new TextEncoder().encode(result).length > maxBytes)
    learningFail(
      "learning_limit",
      "Complete learning JSON exceeds its byte bound."
    );
  return result;
}
function learningFreeze(v) {
  if (v && typeof v === "object") {
    for (const x of Object.values(v)) learningFreeze(x);
    Object.freeze(v);
  }
  return v;
}
function learningOwned(value, { bytes = 64 * 1024 * 1024, nativeStrings = false } = {}) {
  return learningFreeze(
    JSON.parse(learningCanonical(value, { nativeStrings, maxBytes: bytes }))
  );
}
function learningBytes(raw, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 64 * 1024 * 1024)
    learningFail("learning_limit", "Invalid learning byte limit.");
  if (!(raw instanceof Uint8Array) || Object.getPrototypeOf(raw) !== Uint8Array.prototype && !(typeof Buffer !== "undefined" && Buffer.isBuffer(raw)))
    learningFail("learning_bytes", "Choose actual UTF-8 bytes.");
  let n;
  try {
    n = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(Uint8Array.prototype),
      "byteLength"
    ).get.call(raw);
  } catch {
    learningFail("learning_bytes", "File bytes are unavailable.");
  }
  if (n > maxBytes)
    learningFail("learning_limit", "The complete file exceeds its byte bound.");
  const b = new Uint8Array(n);
  Uint8Array.prototype.set.call(b, raw);
  return b;
}
function parseLearningTransport(raw, maxBytes, { nativeStrings = false } = {}) {
  const bytes = typeof raw === "string" ? new TextEncoder().encode(raw) : learningBytes(raw, maxBytes);
  if (bytes.length > maxBytes)
    learningFail("learning_limit", "The complete file exceeds its byte bound.");
  let s;
  try {
    s = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes
    );
  } catch {
    learningFail("learning_utf8", "Choose valid UTF-8 JSON.");
  }
  if (s.charCodeAt(0) === 65279)
    learningFail("learning_json", "A UTF-8 BOM is unsupported.");
  if (typeof raw === "string" && s !== raw)
    learningFail("learning_utf8", "Raw JSON text cannot be encoded exactly.");
  let at = 0, nodes = 0;
  const ws = () => {
    while (/[ \n\r\t]/.test(s[at] ?? "x")) at++;
  };
  const bad = () => learningFail("learning_json", "Choose one complete strict JSON value.");
  const str = () => {
    const start = at++;
    while (at < s.length) {
      const c = s.charCodeAt(at++);
      if (c === 34) {
        try {
          return JSON.parse(s.slice(start, at));
        } catch {
          bad();
        }
      }
      if (c < 32) bad();
      if (c === 92) {
        const e = s[at++];
        if (e === "u") {
          if (!/^[a-fA-F0-9]{4}$/.test(s.slice(at, at + 4))) bad();
          at += 4;
        } else if (!['"', "\\", "/", "b", "f", "n", "r", "t"].includes(e))
          bad();
      }
    }
    bad();
  };
  const val = (depth) => {
    if (++nodes > 2e5 || depth > 32)
      learningFail(
        "learning_limit",
        "Learning JSON exceeds its depth or work bound."
      );
    ws();
    const c = s[at];
    if (c === '"') return str();
    if (c === "{") {
      at++;
      ws();
      const out = {};
      const names = /* @__PURE__ */ new Set();
      if (s[at] === "}") {
        at++;
        return out;
      }
      for (; ; ) {
        ws();
        if (s[at] !== '"') bad();
        const k = str();
        if (names.has(k) || reserved.has(k))
          learningFail(
            "learning_json",
            "Duplicate or unsafe JSON object name."
          );
        names.add(k);
        ws();
        if (s[at++] !== ":") bad();
        Object.defineProperty(out, k, {
          value: val(depth + 1),
          writable: true,
          enumerable: true,
          configurable: true
        });
        ws();
        const end = s[at++];
        if (end === "}") return out;
        if (end !== ",") bad();
      }
    }
    if (c === "[") {
      at++;
      ws();
      const out = [];
      if (s[at] === "]") {
        at++;
        return out;
      }
      for (; ; ) {
        out.push(val(depth + 1));
        ws();
        const end = s[at++];
        if (end === "]") return out;
        if (end !== ",") bad();
      }
    }
    for (const [l, v2] of [
      ["null", null],
      ["true", true],
      ["false", false]
    ])
      if (s.startsWith(l, at)) {
        at += l.length;
        return v2;
      }
    const m = s.slice(at).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!m) bad();
    at += m[0].length;
    const num2 = Number(m[0]);
    if (!Number.isFinite(num2)) bad();
    return num2;
  };
  const v = val(1);
  ws();
  if (at !== s.length) bad();
  return learningOwned(v, { bytes: maxBytes, nativeStrings });
}

// services/charity-os/lib/learning-native-entry.ts
var KEY = "charitology.partner-workspace-v1.nonprofit-advisory";
function complete(bytes, adapter) {
  if (!["theory-of-change-native-v1", "nonprofit-learning-native-v1"].includes(
    adapter
  ))
    learningFail("learning_adapter", "Choose a supported native source.");
  const limit = adapter === "theory-of-change-native-v1" ? 1e6 : 8e6;
  const owned = learningBytes(bytes, limit);
  const parsed = parseLearningTransport(owned, limit, {
    nativeStrings: true
  });
  if (adapter === "theory-of-change-native-v1") {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).sort().join(",") !== "draft,exportedAt,format,version" || parsed.format !== "charitology-theory-of-change" || parsed.version !== 1 || typeof parsed.exportedAt !== "string" || parsed.exportedAt.length > 100 || !Number.isFinite(Date.parse(parsed.exportedAt)))
      learningFail(
        "learning_native",
        "Choose the native single-draft ToC export."
      );
    validateD1Value("impact-drafts", {
      v: 1,
      current: parsed.draft?.id,
      drafts: [parsed.draft]
    });
  } else parseRemainingRecordBackup(owned, KEY);
  return parsed;
}
function listLearningNativeSelections(bytes, { adapter }) {
  const v = complete(bytes, adapter);
  return learningFreeze(
    adapter === "theory-of-change-native-v1" ? [{ selection: { kind: "whole-draft" }, title: v.draft.name }] : v.records.learning.map((row) => ({
      selection: { kind: "learning-row", recordId: row.id },
      title: row.values.title
    }))
  );
}
function validateLearningSelectedNative(adapter, selection, selected) {
  if (adapter === "theory-of-change-native-v1") {
    if (!selection || Object.keys(selection).join(",") !== "kind" || selection.kind !== "whole-draft" || selected?.kind !== "theory-of-change" || Object.keys(selected).sort().join(",") !== "kind,value")
      learningFail(
        "learning_selection",
        "Choose the complete native ToC draft."
      );
    const b = new TextEncoder().encode(JSON.stringify(selected.value));
    complete(b, adapter);
    return selected.value.draft.id;
  }
  if (adapter !== "nonprofit-learning-native-v1" || !selection || Object.keys(selection).sort().join(",") !== "kind,recordId" || selection.kind !== "learning-row" || selected?.kind !== "nonprofit-learning" || Object.keys(selected).sort().join(",") !== "kind,value")
    learningFail(
      "learning_selection",
      "Choose one native nonprofit learning row."
    );
  const v = selected.value;
  if (!v || Object.keys(v).sort().join(",") !== "context,learning,program,updated,version" || v.learning?.id !== selection.recordId)
    learningFail(
      "learning_selection",
      "The selected learning identity differs."
    );
  const native = {
    version: v.version,
    program: v.program,
    updated: v.updated,
    context: v.context,
    records: {
      diagnostics: [],
      evidence: [],
      actions: [],
      learning: [v.learning],
      readiness: []
    }
  };
  parseRemainingRecordBackup(remainingRecordBackup(KEY, native), KEY);
  return v.learning.id;
}
function representable(v, path = "selected") {
  if (typeof v === "string" && !learningRepresentable(v))
    learningFail(
      "learning_native_text_unsupported",
      "Valid native source; selected text is unsupported by this hosted bridge. The original file was not changed. Keep the original file and its native recovery; to continue here, edit an explicit copy in the original tool and export it again.",
      path
    );
  if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) representable(x, path + "." + k);
}
function inspectLearningNativeValue(bytes, { adapter, selection }) {
  const owned = learningBytes(
    bytes,
    adapter === "theory-of-change-native-v1" ? 1e6 : 8e6
  ), v = complete(owned, adapter);
  let selected;
  if (adapter === "theory-of-change-native-v1")
    selected = { kind: "theory-of-change", value: v };
  else {
    const row = v.records.learning.find(
      (r) => r.id === selection?.recordId
    );
    if (!row)
      learningFail(
        "learning_selection",
        "Choose an existing native learning row."
      );
    selected = {
      kind: "nonprofit-learning",
      value: {
        version: v.version,
        program: v.program,
        updated: v.updated,
        context: v.context,
        learning: row
      }
    };
  }
  const nativeIdentity = validateLearningSelectedNative(
    adapter,
    selection,
    selected
  );
  representable({ selection, selected, nativeIdentity });
  return learningOwned(
    {
      adapter,
      nativeIdentity,
      selection,
      selected,
      originalBytes: owned.length,
      originalSha256: bytesToHex(sha256(owned))
    },
    { bytes: 1056768 }
  );
}
export {
  inspectLearningNativeValue,
  listLearningNativeSelections,
  validateLearningSelectedNative
};
