/**
 * The status vocabulary, and the one function that decides which value a check
 * produced. See docs/agents/domain.md — several of these values mean different
 * kinds of "no" and they are not interchangeable.
 */

export type Status =
  /** Answered, within the latency threshold. */
  | "operational"
  /** Answered, but too slow — or rate limited. Their problem. */
  | "degraded"
  /** 5xx, a timeout, or the connection failed. Their problem. */
  | "down"
  /** We hold no valid credential, or we are asking wrongly. Our problem. */
  | "misconfigured"
  /** The check itself could not run. Our problem. */
  | "unknown";

export type CheckOutcome =
  | { kind: "http"; status: number; latencyMs: number }
  | { kind: "timeout"; latencyMs: number }
  | { kind: "error"; latencyMs: number; message: string }
  | { kind: "no-credential" };

/** Per-component, because 2s is fine for an LLM and far too slow for a listing. */
export type Thresholds = { slowMs: number };

export function classify(outcome: CheckOutcome, thresholds: Thresholds): Status {
  switch (outcome.kind) {
    // No key configured. This is the only correct answer — the alternative is
    // borrowing a fallback key, which is how the reference implementation
    // leaked one into a public repository.
    case "no-credential":
      return "misconfigured";

    // Our fetch never completed. Recording this as `down` would write a
    // permanent lie into their history, and history cannot be corrected later.
    case "error":
      return "unknown";

    case "timeout":
      return "down";

    case "http": {
      const { status, latencyMs } = outcome;

      // `status < 500` is the test that made the reference implementation
      // report an expired key as healthy. 401 and 429 both pass it.
      if (status === 429) return "degraded";
      if (status >= 500) return "down";
      if (status >= 400) return "misconfigured";

      return latencyMs > thresholds.slowMs ? "degraded" : "operational";
    }
  }
}
