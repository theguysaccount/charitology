// Original editorial teaching draft. Content and data: CC BY 4.0.
// This standalone module performs no I/O and leaves the ten-unit course unchanged.
export const kitVersion = '0.1';

export const learningOutcomes = [
  "Map a fictional project from resources to work and distinguish an output, a measured outcome and an impact claim.",
  "Calculate simple cash-cost ratios and rates, then explain how alternative counterfactual assumptions change the interpretation.",
  "State a fair moral disagreement and propose a feedback or revision step without ranking people, causes or charities by depth."
];

export const glossary = [
  {
    "term": "Input",
    "definition": "A resource used, such as cash or staff time."
  },
  {
    "term": "Activity",
    "definition": "Something the project does, such as running a workshop."
  },
  {
    "term": "Output",
    "definition": "A count of delivered work, such as workshops held or people attending."
  },
  {
    "term": "Outcome",
    "definition": "A change in a specified condition or ability. A check result is closer to the activity than an outcome such as being able to make a real journey."
  },
  {
    "term": "Counterfactual",
    "definition": "What would have happened to the same people, over the same period, without the program or decision being considered. It is not directly observed for those people."
  },
  {
    "term": "Impact claim",
    "definition": "A claim about the difference made compared with that counterfactual. An observed outcome alone does not establish it."
  },
  {
    "term": "Proxy",
    "definition": "A measured stand-in for something we care about. Passing a timetable check is not the same as successfully making a journey."
  },
  {
    "term": "Percentage point",
    "definition": "The difference between two percentages: 70% minus 40% is 30 percentage points."
  },
  {
    "term": "Moral lens",
    "definition": "A way of asking what matters and why. The project uses editorial sketches of welfare, rights, justice, care, faith and tradition, future generations, all life and flourishing. These are prompts, not complete accounts of every tradition."
  },
  {
    "term": "Depth",
    "definition": "A description of where an activity aims to act: relief, repair, prevention, structure or source. It is not a grade. A larger number does not mean better or more effective; every level may be needed."
  },
  {
    "term": "Six-source hypothesis",
    "definition": "Story, coordination, vision, attention, status and gatekeepers are proposed sources adopted from Humanity’s Checklist. Their explanatory and practical reach remains a hypothesis, not an established causal map."
  }
];

export const lessonCase = {
  "title": "The Riverbend journey-planning project",
  "intro": "All details are fictional. Riverbend is an invented town. A community project wants adults who choose to attend to find usable journey information. Its workshops aim to help people plan future journeys. It has not measured whether people reach appointments, find work or experience better wellbeing.",
  "records": [
    {
      "label": "Recorded cash spent",
      "value": "$600, including space, printed materials and facilitation"
    },
    {
      "label": "Workshops held",
      "value": "6"
    },
    {
      "label": "People at each workshop",
      "value": "5"
    },
    {
      "label": "Unique attendees",
      "value": "30; each attended exactly one workshop"
    },
    {
      "label": "People completing both checks",
      "value": "The same 30 attendees"
    },
    {
      "label": "Passed the check before the workshop",
      "value": "12 of 30"
    },
    {
      "label": "Passed the check one week afterward",
      "value": "21 of 30"
    }
  ],
  "limitations": [
    "Unpaid preparation time was not recorded. The $600 is recorded cash spending, not the full economic cost.",
    "There is no comparison group. A before/after change does not establish how much the workshops caused.",
    "The check uses a printed fictional timetable. Its accuracy as a measure of practical journey-planning ability has not been established.",
    "No actual journeys, employment or wellbeing outcomes were measured. Classroom numeracy is not measured charitable impact.",
    "Invitations were available only in small print. Organizers do not know who wanted to attend but could not access the invitation or session. The figures describe the participating group, not everyone in Riverbend.",
    "No personal journeys or private difficulties are needed for the exercise. A particular gift’s effect is not identified; other funders and other actors’ responses have not been modeled."
  ],
  "counterfactuals": [
    {
      "id": "a",
      "label": "Card A: an assumption, not evidence",
      "description": "Suppose 18 of these same 30 people would have passed the later check without the workshops, perhaps through other practice or information. This is an imagined alternative, not an observed comparison group. Calculate what follows only if the assumption were true."
    },
    {
      "id": "b",
      "label": "Card B: an assumption, not evidence",
      "description": "Suppose 21 of these same 30 people would have passed the later check without the workshops. This is another imagined alternative, not an observed comparison group. The case gives no basis for choosing A or B as correct."
    }
  ]
};

export const lessonAgenda = [
  {
    "minutes": 4,
    "activity": "Welcome and the right to pass. Introduce the fictional setting without asking for personal giving examples.",
    "output": "One question the lesson should help answer."
  },
  {
    "minutes": 5,
    "activity": "Teach givers → signals → channels → work → outcomes and the input, output and outcome definitions.",
    "output": "A blank five-stage map with the definitions labeled."
  },
  {
    "minutes": 5,
    "activity": "Read the case card aloud or quietly. Check “same 30 people” and “cash costs only.”",
    "output": "W1: case facts in the map; recorded and unmeasured items marked."
  },
  {
    "minutes": 10,
    "activity": "Calculate W2 and W3 in pairs or individually. Offer fractions, the worked table or a calculator.",
    "output": "Cash-cost ratios, pass rates and an explicitly labeled observed change."
  },
  {
    "minutes": 7,
    "activity": "Reveal counterfactual cards A and B. Ask whether they are new data or assumptions.",
    "output": "W4 and W5: conditional calculations and a repaired headline."
  },
  {
    "minutes": 7,
    "activity": "Introduce descriptive depth. Compare assigned welfare and rights/justice questions.",
    "output": "W6: one fair disagreement and a tentative activity description."
  },
  {
    "minutes": 7,
    "activity": "Ask who can change the work after hearing feedback.",
    "output": "W7: an accessible route to disagree, an owner role and a revision rule."
  },
  {
    "minutes": 5,
    "activity": "Use the exit prompt and share a worked limitation. Return worksheets to learners.",
    "output": "W8: an output, a measured outcome, an unresolved claim and a next evidence need."
  }
];

