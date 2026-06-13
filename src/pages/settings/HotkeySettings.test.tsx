import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_SETTINGS } from "../../state/defaults";

const saveSettings = vi.fn().mockResolvedValue(undefined);
vi.mock("../../state/settingsStore", () => ({
  loadSettings: () => Promise.resolve(DEFAULT_SETTINGS),
  saveSettings: (s: unknown) => saveSettings(s),
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
  saveSettings.mockClear();
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
});
