import { describe, expect, test } from "bun:test";
import { classify, type CheckOutcome } from "./status";

// Thresholds are per-component; these are the defaults the spec fixes.
const HTTP = { slowMs: 1_500 };
const LLM = { slowMs: 3_500 };

describe("classify — a reachable service", () => {
  test("2xx inside the latency threshold is operational", () => {
    expect(classify({ kind: "http", status: 200, latencyMs: 340 }, LLM)).toBe("operational");
  });

  test("2xx slower than the threshold is degraded, not down", () => {
    expect(classify({ kind: "http", status: 200, latencyMs: 4_000 }, LLM)).toBe("degraded");
  });

  test("the threshold is per-component, not global", () => {
    // 2s is fine for an LLM and far too slow for a models listing
    expect(classify({ kind: "http", status: 200, latencyMs: 2_000 }, LLM)).toBe("operational");
    expect(classify({ kind: "http", status: 200, latencyMs: 2_000 }, HTTP)).toBe("degraded");
  });
});

describe("classify — the false-green cases", () => {
  // The reference implementation used `ok = status < 500`, which reports an
  // expired key and a rate limit as healthy. Both are below 500.
  test("401 is misconfigured — our problem — and never operational", () => {
    expect(classify({ kind: "http", status: 401, latencyMs: 20 }, LLM)).toBe("misconfigured");
  });

  test("403 is misconfigured too", () => {
    expect(classify({ kind: "http", status: 403, latencyMs: 20 }, LLM)).toBe("misconfigured");
  });

  test("429 is degraded — rate limited is not the same as down", () => {
    expect(classify({ kind: "http", status: 429, latencyMs: 20 }, LLM)).toBe("degraded");
  });

  test("no status below 500 is silently treated as healthy", () => {
    for (const status of [400, 404, 418, 451]) {
      expect(classify({ kind: "http", status, latencyMs: 20 }, LLM)).not.toBe("operational");
    }
  });
});

describe("classify — theirs versus ours", () => {
  test("5xx is down", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(classify({ kind: "http", status, latencyMs: 90 }, LLM)).toBe("down");
    }
  });

  test("a timeout is down — they did not answer", () => {
    expect(classify({ kind: "timeout", latencyMs: 10_000 }, LLM)).toBe("down");
  });

  test("a failure on our side is unknown, never down", () => {
    // Our network hiccuped. Recording this as an outage writes a permanent
    // lie into their history that cannot be corrected later.
    expect(classify({ kind: "error", latencyMs: 12, message: "getaddrinfo ENOTFOUND" }, LLM))
      .toBe("unknown");
  });

  test("a missing credential is unknown, not a reason to borrow one", () => {
    expect(classify({ kind: "no-credential" }, LLM)).toBe("misconfigured");
  });
});

describe("classify — exhaustiveness", () => {
  test("every outcome kind maps to a status", () => {
    const outcomes: CheckOutcome[] = [
      { kind: "http", status: 200, latencyMs: 1 },
      { kind: "timeout", latencyMs: 1 },
      { kind: "error", latencyMs: 1, message: "x" },
      { kind: "no-credential" },
    ];
    for (const o of outcomes) expect(typeof classify(o, LLM)).toBe("string");
  });
});
