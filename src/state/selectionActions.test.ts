import { describe, it, expect } from "vitest";
import { BUILTIN_SELECTION_ACTIONS, ICON_REGISTRY, enabledActions } from "./selectionActions";

describe("BUILTIN_SELECTION_ACTIONS", () => {
  it("has the four builtins in order with correct kinds", () => {
    expect(BUILTIN_SELECTION_ACTIONS.map((a) => a.kind)).toEqual([
      "explain",
      "translate",
      "summarize",
      "copy",
    ]);
    expect(BUILTIN_SELECTION_ACTIONS.every((a) => a.source === "builtin")).toBe(true);
    expect(BUILTIN_SELECTION_ACTIONS.every((a) => a.enabled)).toBe(true);
  });

  it("every builtin has a labelKey and a registered icon", () => {
    for (const a of BUILTIN_SELECTION_ACTIONS) {
      expect(a.labelKey).toBeTruthy();
      expect(ICON_REGISTRY[a.icon]).toBeDefined();
    }
  });
});

describe("enabledActions", () => {
  it("filters disabled and sorts by order ascending", () => {
    const acts = [
      { id: "b", source: "builtin", kind: "copy", icon: "Copy", enabled: true, order: 2 },
      { id: "a", source: "builtin", kind: "explain", icon: "BookOpen", enabled: true, order: 1 },
      { id: "c", source: "builtin", kind: "translate", icon: "Languages", enabled: false, order: 3 },
    ];
    expect(enabledActions(acts as never).map((a) => a.id)).toEqual(["a", "b"]);
  });
});
