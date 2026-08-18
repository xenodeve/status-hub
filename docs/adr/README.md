# Architecture Decision Records

Each ADR captures one significant, hard-to-reverse decision: its context, what was chosen, the
alternatives rejected, and the consequences. They document decisions **already in the codebase**
(unless marked *pending*), so a new maintainer — human or agent — can recover the *why* without
re-deriving it. A decision that overturns an earlier one marks the old ADR **Superseded**.

| # | Title | Area | Status |
|---|-------|------|--------|
| [0001](0001-supabase-runs-the-collector.md) | Supabase runs the collector; Vercel only serves the page | Infra | Accepted |
| [0002](0002-daily-rollups-not-raw-checks.md) | Store a daily rollup per component; a green check writes nothing | Backend | Accepted |
| [0003](0003-an-unchecked-component-gets-no-reading.md) | A component that was not checked gets no reading, not a status | Backend | Accepted |

## Conventions

Naming is `NNNN-short-kebab-title.md`, numbered in the order decided and globally unique. A
superseded record is never deleted — the reasoning is the point, and a decision that was later
reversed is the most useful record in the directory.

Ground every claim in the code as it is now and cite `file:line`. An ADR describing an intention the
code does not reflect is a landmine.
