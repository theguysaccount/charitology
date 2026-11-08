# Aggregate field responses to observation drafts

This is the candidate contract for OS-FIELD-01. It is not a release or a completed field study. The [model](../services/charity-os/lib/field-response-model.mjs) supports one versioned aggregate-visits JSON format. It does not read a live Kobo account, convert an arbitrary spreadsheet or infer a measurement definition.

## The staff workflow

1. Choose a current program, its indicator with the exact unit `visits`, and a credential-free CSV connection for Evidence and outcomes. An administrator creates the connection; it supplies source identity, not remote synchronization.
2. Choose the original aggregate JSON file and acknowledge that inspection sends the complete file to the authenticated service. Inspection is read-only. It does not retain the original file or unselected rows.
3. Read every row's period, geography, count, denominator and disposition. Select rows deliberately. A selected excluded row preserves its reason without creating an observation. Conflicts and already-recorded responses cannot be selected.
4. Preview at least one new observation. Review the complete outgoing drafts and selected manifest before committing. A changed program, indicator, connection, membership, restored workspace or relevant record state can invalidate the review.
5. Commit the reviewed command. Observations are ordinary editable drafts with unknown evidence and no approval. The immutable import manifest retains the selected source values and their provenance separately from later record edits.

Source identity combines the connection, form and response ID. Matching history prevents overwriting later edits or recreating trashed observations. A changed source or mapping requires reconciliation. Separate connections may use the same response ID.

## The closed file

The file is UTF-8 JSON, at most 262,144 bytes and 100 responses. It permits only the declared fields. Duplicate keys, duplicate response IDs, incomplete JSON and unsupported formats refuse. Original numeric spelling is checked before accepting exact nonnegative safe integers; strings and rounded fractional values are not counts.

This fictional example illustrates the shape; it is not an observation to import:

```json
{
  "format": "charitology-aggregate-service-visits",
  "version": 1,
  "formId": "aggregate-service-visits-v1",
  "schemaVersion": 1,
  "responses": [
    {
      "responseId": "fictional_aggregate_1",
      "startDate": "2026-01-01",
      "endDate": "2026-01-31",
      "geography": null,
      "visitCount": null,
      "denominator": null,
      "excluded": false,
      "exclusionReason": null
    }
  ]
}
```

Use opaque response IDs of 1–100 letters, digits, underscores or hyphens. Periods are ordered calendar dates from 1900 through 2200. Geography is null or an aggregate label of at most 240 characters. An explicitly excluded response needs a reason of at most 600 characters; an included response has a null exclusion reason. Do not put names, contact details or individual case narratives in these fields.

Null stays unknown. Zero stays a supplied zero. A denominator is never filled in and no rate is calculated. Counts above the ordinary Outcomes field limit refuse when selected for a draft. The unit describes visits, not unique people or causal impact. File and row hashes identify retained bytes or values; they do not establish collection quality.

## Interrupted saves and history

A save with an unknown result retains its exact preview ID and command key for deliberate Retry. A later rate limit or conflict cannot turn that uncertainty into permission to create another command. The accepted result and current record state remain separate. Fresh session, membership and scope checks still apply to Retry and history.

History follows the current program's visibility. If that program is missing, deleted or changed to another kind, only an unscoped owner or administrator can read its orphaned history. Roles restricted to approved snapshots cannot read these unapproved source manifests.

## Backup and acceptance

Manifests use the existing immutable reports collection. Complete workspace recovery preserves their payloads, IDs, titles, checksums and historical origin through later exports. Destination row ownership and timestamps change. Recovery imports no accepted command, session, credential, approval or current definition authority. Existing destination history or report-ID collisions refuse instead of overwriting it.

The original workspace storage, native backup, source archive and record limits still apply. No new table, grant, provider or automatic job is required. Unit tests, actual database transactions, browser journeys, release checks and real organizational use are separate evidence. None establishes that a charity's collection method is valid or that an intervention caused an outcome.
