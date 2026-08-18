# Status Hub — System-Impact Change & Tech-Debt Report

> Curated, report-level record of changes that **affect the running system** plus the
> **tech-debt register**. Audience: team / stakeholders / status reports. Append a dated
> section per significant batch; keep entries terse + linkable. Write "not measured" / "N/A"
> honestly — never fabricate numbers.

## 2026-08-18 — Status Hub, empty folder to running system (feature)

**Scope:** whole repo · **Type:** initial build — T4 operating layer, schema, four source adapters,
collector, public page · **Tests:** 115/115 green (115 new); typecheck clean; E2E **not run** — no
suite exists ([ledger, UNTRACKED](../OPEN-WORK-LEDGER.md))

**What & where:** `lib/status.ts` (`classify`), `lib/collector.ts` (`transition`, the 3-strike
incident rule), `lib/rollup.ts` (`addSample`, `dayStatus`), `lib/model-name.ts` (`familyOf`),
`lib/adapters/{statuspage,litellm,gcp}.ts`, `lib/{view,queries,totals}.ts`, `app/page.tsx`,
`supabase/migrations/20260818000100_initial_schema.sql`, `supabase/functions/collect/index.ts`.

**Why:** the team uses several AI gateways at once and had no way to answer "is it us or them"
without opening five vendor pages — and the gateway it uses most has no status page at all.

**Before → After:** nothing → 34 components across Anthropic, OpenAI, Google and the 9arm gateway,
checked every five minutes, with permanent daily history and incidents we derive ourselves.

**Performance Δ:** collector run ≈ 10 s wall clock for 34 components (~230 sequential round trips —
[#6](https://github.com/xenodeve/status-hub/issues/6)). Page, production build, measured before and
after the SVG history strip: 90-day view **1.05 MB / 5.0 s → 112 KB / 0.53 s**; 365-day view
**4.12 MB / 13.2 s → 159 KB / 0.52 s**.

**Quality:** first live run wrote 33 components, 33 rollups, 33 status events and **zero**
check_samples — the storage design in [ADR 0002](../adr/0002-daily-rollups-not-raw-checks.md)
behaving as designed rather than asserted. `get_advisors` security: no lints. RLS is select-only for
`anon` on all seven tables.

**Validation:** 115 unit tests over the pure logic — status classification, the incident state
machine, rollup arithmetic, model-family normalisation, view rules, and all three adapters against
real payloads captured 2026-08-18. Collector invoked directly three times and the resulting rows
inspected. Page opened in a browser at both ranges. **Not run:** any E2E suite; the LiteLLM
`/health` reader has never seen a real response ([#4](https://github.com/xenodeve/status-hub/issues/4)).

**Risk / rollback:** the deployed Edge Function is versioned (currently v3) and revertible from the
Supabase dashboard. `pg_cron` job `collect-every-5-min` is a single row; unschedule it to stop all
writes. The page degrades to a configuration notice without its two environment variables rather
than failing.

**Links:** [#1](https://github.com/xenodeve/status-hub/issues/1)
[#2](https://github.com/xenodeve/status-hub/issues/2)
[#3](https://github.com/xenodeve/status-hub/issues/3)
[#4](https://github.com/xenodeve/status-hub/issues/4)
[#6](https://github.com/xenodeve/status-hub/issues/6)
[#7](https://github.com/xenodeve/status-hub/issues/7)
[#10](https://github.com/xenodeve/status-hub/issues/10) ·
ADR [0001](../adr/0001-supabase-runs-the-collector.md)
[0002](../adr/0002-daily-rollups-not-raw-checks.md)
[0003](../adr/0003-an-unchecked-component-gets-no-reading.md) ·
commits `a5595d3`…`0814219`

---

## Tech-debt register

| Item | Cost if left | Tracked |
|---|---|---|
| ~230 sequential round trips per collector run | ~10 s of an Edge Function's budget every five minutes, and a rollup read-modify-write that loses updates if two runs overlap | [#6](https://github.com/xenodeve/status-hub/issues/6) |
| No adapter interface or registry | Adding a source touches five places instead of the two the domain doc promises; multi-request protocols leak into the collector | [#7](https://github.com/xenodeve/status-hub/issues/7) |
| No E2E suite | Frontend correctness rests on someone remembering to open the page | 🔴 UNTRACKED — ledger |
| `components.thresholds` stored but never read | Latency policy is data in the schema and a literal in the code; tuning needs a deploy | 🔴 UNTRACKED — ledger |
| `readHealth()` written against documented, unverified payload shape | Degrades to discovery rather than lying, but unconfirmed | [#4](https://github.com/xenodeve/status-hub/issues/4) |
| CI has never executed a step | Every quality claim rests on a local gate that binds only agent-run commands | [#2](https://github.com/xenodeve/status-hub/issues/2) |
