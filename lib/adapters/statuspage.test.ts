import { describe, expect, test } from "bun:test";
import anthropic from "../../test/fixtures/statuspage-anthropic.json";
import openai from "../../test/fixtures/statuspage-openai.json";
import { readStatuspage } from "./statuspage";

describe("readStatuspage — real Anthropic payload", () => {
  const reading = readStatuspage(anthropic);

  test("every showcased component becomes a reading", () => {
    expect(reading.components.length).toBeGreaterThan(0);
    for (const c of reading.components) {
      expect(c.key).toBeTruthy();
      expect(c.name).toBeTruthy();
    }
  });

  test("keys are the vendor's own ids, so a rename does not orphan history", () => {
    const claudeAi = reading.components.find((c) => c.name === "claude.ai");
    expect(claudeAi?.key).toBe("rwppv331jlwc");
  });

  test("a vendor page reading carries no latency of its own", () => {
    // We measured how long *their status page* took, which says nothing about
    // whether the API is fast. Reporting it as the component's latency would
    // be a number that looks meaningful and is not.
    for (const c of reading.components) expect(c.latencyMs).toBeNull();
  });
});

describe("readStatuspage — real OpenAI payload", () => {
  test("parses a second vendor with the same adapter", () => {
    const reading = readStatuspage(openai);
    expect(reading.components.length).toBeGreaterThan(0);
  });
});

describe("readStatuspage — status mapping", () => {
  const withStatus = (status: string) =>
    readStatuspage({
      page: { id: "p", name: "n" },
      status: { indicator: "none", description: "" },
      components: [{ id: "c1", name: "API", status, group: false, group_id: null, showcase: true }],
      incidents: [],
    }).components[0]!.status;

  test("operational maps through", () => {
    expect(withStatus("operational")).toBe("operational");
  });

  test("degraded_performance and partial_outage are degraded", () => {
    expect(withStatus("degraded_performance")).toBe("degraded");
    expect(withStatus("partial_outage")).toBe("degraded");
  });

  test("major_outage is down", () => {
    expect(withStatus("major_outage")).toBe("down");
  });

  test("an unrecognised status is unknown, never operational", () => {
    // A vendor adding a status we have not seen must not silently read as
    // healthy. Grey is the honest answer to "we do not understand this".
    expect(withStatus("some_new_state_they_invented")).toBe("unknown");
  });
});

describe("readStatuspage — incidents", () => {
  test("an unresolved incident is carried through with vendor origin", () => {
    const reading = readStatuspage({
      page: { id: "p", name: "n" },
      status: { indicator: "major", description: "" },
      components: [],
      incidents: [{
        id: "i1",
        name: "Elevated error rates",
        status: "investigating",
        impact: "major",
        created_at: "2026-08-18T01:00:00Z",
        resolved_at: null,
        components: [{ id: "c1" }],
      }],
    });
    expect(reading.incidents).toHaveLength(1);
    expect(reading.incidents[0]).toMatchObject({
      key: "i1",
      title: "Elevated error rates",
      origin: "vendor",
      endedAt: null,
    });
  });

  test("a malformed payload yields no readings rather than throwing", () => {
    // An adapter that throws takes down the whole collection run, including
    // the sources that were answering fine.
    expect(readStatuspage({}).components).toEqual([]);
    expect(readStatuspage(null).components).toEqual([]);
  });
});
