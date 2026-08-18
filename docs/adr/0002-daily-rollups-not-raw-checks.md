# ADR 0002 — Store a daily rollup per component; a green check writes nothing

- **Status:** Accepted (2026-08-18) — implemented
- **Area:** Backend
- **Related:** [0001](0001-supabase-runs-the-collector.md), [0003](0003-an-unchecked-component-gets-no-reading.md), [#10](https://github.com/xenodeve/status-hub/issues/10)

## Context

The obvious storage shape is a row per check. It is what the reference implementation
(`pakorn269/open-status-page`) does, and it makes every later question answerable.

It also does not fit. At ten components checked every minute:

```
10 × 1,440 checks/day = 14,400 rows/day
× 90 days             = 1,296,000 rows
× ~200 bytes + index  ≈ 400–500 MB
```

Supabase Free stops writes at **500 MB** — read-only mode, not a warning. The raw table alone
reaches the ceiling in about three months.

The second observation is that nobody was going to read those rows. The history bar this product
copies — Claude Status — is **one bar per day**. Ninety days of per-minute data was being stored to
render ninety values.

## Decision

Nothing is written per check during normal operation.

1. **`daily_rollups`** — one row per component per day, updated in place: counters per status, a
   fixed-size latency histogram, the day's worst status, and how many checks actually ran. Every
   history bar at every time range is drawn from this table. ~1 MB/year. Permanent, never pruned.
2. **`component_state`** — one row per component, updated in place. Carries `last_checked_at`, which
   is how the page distinguishes "everything is fine" from "the collector died three hours ago".
3. **`check_samples`** — full-resolution rows, written **only while a component is not operational**
   (`lib/collector.ts:86`). Quiet during normal running; detailed for exactly the window anyone
   would look back at.
4. **A day with no row means we did not check that day.** Absence *is* the signal. Never insert a
   placeholder — a "no data" row would make "we checked and all was well" indistinguishable from
   "we never looked".

`addSample` in `lib/rollup.ts` is the only code that knows how a status contributes to a day, so the
counters, the histogram and the colour cannot disagree.

## Alternatives considered

- **Raw rows with a 90-day prune.** Rejected — the arithmetic above shows 90 days of raw data is
  already the whole budget, so the prune buys nothing and the table still cannot grow.
- **Raw rows on a paid tier.** Rejected — paying to store data that is aggregated away before anyone
  reads it.
- **Rollup only, no samples at all.** Rejected — when something breaks, per-minute detail for the
  broken window is exactly what a post-mortem needs. Storing it only while broken is nearly free.

## Consequences

- **Positive:** ten years of history stays under about 20 MB. Nothing needs pruning, so "how far
  back can we look" has no answer that shrinks over time. Verified on the first live run: 33
  components produced 33 rollups and **zero** samples.
- **Negative / limits:** per-minute latency for a *normal* day is not recoverable — the histogram
  gives approximate percentiles, and precise numbers exist only for windows that were not green.
  The rollup update is read-modify-write, so two overlapping collector runs would lose an update
  ([#6](https://github.com/xenodeve/status-hub/issues/6) proposes an atomic SQL upsert).
- **Follow-ups:** a component stuck in a non-green state writes a sample every five minutes forever,
  which is bounded but buys nothing after the first few — [#10](https://github.com/xenodeve/status-hub/issues/10).
