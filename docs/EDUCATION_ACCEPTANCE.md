# Education activation acceptance

Status: local implementation acceptance, October 28, 2026 UTC. The release record is [PR #35](https://github.com/theguysaccount/charitology/pull/35). AI-assisted content and source review; all teaching resources remain untested editorial drafts.

## Four-meeting starter update, November 9

The club guide now links to a distinct four-meeting preset in the chapter workspace. It uses the same authored beginner sequence as the guide, with editable objectives, timed agendas, readings and outputs. The complete proposed kit is visible before Apply. Existing discard checks protect saved records and unfinished fields; review alone writes nothing. The six-session example, local key and native version 1 format remain unchanged. Neither preset registers a club or confirms a meeting.

The final local build produces 611 pages, and the complete `npm run check` passes. Thirty-seven actual Astro-rendered, mounted interface groups pass, including two new behavioral groups for discard/review/Apply, exact JSON/Markdown/CSV exports and invalidation after new writing or persisted page hide. The earlier unchanged ten pure planning checks retain their separate source scope. Independent AI-assisted source review caught a six-session term label inherited by the new preset; a retained negative control fails the prior source, and the corrected preset says “Illustrative four-meeting starter.” No historical reference output was regenerated.

An actual in-app-browser journey follows the club link, preserves unfinished text until explicit discard, reviews the four titled meetings, applies four editable sessions with two roles and two tasks, then uses guarded Undo. A reload confirms the disposable workspace is empty again. The task tab and static preview server are closed. This verifies that finite browser flow; it is not Chrome/phone-layout, native file-picker, print, screen-reader or institutional-adoption evidence. Native file-save checks from earlier releases were not repeated. Publication and canonical checks remain separate from this local record.

## Scope

Five public `/learn/` pages provide a teaching hub, a 50-minute lesson, an eight-session university outline, a four-meeting beginner club guide and an adult-educator-led school adaptation. Seven editable, self-contained Markdown downloads include a starting guide, facilitator guide, separate student worksheet, syllabus, club starter, school pack and complete pack. Entry points appear in the footer, menu, charity hub and existing course/chapter wrappers.

One shared authored data module supplies the on-page lesson and downloads. Its build-time invariants check the 50-minute agenda, eight session mappings covering all ten existing chapters once, four 50-minute club meetings, eight matched worksheet/answer sections, five rubric criteria with four levels, five descriptive depth levels and seven unique safe material IDs. The fictional case distinguishes 30 observed participants, 12→21 before/after passes, conditional assumed counterfactuals and the undefined zero-denominator ratio. There is no causal-effect or learning-efficacy claim.

Eighteen selected official-source records retain read dates, limits and draft status. [Source audit](EDUCATION_SOURCE_AUDIT.md) and [adoption plan](EDUCATION_ADOPTION_PLAN.md) distinguish actual reading from protected/unread material and future institutional decisions. Eight private drafts and an unsent CSV comprise six primary institution groups and two held alternatives. Private reviewer checks found no meaningful defect; this is AI review, not independent institutional validation.

## Preserved behavior and limits

The original 66-item brief, existing ten-unit course, frozen criteria, six-session chapter workspace, learner storage, shared OS, mail service, provider configuration and dependencies are unchanged. Astro remains pinned to 5.18.2. Manual OS links only navigate; teaching needs no account or software. School activities use fictional records and learner-owned paper, with no required donations, student account, personal beliefs, survey or uploaded work.

No message or form was sent, no application/registration submitted, no student contacted, no pilot held and no course credit, recognition, partnership or learning gain established. The suggested 14–18 school range is a proposed adaptation for educator review. Locally approved sessions, research and any later learner data collection remain separate work.

## Local verification

Runtime commit `1c7407964a5c8a0229cb3bab726f730a884a49a6` contains the final teaching code and text. The full normal `npm run build` and `npm run check` passed locally. A final rebuild after the minor capstone/invitation copy refinements built **577 HTML pages**; the final content and link checks passed **49,878 internal links/assets with none broken**. The final kit SHA-256 is `64d59d9d29394645e8157329d488059fd5292deb1e646271683ace9fd66dc339`; source-module SHA-256 is `e0e045589dd261257e1cbc641cda2e0ae3f4da0fd8de2999aa061943910279fc`.

Actual in-app-browser checks against the final build covered all five pages at 320 pixels in the existing dark theme: document width stayed 320, text/cards remained contained and wide tables had named focusable internal scroll regions. A native right-arrow moved the lesson agenda horizontally by 40 pixels. The final lesson has eight timed rows, eight worksheet prompts and eight expandable worked-answer sections; the actual opened A4 explains the assumed three/zero additional passes and undefined division by zero. The three guides displayed their actual draft/read-date source notes. Menu/footer and charity/course/chapter entry points lead to the intended teaching routes. The bounded warning/error log was empty. Light theme, native print and screen-reader operation were not exercised in this pass.

Two actual click-triggered native downloads were saved, independently reopened and compared byte-for-byte with the final built files:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| Student worksheet | 9,302 | `6ab24494942eaa0f1867043cc3e5506beae5378600af7d1ed1905c0a2f596467` |
| Complete pack | 37,849 | `bbf3220baaead619e22df2b5b1f3081ef406277c93a52ed3ee0453172955f715` |

The saved worksheet contains W1–W8 and excludes the facilitator answer sections. The complete pack includes the zero-denominator explanation and the corrected short club-brief instruction. Both preserve fictional/draft scope and attribution. The other five files were built and linked but were not individually saved through the native browser. Private copies/receipts and screenshots are retained outside Git; task-created Downloads copies were removed after the independent byte check.

The owned local preview tab closed and its viewport override was reset. The task-created static preview server was stopped. The preexisting user tab and ongoing Learning development server were preserved. An older, previously unresponsive Chrome Save preview has no verified closure; no unrelated browser or process was killed. No classroom learning effect is established by these checks.

## Release and public checks

[PR #35](https://github.com/theguysaccount/charitology/pull/35) records the final release head, exact CI outcomes, merge and Pages identity, and bounded canonical checks after completion. Local acceptance alone does not establish publication. Merge requires the final head’s public, OS and newsletter checks, followed by successful Pages deployment and exact-byte checks of the five new pages, three existing entry points, all seven Markdown files and their selected linked runtime/media assets. The public comparison is selected coverage, not an HTTP read of every one of the 577 HTML pages.

The first new-branch push at runtime `1c7407964a5c8a0229cb3bab726f730a884a49a6` failed the observation-history gate because the push event supplied no nonzero committed base. Its failure remains recorded; no gate was bypassed. Later documentation commits have a real parent and require fresh exact-head push/PR CI. Private release/public-response receipts preserve the final identities and actual saved bodies.
