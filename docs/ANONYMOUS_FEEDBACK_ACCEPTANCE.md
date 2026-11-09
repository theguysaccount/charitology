# Anonymous feedback for private follow-up

Charity OS offers an anonymous process feedback form. It asks what someone was trying to do and whether they could finish. The two questions use fixed choices. The form has no name, email or written response field.

In Public forms and requests, prepare a form with a retention review date. Save the draft, have another authorized person approve that revision, and move the approved record to Published. An administrator with organization-wide Forms and Community feedback access can then create the public link. The link stops accepting new responses after withdrawal, a source edit or the retention review date. Staff review or erase retained answers separately.

People can submit without signing in. They agree to private process review. The first accepted response shows a private receipt for checking status or withdrawing the feedback. A retry with the same answers can confirm status if the first response was interrupted. Save the original receipt when it appears.

Staff explicitly review a response before creating one Community feedback draft. The draft stays private, with publication permission withheld. Staff can record a private follow-up. The workflow creates no contact or account link and sends no message. Withdrawing a response or erasing its selections does not remove a draft already created. The draft has its own retention process.

If a draft save is unconfirmed, Retry checks the same request. Its original decision and current record are shown separately. Backups preserve the permitted history. A restored form stays withdrawn, and restored history carries no live receipt or publication authority.

## Verification scope

- In a fictional workspace, the full browser used the actual app and a restricted PostgreSQL connection. It checked the prefilled form, the exact draft and its acknowledgment, an unconfirmed save, close and reopen, a byte-identical Retry, and the link to the single saved private draft. A separate public visit submitted and withdrew a fictional response through its receipt.
- Mounted PostgreSQL checks cover independent Forms approval, anonymous admission, scoped queue pagination, concurrent staff saves, erasure and legacy Contact intake. Scoped roles cannot read intake-linked drafts through ordinary record views, reports or the native backup. Browser history and portable backup omit the local request hashes.
- Isolated database checks also cover exact schema admission, whole-workspace limits, older data without feedback, and inactive backup recovery. The two settings that control participant reminders stay off.

This is private process feedback. Public aggregate responses, evidence of better outcomes, and real charity use require separate work.

## Production release

[PR #63](https://github.com/theguysaccount/charitology/pull/63) merged as `a9a5c1fa2897e425ec6344b7d804b92e24e22144`. Its tree matches the tested head `5a30b3a17d8c453723f957cf8c0cba71c6267512`. All four jobs passed on both the [push](https://github.com/theguysaccount/charitology/actions/runs/42606578374) and the [pull request](https://github.com/theguysaccount/charitology/actions/runs/42606584673).

The compatible release served the tested application before the schema change. A single production transaction changed two publication constraints and created one receipt index. A fresh read verified the new structure and all 130 existing rows across 40 tables. The deployment from the merged Git commit then matched all 16 selected responses, including nine assets, five signed-out refusals, the unpublished-form refusal and the health response. These checks did not submit feedback or publish a real organization's form.
