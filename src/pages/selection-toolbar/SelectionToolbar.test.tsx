import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const placeAndShowSelectionToolbar = vi.fn().mockResolvedValue(undefined);
const hideSelectionToolbar = vi.fn().mockResolvedValue(undefined);
const getPendingSelectionShow = vi.fn().mockResolvedValue({ text: "", x: 0, y: 0, show: false });
const copySelection = vi.fn().mockResolvedValue(undefined);
const showQuickAsk = vi.fn().mockResolvedValue(undefined);
const showQuickAskWithPrompt = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lib/commands", () => ({
  placeAndShowSelectionToolbar: (w: number, h: number) => placeAndShowSelectionToolbar(w, h),
  hideSelectionToolbar: () => hideSelectionToolbar(),
  getPendingSelectionShow: () => getPendingSelectionShow(),
  copySelection: () => copySelection(),
  showQuickAsk: () => showQuickAsk(),
  showQuickAskWithPrompt: (prompt: string | null) => showQuickAskWithPrompt(prompt),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));
vi.mock("../../state/SettingsContext", () => ({
  useSettings: () => ({
    settings: { language: "zh-CN" },
    ready: true,
    updateSettings: () => Promise.resolve(),
  }),
}));

import { I18nProvider } from "../../i18n";
import { SelectionToolbar } from "./SelectionToolbar";

function setup() {
  return render(
    <I18nProvider>
      <SelectionToolbar />
    </I18nProvider>
  );
}

beforeEach(() => {
  for (const m of [placeAndShowSelectionToolbar, hideSelectionToolbar, copySelection, showQuickAsk, showQuickAskWithPrompt]) {
    m.mockReset();
    m.mockResolvedValue(undefined);
  }
  getPendingSelectionShow.mockReset().mockResolvedValue({ text: "", x: 0, y: 0, show: false });
});

describe("SelectionToolbar", () => {
  it("renders the four builtin buttons", () => {
    setup();
    for (const name of ["解释", "翻译", "总结", "复制"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("copy button copies then hides", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "复制" }));
    expect(copySelection).toHaveBeenCalled();
    expect(hideSelectionToolbar).toHaveBeenCalled();
    expect(showQuickAsk).not.toHaveBeenCalled();
  });

  it("explain button opens quick-ask without prompt when captured text is blank", async () => {
    getPendingSelectionShow.mockResolvedValue({ text: "   \n", x: 0, y: 0, show: true });
    setup();
    await waitFor(() => expect(placeAndShowSelectionToolbar).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "解释" }));

    expect(showQuickAskWithPrompt).toHaveBeenCalledWith(null);
    expect(showQuickAsk).not.toHaveBeenCalled();
    expect(hideSelectionToolbar).toHaveBeenCalled();
    expect(copySelection).not.toHaveBeenCalled();
  });

  it("translate button sends a rendered prompt to quick-ask when captured text is non-empty", async () => {
    getPendingSelectionShow.mockResolvedValue({ text: "hello\nworld", x: 0, y: 0, show: true });
    setup();
    await waitFor(() => expect(placeAndShowSelectionToolbar).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "翻译" }));

    expect(showQuickAskWithPrompt).toHaveBeenCalledWith("hello\nworld\n\n翻译上文至简体中文");
    expect(showQuickAsk).not.toHaveBeenCalled();
    expect(hideSelectionToolbar).toHaveBeenCalled();
    expect(copySelection).not.toHaveBeenCalled();
  });
});