export const worksheet = [
  {
    "id": "W1",
    "title": "Draw the chain",
    "prompt": "Use the Riverbend case to complete givers → signals → channels → work → outcomes. Write “unknown” where the case does not tell you something.",
    "steps": [
      "Label $600 recorded cash spending as input, output, measured outcome or not measured.",
      "Label six workshops and 30 unique attendees.",
      "Label 21 attendees passing the later check.",
      "Label attendees making more successful real journeys."
    ]
  },
  {
    "id": "W2",
    "title": "Count the cash costs",
    "prompt": "Calculate the recorded cash costs. Keep the units visible.",
    "steps": [
      "$600 ÷ 6 workshops = ______ per workshop.",
      "$600 ÷ 30 unique attendees = ______ per attendee.",
      "Does either calculation include the unrecorded unpaid preparation time?"
    ]
  },
  {
    "id": "W3",
    "title": "Describe the observed change",
    "prompt": "Use the same 30 people for the before and later denominators.",
    "steps": [
      "12 ÷ 30 = ______% before; 21 ÷ 30 = ______% later.",
      "21 − 12 = ______ more people passing.",
      "The pass rate changed by ______ percentage points.",
      "Does this before/after change by itself show how much the workshops caused? Explain."
    ]
  },
  {
    "id": "W4",
    "title": "Make the assumptions visible",
    "prompt": "Treat both counterfactual cards as assumptions, not additional observations.",
    "steps": [
      "Card A assumes 18 later passes without workshops. Calculate 21 − 18 and $600 divided by that conditional additional number.",
      "Card B assumes 21 later passes without workshops. Calculate 21 − 21. Can a cost-per-additional-pass ratio be calculated with this denominator?",
      "Name one design or evidence need that could support a more credible comparison and one limitation it would still have."
    ]
  },
  {
    "id": "W5",
    "title": "Repair a headline",
    "prompt": "An invented report says: “Nine people benefited because of our workshops, proving that the project worked.” Rewrite it in two sentences. Keep the observed result and say what the records do not establish."
  },
  {
    "id": "W6",
    "title": "Describe the work and a disagreement",
    "prompt": "The workshops aim to prevent future missed journeys. Describe the intended mechanism and compare two assigned perspectives. You need not disclose your own beliefs.",
    "steps": [
      "Which depth description might fit that aim? Explain why it is not proof or a moral grade.",
      "Write a welfare question about additional practical benefit.",
      "Write a rights/justice question about access and decision authority.",
      "Propose one next step, explaining its evidence, values and limits. More than one recommendation can be well reasoned."
    ]
  },
  {
    "id": "W7",
    "title": "Close part of a feedback loop",
    "prompt": "Design a fictional route to disagree and a decision that could change. No private story is needed.",
    "steps": [
      "How could a participant disagree in an accessible way?",
      "Which role would read and respond?",
      "What decision could change?",
      "How would participants learn what changed or why no change was made?",
      "Write one rule for pausing or revising the next workshop before seeing its results."
    ]
  },
  {
    "id": "W8",
    "title": "Exit prompt",
    "prompt": "Write one output, one measured outcome and one sentence beginning “We still cannot conclude…”. Add the next piece of evidence or feedback you would seek."
  }
];

