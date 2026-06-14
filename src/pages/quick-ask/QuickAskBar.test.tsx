import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_SETTINGS } from "../../state/defaults";

const hideQuickAsk = vi.fn().mockResolvedValue(undefined);
const setQuickAskPinned = vi.fn().mockResolvedValue(undefined);
const quickAskNewChat = vi.fn().mockResolvedValue(undefined);
const setQuickAskProvider = vi.fn().mockResolvedValue(undefined);
const setQuickAskAiVisible = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lib/commands", () => ({
  hideQuickAsk: () => hideQuickAsk(),
  setQuickAskPinned: (p: boolean) => setQuickAskPinned(p),
  quickAskNewChat: () => quickAskNewChat(),
  setQuickAskProvider: (u: string) => setQuickAskProvider(u),
  setQuickAskAiVisible: (v: boolean) => setQuickAskAiVisible(v),
}));

const saveSettings = vi.fn().mockResolvedValue(undefined);
vi.mock("../../state/settingsStore", () => ({
  loadSettings: () => Promise.resolve(DEFAULT_SETTINGS),
  saveSettings: (s: unknown) => saveSettings(s),
  SETTINGS_CHANGED_EVENT: "settings:changed",
}));

// 暴露 onFocusChanged 回调，供测试模拟窗口失焦
const h = vi.hoisted(() => ({ cb: null as null | ((e: { payload: boolean }) => void) }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: (cb: (e: { payload: boolean }) => void) => {
      h.cb = cb;
      return Promise.resolve(() => {});
    },
  }),
}));

import { SettingsProvider } from "../../state/SettingsContext";
import { I18nProvider } from "../../i18n";
import { QuickAskBar } from "./QuickAskBar";

function setup() {
  return render(
    <I18nProvider>
      <SettingsProvider>
        <QuickAskBar />
      </SettingsProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  for (const m of [hideQuickAsk, setQuickAskPinned, quickAskNewChat, setQuickAskProvider, setQuickAskAiVisible, saveSettings]) {
    m.mockReset();
    m.mockResolvedValue(undefined);
  }
  h.cb = null;
});

describe("QuickAskBar", () => {
  it("hides on hide button click", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "隐藏" }));
    expect(hideQuickAsk).toHaveBeenCalled();
  });

  it("toggles pin and reflects aria-pressed", async () => {
    setup();
    const pin = screen.getByRole("button", { name: "置顶" });
    expect(pin).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(pin);
    expect(setQuickAskPinned).toHaveBeenCalledWith(true);
    await waitFor(() => expect(pin).toHaveAttribute("aria-pressed", "true"));
    await userEvent.click(pin);
    expect(setQuickAskPinned).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(pin).toHaveAttribute("aria-pressed", "false"));
  });

  it("keeps pin state unchanged when set_quick_ask_pinned fails (rollback)", async () => {
    setQuickAskPinned.mockRejectedValueOnce(new Error("set_always_on_top failed"));
    setup();
    const pin = screen.getByRole("button", { name: "置顶" });
    await userEvent.click(pin);
    expect(setQuickAskPinned).toHaveBeenCalledWith(true);
    await waitFor(() => expect(setQuickAskPinned).toHaveBeenCalled());
    expect(pin).toHaveAttribute("aria-pressed", "false");
  });

  it("starts a new chat on new-chat button click", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "新对话" }));
    expect(quickAskNewChat).toHaveBeenCalled();
  });

  it("opens the AI panel: hides the AI webview and lists enabled providers", async () => {
    setup();
    await waitFor(() => screen.getByRole("button", { name: "选择 AI" }));
    await userEvent.click(screen.getByRole("button", { name: "选择 AI" }));
    expect(setQuickAskAiVisible).toHaveBeenCalledWith(false);
    // DEFAULT_SETTINGS 三个 provider 均 enabled，应各出现一张卡片
    expect(await screen.findByRole("button", { name: "Claude" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Google AI Studio" })).toBeInTheDocument();
  });

  it("selects a provider: navigates, persists default, restores AI, closes", async () => {
    setup();
    await waitFor(() => screen.getByRole("button", { name: "选择 AI" }));
    await userEvent.click(screen.getByRole("button", { name: "选择 AI" }));
    await userEvent.click(await screen.findByRole("button", { name: "Claude" }));

    expect(setQuickAskProvider).toHaveBeenCalledWith("https://claude.ai");
    await waitFor(() => {
      const last = saveSettings.mock.calls.at(-1)![0];
      expect(last.quickAskProviderId).toBe("claude");
    });
    expect(setQuickAskAiVisible).toHaveBeenCalledWith(true);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Claude" })).not.toBeInTheDocument());
  });

  it("restores the AI webview even when navigation fails (finally)", async () => {
    setQuickAskProvider.mockRejectedValueOnce(new Error("navigate failed"));
    setup();
    await waitFor(() => screen.getByRole("button", { name: "选择 AI" }));
    await userEvent.click(screen.getByRole("button", { name: "选择 AI" }));
    await userEvent.click(await screen.findByRole("button", { name: "Claude" }));
    await waitFor(() => expect(setQuickAskAiVisible).toHaveBeenLastCalledWith(true));
  });

  it("closes the panel and restores AI when clicking empty area", async () => {
    setup();
    await waitFor(() => screen.getByRole("button", { name: "选择 AI" }));
    await userEvent.click(screen.getByRole("button", { name: "选择 AI" }));
    const panel = await screen.findByTestId("ai-panel");
    setQuickAskAiVisible.mockClear();
    await userEvent.click(panel);
    expect(setQuickAskAiVisible).toHaveBeenCalledWith(true);
    await waitFor(() => expect(screen.queryByTestId("ai-panel")).not.toBeInTheDocument());
  });

  it("restores the AI webview when the window loses focus while the panel is open", async () => {
    setup();
    await waitFor(() => screen.getByRole("button", { name: "选择 AI" }));
    await userEvent.click(screen.getByRole("button", { name: "选择 AI" }));
    setQuickAskAiVisible.mockClear();
    // 模拟窗口失焦（含被快捷键隐藏的情况）
    await act(async () => {
      h.cb?.({ payload: false });
    });
    await waitFor(() => expect(setQuickAskAiVisible).toHaveBeenCalledWith(true));
  });
});
