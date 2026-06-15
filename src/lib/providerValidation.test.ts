import { describe, it, expect } from "vitest";
import { validateName, validateUrl, validateProvider, canDisableProvider } from "./providerValidation";
import type { AiProvider } from "../state/types";

describe("validateName", () => {
  it("rejects empty / whitespace", () => {
    expect(validateName("")).toBe("errors.nameRequired");
    expect(validateName("   ")).toBe("errors.nameRequired");
  });
  it("rejects > 20 chars counting code points", () => {
    expect(validateName("a".repeat(21))).toBe("errors.nameTooLong");
    expect(validateName("😀".repeat(21))).toBe("errors.nameTooLong");
  });
  it("accepts trimmed valid name", () => {
    expect(validateName("  ChatGPT  ")).toBeUndefined();
    expect(validateName("😀".repeat(20))).toBeUndefined();
  });
});

describe("validateUrl", () => {
  it("rejects empty", () => {
    expect(validateUrl("")).toBe("errors.urlRequired");
  });
  it("rejects malformed or non-http(s)", () => {
    expect(validateUrl("notaurl")).toBe("errors.urlInvalid");
    expect(validateUrl("ftp://x.com")).toBe("errors.urlInvalid");
  });
  it("accepts http/https", () => {
    expect(validateUrl("https://chatgpt.com")).toBeUndefined();
    expect(validateUrl("http://localhost:3000")).toBeUndefined();
  });
});

describe("validateProvider", () => {
  it("collects field errors", () => {
    expect(validateProvider({ name: "", url: "" })).toEqual({
      name: "errors.nameRequired",
      url: "errors.urlRequired",
    });
  });
  it("returns empty object when valid", () => {
    expect(validateProvider({ name: "X", url: "https://x.com" })).toEqual({});
  });
});

describe("canDisableProvider", () => {
  const p = (id: string, enabled: boolean): AiProvider => ({
    id, name: id, url: "https://x.com", enabled, logo: { type: "letter", color: "#000" },
  });
  it("false when only one enabled", () => {
    expect(canDisableProvider([p("a", true), p("b", false)])).toBe(false);
  });
  it("true when two or more enabled", () => {
    expect(canDisableProvider([p("a", true), p("b", true)])).toBe(true);
  });
});
