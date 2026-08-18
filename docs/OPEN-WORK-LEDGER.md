# Open work ledger

Everything currently open, in one place, so a fresh session recovers state without reading the
whole tracker. The tracker is the source of truth; this is the index into it.

**Update this in the same commit as the work.** A ledger that lags is worse than none, because it
is read as current.

| Item | Where | State | Next action |
|---|---|---|---|
| Bootstrap the T4 operating layer | this repo | in progress | finish CI/labels/rulesets, then verify hooks (step 11) |
| Implement Status Hub per the spec | `docs/superpowers/specs/2026-08-18-status-hub-design.md` | not started | file issues from the spec, then TDD |
| `openCode` source is unresolved | spec §14 | **parked — needs the developer** | `status.opencode.de` is a German public-sector platform, not `opencode.ai`. Watch the German one, probe `opencode.ai` over plain HTTP, or drop it |
| 9arm API surface unconfirmed | spec §6 | open | the reference implementation calls the Anthropic Messages API; confirm whether the OpenAI surface also works before writing the adapter |
| ~~`.claude/t4.json` `verify` is empty~~ | `.claude/t4.json` | **done** | armed with `bun run verify`; measured green (lint + typecheck + test + build) |
