# Open work ledger

Everything currently open, in one place, so a fresh session recovers state without reading the
whole tracker. The tracker is the source of truth; this is the index into it.

**Update this in the same commit as the work.** A ledger that lags is worse than none, because it
is read as current.

## Parked — needs the developer

| Item | Where | Why it is parked |
|---|---|---|
| **GitHub Actions is billing-locked** ([#2](https://github.com/xenodeve/status-hub/issues/2)) | `.github/workflows/t4-verify.yml` | Every job reports *"The job was not started because your account is locked due to a billing issue"*. The workflow is correct and has never executed a step. **Nothing in CI can be trusted until this is resolved**, and required status checks are deliberately NOT armed on `main` — a required check that can never run makes the branch permanently unmergeable. The local `bun run verify` gate is armed and green, which binds agent-run merges only. |
| **Which openCode to watch** ([#3](https://github.com/xenodeve/status-hub/issues/3)) | spec §14 | `status.opencode.de` is openCode, the German public-sector platform — its components are `opencode.de`, `gitlab`, `discourse`, `DevGuard`. It is not `opencode.ai`, the AI coding agent, which has no status page at all (`status.opencode.ai` does not resolve). Three options: watch the German one, probe `opencode.ai` over plain HTTP, or drop it. No source row and no RSS adapter exist until this is answered. |
| **9arm gateway credential** ([#4](https://github.com/xenodeve/status-hub/issues/4)) | Supabase function secrets | `GATEWAY_9ARM_KEY` is unset, so the collector reports the gateway from `/health/readiness` only and no models are discovered. Setting it turns on discovery; a master key additionally turns on LiteLLM's own per-model health. The collector holds no fallback key by design. |

## Open

| Item | Where | State | Next action |
|---|---|---|---|
| End-to-end test suite | — | not started | There is none. Frontend changes are currently verified by opening the page and looking, which is what caught the first render's light-on-light bug. Worth a Playwright suite once CI can actually run it. |
| LiteLLM `/health` payload shape | `lib/adapters/litellm.ts` | **hypothesis, not verified** | The reader is written against LiteLLM's documented response and has never seen a real one — it needs a master key. If the real shape differs the reader returns `[]` and the collector falls back to discovery, so a wrong guess degrades rather than lies. |
| Inference probes | `components.probe_enabled` | off for every component, and nothing reads the column | Discovery registers a model without checking it, so a discovered model has no status at all until a probe exists. Turning one on spends tokens on someone else's gateway, so it stays a deliberate per-model decision. |
| [#6](https://github.com/xenodeve/status-hub/issues/6) collector round trips | `supabase/functions/collect/index.ts` | open, `ready-for-agent` | ~7 sequential queries per component, ~230 per run, ~10 s wall clock. Batch the reads and writes; the rollup read-modify-write should become one atomic SQL upsert. |
| [#7](https://github.com/xenodeve/status-hub/issues/7) adapter registry | `supabase/functions/collect/index.ts` | open, `ready-for-agent` | Adding a source touches five places, not the two the domain doc promises. No adapter interface exists, so multi-request protocols live in the collector. |
| `components.thresholds` unused | `supabase/functions/collect/index.ts` | open | Latency thresholds are stored per component so they can be tuned without a deploy, but the collector hardcodes them. `classify` runs before the component id is resolved, so this needs the shape from #7. |
| OpenAI contributes 27 components | `lib/adapters/statuspage.ts` | works, but noisy | Their `summary.json` lists every component. Worth filtering to `showcase: true` if the page gets unwieldy. |
| Vercel environment variables ([#1](https://github.com/xenodeve/status-hub/issues/1)) | Vercel | deployed, not configured | Live at https://status-hub-sand.vercel.app rendering the configuration notice. Needs the two `NEXT_PUBLIC_*` variables. |

## Done

| Item | Evidence |
|---|---|
| Quality gates run and acted on | `/simplify` (4 agents) → `/code-review` (2 axes) → `/scrutinize`. Each found real defects and each finding was fixed or filed. See commits `8fde171`, `59f2ecb`, and the scrutinize commit. |
| Page cost cut 25× | The history strip became one SVG. Measured on a production build: 365-day view 4.12 MB / 13.2 s → 159 KB / 0.52 s; 90-day view 1.05 MB / 5.0 s → 112 KB / 0.53 s. |
| Two false alarms removed before anyone saw them | Staleness threshold equalled the cron period, so a healthy board went stale once a cycle — measured 288 s old against a 300 s bar. And a day's bar took its colour from the worst single check, so 1 failure in 288 painted the day red. |
| T4 operating layer | `CLAUDE.md`, `docs/agents/*`, hooks, guards, memory vault. Commit `a5595d3`. |
| Schema and RLS | Applied to Supabase project `zrqdzcnxjeoccsjxntxg`; `get_advisors` security returns no lints. |
| Status vocabulary and adapters | 92 tests green; fixtures are real payloads captured 2026-08-18. |
| Collector deployed and scheduled | First live run wrote 33 components / 33 rollups / **0 check_samples**, all operational, in 11s. `pg_cron` every 5 minutes. |
| Local ship gate armed | `.claude/t4.json` `verify` = `bun run verify`, measured green. |