export const workedAnswers = [
  {
    "id": "A1",
    "title": "Chain and claim types",
    "paragraphs": [
      "Unknown giver → unknown signal → unknown funding channel → six workshops → later check results is a sound map. Missing stages are findings; do not invent a funder.",
      "$600 is an input. Six workshops and 30 unique attendees are outputs: 6 × 5 = 30, with no duplicate attendance here. Twenty-one later passes describe a measured proximal outcome on this check; the before/after change is nine more passes.",
      "More successful real journeys is not measured. The check is a proxy, not established evidence of practical travel, employment or wellbeing."
    ]
  },
  {
    "id": "A2",
    "title": "Cash costs",
    "paragraphs": [
      "$600 ÷ 6 = $100 per workshop. $600 ÷ 30 = $20 per unique attendee.",
      "These ratios describe recorded cash cost for delivered work. They are neither full economic costs nor impact estimates. Unpaid preparation time is missing."
    ]
  },
  {
    "id": "A3",
    "title": "Observed change",
    "paragraphs": [
      "12 ÷ 30 = 40% before. 21 ÷ 30 = 70% later. There are nine more people passing and an increase of 30 percentage points.",
      "A relative increase, if calculated, is (21 − 12) ÷ 12 = 75%. It is a different description of the same pattern, not a causal effect.",
      "The records contain no counterfactual comparison. Practice on the check, other information and selection into attendance are possible explanations to investigate, not established explanations in this fictional case."
    ]
  },
  {
    "id": "A4",
    "title": "Conditional counterfactual calculations",
    "paragraphs": [
      "Under card A, 21 − 18 = 3 conditional additional passes. $600 ÷ 3 = $200 in recorded cash cost per additional pass, if that counterfactual assumption were true.",
      "Under card B, 21 − 21 = 0. Division by zero is undefined, so there is no numerical cost-per-additional-pass ratio. This does not mean the project cost nothing or had no other benefit or harm.",
      "Both cards are imagined assumptions. Do not choose A because its answer looks useful. A suitable contemporaneous comparison or an ethically appropriate randomized design could help with a particular causal question.",
      "Any design still needs comparable conditions, credible follow-up and a measure of the ability of interest. Random assignment does not automatically validate the check or transfer a result to another setting. Learners are not asked to experiment on real people."
    ]
  },
  {
    "id": "A5",
    "title": "A defensible headline",
    "paragraphs": [
      "Among the same 30 fictional attendees, passes on a route-planning check rose from 12 to 21 one week after the workshops. Without a credible counterfactual comparison or a validated practical outcome, these records do not establish how much the workshops caused or whether real journeys improved.",
      "Do not call $600 ÷ 9, approximately $66.67, cost per causally additional outcome. Nine is the raw before/after increase, not an identified effect. Correct classroom arithmetic does not establish measured charitable impact."
    ]
  },
  {
    "id": "A6",
    "title": "Depth and moral disagreement",
    "paragraphs": [
      "Prevention, level 2, could describe the stated aim of avoiding future missed journeys. Repair could fit if an activity restored lost skills. Neither description establishes success. Immediate help could be relief, while changing an access rule could be structure. No source-level change is established here.",
      "A welfare question asks what additional practical improvement this might create compared with an alternative use of resources. A rights/justice question asks who cannot access the invitation and who can change that barrier.",
      "One defensible step is to improve invitation accessibility and let a fictional participant panel help revise the format. Another is to retain immediate help while planning a better comparison. Both remain open to challenge. The check result does not settle duties, fair access, care or decision authority.",
      "Represent lenses fairly without stereotyping a tradition or asking a learner to speak for it. A higher depth number earns no extra moral or assessment credit."
    ]
  },
  {
    "id": "A7",
    "title": "Feedback and a revision rule",
    "paragraphs": [
      "Offer optional anonymous comments or accessible written and spoken feedback without asking about personal journeys. A session-coordinator role reviews themes; an invented participant panel could choose between accessible invitation formats.",
      "Report the decision and reasons back through accessible channels. Consultation, responding and shared authority differ: a survey alone grants no decision power.",
      "Example predeclared rule: before another workshop, pause registration if invitations and materials remain available only in small print. Revise them with the panel, check the alternative formats and explain the change. This is a process safeguard, not a demonstrated impact threshold.",
      "In a longer seminar, specify a measure, comparison, review date and revision rule. Retain an unclear or unfavorable result instead of changing the measure to claim success. The invented table supplies no statistical certainty."
    ]
  },
  {
    "id": "A8",
    "title": "Exit response",
    "paragraphs": [
      "Output: six workshops. Measured outcome: 21 of 30 passed the later check. We still cannot conclude how much the workshops caused or whether real journeys improved. I would seek a credible comparison and feedback on who could not access the invitation.",
      "The exit prompt checks reasoning shown in this activity. It does not establish retained learning, later giving behavior or benefits to people served."
    ]
  }
];

export const seminarSessions = [
  {
    "number": 1,
    "title": "Map the system",
    "chapters": [
      1,
      2
    ],
    "exercise": "Map Riverbend through givers, signals, channels, work and outcomes. Mark unknown stages and a missing feedback link. Separate a proposed systems claim from a recorded fact.",
    "output": "An annotated causal map and a testable hypothesis."
  },
  {
    "number": 2,
    "title": "Describe where work acts",
    "chapters": [
      3
    ],
    "exercise": "Describe five fictional activities at different depths. Defend a boundary case and explain why several levels may be needed together. Treat the six-source framework as a hypothesis.",
    "output": "Activity-level descriptions, an uncertainty note and a challenge to one proposed causal link."
  },
  {
    "number": 3,
    "title": "Evidence and the missing comparison",
    "chapters": [
      4,
      5
    ],
    "exercise": "Use cards A and B. Explain what a fair comparison requires. Add a fictional alternative funder and trace how its response could change a gift’s effect. Explain why neglect alone does not establish a tractable opportunity.",
    "output": "A claim table separating recorded values, assumptions and unknowns, plus a proposed design and its limits."
  },
  {
    "number": 4,
    "title": "Compare without hiding values",
    "chapters": [
      6
    ],
    "exercise": "Consider workshops, immediate help and accessible information. Represent two moral lenses fairly. Identify an empirical question and a value disagreement; no single score is required.",
    "output": "Two defensible recommendations with assumptions and an unresolved disagreement."
  },
  {
    "number": 5,
    "title": "Time and durability",
    "chapters": [
      7
    ],
    "exercise": "Draw when a fictional benefit begins and might stop. Separate uncertainty about occurrence from the moral weight assigned to later benefits. Label any discount rate as an assumption and compare alternatives.",
    "output": "A timeline, an explicit timing assumption and a sensitivity note; no universal rate."
  },
  {
    "number": 6,
    "title": "Voice and decision authority",
    "chapters": [
      8
    ],
    "exercise": "Design who can disagree, who responds, what can change and how a response returns. Compare consultation with shared authority. Use no real personal data.",
    "output": "A decision-rights diagram and an accessible feedback plan."
  },
  {
    "number": 7,
    "title": "Failure, forecasts and revision",
    "chapters": [
      9
    ],
    "exercise": "Write a measure, comparison, review date and revision rule before opening an invented results card. Report an inconclusive result or possible harm. Explain why one forecast score cannot establish calibration.",
    "output": "A prereview rule and a short report retaining uncertainty and an unfavorable result."
  },
  {
    "number": 8,
    "title": "Practice and peer challenge",
    "chapters": [
      10
    ],
    "exercise": "Present a fictional decision brief using the checklist. A peer identifies the weakest link, an alternative explanation and a missing voice. Revise and record what changed.",
    "output": "A capstone, peer questions and a revision note; no donation or public publication."
  }
];

