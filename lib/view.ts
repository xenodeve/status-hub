/**
 * What the page shows, derived from what the database stores. Pure, because the
 * two rules here are the ones a rendering bug would hide: a page that keeps
 * showing green after the collector died, and a gap in history drawn as if it
 * were a good day.
 */

import type { Status } from "./status";

/** `stale` is never stored — it is computed at render time. See docs/agents/domain.md. */
export type DisplayStatus = Status | "stale";

export type StateRow = {
  status: Status;
  lastCheckedAt: string | null;
};

export type RollupRow = {
  /** `YYYY-MM-DD`. */
  day: string;
  worstStatus: Status;
  checkCount: number;
  uptimePct: number | null;
};

export type Bar = {
  day: string;
  /** Null means no row for that day: we did not check. Not "nothing was wrong". */
  status: Status | null;
};

/**
 * A stored status is only as good as the moment it was written. Once the gap
 * since the last check exceeds what the schedule allows, the honest answer is
 * that we do not know — whatever the row still says.
 */
export function effectiveStatus(row: StateRow, now: Date, maxGapMs: number): DisplayStatus {
  if (!row.lastCheckedAt) return "stale";
  const gap = now.getTime() - new Date(row.lastCheckedAt).getTime();
  return gap > maxGapMs ? "stale" : row.status;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function buildBars(rollups: RollupRow[], days: number, today: Date): Bar[] {
  const byDay = new Map(rollups.map((r) => [r.day, r]));

  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - (days - 1 - i));
    const day = isoDay(d);
    return { day, status: byDay.get(day)?.worstStatus ?? null };
  });
}

/** Worst first — the banner reports the worst thing currently true. */
const BANNER_ORDER: DisplayStatus[] = [
  "down",
  "degraded",
  "misconfigured",
  "stale",
  "unknown",
  "operational",
];

export function overallStatus(statuses: DisplayStatus[]): DisplayStatus {
  // Nothing to report is not the same as everything being fine.
  if (statuses.length === 0) return "stale";
  return BANNER_ORDER.find((s) => statuses.includes(s)) ?? "operational";
}
