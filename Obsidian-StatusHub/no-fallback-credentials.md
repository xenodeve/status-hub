---
name: no-fallback-credentials
description: There is no fallback key anywhere; a missing credential reports misconfigured, and why that rule exists
type: project
---

**No credential may have a fallback value in source. Not for convenience, not for local
development, not "temporarily".** A missing key makes the check report `misconfigured` — grey, with
the reason shown — and never anything else.

The rule has a specific origin. The reference implementation this project learned from,
`pakorn269/open-status-page`, shipped exactly one line of convenience:

```ts
const effectiveKey = apiKey || 'sk-...';
```

at `supabase/functions/health-check/index.ts:120`. The intent was that the collector would still run
if someone forgot the environment variable. The effect was a live gateway key readable in a public
repository, introduced in a single commit and public from the moment it was pushed. A key that has
been pushed must be treated as compromised even after the line is deleted — GitHub caches history,
forks copy it, and scanners read new repositories continuously.

The convenience it bought was one environment variable. The cost was a credential that has to be
rotated.

**What to do instead:** let it fail loudly and visibly. `classify()` has a `no-credential` outcome
kind for this, and the page renders it as a component that says what is missing. A monitoring system
that cannot check something should say so — that is the same principle as
[[status-must-not-overclaim]], applied to our own configuration.

Related: [[platform-limits]]
