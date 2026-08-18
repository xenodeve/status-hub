/**
 * The decision the collector makes after every check: has anything actually
 * changed, and does an incident open or close.
 *
 * Pure on purpose. This is where the reference implementation went wrong —
 * it opened an incident on every slow check and produced sixteen in one day
 * for one model, each with its own alert — so it is the part that gets tests
 * rather than a deployment.
 */

import type { Status } from "./status";

/** Consecutive agreeing checks before an incident opens or closes. */
export const STRIKES = 3;

export type ComponentState = {
  status: Status;
  consecutiveOk: number;
  consecutiveBad: number;
  openIncident: boolean;
};

export type Reading = {
  status: Status;
  latencyMs: number | null;
  detail?: string;
};

export type IncidentAction =
  | { kind: "open-incident"; status: Status; severity: "minor" | "major"; detail?: string }
  | { kind: "extend-incident"; status: Status; detail?: string }
  | { kind: "close-incident" };

export type StatusEvent = { from: Status; to: Status };

export type Step = {
  state: ComponentState;
  action: IncidentAction | null;
  event: StatusEvent | null;
  /** Green checks store nothing; that is what keeps the database small. */
  storeSample: boolean;
};

/**
 * `unknown` and `misconfigured` are our own failures. They say nothing about
 * whether the vendor is up, so they neither count toward an outage nor count
 * as recovery — they leave both streaks exactly where they were.
 */
const isOurFault = (status: Status) => status === "unknown" || status === "misconfigured";

const isBad = (status: Status) => status === "down" || status === "degraded";

export function transition(previous: ComponentState, reading: Reading): Step {
  const { status } = reading;

  const ours = isOurFault(status);
  const bad = isBad(status);

  const consecutiveOk = ours ? previous.consecutiveOk : bad ? 0 : previous.consecutiveOk + 1;
  const consecutiveBad = ours ? previous.consecutiveBad : bad ? previous.consecutiveBad + 1 : 0;

  let openIncident = previous.openIncident;
  let action: IncidentAction | null = null;

  if (!previous.openIncident && bad && consecutiveBad >= STRIKES) {
    openIncident = true;
    action = {
      kind: "open-incident",
      status,
      severity: status === "down" ? "major" : "minor",
      detail: reading.detail,
    };
  } else if (previous.openIncident && bad) {
    // A continuing problem extends the row it already has. Opening a second is
    // the flood this whole rule exists to prevent.
    action = { kind: "extend-incident", status, detail: reading.detail };
  } else if (previous.openIncident && !ours && consecutiveOk >= STRIKES) {
    openIncident = false;
    action = { kind: "close-incident" };
  }

  return {
    state: { status, consecutiveOk, consecutiveBad, openIncident },
    action,
    event: previous.status === status ? null : { from: previous.status, to: status },
    storeSample: status !== "operational",
  };
}
