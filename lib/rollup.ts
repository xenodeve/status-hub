/**
 * One row per component per day, updated in place. This replaces storing a row
 * per check — at ten components that would reach Supabase's 500 MB free-tier
 * ceiling in about three months. See docs/memory/platform-limits.md.
 */

import type { Status } from "./status";

/** Upper bounds, in milliseconds. The last bucket catches everything slower. */
export const BUCKETS = [100, 250, 500, 1_000, 3_000, Infinity] as const;

export type LatencyBuckets = Record<string, number>;

export type Rollup = {
  checkCount: number;
  latencyBuckets: LatencyBuckets;
  worstStatus: Status | null;
};

export type Sample = { status: Status; latencyMs: number | null };

/**
 * How bad each status is for the day's colour. Our own failures rank *below* a
 * real outage: one flaky check must never hide a genuine incident behind grey.
 */
const SEVERITY: Record<Status, number> = {
  operational: 0,
  unknown: 1,
  misconfigured: 2,
  degraded: 3,
  down: 4,
};

export function worst(a: Status, b: Status): Status {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

export function emptyRollup(): Rollup {
  const latencyBuckets: LatencyBuckets = {};
  for (const bound of BUCKETS) latencyBuckets[String(bound)] = 0;
  return { checkCount: 0, latencyBuckets, worstStatus: null };
}

export function addSample(rollup: Rollup, sample: Sample): Rollup {
  const latencyBuckets = { ...rollup.latencyBuckets };

  // A check that never answered has no latency to record — counting it as fast
  // would flatter the percentiles with time that was never measured.
  if (sample.latencyMs !== null) {
    const bound = BUCKETS.find((b) => sample.latencyMs! <= b) ?? BUCKETS[BUCKETS.length - 1];
    latencyBuckets[String(bound)] += 1;
  }

  return {
    checkCount: rollup.checkCount + 1,
    latencyBuckets,
    worstStatus: rollup.worstStatus === null ? sample.status : worst(rollup.worstStatus, sample.status),
  };
}

/** Checks that reached them at all — the denominator uptime is a fraction of. */
export type ReachCounts = { operational: number; degraded: number; down: number };

export function uptimePct(counts: ReachCounts): number | null {
  const reached = counts.operational + counts.degraded + counts.down;
  if (reached === 0) return null;

  // Degraded counts as up. It answered — slowly, but it answered.
  return ((counts.operational + counts.degraded) / reached) * 100;
}

/**
 * Approximate, read off the histogram. Returns the upper bound of the bucket the
 * percentile falls in, so the answer is "at most this", never a precise number
 * we did not keep the samples to compute.
 */
export function percentile(rollup: Rollup, p: number): number | null {
  const total = Object.values(rollup.latencyBuckets).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const target = (p / 100) * total;
  let seen = 0;
  for (const bound of BUCKETS) {
    seen += rollup.latencyBuckets[String(bound)];
    if (seen >= target) return bound;
  }
  return BUCKETS[BUCKETS.length - 1];
}
