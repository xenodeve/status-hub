import { describe, expect, test } from "bun:test";
import readiness from "../../test/fixtures/litellm-readiness.json";
import { readHealth, readModels, readReadiness } from "./litellm";

describe("readReadiness — the keyless gateway check", () => {
  test("the real payload reads as operational", () => {
    // {"status":"healthy","db":"connected"} — captured from gateway.9arm.co
    expect(readReadiness(readiness)).toBe("operational");
  });

  test("an unhealthy gateway is down", () => {
    expect(readReadiness({ status: "unhealthy", db: "disconnected" })).toBe("down");
  });

  test("a payload we cannot read is unknown, not operational", () => {
    expect(readReadiness(null)).toBe("unknown");
    expect(readReadiness({})).toBe("unknown");
  });
});

describe("readModels — discovery, so a rotated model needs no code change", () => {
  const payload = {
    object: "list",
    data: [
      { id: "deepseek-v4-flash-0731", object: "model" },
      { id: "qwen3.8-27b-fp8", object: "model" },
    ],
  };

  test("every model in the listing becomes a component", () => {
    expect(readModels(payload).map((m) => m.key)).toEqual([
      "deepseek-v4-flash",
      "qwen3.8-27b",
    ]);
  });

  test("the key is the family and the variant is kept alongside", () => {
    const [first] = readModels(payload);
    expect(first).toMatchObject({ key: "deepseek-v4-flash", variant: "deepseek-v4-flash-0731" });
  });

  test("two snapshots of one model collapse to a single component", () => {
    const rotated = {
      data: [
        { id: "deepseek-v4-flash-0731" },
        { id: "deepseek-v4-flash-0815" },
      ],
    };
    expect(readModels(rotated)).toHaveLength(1);
  });

  test("a malformed listing yields nothing rather than throwing", () => {
    expect(readModels(null)).toEqual([]);
    expect(readModels({ data: "not an array" })).toEqual([]);
  });
});

describe("readHealth — LiteLLM checks each model for us", () => {
  // NOTE: shape taken from LiteLLM's documented /health response. Not yet
  // confirmed against this gateway — it needs a master key we do not hold.
  const payload = {
    healthy_endpoints: [{ model: "qwen3.8-27b-fp8" }],
    unhealthy_endpoints: [{ model: "deepseek-v4-flash-0731", error: "Timeout" }],
    healthy_count: 1,
    unhealthy_count: 1,
  };

  test("healthy endpoints are operational, unhealthy are down", () => {
    const byKey = Object.fromEntries(readHealth(payload).map((c) => [c.key, c.status]));
    expect(byKey["qwen3.8-27b"]).toBe("operational");
    expect(byKey["deepseek-v4-flash"]).toBe("down");
  });

  test("the reported error is carried so the incident says what happened", () => {
    const deepseek = readHealth(payload).find((c) => c.key === "deepseek-v4-flash");
    expect(deepseek?.detail).toContain("Timeout");
  });

  test("a model listed in both is treated as down", () => {
    // Ambiguity resolves toward the worse reading: claiming healthy on a
    // contradiction is the false-green failure in another costume.
    const both = {
      healthy_endpoints: [{ model: "m-0101" }],
      unhealthy_endpoints: [{ model: "m-0101", error: "flapping" }],
    };
    expect(readHealth(both)[0]!.status).toBe("down");
  });

  test("a malformed payload yields nothing rather than throwing", () => {
    expect(readHealth(null)).toEqual([]);
  });
});
