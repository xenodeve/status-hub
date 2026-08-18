# Ship log

Newest first. One line per shipped thing: what changed, why it mattered, and the evidence. This is
what a future session reads to learn what has already been tried.

## 2026-08-18 — Status Hub goes from an empty folder to a running system

**Shipped.** The T4 operating layer, a Next.js 16 page, a Supabase schema, four source adapters, and
a collector running every five minutes.

**Evidence, not claims.** 92 unit tests green. The first live collector run wrote 33 components,
33 daily rollups, 33 status events and **zero check samples** across Anthropic, OpenAI, Google and
the 9arm gateway, in 11 seconds — zero samples is the storage design working, not an assertion about
it. `get_advisors` security returns no lints. The page was opened in a browser and looked at, which
caught a light-on-light rendering bug that every unit test passed straight through.

**What is deliberately not done.** No fallback API key anywhere. No openCode source, because which
openCode to watch is an unanswered question ([#3](https://github.com/xenodeve/status-hub/issues/3)).
No required status checks on `main`, because GitHub Actions is billing-locked and a check that can
never pass is worse than no check ([#2](https://github.com/xenodeve/status-hub/issues/2)).

Commits `a5595d3` through `245d70f`.
