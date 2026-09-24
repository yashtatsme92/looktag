# Issue #24 — You session trust notes

Fixes #24.

## Related funnel trust notes

Issue #24 sits next to [#9](https://github.com/yashtatsme92/looktag/issues/9): the funnel trust notes for that work live in PR [#47](https://github.com/yashtatsme92/looktag/pull/47) under `docs/pr-previews/issue9/README.md`.

## You session-state coverage

| Session state | You copy / chrome expectation |
| --- | --- |
| Pending | Neutral session-loading copy only; no signed-in redirect or ownership UI until auth settles. |
| Guest | Prompt to sign in for publishing/profile ownership only; no admin wording or admin affordances. |
| Member | Self-profile identity and account actions show only after the signed-in session is settled. |
| Admin | Admin identity is explicit and admin-only links stay behind the resolved admin state. |