export const rubric = [
  {
    "criterion": "Causal clarity",
    "levels": [
      "0: No usable chain.",
      "1: Some stages, but output and outcome are confused.",
      "2: Distinguishes stages, output and outcome.",
      "3: Also identifies a weak link and a plausible alternative explanation."
    ]
  },
  {
    "criterion": "Quantitative care",
    "levels": [
      "0: No interpretable calculation.",
      "1: A calculation or its units are unclear.",
      "2: Arithmetic, units and denominators are correct.",
      "3: Also distinguishes cash and full costs, proxy limits and a zero denominator."
    ]
  },
  {
    "criterion": "Evidence and counterfactuals",
    "levels": [
      "0: Treats a result as proof.",
      "1: Notices uncertainty but leaves the comparison implicit.",
      "2: Separates observations, assumptions and unknowns.",
      "3: Also explains a credible comparison and its remaining limits."
    ]
  },
  {
    "criterion": "Moral reasoning and voice",
    "levels": [
      "0: Gives a verdict without reasons.",
      "1: Names a lens or stakeholder without explaining it.",
      "2: Fairly represents two lenses and a missing voice.",
      "3: Also identifies unresolved disagreement and explicit decision authority."
    ]
  },
  {
    "criterion": "Learning and revision",
    "levels": [
      "0: No follow-up.",
      "1: A vague intention to learn.",
      "2: Defines a review and revision step.",
      "3: Also retains unfavorable or inconclusive results and documents a response to criticism."
    ]
  }
];

export const beginnerMeetings = [
  {
    "number": 1,
    "title": "Follow the chain",
    "timing": "5 welcome; 10 case reading; 15 map; 15 sort claim cards; 5 exit",
    "minutes": [
      5,
      10,
      15,
      15,
      5
    ],
    "activity": "Build the five-stage map. Sort cash, workshops, check results and unmeasured claims. “Unknown” is a useful answer.",
    "output": "A map with one missing link."
  },
  {
    "number": 2,
    "title": "Check the comparison",
    "timing": "5 revisit; 10 fractions and costs; 15 counterfactual cards; 15 headline repair; 5 exit",
    "minutes": [
      5,
      10,
      15,
      15,
      5
    ],
    "activity": "Calculate output costs and observed change, then compare cards A and B. Use fractions or the worked table if percentages are a barrier.",
    "output": "A corrected headline and a question about evidence."
  },
  {
    "number": 3,
    "title": "Ask who decides",
    "timing": "5 setup; 10 depth descriptions; 15 assigned moral roles; 15 feedback design; 5 exit",
    "minutes": [
      5,
      10,
      15,
      15,
      5
    ],
    "activity": "Describe depth without grades. Compare welfare and rights/justice questions. Design an accessible route to disagree.",
    "output": "A decision-rights and feedback diagram."
  },
  {
    "number": 4,
    "title": "Revise and hand over",
    "timing": "5 revisit; 15 fictional proposal; 15 peer questions; 10 revision and handover; 5 exit",
    "minutes": [
      5,
      15,
      15,
      10,
      5
    ],
    "activity": "Use the brief template, hear a challenge and change one part. Retain an unresolved question instead of inventing certainty.",
    "output": "A one-page proposal and a handover card for the next organizer."
  }
];

export const depthExamples = [
  {
    "level": 0,
    "name": "Relief",
    "question": "Does it meet a need now?",
    "example": "Help someone plan a journey they must make today."
  },
  {
    "level": 1,
    "name": "Repair",
    "question": "Does it restore something lost?",
    "example": "Help restore route-planning skills after a disruption."
  },
  {
    "level": 2,
    "name": "Prevention",
    "question": "Does it aim to stop a future harm for these people?",
    "example": "Teach route planning to try to prevent future missed journeys."
  },
  {
    "level": 3,
    "name": "Structure",
    "question": "Does it change a rule or institution producing a barrier?",
    "example": "Change a transport authority’s timetable-access policy."
  },
  {
    "level": 4,
    "name": "Source",
    "question": "Does it address something feeding several kinds of problem?",
    "example": "Try to change whose knowledge institutions respect across transport, education and public services. That proposed connection needs evidence."
  }
];

