import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_PROVIDERS, mergeSettings } from "./defaults";

describe("DEFAULT_SETTINGS", () => {
  it("has 3 built-in providers all enabled", () => {
    expect(DEFAULT_PROVIDERS.map((p) => p.id)).toEqual(["chatgpt", "claude", "aistudio"]);
    expect(DEFAULT_PROVIDERS.every((p) => p.enabled)).toBe(true);
  });

  it("defaults keepStateOnSwitch to true and theme to system", () => {
    expect(DEFAULT_SETTINGS.keepStateOnSwitch).toBe(true);
    expect(DEFAULT_SETTINGS.theme).toBe("system");
  });

  it("default hotkeys", () => {
    expect(DEFAULT_SETTINGS.hotkeys.quickAsk).toBe("Shift+Z");
    expect(DEFAULT_SETTINGS.hotkeys.showMain).toBe("CommandOrControl+Alt+Space");
    expect(DEFAULT_SETTINGS.hotkeys.selectionToolbar).toBe("Alt+Q");
  });

  it("defaults quickAskResetPolicy to after5m", () => {
    expect(DEFAULT_SETTINGS.quickAskResetPolicy).toBe("after5m");
  });

  it("defaults selectionAutoPopup to true", () => {
    expect(DEFAULT_SETTINGS.selectionAutoPopup).toBe(true);
  });
});

describe("mergeSettings", () => {
  it("returns defaults when stored is null", () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("fills missing fields from defaults", () => {
    const merged = mergeSettings({ theme: "dark" });
    expect(merged.theme).toBe("dark");
    expect(merged.keepStateOnSwitch).toBe(true);
    expect(merged.providers).toHaveLength(3);
  });

  it("fills missing quickAskResetPolicy from defaults", () => {
    const merged = mergeSettings({ theme: "dark" });
    expect(merged.quickAskResetPolicy).toBe("after5m");
  });

  it("keeps stored quickAskResetPolicy", () => {
    const merged = mergeSettings({ quickAskResetPolicy: "never" });
    expect(merged.quickAskResetPolicy).toBe("never");
  });

  it("fills missing selectionToolbar hotkey from defaults", () => {
    expect(mergeSettings({}).hotkeys.selectionToolbar).toBe("Alt+Q");
  });

  it("keeps stored providers when present", () => {
    const merged = mergeSettings({
      providers: [{ id: "x", name: "X", url: "https://x.com", enabled: false, logo: { type: "letter", color: "#000" } }],
    });
    expect(merged.providers).toHaveLength(1);
    expect(merged.providers[0].id).toBe("x");
  });

  it("does not mutate DEFAULT_SETTINGS", () => {
    const merged = mergeSettings({ theme: "dark" });
    merged.providers.push({ id: "y", name: "Y", url: "", enabled: true, logo: { type: "letter", color: "#111" } });
    expect(DEFAULT_SETTINGS.providers).toHaveLength(3);
  });

  it("fills missing selectionAutoPopup from defaults", () => {
    expect(mergeSettings({}).selectionAutoPopup).toBe(true);
  });

  it("keeps stored selectionAutoPopup=false", () => {
    expect(mergeSettings({ selectionAutoPopup: false }).selectionAutoPopup).toBe(false);
  });
});
