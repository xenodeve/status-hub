# Platform limits that shaped the architecture

Measured 2026-08-18. These are the constraints the design is built around; changing any of them
would reopen a decision.

**Vercel Cron on Hobby fires once per day.** This is why Vercel is not the poller. Any frequency
finer than daily needs Pro at $20/month. Vercel serves the page and nothing else.

**Supabase Cron (`pg_cron`) runs on Free, down to every second.** This is why the collector lives in
Supabase. Their guidance is no more than 8 concurrent jobs; we use three.

**Supabase Free stops writes at 500 MB of database size** — read-only mode, not a warning. Storing
every check would reach that in roughly three months at ten components, which is the entire reason
for the rollup design in `docs/agents/domain.md`.

**Supabase Free pauses a project after 7 days of low activity.** Not a risk here: the collector
writes every minute.

**Supabase Free realtime: 200 concurrent connections, 2M messages/month.** The page must fall back
to polling when it cannot subscribe, rather than showing nothing.

**Vercel advises against putting a proxy in front of it** — it breaks their firewall's view of the
real client IP and adds a second CDN layer. Cloudflare is DNS-only here, grey cloud.

**A public repo is scanned continuously.** The reference implementation
(`pakorn269/open-status-page`) shipped a gateway key as a fallback in
`supabase/functions/health-check/index.ts:120`. This repo forbids a fallback key anywhere: no key
means the check reports grey.
