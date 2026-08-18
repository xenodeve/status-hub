# Status Hub — Bug & Engineering Case Catalog (War Stories)

> Curated catalog of notable bugs and engineering cases. Each entry:
> **symptom → root cause → fix → the lesson**. Sourced from the dev log, the system-impact
> report, memory notes, and git history.

## ⭐ Top 3

1. [A status page that reports green while nothing works](#a-status-page-that-reports-green-while-nothing-works) — three variants, two of them ours
2. [The staleness threshold equalled the poll interval](#the-staleness-threshold-equalled-the-poll-interval)
3. [Light grey text on a light background, with every test passing](#light-grey-text-on-a-light-background-with-every-test-passing)

---

## A status page that reports green while nothing works

**Symptom:** three separate times, a component reported healthier than the evidence justified.

**Root cause:** each time, a shortcut that looked reasonable in isolation.

| Variant | The shortcut | Why it reads green |
|---|---|---|
| `ok = status < 500` | Treat any non-5xx as reachable | `401` from an expired key and `429` from a rate limit both pass |
| A model in `/v1/models` is `operational` | A listing entry is evidence the model exists | Existing is not answering |
| …so mark it `unknown` instead | Grey is honest about not knowing | `storeSample` writes a row for anything not green — 8,640/day |

The first is from the reference implementation this project learned from, and it is deliberate
there: commit `d14e29a` reads *"use unauthenticated ping — 401 = operational, no token consumed"*,
which is sound for a keyless reachability ping. The bug is that the rule survived into the
authenticated model-probe path, where `401` means the thing genuinely does not work.

The second and third are ours, in consecutive commits. The third was caught by `/code-review` before
it ever ran.

**Fix:** `classify()` (`lib/status.ts:28`) is the single place a result becomes a status, and it maps
`401`/`403` to `misconfigured` and `429` to `degraded`. A component that was not checked gets no
reading at all — see [ADR 0003](../adr/0003-an-unchecked-component-gets-no-reading.md).

**Lesson:** every value in a status vocabulary is a *claim about the thing being watched*. When you
reach for one to express "we did not look", there is no correct choice — the absence of a reading is
what says that. A green nobody measured is worse than no monitoring, because it answers confidently
and wrongly and people stop checking. *(`Obsidian-StatusHub/status-must-not-overclaim.md`, ADR 0003)*

---

## The staleness threshold equalled the poll interval

**Symptom:** would have shown "Not currently checking — this page may be out of date" across the
whole board, once every five minutes, on a completely healthy system.

**Root cause:** `MAX_GAP_MS` was five minutes and `pg_cron` runs every five minutes. The collector
captures `now` once and writes it to all 34 rows, so every component crosses the threshold at the
same instant — and the next run needs ~10 s to write. Measured on the live table mid-cycle: the
board sat **288 s old against a 300 s threshold**.

**Fix:** `lib/queries.ts:19` — twelve minutes. Two missed cycles plus the run time is the honest bar
for "something is wrong".

**Lesson:** a freshness threshold is not a property of the reader; it is a property of the writer's
cadence, and it has to be **strictly greater** with room for the write to finish. Equal is the one
value guaranteed to alarm on healthy behaviour. Check thresholds against the schedule that feeds
them, not against what feels recent. *(found by `/scrutinize`)*

---

## Light grey text on a light background, with every test passing

**Symptom:** the first render of the page was unreadable — near-invisible text. 92 unit tests green,
lint and typecheck clean, build successful.

**Root cause:** `app/globals.css` honoured `prefers-color-scheme`, so a light-mode browser got a
light background, while every component class was written for a dark one (`text-neutral-100`,
`bg-neutral-800`). The CSS and the components each assumed the other's opposite.

**Fix:** commit to one dark theme and delete the light branch. A dashboard left open all day, opened
most often when something has gone wrong, does not need two palettes — and supporting both means
every status colour has to work on two backgrounds.

**Lesson:** unit tests cannot see rendering. Not "did not happen to cover it" — *structurally
cannot*. For a product whose entire meaning is the difference between one colour and another, the
browser is the test, and a claim of `verify=ran` that did not include opening the page is not
evidence of anything. This is why `docs/agents/workflow.md` requires looking at frontend changes.
