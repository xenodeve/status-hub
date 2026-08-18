import { describe, expect, test } from "bun:test";
import { BUCKETS, addSample, dayStatus, emptyRollup, percentile, uptimePct, worst } from "./rollup";
import type { Status } from "./status";

describe("worst — a day is as bad as its worst check", () => {
  test("down beats degraded beats operational", () => {
    expect(worst("operational", "degraded")).toBe("degraded");
    expect(worst("degraded", "down")).toBe("down");
    expect(worst("down", "operational")).toBe("down");
  });

  test("our own failures rank below their outages, not above", () => {
    // `unknown` means we could not look. It must not outrank a real outage,
    // or one flaky check hides a genuine incident behind a grey bar.
    expect(worst("down", "unknown")).toBe("down");
    expect(worst("operational", "unknown")).toBe("unknown");
  });
});

describe("uptimePct — the grade a day gets", () => {
  test("counts only checks that reached them", () => {
    // 8 operational, 2 down out of 10
    expect(uptimePct({ operational: 8, degraded: 0, down: 2 })).toBe(80);
  });

  test("degraded counts as up — it answered", () => {
    expect(uptimePct({ operational: 5, degraded: 5, down: 0 })).toBe(100);
  });

  test("a day with no reachable checks is not 100%", () => {
    expect(uptimePct({ operational: 0, degraded: 0, down: 0 })).toBeNull();
  });
});

describe("addSample — the histogram replaces storing every row", () => {
  test("an empty rollup has every bucket at zero and no checks", () => {
    const r = emptyRollup();
    expect(r.checkCount).toBe(0);
    expect(Object.values(r.latencyBuckets).every((n) => n === 0)).toBe(true);
  });

  test("each sample lands in exactly one bucket", () => {
    let r = emptyRollup();
    r = addSample(r, { status: "operational", latencyMs: 90 });
    const total = Object.values(r.latencyBuckets).reduce((a, b) => a + b, 0);
    expect(total).toBe(1);
    expect(r.checkCount).toBe(1);
  });

  test("the histogram is a fixed size no matter how many samples", () => {
    let r = emptyRollup();
    for (let i = 0; i < 5_000; i++) r = addSample(r, { status: "operational", latencyMs: i });
    expect(Object.keys(r.latencyBuckets).length).toBe(BUCKETS.length);
    expect(r.checkCount).toBe(5_000);
  });

  test("a sample that never answered has no latency to record", () => {
    let r = emptyRollup();
    r = addSample(r, { status: "unknown", latencyMs: null });
    expect(r.checkCount).toBe(1);
    expect(Object.values(r.latencyBuckets).reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("percentile — approximate, from the histogram", () => {
  test("reads the bucket the percentile falls in", () => {
    let r = emptyRollup();
    for (let i = 0; i < 90; i++) r = addSample(r, { status: "operational", latencyMs: 50 });
    for (let i = 0; i < 10; i++) r = addSample(r, { status: "degraded", latencyMs: 4_000 });
    expect(percentile(r, 50)).toBeLessThanOrEqual(100);
    expect(percentile(r, 95)).toBeGreaterThan(3_000);
  });

  test("no latency samples means no percentile to report", () => {
    expect(percentile(emptyRollup(), 50)).toBeNull();
  });
});

describe("addSample — the counters live here, not in the caller", () => {
  test("each status increments exactly one counter", () => {
    let r = emptyRollup();
    r = addSample(r, { status: "operational", latencyMs: 10 });
    r = addSample(r, { status: "degraded", latencyMs: 10 });
    r = addSample(r, { status: "down", latencyMs: null });
    expect(r.counts).toEqual({ operational: 1, degraded: 1, down: 1, unreachable: 0 });
  });

  test("our own failures land in unreachable, not against the vendor", () => {
    // Counting `unknown` as downtime would blame a vendor for our network.
    let r = emptyRollup();
    for (const status of ["unknown", "misconfigured"] as Status[]) {
      r = addSample(r, { status, latencyMs: null });
    }
    expect(r.counts.unreachable).toBe(2);
    expect(r.counts.down).toBe(0);
  });

  test("the counters feed uptimePct directly", () => {
    let r = emptyRollup();
    for (let i = 0; i < 9; i++) r = addSample(r, { status: "operational", latencyMs: 10 });
    r = addSample(r, { status: "down", latencyMs: null });
    expect(uptimePct(r.counts)).toBe(90);
  });

  test("a day that only ever failed on our side has no uptime figure", () => {
    let r = emptyRollup();
    r = addSample(r, { status: "unknown", latencyMs: null });
    expect(uptimePct(r.counts)).toBeNull();
  });

  test("an empty rollup starts operational, because that is the identity of worst", () => {
    expect(emptyRollup().worstStatus).toBe("operational");
    expect(addSample(emptyRollup(), { status: "down", latencyMs: 1 }).worstStatus).toBe("down");
  });
});

describe("dayStatus — a day is graded on its uptime, not its worst moment", () => {
  const counts = (operational: number, degraded: number, down: number) => ({
    operational,
    degraded,
    down,
    unreachable: 0,
  });

  test("one bad check out of 288 does not paint the day red", () => {
    // 99.65 % uptime. Grading this as an outage makes a transient blip
    // indistinguishable from a real one when you look back at the bar.
    expect(dayStatus(counts(287, 0, 1), "down")).toBe("operational");
  });

  test("98 % is the boundary and it is inclusive", () => {
    expect(dayStatus(counts(98, 0, 2), "down")).toBe("operational");
    expect(dayStatus(counts(97, 0, 3), "down")).toBe("degraded");
  });

  test("below 80 % is an outage", () => {
    expect(dayStatus(counts(79, 0, 21), "down")).toBe("down");
    expect(dayStatus(counts(80, 0, 20), "down")).toBe("degraded");
  });

  test("degraded checks count as up, so a slow day is not an outage", () => {
    expect(dayStatus(counts(0, 100, 0), "degraded")).toBe("operational");
  });

  test("a day we never reached them keeps the worst reading, which is grey", () => {
    expect(dayStatus(counts(0, 0, 0), "unknown")).toBe("unknown");
    expect(dayStatus(counts(0, 0, 0), "misconfigured")).toBe("misconfigured");
  });
});
