# Status Hub — memory vault

The Map of Content. Skim the descriptions, open only the notes the task touches.

**Read this at session start**, then `docs/OPEN-WORK-LEDGER.md`, then the issue you are picking up.
Do not preload the graph — pull the one slice you need.

## Notes

| Note | What it holds |
|---|---|
| [[platform-limits]] | The free-tier ceilings the architecture is built around — measured, not assumed. Changing any of them reopens a decision. |
| [[no-fallback-credentials]] | Why there is no fallback key anywhere, and what a missing credential must report instead. |
| [[status-must-not-overclaim]] | The invariant the whole product rests on: a status value claims exactly what was observed, never more. |

## What belongs here

A convention we settled on, a decision and its reasoning, feedback from the developer, a constraint
discovered the hard way — anything a future agent would otherwise rediscover at cost.

**Not** what the code, the git history, `docs/agents/*` or an issue already records. If asked to
remember one of those, persist what was *non-obvious* about it instead.

An unresolved `[[wikilink]]` is a memory worth writing, not an error.
