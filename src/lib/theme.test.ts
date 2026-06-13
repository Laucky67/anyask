import { describe, it, expect, beforeEach } from "vitest";
import { resolveTheme, applyTheme } from "./theme";

describe("resolveTheme", () => {
  it("returns explicit light/dark as-is", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("resolves system to system preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("applyTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });
  it("sets data-theme on <html>", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
