import { describe, expect, test } from "bun:test";
import { familyOf } from "./model-name";

describe("familyOf — history must survive a version rotation", () => {
  test("a trailing date snapshot is not part of the identity", () => {
    expect(familyOf("deepseek-v4-flash-0731")).toBe("deepseek-v4-flash");
    expect(familyOf("deepseek-v4-flash-0815")).toBe("deepseek-v4-flash");
  });

  test("two snapshots of one model share a family", () => {
    // This is the whole point: when the gateway rotates the snapshot, the
    // uptime bar must keep its history instead of restarting empty.
    expect(familyOf("deepseek-v4-flash-0731")).toBe(familyOf("deepseek-v4-flash-0815"));
  });

  test("a quantization suffix is not part of the identity either", () => {
    expect(familyOf("qwen3.8-27b-fp8")).toBe("qwen3.8-27b");
    expect(familyOf("qwen3.8-27b-awq")).toBe("qwen3.8-27b");
    expect(familyOf("qwen3.8-27b-int4")).toBe("qwen3.8-27b");
  });

  test("date and quantization together both come off", () => {
    expect(familyOf("deepseek-v4-flash-0731-fp8")).toBe("deepseek-v4-flash");
  });
});

describe("familyOf — what must NOT be stripped", () => {
  test("a parameter count is part of the name", () => {
    expect(familyOf("qwen3.8-27b")).toBe("qwen3.8-27b");
    expect(familyOf("llama-3.1-405b")).toBe("llama-3.1-405b");
  });

  test("a version number is part of the name", () => {
    expect(familyOf("claude-opus-5")).toBe("claude-opus-5");
    expect(familyOf("gpt-5")).toBe("gpt-5");
  });

  test("a name with no suffix is returned unchanged", () => {
    expect(familyOf("deepseek-v4-flash")).toBe("deepseek-v4-flash");
  });

  test("stripping never empties the name", () => {
    // A pathological id must still identify something, or every such model
    // collapses into one shared history.
    expect(familyOf("0731")).toBe("0731");
    expect(familyOf("fp8")).toBe("fp8");
  });
});
