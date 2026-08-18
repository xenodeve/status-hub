import { describe, expect, test } from "bun:test";
import incidents from "../../test/fixtures/gcp-incidents.json";
import { readGcp } from "./gcp";

const GEMINI = /gemini|vertex/i;

describe("readGcp — real Google Cloud incident feed", () => {
  test("a component is reported even when nothing is wrong", () => {
    // A source with no open incident still has to render a green bar. Returning
    // nothing would draw as "no data", which means something different.
    const reading = readGcp(incidents, { key: "gemini-api", name: "Gemini API", match: GEMINI });
    expect(reading.components).toHaveLength(1);
    expect(reading.components[0]!.key).toBe("gemini-api");
  });

  test("every incident in the fixture has ended, so the component is operational", () => {
    const reading = readGcp(incidents, { key: "gemini-api", name: "Gemini API", match: GEMINI });
    expect(reading.components[0]!.status).toBe("operational");
  });

  test("only incidents naming a matching product are carried", () => {
    const reading = readGcp(incidents, { key: "gemini-api", name: "Gemini API", match: GEMINI });
    // The fixture's Gemini row is a SERVICE_INFORMATION about Vertex Gemini API;
    // the others are VMware and networking and must not appear.
    for (const i of reading.incidents) {
      expect(i.title.toLowerCase()).not.toContain("vmware");
    }
  });
});

describe("readGcp — impact mapping", () => {
  const open = (status_impact: string) =>
    readGcp(
      [{
        id: "x", begin: "2026-08-18T00:00:00Z", end: null,
        external_desc: "Something", status_impact,
        affected_products: [{ title: "Vertex Gemini API" }],
      }],
      { key: "gemini-api", name: "Gemini API", match: GEMINI },
    ).components[0]!.status;

  test("an outage is down", () => {
    expect(open("SERVICE_OUTAGE")).toBe("down");
  });

  test("a disruption is degraded", () => {
    expect(open("SERVICE_DISRUPTION")).toBe("degraded");
  });

  test("an information notice is not an outage", () => {
    expect(open("SERVICE_INFORMATION")).toBe("operational");
  });

  test("an impact level we do not recognise is unknown, never operational", () => {
    expect(open("SOMETHING_NEW")).toBe("unknown");
  });
});

describe("readGcp — robustness", () => {
  test("a payload that is not a list yields a component with no reading", () => {
    const reading = readGcp(null, { key: "gemini-api", name: "Gemini API", match: GEMINI });
    expect(reading.components[0]!.status).toBe("unknown");
    expect(reading.incidents).toEqual([]);
  });

  test("an incident with no products is ignored rather than crashing", () => {
    const reading = readGcp([{ id: "y", end: null, status_impact: "SERVICE_OUTAGE" }], {
      key: "gemini-api", name: "Gemini API", match: GEMINI,
    });
    expect(reading.components[0]!.status).toBe("operational");
  });
});

describe("readGcp — the feed is the whole history, we are not", () => {
  const target = { key: "gemini-api", name: "Gemini API", match: GEMINI };
  const now = new Date("2026-08-18T00:00:00Z");
  const incident = (end: string | null) => ({
    id: `i-${end ?? "open"}`,
    begin: "2026-01-01T00:00:00Z",
    end,
    external_desc: "Something",
    status_impact: "SERVICE_DISRUPTION",
    affected_products: [{ title: "Vertex Gemini API" }],
  });

  test("an incident closed years ago is not re-sent every five minutes", () => {
    // incidents.json is the full historical feed. Carrying all of it means the
    // collector rewrites rows that have not changed since 2024, on every run.
    const reading = readGcp([incident("2024-03-01T00:00:00Z")], target, now);
    expect(reading.incidents).toHaveLength(0);
  });

  test("an incident that just closed is still carried, so the close is recorded", () => {
    // Dropping it the moment it ends would leave our copy open forever: we
    // would never see the end we are waiting for.
    const reading = readGcp([incident("2026-08-17T00:00:00Z")], target, now);
    expect(reading.incidents).toHaveLength(1);
    expect(reading.incidents[0]!.endedAt).toBe("2026-08-17T00:00:00Z");
  });

  test("an open incident is always carried, however old", () => {
    const reading = readGcp([incident(null)], target, now);
    expect(reading.incidents).toHaveLength(1);
  });

  test("the component status still reflects only open incidents", () => {
    const reading = readGcp([incident("2026-08-17T00:00:00Z")], target, now);
    expect(reading.components[0]!.status).toBe("operational");
  });
});
