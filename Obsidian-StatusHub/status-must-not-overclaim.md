---
name: status-must-not-overclaim
description: The invariant the product rests on — a status claims exactly what was observed, never more
type: project
---

**Every status value claims exactly what was observed. A green that nobody measured is worse than
no monitoring at all**, because it answers the question confidently and wrongly, and people stop
checking.

This invariant has been violated three separate ways already, twice by code written for this
project. Each looked reasonable in isolation.

**`status < 500` means healthy.** The reference implementation used this test. A `401` from an
expired key and a `429` from a rate limit both pass it, so a gateway nobody could call reported
green. `lib/status.ts` now maps `401`/`403` to `misconfigured` and `429` to `degraded`.

**A model that appears in a listing is operational.** `/v1/models` returning a name is evidence the
gateway serves it, not evidence it answers. Marking those `operational` was a green nobody observed.

**Marking them `unknown` instead.** The obvious correction, and worse: `storeSample` writes a
forensic row for anything not green, so every listed model would have written one every five
minutes forever — the 500 MB blowout in [[platform-limits]]. A component that was not checked now
gets **no reading at all**; it is registered so its name and first-seen date exist, and nothing else
is written. See `DiscoveredComponent` in `lib/adapters/types.ts`.

**The general shape of the mistake:** reaching for a status value to express "we did not look".
There is no such value, because every value in the vocabulary is a claim about the thing being
watched. The absence of a reading is what says we did not look — a day with no rollup row, a
component with no state. That is also why `no-data` is the absence of a row rather than a value
stored in one.

When adding a status, ask what observation justifies it. If the answer is "none, but we need
something to display", the answer is to display nothing.

Related: [[no-fallback-credentials]], `docs/agents/domain.md`