export const clubRoles = [
  {
    "role": "Facilitator",
    "detail": "Explain the fictional case and invite disagreement without demanding personal disclosure."
  },
  {
    "role": "Access coordinator",
    "detail": "Check formats, room arrangements and participation alternatives. Record arrangements, not private medical details."
  },
  {
    "role": "Timekeeper",
    "detail": "Protect breaks and the planned ending."
  },
  {
    "role": "Notes and handover",
    "detail": "Record material versions, decisions and open questions without attributing private comments or keeping a learner roster."
  }
];

export const clubHandover = [
  "Purpose and next meeting.",
  "Material title, version and location.",
  "Roles to arrange next time.",
  "Access arrangements to keep, without private diagnoses or personal stories.",
  "Decisions made and their reasons.",
  "Open questions and known errors.",
  "Next owner role and review date.",
  "Commitments or costs already agreed; default: none.",
  "Institutional process still needed.",
  "Hand over agreed organizational information only: no contact lists, private learner notes, personal stories or account credentials. Include the worked answers and the untested-draft notice."
];

export const clubInvitation = `Proposed invitation — edit before use

Join a beginner discussion of charity as a system at [locally approved place] on [date and time]. We will use an invented case to ask what changed, what might have happened anyway and whose voice can change a decision. No prior knowledge, donation, account or personal story is required. Paper materials and quiet participation are available; arrange access adjustments through [locally approved route without public disclosure].

This is a proposed local activity using untested draft materials. Participation follows [institution’s eligibility and supervision rules]. It does not register a chapter or establish Charitology or institutional recognition. Contact [organizer role through the locally approved route] with questions. Do not put private contact details in a public copy of this template.`;

export const clubConstitution = [
  {title: 'Purpose and draft status', text: 'Proposed purpose: study the system of charity through fictional cases, fair moral disagreement and careful reasoning. This editable template is not an official registration or constitution approved by Charitology or an institution.'},
  {title: 'Locally eligible membership', text: 'Participation is open to people eligible under [institution’s locally applicable rules]. An educator or organizer must set appropriate supervision and access arrangements. No donation, account, public profile, belief statement or personal giving disclosure is a condition of these activities.'},
  {title: 'Rotating roles', text: 'Rotate or combine facilitator, access coordinator, timekeeper and notes/handover roles by agreement. Record roles rather than private learner details. Agree who can make arrangements and what needs institutional approval.'},
  {title: 'Meetings and decisions', text: 'Proposed default: announce the next agenda and accessible materials in advance; seek agreement after hearing objections. If agreement is unavailable, record the disagreement and postpone commitments. Confirm [local decision and quorum rules] before adopting them. Nobody is required to state a personal moral or religious view.'},
  {title: 'Access and discussion', text: 'Offer paper, spoken, written and quiet participation. Participants may pass or use assigned perspectives. Describe mechanisms without judging motives. Do not rank named charities. Request access arrangements through an appropriate private route without recording diagnoses.'},
  {title: 'Funds and authority', text: 'Default: no funds are raised, held or directed in Charitology’s name. Do not make financial commitments, speak for Charitology or imply an institutional partnership. Any different local activity needs its own authorized process and is outside this starter template.'},
  {title: 'Affiliation and recognition', text: 'Using the kit does not register a chapter or establish affiliation, accreditation, credit or recognition. A proposed club or name remains subject to the institution’s local approval process and any separately required permission.'},
  {title: 'Handover and privacy', text: 'Hand over the material version, decisions, reasons, access arrangements, open questions and next owner role. Keep no learner roster for this activity and transfer no private notes, contact lists, personal stories or credentials. Review this draft with the next organizer before use.'}
];

const chapters = [
  ['What charitology is', '01-what-charitology-is'],
  ['The charity system', '02-the-charity-system'],
  ['Depth: from relief to source', '03-depth-from-relief-to-source'],
  ['Evidence and its grades', '04-evidence-and-its-grades'],
  ['Counterfactuals and neglect', '05-counterfactuals-and-neglect'],
  ['Comparing the incomparable', '06-comparing-the-incomparable'],
  ['Time', '07-time'],
  ['Feedback and voice', '08-feedback-and-voice'],
  ['Failure and learning', '09-failure-and-learning'],
  ['Becoming a charitologist', '10-becoming-a-charitologist']
];

const status = `Version ${kitVersion} · review: draft · untested editorial teaching proposal

These original, AI-assisted materials are for educator review and adaptation. The activities, timings and rubric have not been tested with learners. They supply no accreditation, academic credit, recognition or evidence of teaching effectiveness. Correct classroom arithmetic is not measured charitable impact.

Use paper and fictional examples. No donation, payment, account, public post or personal story is required. Do not ask learners to disclose finances, giving history, beliefs or experiences of receiving help. This pack does not rank named charities or judge people’s motives. It does not change the existing ten-unit course, stored progress or completion criteria.`;

const attribution = `## Attribution and reuse

Credit: [Charitology (charitology.org)](https://charitology.org/). Original editorial content and authored data are [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). You may share and adapt them with attribution and a note of changes. Cited sources retain their own rights.

Teaching hub: https://charitology.org/learn/
Existing ten-unit course: https://charitology.org/programs/principles-course/
Textbook: https://charitology.org/record/principles/

The chapter links are reading routes. This pack does not claim an independent review of every chapter’s external citations. Educators should read the selected chapter and check cited originals before teaching its empirical examples.`;

