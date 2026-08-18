import { describe, expect, test } from "bun:test";
import { STRIKES, transition, type ComponentState } from "./collector";
import type { Status } from "./status";

const green = (over: Partial<ComponentState> = {}): ComponentState => ({
  status: "operational",
  consecutiveOk: 10,
  consecutiveBad: 0,
  openIncident: false,
  ...over,
});

/** Feed a run of identical readings through the machine. */
const run = (from: ComponentState, status: Status, times: number) => {
  let state = from;
  const actions = [];
  for (let i = 0; i < times; i++) {
    const step = transition(state, { status, latencyMs: 1, detail: "boom" });
    state = step.state;
    actions.push(step.action);
  }
  return { state, actions };
};

describe("transition — opening an incident", () => {
  test("one bad check opens nothing", () => {
    // A single failed check is a network hiccup. The reference implementation
    // opened an incident here and alerted on it.
    const { state, actions } = run(green(), "down", 1);
    expect(state.openIncident).toBe(false);
    expect(actions.at(-1)).toBeNull();
  });

  test(`it takes ${STRIKES} consecutive bad checks`, () => {
    const { state, actions } = run(green(), "down", STRIKES);
    expect(state.openIncident).toBe(true);
    expect(actions.at(-1)).toMatchObject({ kind: "open-incident", status: "down" });
  });

  test("one good check in the middle resets the count", () => {
    let state = green();
    state = transition(state, { status: "down", latencyMs: 1 }).state;
    state = transition(state, { status: "down", latencyMs: 1 }).state;
    state = transition(state, { status: "operational", latencyMs: 1 }).state;
    state = transition(state, { status: "down", latencyMs: 1 }).state;
    expect(state.openIncident).toBe(false);
  });

  test("a fourth bad check does not open a second incident", () => {
    // Sixteen incidents in one day for one model is what this prevents.
    const { actions } = run(green(), "down", STRIKES + 5);
    const opens = actions.filter((a) => a?.kind === "open-incident");
    expect(opens).toHaveLength(1);
  });

  test("a continuing problem asks to extend, not to open again", () => {
    const { actions } = run(green(), "down", STRIKES + 1);
    expect(actions.at(-1)).toMatchObject({ kind: "extend-incident" });
  });
});

describe("transition — closing an incident", () => {
  const broken = () => run(green(), "down", STRIKES).state;

  test("one good check does not close it", () => {
    const state = transition(broken(), { status: "operational", latencyMs: 1 }).state;
    expect(state.openIncident).toBe(true);
  });

  test(`${STRIKES} consecutive good checks close it`, () => {
    const { state, actions } = run(broken(), "operational", STRIKES);
    expect(state.openIncident).toBe(false);
    expect(actions.at(-1)).toMatchObject({ kind: "close-incident" });
  });

  test("closing happens once, not on every green check afterwards", () => {
    const { actions } = run(broken(), "operational", STRIKES + 4);
    expect(actions.filter((a) => a?.kind === "close-incident")).toHaveLength(1);
  });
});

describe("transition — our failures are not their outage", () => {
  test("unknown never opens an incident, however long it lasts", () => {
    // `unknown` means our own check could not run. Opening an incident would
    // write a permanent lie into the vendor's history, and history cannot be
    // corrected later.
    const { state, actions } = run(green(), "unknown", STRIKES + 10);
    expect(state.openIncident).toBe(false);
    expect(actions.every((a) => a?.kind !== "open-incident")).toBe(true);
  });

  test("misconfigured never opens one either — the fault is ours", () => {
    const { state } = run(green(), "misconfigured", STRIKES + 10);
    expect(state.openIncident).toBe(false);
  });

  test("an unknown run does not reset a bad streak either", () => {
    // Our check failing tells us nothing about them, so it must neither count
    // toward an outage nor count as recovery.
    let state = green();
    state = transition(state, { status: "down", latencyMs: 1 }).state;
    state = transition(state, { status: "down", latencyMs: 1 }).state;
    state = transition(state, { status: "unknown", latencyMs: null }).state;
    state = transition(state, { status: "down", latencyMs: 1 }).state;
    expect(state.openIncident).toBe(true);
  });
});

describe("transition — degraded is an incident too", () => {
  test(`${STRIKES} degraded checks open a minor incident`, () => {
    const { actions } = run(green(), "degraded", STRIKES);
    expect(actions.at(-1)).toMatchObject({ kind: "open-incident", severity: "minor" });
  });

  test("down opens a major one", () => {
    const { actions } = run(green(), "down", STRIKES);
    expect(actions.at(-1)).toMatchObject({ kind: "open-incident", severity: "major" });
  });
});

describe("transition — status events", () => {
  test("a change of status is recorded the moment it happens", () => {
    const step = transition(green(), { status: "down", latencyMs: 1 });
    expect(step.event).toMatchObject({ from: "operational", to: "down" });
  });

  test("an unchanged status records nothing", () => {
    expect(transition(green(), { status: "operational", latencyMs: 1 }).event).toBeNull();
  });
});

describe("transition — what gets stored", () => {
  test("a green check stores no sample", () => {
    // Storing a row per check is what reaches the 500 MB ceiling in three months.
    expect(transition(green(), { status: "operational", latencyMs: 42 }).storeSample).toBe(false);
  });

  test("anything not green stores a full-resolution sample", () => {
    for (const status of ["degraded", "down", "misconfigured", "unknown"] as Status[]) {
      expect(transition(green(), { status, latencyMs: 42 }).storeSample).toBe(true);
    }
  });
});
