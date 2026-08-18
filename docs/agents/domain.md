# Domain glossary — Status Hub

**Read this before writing code.** These words appear in table names, column names and function
names. Several of them are close enough to each other that using the wrong one produces a bug the
tests cannot catch — because the test would be written from the same misunderstanding.

## The things we watch

**source** — one provider we monitor. `9arm gateway`, `Anthropic`, `OpenAI`, `Google`, and later
this team's own websites. A source has exactly one **adapter** and one or more **components**.

**adapter** — the code that turns one source's reply into our shape. Each source speaks a different
language (Statuspage JSON, an RSS feed, a LiteLLM health endpoint, plain HTTP), and the adapter is
the only place that knows which. Adding a source means writing one adapter and nothing else.

**component** — the smallest thing that can be up or down on its own. `Claude API` is a component
of Anthropic; `deepseek-v4-flash` is a component of the 9arm gateway. Uptime, incidents and the
history bar all attach to a component, never to a source.

**family** and **variant** — a model's name carries its version: `deepseek-v4-flash-0731`. When the
gateway rotates to `-0815` that is the **same family, a new variant**. The component — and therefore
all of its history — is the *family*. The variant is recorded as a change within it. Getting this
backwards resets every uptime bar to empty on every model rotation, which for this gateway is often.

## The things we do

**check** — one execution of an adapter against a source. Cheap ones run every minute.

**probe** — a check that sends a **real inference request** to a model and measures what comes back.
A probe costs tokens and hits somebody's gateway, so probes run every five minutes, use
`max_tokens: 1`, and every one can be switched off per-component from the database.

Every probe is a check. Not every check is a probe. When the code says `check` it must accept both.

**sample** — the stored result of one check: timestamp, status, latency, raw payload. **Samples are
written only while a component is not green.** During normal operation nothing is stored per check,
which is what keeps the database inside the free tier.

**rollup** — one row per component per day, updated in place on every check: uptime percent, a
latency histogram, the day's worst status, and how many checks actually ran. This is what every
history bar is drawn from, at every time range. It is permanent.

**strike** — how many consecutive checks have agreed. Three strikes open an incident; three of the
opposite close it. One bad check is a network hiccup, not an outage.

## Status — and the three different ways of not knowing

This is the part that goes wrong. Four of these values mean some kind of "no", and they are not
interchangeable.

| Value | Means | Whose problem |
|---|---|---|
| `operational` | Answered, within the latency threshold | — |
| `degraded` | Answered, but too slow — or `429`, rate-limited | theirs |
| `down` | `5xx`, a timeout, or the connection failed | theirs |
| `misconfigured` | `401` / `403` — we hold no valid credential | **ours** |
| `unknown` | The check itself could not run — our network, our function crashed | **ours** |
| `stale` | `last_checked_at` is older than the expected interval — the collector is not running | **ours** |
| `no-data` | That day has no rollup row at all — nothing checked that day | — |

**`no-data` is the absence of a row, not a value stored in one.** A day we checked has a row; a day
we did not has nothing. That is the whole mechanism — do not add a "no-data" row, because writing
one makes "we checked and found nothing wrong" indistinguishable from "we never looked".

**`stale` is not stored either.** It is computed when the page renders, by comparing
`last_checked_at` against now. A dashboard that shows green because it stopped checking is the
failure mode this exists to prevent.

**`misconfigured` must never be reported as `operational`.** A `401` is below `500`, and the
obvious `status < 500` test therefore calls an expired key healthy. That is a false green, and a
false green is worse than no monitoring — it answers the question confidently and wrongly.

## Incidents

**incident** — a period during which a component was not operational: when it started, when it
ended, how long, and what the symptom was.

**origin** — where the incident came from:

- `vendor` — pulled from the provider's own incident feed. They said it.
- `derived` — we concluded it from our own checks. Nobody else is reporting it.

`derived` is the reason this project exists. It is what catches *"the gateway is alive but this one
model has not answered in twenty minutes"* — a sentence no vendor status page will ever print.

Incidents attach to a component by **id**, never by matching its name. A renamed component with
name-matching creates a duplicate incident on every single run.
