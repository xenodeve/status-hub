---
name: platform-limits
description: The free-tier ceilings that shaped the architecture — measured 2026-08-18, not assumed
type: project
---

Changing any of these reopens a design decision, so check here before proposing one.

**Vercel Cron on Hobby fires once per day.** This is why Vercel is not the poller. Any finer cadence
needs Pro at $20/month. Vercel serves the page and nothing else.

**Supabase Cron (`pg_cron`) runs on Free, down to every second.** This is why the collector lives in
Supabase. Their guidance is no more than 8 concurrent jobs; we use one.

**Supabase Free stops writes at 500 MB of database size** — read-only mode, not a warning. Storing
every check would reach that in roughly three months at ten components, which is the entire reason
for the rollup design. See `docs/agents/domain.md`.

**Supabase Free pauses a project after 7 days of low activity.** Not a risk here: the collector
writes every five minutes.

**Supabase Free realtime: 200 concurrent connections, 2M messages/month.** The page falls back to
polling when it cannot subscribe, rather than silently showing stale data.

**Vercel advises against putting a proxy in front of it** — it breaks their firewall's view of the
real client IP and adds a second CDN layer. Cloudflare is DNS-only here, grey cloud.

**GitHub Actions on this account is billing-locked** and has never executed a step, so no CI check
has ever run. Required status checks are deliberately not armed — see
[#2](https://github.com/xenodeve/status-hub/issues/2).

Related: [[no-fallback-credentials]], [[status-must-not-overclaim]]
