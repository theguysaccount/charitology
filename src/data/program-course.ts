export type CourseQuestion = {
  prompt: string;
  options: string[];
  correct: number;
  explanation: string;
};
export const courseLessons: {
  chapter: number;
  takeaway: string;
  exercise: string;
  worked: string;
  questions: CourseQuestion[];
}[] = [
  {
    chapter: 1,
    takeaway:
      "Study mechanisms that connect generosity to results. Describe the work without judging the people doing it, and keep the field’s own founding claims open to testing.",
    exercise:
      "Choose a hypothetical gift. Describe the mechanism you would investigate, without judging anyone’s motives.",
    worked:
      "For a hypothetical food service, ask whether opening hours let people reach it and whether the food meets the need. A claim about waste or selfishness would not answer either question.",
    questions: [
      {
        prompt: "What is Charitology’s subject?",
        options: [
          "The character of donors",
          "The system connecting giving, work and outcomes",
          "A ranking of charities",
        ],
        correct: 1,
        explanation:
          "The system is the subject. People’s character is not the proposed object of study.",
      },
      {
        prompt: "How should an untested founding claim be labeled?",
        options: [
          "Established because it is central",
          "Documented because it sounds plausible",
          "Hypothesis",
        ],
        correct: 2,
        explanation:
          "A founding idea still needs evidence. The project’s own claims receive the same scrutiny.",
      },
    ],
  },
  {
    chapter: 2,
    takeaway:
      "Map givers, signals, channels, work and outcomes. A feedback loop must connect what is learned to the next decision; a report by itself does not show that money or practice changed.",
    exercise:
      "Map those five stages for a hypothetical project. Name one missing link in its feedback loop.",
    worked:
      "Neighbors → a local appeal → a grant → evening food service → more reliable food access. Ask whether the people using it can change the hours and whether the funder responds to what they say.",
    questions: [
      {
        prompt: "Where does a donor’s overhead ratio first act in the map?",
        options: [
          "As a signal",
          "As an outcome",
          "As the entire feedback loop",
        ],
        correct: 0,
        explanation:
          "It is information presented to a giver. Its downstream effects are a separate question.",
      },
      {
        prompt: "Which is an outcome rather than an output?",
        options: [
          "A class was delivered",
          "Forty flyers were printed",
          "Participants’ reading improved",
        ],
        correct: 2,
        explanation:
          "The first two describe activities. Improved reading describes a change, whose cause still needs examination.",
      },
    ],
  },
  {
    chapter: 3,
    takeaway:
      "The five levels are relief, repair, prevention, structure and source. Classify a specific activity and its causal chain, rather than assigning one grade to an entire organization.",
    exercise:
      "Place two activities addressing the same need at different depths. Explain uncertainty and why both might be needed.",
    worked:
      "A shelter meets a need tonight, while an eviction-prevention service aims to stop a future loss. Describing the second as prevention does not make the first less valuable.",
    questions: [
      {
        prompt:
          "A shelter gives someone a bed tonight. Which description fits?",
        options: ["Relief", "A low moral grade", "Source by definition"],
        correct: 0,
        explanation:
          "Relief names where the work acts. It does not grade its worth.",
      },
      {
        prompt:
          "An organization runs a clinic and advocates for a law. What should you classify?",
        options: [
          "The founder’s ambition",
          "Each activity and the resources supporting it",
          "Only the deepest stated goal",
        ],
        correct: 1,
        explanation:
          "A broad mission can contain work at several depths. Classify the activities, with uncertainties stated.",
      },
    ],
  },
  {
    chapter: 4,
    takeaway:
      "Evidence strength, effect size, cost and depth answer different questions. A rigorous result in one setting may need further reasoning before it applies somewhere else.",
    exercise:
      "Write one claim about a hypothetical intervention. State the evidence you would need and what could change its label.",
    worked:
      "“Tutoring improves reading here” needs a credible comparison and a defined reading measure. A useful study elsewhere is a reason to investigate, not proof that every delivery model works here.",
    questions: [
      {
        prompt:
          "Several rigorous studies disagree. Which intervention grade fits?",
        options: ["Strong", "Mixed", "Established"],
        correct: 1,
        explanation:
          "Mixed is the intervention grade for disagreement among rigorous studies. Established belongs to the system-claim labels.",
      },
      {
        prompt: "Does a strong evidence grade tell you the cost per outcome?",
        options: [
          "Yes, it is a cost ranking",
          "Only when depth is high",
          "No, that requires further data and assumptions",
        ],
        correct: 2,
        explanation:
          "Confidence that an effect exists is different from its size and cost.",
      },
    ],
  },
  {
    chapter: 5,
    takeaway:
      "Impact asks what changed compared with what would have happened otherwise. Other funders may respond, and a neglected problem is not automatically a tractable opportunity.",
    exercise:
      "Write two plausible no-gift scenarios for a project. Explain which assumption most changes the decision.",
    worked:
      "Another donor might fill the gap, or the work might shrink. If another donor fills it, consider what that donor would do instead; do not simply assign zero impact without examining the wider change.",
    questions: [
      {
        prompt:
          "A program reports a result. What else is needed to estimate impact?",
        options: [
          "What would have happened without the program",
          "A more moving story",
          "Its logo",
        ],
        correct: 0,
        explanation:
          "The counterfactual comparison is the hidden half of an impact claim.",
      },
      {
        prompt: "A cause receives little funding. What follows?",
        options: [
          "It must be the best gift",
          "Its methods must work",
          "Investigate scale, tractability and why funding is low",
        ],
        correct: 2,
        explanation:
          "Neglect is a clue, not a verdict. There may be no effective next step, or the problem may be small.",
      },
    ],
  },
  {
    chapter: 6,
    takeaway:
      "Different moral frameworks can see different goods. Make value judgments visible and compare robust choices alongside disagreements; an editorial framework sketch does not speak for every tradition.",
    exercise:
      "Compare one giving decision through two moral lenses. State a disagreement that a cost calculation alone cannot settle.",
    worked:
      "A welfare lens might ask about wellbeing gained, while a rights lens asks about duties and consent. Write both questions before choosing; a larger measured output need not settle a rights concern.",
    questions: [
      {
        prompt: "What should happen to a moral weight in a comparison?",
        options: [
          "Hide it inside a score",
          "State it and invite disagreement",
          "Call it a measured fact",
        ],
        correct: 1,
        explanation:
          "An explicit weight makes the value judgment open to challenge.",
      },
      {
        prompt: "What is moral uncertainty?",
        options: [
          "Uncertainty about which moral view is right",
          "Uncertainty about a bank balance",
          "Proof all frameworks are identical",
        ],
        correct: 0,
        explanation:
          "Moral uncertainty concerns values. Empirical uncertainty concerns what is true about the world.",
      },
    ],
  },
  {
    chapter: 7,
    takeaway:
      "Separate time to effect from durability. Discounting can combine empirical beliefs and moral judgments; choosing a rate should not hide either.",
    exercise:
      "Describe a short-run and long-run option. State timing, durability and one reason to discount, without choosing a universal rate.",
    worked:
      "Immediate care works now while a prevention project may avert later need. Distinguish uncertainty that the future benefit arrives from valuing later wellbeing less simply because it is later.",
    questions: [
      {
        prompt: "Which pair names different time questions?",
        options: [
          "Popularity and prestige",
          "Time to effect and durability",
          "Income and overhead",
        ],
        correct: 1,
        explanation:
          "One asks when benefit starts, the other how long it lasts.",
      },
      {
        prompt: "What is pure time preference?",
        options: [
          "Risk that a program fails",
          "A forecast of future wealth",
          "Valuing later wellbeing less just because it is later",
        ],
        correct: 2,
        explanation:
          "That is a moral position, distinct from uncertainty or beliefs about future incomes.",
      },
    ],
  },
  {
    chapter: 8,
    takeaway:
      "Listening, responding and sharing decision authority are different. A feedback process should say who can speak safely, who acts on it and how people learn what changed.",
    exercise:
      "Design a feedback loop for a hypothetical service. Include a safe way to disagree and a decision that feedback can change.",
    worked:
      "Offer anonymous feedback, report themes without identifying people, name who can adjust the service, and tell participants what changed. A survey alone is not shared decision authority.",
    questions: [
      {
        prompt: "What distinguishes shared decisions from consultation?",
        options: [
          "A longer survey",
          "A new logo",
          "People affected hold some decision authority",
        ],
        correct: 2,
        explanation:
          "Asking for views and sharing authority are distinct practices.",
      },
      {
        prompt: "What closes more of the feedback loop?",
        options: [
          "Collect, respond, and explain what changed",
          "Collect and file away",
          "Report only favorable answers",
        ],
        correct: 0,
        explanation:
          "A response and accountability for decisions help connect information to practice.",
      },
    ],
  },
  {
    chapter: 9,
    takeaway:
      "Pre-specify the outcome and what would change your plan. Report null results and harms as well as successes; a forecast score is not by itself a complete calibration test.",
    exercise:
      "Write a stopping or revision rule before a hypothetical trial, plus what you would report if it found no effect.",
    worked:
      "Specify the measure, comparison, review date and threshold for revisiting the program. If the result is inconclusive, report the interval and what the design could detect rather than relabeling it a success.",
    questions: [
      {
        prompt: "When should the main outcome be specified?",
        options: [
          "Before looking at results",
          "After finding a favorable result",
          "Only if the program fails",
        ],
        correct: 0,
        explanation:
          "Pre-specification makes it harder to redefine success after seeing the data.",
      },
      {
        prompt: "A study finds no clear effect. What is an honest next step?",
        options: [
          "Hide it",
          "Claim there can never be an effect",
          "Report the result, uncertainty and what it can rule out",
        ],
        correct: 2,
        explanation:
          "No clear effect can reflect a small effect, an imprecise design or other limits. Explain what was learned.",
      },
    ],
  },
  {
    chapter: 10,
    takeaway:
      "Practice by writing one decision, its causal chain, evidence, lenses, counterfactual and follow-up. A certificate is optional; participation does not require permission or a credential.",
    exercise:
      "Outline a giving decision using the checklist. Include a source you would check and a date to revisit what happened.",
    worked:
      "A useful capstone states the choice, alternative, intended outcome, weakest causal link, evidence limits, community decision rights, moral disagreement and a follow-up plan. It need not pick a named charity.",
    questions: [
      {
        prompt: "Who may practice charitology?",
        options: [
          "Only certificate holders",
          "Anyone studying or improving how generosity is aimed",
          "Only paid advisors",
        ],
        correct: 1,
        explanation:
          "The field is open. This course completion record does not control participation.",
      },
      {
        prompt: "What can this self-study record establish?",
        options: [
          "Professional accreditation",
          "Independent review of a portfolio",
          "Completion of these local course checks, with stated limits",
        ],
        correct: 2,
        explanation:
          "The browser checks answers and completion, not identity, independent competence or accreditation.",
      },
    ],
  },
];
