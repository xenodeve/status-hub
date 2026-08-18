# ADR 0003 — A component that was not checked gets no reading, not a status

- **Status:** Accepted (2026-08-18) — implemented
- **Area:** Backend
- **Related:** [0002](0002-daily-rollups-not-raw-checks.md), [#4](https://github.com/xenodeve/status-hub/issues/4), `Obsidian-StatusHub/status-must-not-overclaim.md`

## Context

The 9arm gateway is discovered, not configured: `GET /v1/models` returns whatever it currently
serves, so models appear and disappear without a code change. That is the point — the gateway
rotates models often and a hardcoded list would need chasing.

It creates a question the status vocabulary has no answer for. A model in the listing is known to
exist. It has not been asked anything. What status does it have?

Two answers were tried and both were wrong, in opposite directions.

**`operational`.** Shipped first. A name in a listing is evidence the gateway serves the model, not
evidence the model answers. This is a green nobody observed — the exact failure this project was
built to avoid.

**`unknown`.** The obvious correction, and worse. `lib/collector.ts:86` is
`storeSample: status !== "operational"`, so every listed model would write a forensic row on every
run forever — roughly 8,640 rows a day at thirty models, which is the 500 MB ceiling in
[ADR 0002](0002-daily-rollups-not-raw-checks.md) reached deliberately. It also fed the
`unreachable` counter, so `uptimePct` returned null and the entire 9arm section would have rendered
grey with "no uptime data" permanently.

Both reviews caught the second one independently before it could run.

## Decision

A discovered component is **registered, not read**.

`DiscoveredComponent` (`lib/adapters/types.ts:40`) is deliberately not a `ComponentReading`. It
carries a key, a name and a variant — no status, no latency. `SourceReading.discovered` holds them,
and the collector's registration pass creates or updates the `components` row and writes nothing
else: no `component_state`, no `check_samples`, no `daily_rollups`.

The consequence is that a discovered model has no status at all until something probes it, and the
page shows no history for it — correctly, because there is none.

## Alternatives considered

- **A sixth status value, e.g. `not-checked`.** Rejected — every value in the vocabulary is a claim
  about the thing being watched, and "we did not look" is not such a claim. Adding one would put the
  same pressure on the next boundary case.
- **Don't register discovered models at all.** Rejected — then discovery has no observable effect
  until probing is enabled, and `first_seen_at` for a model is lost. Registering is cheap and the
  name is worth having.
- **Probe every discovered model so it has a real status.** Rejected as a default — probing spends
  tokens on someone else's gateway. It stays a deliberate per-model decision behind
  `components.probe_enabled`.

## Consequences

- **Positive:** the vocabulary keeps its meaning. `unknown` means only what
  `docs/agents/domain.md` says it means — our own check could not run — and no value in the set
  claims more than was observed.
- **Negative / limits:** the shape only exists because `storeSample` keys off "not operational". If
  that rule changes, re-check that this decision still holds. `probe_enabled` is stored but nothing
  reads it yet, so there is currently no path from `discovered` to a real reading.
- **Follow-ups:** [#4](https://github.com/xenodeve/status-hub/issues/4) sets the gateway key, which
  is what makes this path execute for the first time — it has never run with a real listing.