const bullets = values => values.map(value => `- ${value}`).join('\n');
const tableCell = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const table = (headings, rows) => [
  `| ${headings.map(tableCell).join(' | ')} |`,
  `| ${headings.map(() => '---').join(' | ')} |`,
  ...rows.map(row => `| ${row.map(tableCell).join(' | ')} |`)
].join('\n');
const material = (id, title, content) => ({id, title, body: `# ${title}\n\n${status}\n\n${content}\n\n${attribution}\n`});

const caseMarkdown = `## Fictional case: ${lessonCase.title}

${lessonCase.intro}

${table(['Recorded item', 'Fictional record'], lessonCase.records.map(row => [row.label, row.value]))}

### Limits of the fictional record

${bullets(lessonCase.limitations)}

${lessonCase.counterfactuals.map(card => `### ${card.label}\n\n${card.description}`).join('\n\n')}

Neither card establishes what a donor’s gift caused. Do not choose an assumption because its answer looks useful.`;

const glossaryMarkdown = `## Working definitions

${glossary.map(item => `- **${item.term}:** ${item.definition}`).join('\n')}`;

const depthMarkdown = `## Depth describes; it does not grade

Apply a description to an activity and explain its proposed causal chain. A larger number does not mean better, more effective or more deserving. Every level may be needed. All examples below are fictional.

${table(['Level', 'Name', 'Question', 'Example'], depthExamples.map(item => [item.level, item.name, item.question, item.example]))}

