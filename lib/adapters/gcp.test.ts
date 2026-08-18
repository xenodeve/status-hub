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
