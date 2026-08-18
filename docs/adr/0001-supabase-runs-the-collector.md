# ADR 0001 — Supabase runs the collector; Vercel only serves the page

- **Status:** Accepted (2026-08-18) — implemented
- **Area:** Infra
- **Related:** [0002](0002-daily-rollups-not-raw-checks.md), [#2](https://github.com/xenodeve/status-hub/issues/2), `Obsidian-StatusHub/platform-limits.md`

## Context

The product needs a scheduled job that checks every source every few minutes and writes what it
found. The natural first arrangement — one Next.js app on Vercel owning both the page and the cron —
does not work on the free tier.

**Vercel Cron on the Hobby plan fires once per day.** The number of cron jobs is generous on every
plan; the *frequency* is not. A monitoring system that polls daily is not a monitoring system, so
this is a hard constraint rather than a preference. Lifting it costs $20/month.

**Supabase Cron (`pg_cron`) runs on the free tier down to every second.** The database we already
need for storage can also schedule the work, and `pg_net` fires the request without holding a
connection for the duration.

## Decision

Three services, each doing one thing:

1. **Supabase** owns the schedule and the data. `pg_cron` invokes the `collect` Edge Function every
   five minutes; the function writes to Postgres directly.
2. **Vercel** serves the Next.js page and nothing else. It holds no schedule, so it stays on Hobby.
3. **Cloudflare** is DNS only — the grey cloud, not a proxy. Vercel documents that a reverse proxy
   in front of it breaks their firewall's view of the client IP and adds a second CDN layer.

One cadence, not the two the design spec originally sketched. A full pass takes about ten seconds
and covers everything; a second schedule would add a second failure mode to buy resolution finer
than a daily bar can display.

## Alternatives considered

- **Vercel Pro, cron on Vercel.** Rejected — $20/month to co-locate a schedule with a page that does
  not need one. The split costs nothing and is arguably clearer.
- **GitHub Actions on a schedule.** Rejected — this account's Actions is billing-locked
  ([#2](https://github.com/xenodeve/status-hub/issues/2)) and has never executed a step. A scheduler
  that cannot run is worse than one that runs elsewhere.
- **Cloudflare Workers with Cron Triggers and D1.** Viable and free. Rejected because the page is
  Next.js, which Vercel runs natively, and D1's free tier caps daily row writes in a way Postgres
  does not.

## Consequences

- **Positive:** the whole system is $0/month at this scale, and each service is used for what it is
  best at. The collector is a single Deno function with no framework around it.
- **Negative / limits:** the collector's code lives in `supabase/functions/collect/` and is deployed
  separately from the web app, so the two can drift. `scripts/sync-collector-lib.ts` mitigates the
  half that matters — the shared logic — by generating the function's copy from `lib/`.
- **Follow-ups:** the deploy is currently manual through the Supabase MCP; there is no CI path for
  it while [#2](https://github.com/xenodeve/status-hub/issues/2) is open.
