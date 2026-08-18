import { describe, expect, test } from "bun:test";
import { buildBars, effectiveStatus, overallStatus, type RollupRow } from "./view";

const at = (iso: string) => new Date(iso);

describe("effectiveStatus — a page that stopped checking must not read green", () => {
  const now = at("2026-08-18T12:00:00Z");

  test("a recent check reports what it found", () => {
    expect(
      effectiveStatus({ status: "operational", lastCheckedAt: "2026-08-18T11:59:00Z" }, now, 300_000),
    ).toBe("operational");
  });

  test("a check older than the allowed gap is stale, not operational", () => {
    // The collector died at noon. The stored row still says green, and a page
    // that trusts it shows green all afternoon.
    expect(
      effectiveStatus({ status: "operational", lastCheckedAt: "2026-08-18T08:00:00Z" }, now, 300_000),
    ).toBe("stale");
  });

  test("staleness outranks a stored outage too", () => {
    // If we stopped checking, we do not know it is still down either.
    expect(
      effectiveStatus({ status: "down", lastCheckedAt: "2026-08-18T08:00:00Z" }, now, 300_000),
    ).toBe("stale");
  });

  test("a component that has never been checked is stale", () => {
    expect(effectiveStatus({ status: "operational", lastCheckedAt: null }, now, 300_000)).toBe("stale");
  });
});

describe("buildBars — absence of a row is the no-data signal", () => {
  const today = at("2026-08-18T00:00:00Z");
  const rollup = (day: string, worst: RollupRow["worstStatus"]): RollupRow => ({
    day,
    worstStatus: worst,
    checkCount: 288,
    uptimePct: 100,
  });

  test("one bar per day, oldest first", () => {
    const bars = buildBars([], 5, today);
    expect(bars).toHaveLength(5);
    expect(bars[0]!.day).toBe("2026-08-14");
    expect(bars[4]!.day).toBe("2026-08-18");
  });

  test("a day with no row renders as no-data, never as green", () => {
    // This is the whole mechanism. Filling the gap with a green bar would make
    // "we checked and all was well" indistinguishable from "we never looked".
    const bars = buildBars([rollup("2026-08-18", "operational")], 3, today);
    expect(bars.map((b) => b.status)).toEqual([null, null, "operational"]);
  });

  test("a day that was checked shows its worst status", () => {
    const bars = buildBars([rollup("2026-08-17", "down")], 2, today);
    expect(bars[0]!.status).toBe("down");
  });

  test("rows outside the window are ignored", () => {
    const bars = buildBars([rollup("2025-01-01", "down")], 3, today);
    expect(bars.every((b) => b.status === null)).toBe(true);
  });

  test("the same call shape serves 90 days and a year", () => {
    expect(buildBars([], 90, today)).toHaveLength(90);
    expect(buildBars([], 365, today)).toHaveLength(365);
  });
});

describe("overallStatus — the banner at the top", () => {
  test("everything operational reads as all systems operational", () => {
    expect(overallStatus(["operational", "operational"])).toBe("operational");
  });

  test("one degraded component degrades the banner", () => {
    expect(overallStatus(["operational", "degraded"])).toBe("degraded");
  });

  test("one down component outranks several degraded", () => {
    expect(overallStatus(["degraded", "degraded", "down"])).toBe("down");
  });

  test("nothing to report is not the same as everything fine", () => {
    expect(overallStatus([])).toBe("stale");
  });

  test("a stale component makes the banner stale rather than green", () => {
    expect(overallStatus(["operational", "stale"])).toBe("stale");
  });
});
