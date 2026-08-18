import { describe, expect, test } from "bun:test";
import { BUCKETS, addSample, emptyRollup, percentile, uptimePct, worst } from "./rollup";

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
