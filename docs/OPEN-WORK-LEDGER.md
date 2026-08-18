# Open work ledger

Everything currently open, in one place, so a fresh session recovers state without reading the
whole tracker. The tracker is the source of truth; this is the index into it.

**Update this in the same commit as the work.** A ledger that lags is worse than none, because it
is read as current.

## Parked — needs the developer

| Item | Where | Why it is parked |
|---|---|---|
| **GitHub Actions is billing-locked** | `.github/workflows/t4-verify.yml` | Every job reports *"The job was not started because your account is locked due to a billing issue"*. The workflow is correct and has never executed a step. **Nothing in CI can be trusted until this is resolved**, and required status checks are deliberately NOT armed on `main` — a required check that can never run makes the branch permanently unmergeable. The local `bun run verify` gate is armed and green, which binds agent-run merges only. |
| **Which openCode to watch** | spec §14 | `status.opencode.de` is openCode, the German public-sector platform — its components are `opencode.de`, `gitlab`, `discourse`, `DevGuard`. It is not `opencode.ai`, the AI coding agent, which has no status page at all (`status.opencode.ai` does not resolve). Three options: watch the German one, probe `opencode.ai` over plain HTTP, or drop it. No source row and no RSS adapter exist until this is answered. |
| **9arm gateway credential** | `.claude` env on Supabase | `GATEWAY_9ARM_KEY` is unset, so the collector reports the gateway from `/health/readiness` only and no models are discovered. Setting it turns on discovery; a master key additionally turns on LiteLLM's own per-model health. The collector holds no fallback key by design. |

## Open

| Item | Where | State | Next action |
|---|---|---|---|
| End-to-end test suite | — | not started | There is none. Frontend changes are currently verified by opening the page and looking, which is what caught the first render's light-on-light bug. Worth a Playwright suite once CI can actually run it. |
| LiteLLM `/health` payload shape | `lib/adapters/litellm.ts` | **hypothesis, not verified** | The reader is written against LiteLLM's documented response and has never seen a real one — it needs a master key. If the real shape differs the reader returns `[]` and the collector falls back to discovery, so a wrong guess degrades rather than lies. |
| Inference probes | `components.probe_enabled` | off for every component | Discovery lists models but never probes them. Turning a probe on spends tokens on someone else's gateway, so it stays a deliberate per-model decision. |
| OpenAI contributes 27 components | `lib/adapters/statuspage.ts` | works, but noisy | Their `summary.json` lists every component. Worth filtering to `showcase: true` if the page gets unwieldy. |
| Deploy the web app | Vercel | not started | The page runs locally against the live database. Needs a Vercel project with the two `NEXT_PUBLIC_*` variables from `.env.example`. |

## Done

| Item | Evidence |
|---|---|
| T4 operating layer | `CLAUDE.md`, `docs/agents/*`, hooks, guards, memory vault. Commit `a5595d3`. |
| Schema and RLS | Applied to Supabase project `zrqdzcnxjeoccsjxntxg`; `get_advisors` security returns no lints. |
| Status vocabulary and adapters | 92 tests green; fixtures are real payloads captured 2026-08-18. |
| Collector deployed and scheduled | First live run wrote 33 components / 33 rollups / **0 check_samples**, all operational, in 11s. `pg_cron` every 5 minutes. |
| Local ship gate armed | `.claude/t4.json` `verify` = `bun run verify`, measured green. |
