import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_SETTINGS } from "../../state/defaults";

const saveSettings = vi.fn().mockResolvedValue(undefined);
vi.mock("../../state/settingsStore", () => ({
  loadSettings: () => Promise.resolve(DEFAULT_SETTINGS),
  saveSettings: (s: unknown) => saveSettings(s),
  SETTINGS_CHANGED_EVENT: "settings:changed",
}));
const applyHotkeys = vi.fn().mockResolvedValue({ quickAsk: true, showMain: true });
vi.mock("../../lib/commands", () => ({ applyHotkeys: () => applyHotkeys() }));

import { SettingsProvider } from "../../state/SettingsContext";
import { I18nProvider } from "../../i18n";
import { HotkeySettings } from "./HotkeySettings";

function setup() {
  return render(
    <I18nProvider>
      <SettingsProvider>
        <HotkeySettings />
      </SettingsProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  saveSettings.mockReset();
  saveSettings.mockResolvedValue(undefined);
  applyHotkeys.mockClear();
});

describe("HotkeySettings", () => {
  it("shows current hotkeys formatted", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("快捷提问")).toBeInTheDocument());
    expect(screen.getByText("Ctrl + Space")).toBeInTheDocument();
    expect(screen.getByText("Ctrl + Shift + Space")).toBeInTheDocument();
  });

  it("captures a new hotkey on click + keydown", async () => {
    setup();
    await waitFor(() => screen.getByText("快捷提问"));
    await userEvent.click(screen.getByRole("button", { name: /设置 快捷提问 快捷键/ }));
    fireEvent.keyDown(window, { ctrlKey: true, altKey: true, code: "KeyJ", key: "j" });
    await waitFor(() => {
      const last = saveSettings.mock.calls.at(-1)![0];
      expect(last.hotkeys.quickAsk).toBe("CommandOrControl+Alt+J");
    });
    expect(applyHotkeys).toHaveBeenCalled();
  });

  it("applies hotkeys only after the new setting is persisted", async () => {
    // 让保存挂起，模拟 store 写入尚未完成
    let resolveSave: (() => void) | null = null;
    saveSettings.mockImplementation(
      () => new Promise<void>((res) => { resolveSave = () => res(); })
    );
    setup();
    await waitFor(() => screen.getByText("快捷提问"));
    applyHotkeys.mockClear(); // 忽略挂载时的一次 applyHotkeys
    await userEvent.click(screen.getByRole("button", { name: /设置 快捷提问 快捷键/ }));
    fireEvent.keyDown(window, { ctrlKey: true, altKey: true, code: "KeyJ", key: "j" });

    // 保存已发起
    await waitFor(() => expect(saveSettings).toHaveBeenCalled());
    // 保存完成前不得调用 applyHotkeys（否则 Rust 会读到旧值 -> 切出设置才生效的 bug）
    expect(applyHotkeys).not.toHaveBeenCalled();

    resolveSave!();
    await waitFor(() => expect(applyHotkeys).toHaveBeenCalled());
  });
});
