# Status Hub — agent operating manual

One public page showing whether the AI gateways and models this team depends on are
actually working right now, and what their history looks like. The agent is the primary
developer here; this file is its operating manual.

## Engineering north-star

**Simplest logic that works · easy to maintain · sustainable long-term · good performance.**

In that order, and the order matters. A clever solution that only its author can maintain
loses to a boring one. Reach for the boring one first and make it fast only where a
measurement says it is slow.

## Route first — `using-t4` is a standing default, not a pointer

**Invoke `using-t4` before acting**, and **re-route at every phase boundary**:

| Boundary | Invoke |
|---|---|
| wrote code | `simplify` |
| before merge | `code-review` + `scrutinize` |
| touched auth / secrets / a token path | `security-review` |
| done | `verify` |

**A check at task start does not discharge a later trigger.** Routing once at the top of a
session and never returning is the one behaviour the map forbids of itself.

## Delegation — `clink-subagents` is the default

The orchestrator's context window is the scarce resource; the clink back-ends bill against
flat subscriptions and the master does not. So **delegating scoped work is the default, not
an optimisation.** Two rules do not relax:

- **Verify everything a subagent returns.** A report is a hypothesis until you have checked
  it. A worker in this family's history claimed a merged PR that did not exist.
- **Never delegate the final verification, and never delegate a security-boundary change.**

**`clink-masteragent`: invoke it before any `clink` call.** Decided 2026-08-18 — not loaded
at session start, because most sessions here never delegate and its ~19 KB would be paid on
all of them. Load it at the moment you are about to choose a model, so the choice comes from
its score table rather than recollection.

## Session start

1. `karpathy-guidelines` — once, so every edit this session is surgical and goal-verified.
2. `t4-agent-memory` — read `Obsidian-StatusHub/Home.md`, then `docs/OPEN-WORK-LEDGER.md`, then
   the issue you are picking up. Skim the index and open one slice; do not preload the graph.
3. Route the task through `using-t4`.
4. **At session end** — report every rule that did not hold as a `skill-feedback` issue on
   `xenodeve/xeno-skills`. Comment on the existing issue for that rule; do not open a second.

## Repo layout

```
Obsidian-StatusHub/        the team memory vault — Home.md is the index
docs/
  agents/                  how this repo is operated (read these before changing process)
    domain.md              THE GLOSSARY — read before writing any code
    workflow.md            grill → PRD → issues → TDD → PR
    issue-tracker.md       where issues live and how to drive them
    triage-labels.md       label vocabulary
    skill-consumer-rules.md  how the skills read CONTEXT.md and the ADRs
  adr/                     architecture decision records
  superpowers/specs/       design specs
  OPEN-WORK-LEDGER.md      what is open right now
DONE.md                    ship log
.claude/                   hooks + the T4 marker
.githooks/                 agent-agnostic pre-push guards
```

## Commands

Bun is the package manager — commit `bun.lock`, use `bunx`.

```bash
bun install
bun run dev          # Next.js dev server
bun run verify       # lint + typecheck + test + build   (the fast gate)
bun run sync:collector  # regenerate the collector's copy of lib/ before deploying
```

`bun run verify` is the command `.claude/t4.json` arms as the local ship gate. Keep it fast
and keep it in sync with `.github/workflows/t4-verify.yml`.

## Writing conventions

**Chat, reports and status updates are Thai** — the developer's language. Identifiers stay
English and byte-exact: paths, commands, flags, branch names, labels, config keys, error
strings. Do not translate a thing the developer will copy, paste or search.

Load `t4-bro` before writing anything the developer reads. A term earns its English three
ways only: it is an identifier, the developer already uses it, or precision would be lost —
and in that last case land its meaning in the same sentence.

**Tracker bodies are bilingual** — issue, PRD and PR bodies carry English plus a full Thai
mirror of the same depth. A mirror is not a summary.

**Code, commit messages and inline comments are English.**

## Notifying the developer

One notification when a batch lands or a real decision is needed — not per-item progress.
An unattended run reports once, and the digest **enumerates** every gate as ran / not-run /
n-a. A list of what ran, with the skipped ones simply absent, reads as completeness and is
how gates quietly go to zero.

## The rules that do not bend

- **Evidence before verdict.** *fixed · works · passes · safe · done · the root cause is* each
  need the command you ran, its output, or the `file:line` you read, named alongside. Else it
  is a **hypothesis** and must say so. "Tests not run" is a complete sentence.
- **Root cause before fix.** Reproduce, trace the failing path, falsify, then propose.
- **Skipping a rule needs a checkable fact, not a judgment.** "Small", "obvious", "unrelated"
  are not proofs. No proof → follow the skill. An unstated skip is a violation.
- **PRD → issues → PR.** Never a PR without a referenced issue.
- **TDD is mandatory** for features and bugfixes.
- **Verify every frontend change end-to-end.** Unit tests cannot see real layout or hydration.
- **Never hardcode a key, not even as a fallback.** No key means the check reports grey. It
  never means quietly borrowing another one.
- **The glossary is load-bearing.** `docs/agents/domain.md` fixes what the words mean here,
  and three of them mean different kinds of "we do not know". Read it before writing code.

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues on `xenodeve/status-hub`, driven by the `gh` CLI.
See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, label strings unchanged, plus T4's Type / Component / Severity
groups. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root.
See `docs/agents/skill-consumer-rules.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
