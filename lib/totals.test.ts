import { describe, expect, test } from "bun:test";
import { uptimePct } from "./rollup";
import { totalCounts, type CountedDay } from "./totals";

const day = (operational: number, degraded: number, down: number): CountedDay => ({
  operational_count: operational,
  degraded_count: degraded,
  down_count: down,
});

describe("totalCounts — the number under the bar", () => {
  test("no days is not zero uptime, it is no uptime figure", () => {
    // A component with no history must print "no data", never "0 %".
    expect(uptimePct(totalCounts([]))).toBeNull();
  });

  test("sums across the whole visible range, not just the last day", () => {
    expect(totalCounts([day(90, 0, 10), day(100, 0, 0)])).toEqual({
      operational: 190,
      degraded: 0,
      down: 10,
    });
  });

  test("the range total is what the page shows", () => {
    expect(uptimePct(totalCounts([day(90, 0, 10), day(100, 0, 0)]))).toBeCloseTo(95, 5);
  });

  test("degraded days still count as up", () => {
    expect(uptimePct(totalCounts([day(0, 100, 0)]))).toBe(100);
  });

  test("a range where we never reached them has no figure, however many days", () => {
    // Every check that day was ours failing. Reporting 0 % would blame the
    // vendor for our own network.
    expect(uptimePct(totalCounts([day(0, 0, 0), day(0, 0, 0)]))).toBeNull();
  });
});
