# Workflow

## The pipeline

```
idea → /grill-me → PRD → issues → TDD → PR → merge
```

Nothing skips to the middle. An idea that has not been grilled becomes a PRD full of assumptions;
a PR with no issue behind it has no record of why it exists.

**PRD → issues → PR is a gate, not a suggestion.** Never open a PR without a referenced issue —
`.githooks/pre-push` and the `t4-gate` hook both block it.

## Issues

Issues are the source of truth. The tracker, not this file, holds current state.

**Bodies are bilingual** — English, then a full Thai mirror of the same depth. A mirror is not a
summary; if the English has a table, the Thai has the same table. This applies to issue bodies, PRD
bodies and PR descriptions. It does **not** apply to chat, reports, code, commit messages or inline
comments.

**Close only with evidence** — the commit, the test output, or the `file:line`. An issue closed
because it "looks done" is an issue that will be reopened.

Labels: `docs/agents/triage-labels.md`. Driving the tracker: `docs/agents/issue-tracker.md`.

## TDD

Mandatory for features and bugfixes. Red → green → refactor, in that order. Existing tests passing
is not TDD for the change in front of you.

## Verifying

```bash
bun run verify       # lint + typecheck + test + build — the fast gate, runs before merge
bun run test:e2e     # Playwright — the slow suite, CI only
```

`bun run verify` is armed in `.claude/t4.json`; the hook runs it itself before `gh pr merge` and
blocks on failure. Keep it fast, and keep it in sync with `.github/workflows/t4-verify.yml`.

**Verify every frontend change end-to-end.** Unit tests cannot see real layout or hydration. Add an
E2E case for each new page or interactive element — and for this project specifically, for each new
status value, because the whole product is the difference between one colour and another.

## Gates, and how to report them

At each phase boundary: wrote code → `simplify` · before merge → `code-review` + `scrutinize` ·
touched a key, a token or RLS → `security-review` · done → `verify`.

When reporting work, **enumerate every gate as ran / not-run / n-a**. Listing only the ones that
ran, with the skipped ones simply absent, reads as completeness. `not-run` with a reason is an
acceptable line; silence about a gate is not. The same claim goes on the branch as a `T4-Gates:`
commit trailer, which `.githooks/check-gate-ledger` checks on push.

## Records

Something notable happened → `t4-engineering-records`. A validated bugfix gets a post-mortem; a
hard-to-reverse decision gets an ADR in `docs/adr/`; a system-affecting change gets an impact entry.
Records stay a reliable index: `file:line`, commit SHAs, validated claims only.
