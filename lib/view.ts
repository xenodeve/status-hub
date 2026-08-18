/**
 * What the page shows, derived from what the database stores. Pure, because the
 * two rules here are the ones a rendering bug would hide: a page that keeps
 * showing green after the collector died, and a gap in history drawn as if it
 * were a good day.
 */

import { SEVERITY } from "./rollup";
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

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The day keys a range covers, oldest first. Computed once per page rather than
 * once per component — at 365 days and 33 components that is the difference
 * between 365 and 12,045 `toISOString()` calls per render.
 */
export function dayRange(days: number, today: Date): string[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - (days - 1 - i));
    return isoDay(d);
  });
}

export function buildBars(rollups: RollupRow[], days: number, today: Date, keys?: string[]): Bar[] {
  const byDay = new Map(rollups.map((r) => [r.day, r]));
  return (keys ?? dayRange(days, today)).map((day) => ({
    day,
    status: byDay.get(day)?.worstStatus ?? null,
  }));
}

/**
 * Ranked by the same severity the day bars use, so the banner can never report
 * a different "worst thing currently true" than the rows below it. `stale`
 * sits just above `unknown`: both mean we cannot see, and neither outranks a
 * real outage.
 */
const DISPLAY_SEVERITY: Record<DisplayStatus, number> = {
  operational: 0,
  unknown: 1,
  stale: 2,
  misconfigured: 3,
  degraded: 4,
  down: 5,
};

export function overallStatus(statuses: DisplayStatus[]): DisplayStatus {
  // Nothing to report is not the same as everything being fine.
  if (statuses.length === 0) return "stale";
  return statuses.reduce((a, b) => (DISPLAY_SEVERITY[a] >= DISPLAY_SEVERITY[b] ? a : b));
}
