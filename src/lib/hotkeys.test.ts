import { describe, it, expect } from "vitest";
import { eventToAccelerator, isValidAccelerator, formatAccelerator, hasConflict, hasAnyConflict } from "./hotkeys";

function ev(parts: Partial<KeyboardEvent>): KeyboardEvent {
  return { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, code: "", key: "", ...parts } as KeyboardEvent;
}

describe("eventToAccelerator", () => {
  it("builds modifier + key", () => {
    expect(eventToAccelerator(ev({ ctrlKey: true, code: "KeyA", key: "a" }))).toBe("CommandOrControl+A");
  });
  it("orders modifiers as Ctrl, Alt, Shift", () => {
    expect(eventToAccelerator(ev({ ctrlKey: true, shiftKey: true, altKey: true, code: "KeyK", key: "k" }))).toBe("CommandOrControl+Alt+Shift+K");
  });
  it("maps Space and digits", () => {
    expect(eventToAccelerator(ev({ ctrlKey: true, code: "Space", key: " " }))).toBe("CommandOrControl+Space");
    expect(eventToAccelerator(ev({ ctrlKey: true, code: "Digit1", key: "1" }))).toBe("CommandOrControl+1");
  });
  it("returns null when only modifiers are pressed", () => {
    expect(eventToAccelerator(ev({ ctrlKey: true, altKey: true, code: "ControlLeft", key: "Control" }))).toBeNull();
  });
});

describe("isValidAccelerator", () => {
  it("requires a non-modifier key", () => {
    expect(isValidAccelerator("CommandOrControl+A")).toBe(true);
    expect(isValidAccelerator("CommandOrControl+Alt")).toBe(false);
    expect(isValidAccelerator("")).toBe(false);
  });
});

describe("formatAccelerator", () => {
  it("renders friendly label", () => {
    expect(formatAccelerator("CommandOrControl+Shift+Space")).toBe("Ctrl + Shift + Space");
  });
});

describe("hasConflict", () => {
  it("detects identical accelerators", () => {
    expect(hasConflict("CommandOrControl+Space", "CommandOrControl+Space")).toBe(true);
    expect(hasConflict("CommandOrControl+Space", "CommandOrControl+Shift+Space")).toBe(false);
  });
});

describe("hasAnyConflict", () => {
  it("detects a duplicate among three accelerators", () => {
    expect(hasAnyConflict(["Alt+Q", "Shift+Z", "Alt+Q"])).toBe(true);
    expect(hasAnyConflict(["Alt+Q", "Shift+Z", "CommandOrControl+Space"])).toBe(false);
  });
  it("ignores empty strings", () => {
    expect(hasAnyConflict(["", "", "Alt+Q"])).toBe(false);
  });
});