Charitology adopts the proposed sources story, coordination, vision, attention, status and gatekeepers from [Humanity’s Checklist](https://humanityschecklist.org/). They prompt questions about shared narratives, working together, imaginable futures, what gets noticed, what gets admired and who gets to participate or build. Their explanatory and practical reach remains a hypothesis. Naming a source does not establish that an activity changes it.`;

const moralMarkdown = `## Make moral disagreement fair

The project uses editorial sketches of welfare, rights, justice, care, faith and tradition, future generations, all life and flourishing. They are prompts rather than complete descriptions of traditions. Use assigned roles instead of asking learners to disclose beliefs or speak for a group.

A welfare role might ask what additional practical benefit the work creates compared with an alternative use of resources. A rights/justice role might ask who cannot access small-print invitations and who has authority to change that barrier. A check score can inform this disagreement without settling duties, fair access or authority. More than one next step can be well reasoned.`;

const worksheetMarkdown = `## Student worksheet

Work alone or with a partner. Write, draw or explain answers aloud. You do not need to put your name on the sheet. You may keep it; no account, public submission or personal example is required.

${worksheet.map(item => `### ${item.id}. ${item.title}\n\n${item.prompt}${item.steps ? '\n\n' + item.steps.map((step, index) => `${index + 1}. ${step}`).join('\n') : ''}\n\nAnswer: ______________________________________________________________`).join('\n\n')}`;

const answersMarkdown = `## Facilitator worked answers

These are worked reasoning, not a prescribed allocation decision. Learners can defend different choices. Arithmetic, units and honest claim labels still matter. Keep this section separate from the student handout until discussion.

${workedAnswers.map(item => `### ${item.id}. ${item.title}\n\n${item.paragraphs.join('\n\n')}`).join('\n\n')}`;

let agendaElapsed = 0;
const agendaRows = lessonAgenda.map(item => {
  const start = agendaElapsed;
  agendaElapsed += item.minutes;
  return [`${start}–${agendaElapsed}`, item.minutes, item.activity, item.output];
});
const agendaMarkdown = `## Ready-to-teach 50-minute taster

### Intended learning outcomes

${learningOutcomes.map((outcome, index) => `${index + 1}. ${outcome}`).join('\n')}

These are intended outcomes, not evidence that the lesson achieves them. No advance reading is needed.

### Preparation

Print the case and worksheet; keep answers separate. Provide pens, large-print copies and an optional calculator. Put givers → signals → channels → work → outcomes on a board, with a learning arrow back to a decision. Offer individual, pair, written, spoken and quiet participation. A learner may pass on speaking.

### Agenda

${table(['Minutes', 'Duration', 'Activity', 'Output'], agendaRows)}

Total: 50 minutes. Adapt pace and formats to the group rather than requiring every learner to finish at the same speed.

### Suggested opening

The numbers are invented. We are practicing reasoning rather than measuring a real charity. Work can be delivered and a change observed without knowing how much the work caused. We can agree on arithmetic and disagree about what should matter. Use assigned roles; no personal belief or experience needs to be shared.

### Suggested closing

We observed a fictional check result and tried two assumptions about what might have happened otherwise. We did not establish a real effect, compare named charities or show that this lesson changes giving. Ask what information and whose voice could change the next decision.`;

const rubricMarkdown = `## Proposed reasoning rubric

Use these five criteria for feedback, with or without points. Each has four levels, 0–3; the optional maximum is 15. A classroom rubric does not award a Charitology credential or establish professional competence.

${table(['Criterion', '0', '1', '2', '3'], rubric.map(item => [item.criterion, ...item.levels]))}

Do not reward selecting a particular cause, agreeing with the facilitator, choosing a higher depth, adopting a prescribed moral lens, donating, revealing personal experience or publishing publicly. Offer equivalent written, diagrammatic and spoken formats. Assess reasoning separately from presentation polish.`;

const capstoneMarkdown = `## Fictional capstone brief

Use a short brief of up to two pages, a diagram with an explanation or an equivalent oral presentation. For the beginner club meeting, use the shorter one-page version. Include:

1. A fictional choice and plausible alternative, intended outcome and time period.
2. A causal chain, weakest link, cash costs and missing resource costs.
3. Recorded fictional values, counterfactual assumptions and unknowns.
4. Two fairly represented moral lenses and a disagreement that survives calculation.
5. Missing voices, proposed decision authority and a route for feedback to return.
6. A measure, comparison, review date and revision rule, including how to report inconclusive results and harms.
7. A peer challenge and revision note, with reasons for any challenge not adopted.

Use supplied fictional material unless an educator has prepared and checked another case. Do not interpret worksheet completion, meeting attendance or this rubric as an automatic completion event in the existing course.`;

const seminarMarkdown = `## Proposed eight-session university seminar

Eight proposed 90-minute meetings cover all ten existing chapters. This adaptation is not an accredited course, approved module or institutional partnership. A university makes its own teaching and assessment decisions.

Reusable 90-minute structure: 10 minutes retrieval and questions; 15 guided reading; 20 individual or pair work; 20 discussion; 15 revision; 10 exit reflection. An educator can redistribute time for access needs.

${seminarSessions.map(session => `### ${session.number}. ${session.title}\n\nReading: ${session.chapters.map(number => `[${number}. ${chapters[number - 1][0]}](https://charitology.org/record/principles/${chapters[number - 1][1]}/)`).join(' and ')}.\n\nExercise: ${session.exercise}\n\nOutput: ${session.output}`).join('\n\n')}

### Sample reading and exercise for session 3

Read chapter 4’s sections on intervention grades and rigor, then chapter 5’s counterfactual sections. Prepare: “The case records…”, “My comparison assumes…” and “I would need…”. Use Riverbend rather than a named charity. Ask whether the check measures something worth knowing, what could make the comparison unfair and whether another funder’s response changes the question.

System-claim labels—established, documented, debated and hypothesis—differ from intervention grades—strong, moderate, mixed, weak and unknown. The fictional table has no external evidentiary standing and should not receive a real intervention grade.

${capstoneMarkdown}

${rubricMarkdown}`;

const meetingsMarkdown = `## Four beginner meetings

Each meeting totals 50 minutes. The proposed ages 14–18 school adaptation requires an educator to adapt language, pace, access and supervision; this is not a validated age-suitability claim. A beginner club can use the same sequence. No prior knowledge, outside speakers, accounts or donations are needed.

${beginnerMeetings.map(meeting => `### ${meeting.number}. ${meeting.title}\n\nTiming: ${meeting.timing} (50 minutes).\n\nActivity: ${meeting.activity}\n\nOutput: ${meeting.output}`).join('\n\n')}

Facilitation prompts:

- Ask what the record tells us before choosing an option.
- Ask what else could explain a change.
- Offer assigned perspectives rather than requesting religious, political or family beliefs.
- Discuss an inaccessible invitation without assigning a personal history to a learner.
- Return discussion of motives to mechanisms, missing information and decisions.
- Use exit responses to adapt the next meeting; do not call them evidence of retained learning or charitable impact.`;

const accessMarkdown = `## Access and local arrangements

Propose a reading group, class or extracurricular activity through the institution’s own process. Using this pack does not register a chapter or establish university, school or Charitology recognition.

Confirm physical and digital access, language, materials, quiet participation and a private route to request an adjustment. Essential figures and readings should be available on paper. Do not require a smartphone, public profile, Values Compass result, account or disclosure of a diagnosis. For a school group, an educator sets age-appropriate supervision and follows the institution’s existing rules.

Learners can pass on speaking, use assigned perspectives and keep their work. If a correction is shared publicly, make it optional, sanitized and subject to the normal editorial process and appropriate permission. Do not collect private learner contact details for this kit.`;

const clubsMarkdown = `## Club roles

${clubRoles.map(item => `- **${item.role}:** ${item.detail}`).join('\n')}

Roles may rotate or be combined. Describe mechanisms, question claims and give moral frameworks a fair hearing. Do not rank named charities or raise, hold or direct funds in Charitology’s name.

## Editable invitation

${clubInvitation}

## Proposed draft constitution

${clubConstitution.map(item => `### ${item.title}\n\n${item.text}`).join('\n\n')}

## Handover card

Fill in only agreed organizational information:

${clubHandover.map(item => `- ${item} ____________________`).join('\n')}

The separate [six-session chapter-launch workspace](https://charitology.org/programs/university-chapters/) remains available for a longer local plan. This four-meeting starter neither changes that workspace nor establishes a recognized chapter.`;

const osMarkdown = `## Optional fictional Charity OS demonstration

The complete activity works on paper. An educator may instead show paper record shapes or an already-authorized fictional demonstration workspace. Do not ask learners to create accounts or enter real student, participant or donor data. This material creates no records, invitations, payments or messages.

- Projects and tasks: manually describe “Review the Riverbend check,” an owner role, completion condition and review date. Completing a task does not show that a program worked.
- Evidence and outcomes: mark 12/30 before and 21/30 later as fictional observations. A stored observation is not a causal conclusion or independently approved finding.
- Evaluation and learning: retain the comparison question, proposed method and unresolved counterfactual. A report or approval does not manufacture evidence or settle values.

Use the ordinary permissions of the existing demonstration setup; no automatic import is implied. Continue on paper if it is unavailable. Service scope: https://charitology.org/for-charities/os-plan/`;

const startMarkdown = `## Choose a starting point

- One meeting: use the facilitator guide and print the student worksheet separately. The taster needs 50 minutes and no advance reading.
- University: use the eight-session syllabus; it maps all ten chapters without changing the existing course.
- Beginner club: use the four-meeting starter, editable invitation, proposed constitution and handover card.
- School: use the educator-adapted school pack, suggested for ages 14–18, with local supervision and access arrangements.

Materials are editable Markdown, not a registration or submission. Keep facilitator answers apart from the learner handout. Read the case limitations alongside its figures; do not reuse only the attractive numbers.

${glossaryMarkdown}

${caseMarkdown}

${accessMarkdown}

## What remains untested

The lesson’s intended outcomes, proposed timings and feedback rubric have not been evaluated with learners. The six-source framework is a hypothesis. Classroom participation, correct arithmetic and feedback are not accreditation, professional competence or measured charitable impact.`;

export const teachingMaterials = [
  material('start-here', 'Teaching charity as a system: start here', startMarkdown),
  material('facilitator-guide', 'Facilitator guide: what changed?', [agendaMarkdown, glossaryMarkdown, caseMarkdown, depthMarkdown, moralMarkdown, worksheetMarkdown, answersMarkdown, accessMarkdown, osMarkdown].join('\n\n')),
  material('student-worksheet', 'Student worksheet: what changed?', [caseMarkdown, glossaryMarkdown, worksheetMarkdown].join('\n\n')),
  material('university-syllabus', 'Proposed eight-session university seminar', [seminarMarkdown, glossaryMarkdown, caseMarkdown, depthMarkdown, moralMarkdown, accessMarkdown, osMarkdown].join('\n\n')),
  material('club-starter', 'Beginner club starter and editable templates', [accessMarkdown, meetingsMarkdown, glossaryMarkdown, caseMarkdown, depthMarkdown, moralMarkdown, capstoneMarkdown, clubsMarkdown, osMarkdown].join('\n\n')),
  material('school-pack', 'Educator-adapted school pack: four beginner meetings', [accessMarkdown, meetingsMarkdown, glossaryMarkdown, caseMarkdown, depthMarkdown, moralMarkdown, worksheetMarkdown, capstoneMarkdown, '## Keeping answers separate\n\nUse the separate facilitator guide for worked answers. Offer fractions, a calculator or the worked table when useful. Do not require every learner to speak publicly or complete every calculation at the same pace. Use this proposal only after adapting it to the group and the institution’s existing supervision and access arrangements.', osMarkdown].join('\n\n')),
  material('complete-pack', 'Complete draft teaching pack', [startMarkdown, agendaMarkdown, depthMarkdown, moralMarkdown, worksheetMarkdown, answersMarkdown, seminarMarkdown, meetingsMarkdown, clubsMarkdown, osMarkdown].join('\n\n'))
];

// Fail during a build if an authored edit breaks the shared page/download structure.
const requireKit = (condition, message) => {
  if (!condition) throw new Error(`Education kit invariant: ${message}`);
};
const positiveMinutes = values => values.every(value => Number.isInteger(value) && value > 0);
requireKit(learningOutcomes.length === 3, 'three intended outcomes');
requireKit(positiveMinutes(lessonAgenda.map(item => item.minutes)) && agendaElapsed === 50, 'taster totals 50 minutes');
requireKit(seminarSessions.length === 8 && seminarSessions.every((item, index) => item.number === index + 1), 'eight ordered seminar sessions');
const chapterCoverage = seminarSessions.flatMap(item => item.chapters).sort((a, b) => a - b);
requireKit(chapterCoverage.length === 10 && chapterCoverage.every((number, index) => number === index + 1), 'chapters 1 through 10 exactly once');
requireKit(beginnerMeetings.length === 4 && beginnerMeetings.every((item, index) => item.number === index + 1 && positiveMinutes(item.minutes) && item.minutes.reduce((sum, value) => sum + value, 0) === 50), 'four 50-minute beginner meetings');
requireKit(worksheet.length === 8 && workedAnswers.length === 8 && worksheet.every((item, index) => item.id === `W${index + 1}` && workedAnswers[index].id === `A${index + 1}`), 'eight matched questions and answers');
requireKit(rubric.length === 5 && rubric.every(item => item.levels.length === 4), 'five reasoning criteria with levels 0 through 3');
requireKit(depthExamples.length === 5 && depthExamples.every((item, index) => item.level === index), 'five descriptive depths');
const requiredMaterialIds = ['start-here', 'facilitator-guide', 'student-worksheet', 'university-syllabus', 'club-starter', 'school-pack', 'complete-pack'];
requireKit(teachingMaterials.length === requiredMaterialIds.length && new Set(teachingMaterials.map(item => item.id)).size === requiredMaterialIds.length && teachingMaterials.every((item, index) => item.id === requiredMaterialIds[index] && /^[a-z][a-z0-9-]*$/.test(item.id) && item.title.length > 0 && item.body.includes(`Version ${kitVersion}`) && item.body.includes('review: draft') && item.body.includes('https://creativecommons.org/licenses/by/4.0/')), 'safe unique complete materials with version, draft and license');
