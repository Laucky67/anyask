import { describe, it, expect } from "vitest";
import { validateLogoFile, logoActionFromDraft } from "./logo";
import type { DraftProvider } from "../state/types";

function fileOf(type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], "logo", { type });
}

describe("validateLogoFile", () => {
  it("rejects unsupported type", () => {
    expect(validateLogoFile(fileOf("image/svg+xml", 10))).toBe("errors.logoInvalidFormat");
  });
  it("rejects > 5MB", () => {
    expect(validateLogoFile(fileOf("image/png", 5 * 1024 * 1024 + 1))).toBe("errors.logoTooLarge");
  });
  it("accepts a small png", () => {
    expect(validateLogoFile(fileOf("image/png", 10))).toBeUndefined();
  });
});

describe("logoActionFromDraft", () => {
  const base: DraftProvider = {
    id: "x", name: "  X  ", url: "https://x.com", enabled: true,
    logo: { type: "letter", color: "#000" },
  };
  it("upload when a new thumbnail is pending", () => {
    expect(logoActionFromDraft({ ...base, pendingLogoDataUrl: "data:image/png;base64,AA" }))
      .toEqual({ type: "upload", dataUrl: "data:image/png;base64,AA" });
  });
  it("keep when logo is an unchanged image", () => {
    expect(logoActionFromDraft({ ...base, logo: { type: "image", src: "x" } }))
      .toEqual({ type: "keep" });
  });
  it("generate from trimmed name when logo is letter", () => {
    expect(logoActionFromDraft(base)).toEqual({ type: "generate", name: "X" });
  });
});
