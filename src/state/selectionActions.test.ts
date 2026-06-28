import { describe, it, expect } from "vitest";
import {
  BUILTIN_SELECTION_ACTIONS,
  ICON_REGISTRY,
  buildSelectionPrompt,
  enabledActions,
  languageName,
} from "./selectionActions";

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

function builtinAction(id: string) {
  const action = BUILTIN_SELECTION_ACTIONS.find((a) => a.id === id);
  if (!action) throw new Error(`missing builtin action: ${id}`);
  return action;
}

describe("selection prompt templates", () => {
  it("defines prompt templates for AI actions and leaves copy without one", () => {
    expect(builtinAction("explain").promptTemplate).toBe("{{selection}}\n\n解释上文");
    expect(builtinAction("translate").promptTemplate).toBe("{{selection}}\n\n翻译上文至{{targetLanguage}}");
    expect(builtinAction("summarize").promptTemplate).toBe("{{selection}}\n\n总结上文");
    expect(builtinAction("copy").promptTemplate).toBeUndefined();
  });

  it("maps zh-CN to Simplified Chinese as the target language name", () => {
    expect(languageName("zh-CN")).toBe("简体中文");
  });

  it("renders explain, translate, and summarize prompts while preserving selection text", () => {
    const selection = "  function demo() {\n    return \"ok\";\n  }  ";

    expect(buildSelectionPrompt(builtinAction("explain"), selection, "zh-CN")).toBe(
      `${selection}\n\n解释上文`
    );
    expect(buildSelectionPrompt(builtinAction("translate"), selection, "zh-CN")).toBe(
      `${selection}\n\n翻译上文至简体中文`
    );
    expect(buildSelectionPrompt(builtinAction("summarize"), selection, "zh-CN")).toBe(
      `${selection}\n\n总结上文`
    );
  });

  it("returns null for actions without a prompt template", () => {
    expect(buildSelectionPrompt(builtinAction("copy"), "hello", "zh-CN")).toBeNull();
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
