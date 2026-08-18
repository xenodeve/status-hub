/**
 * One row per component per day, updated in place. This replaces storing a row
 * per check — at ten components that would reach Supabase's 500 MB free-tier
 * ceiling in about three months. See docs/memory/platform-limits.md.
 *
 * Everything a daily row holds is accumulated here, by `addSample`, so there is
 * exactly one place that knows how a status contributes to a day.
 */

import type { Status } from "./status";

/** Upper bounds, in milliseconds. The last bucket catches everything slower. */
export const BUCKETS = [100, 250, 500, 1_000, 3_000, Infinity] as const;

export type LatencyBuckets = Record<string, number>;

/** Checks that reached them at all — the denominator uptime is a fraction of. */
export type Counts = {
  operational: number;
  degraded: number;
  down: number;
  /** `unknown` + `misconfigured`: our failures, excluded from their uptime. */
  unreachable: number;
};

export type Rollup = {
  checkCount: number;
  counts: Counts;
  latencyBuckets: LatencyBuckets;
  worstStatus: Status;
};

export type Sample = { status: Status; latencyMs: number | null };

/**
 * How bad each status is for the day's colour. Our own failures rank *below* a
 * real outage: one flaky check must never hide a genuine incident behind grey.
 */
export const SEVERITY: Record<Status, number> = {
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
  // `operational` is the identity of `worst`, so it seeds the day without
  // needing a null case that the NOT NULL column could never store anyway.
  return {
    checkCount: 0,
    counts: { operational: 0, degraded: 0, down: 0, unreachable: 0 },
    latencyBuckets,
    worstStatus: "operational",
  };
}

const COUNTED: Record<Status, keyof Counts> = {
  operational: "operational",
  degraded: "degraded",
  down: "down",
  unknown: "unreachable",
  misconfigured: "unreachable",
};

export function addSample(rollup: Rollup, sample: Sample): Rollup {
  const latencyBuckets = { ...rollup.latencyBuckets };

  // A check that never answered has no latency to record — counting it as fast
  // would flatter the percentiles with time that was never measured.
  if (sample.latencyMs !== null) {
    const bound = BUCKETS.find((b) => sample.latencyMs! <= b) ?? BUCKETS[BUCKETS.length - 1];
    latencyBuckets[String(bound)] += 1;
  }

  const bucket = COUNTED[sample.status];
  return {
    checkCount: rollup.checkCount + 1,
    counts: { ...rollup.counts, [bucket]: rollup.counts[bucket] + 1 },
    latencyBuckets,
    worstStatus: worst(rollup.worstStatus, sample.status),
  };
}

export function uptimePct(counts: Pick<Counts, "operational" | "degraded" | "down">): number | null {
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
