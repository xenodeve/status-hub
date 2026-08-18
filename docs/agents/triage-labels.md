# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

---

## The T4 delta

pocock stops at the five triage roles above. T4 adds three orthogonal groups. An issue carries
**one role**, **one type**, **one or more components**, and — when it is a bug or a security
issue — **one severity**.

### Type

| Label | Meaning |
|---|---|
| `bug` | Something behaves differently from what the spec or the code claims |
| `feature` | New capability |
| `chore` | Maintenance with no behaviour change — deps, config, tooling |
| `docs` | Documentation only |
| `security` | Touches a trust boundary — keys, tokens, RLS, anything that could leak or grant |

### Component

| Label | Meaning |
|---|---|
| `adapter` | One source's translation layer — statuspage, litellm, rss, gcp, http-probe |
| `collector` | The scheduled run: pg_cron, the Edge Function, rollups, incident lifecycle |
| `web` | The Next.js page and everything the public sees |
| `infra` | Supabase config, Vercel, DNS, CI, hooks, guards |

### Severity

`critical` · `major` · `minor`

**A `security` issue must carry `critical` or `major`.** There is no minor security issue: if it
genuinely cannot hurt anyone it is not a security issue, and if it can, it is not minor. This rule
exists so severity cannot be used to quietly de-prioritise a trust-boundary problem.

### Also

`blocked` — scoped, but waiting on a named blocker. Name the blocker in the body; a `blocked`
label with no named blocker is indistinguishable from an abandoned issue.

### Reporting a gap

If the vocabulary here names a label that does not exist in the tracker, **say so** — do not
proceed silently. A documented vocabulary with no labels behind it looks identical to a working
one right up until the first triage query returns nothing.
