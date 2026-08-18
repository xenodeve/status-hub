import type { Counts } from "./rollup";

/** The daily counters, as they come back from the database. */
export type CountedDay = {
  operational_count: number;
  degraded_count: number;
  down_count: number;
};

/**
 * Sums a range of daily rows into the counts `uptimePct` expects.
 *
 * Pure and separate from the query so it can be tested: the arithmetic that
 * decides the number on the page should not need a database to check.
 */
export function totalCounts(days: CountedDay[]): Pick<Counts, "operational" | "degraded" | "down"> {
  return days.reduce(
    (acc, day) => ({
      operational: acc.operational + day.operational_count,
      degraded: acc.degraded + day.degraded_count,
      down: acc.down + day.down_count,
    }),
    { operational: 0, degraded: 0, down: 0 },
  );
}
