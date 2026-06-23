import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_SETTINGS } from "../../state/defaults";

const saveSettings = vi.fn().mockResolvedValue(undefined);
vi.mock("../../state/settingsStore", () => ({
  loadSettings: () => Promise.resolve(DEFAULT_SETTINGS),
  saveSettings: (s: unknown) => saveSettings(s),
  SETTINGS_CHANGED_EVENT: "settings:changed",
}));

const setSelectionAutoPopup = vi.fn().mockResolvedValue(undefined);
const setQuickAskProvider = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lib/commands", () => ({
  setQuickAskProvider: (url: string) => setQuickAskProvider(url),
  setSelectionAutoPopup: (v: boolean) => setSelectionAutoPopup(v),
}));

import { SettingsProvider } from "../../state/SettingsContext";
import { I18nProvider } from "../../i18n";
import { BasicSettings } from "./BasicSettings";

function setup() {
  return render(
    <I18nProvider>
      <SettingsProvider>
        <BasicSettings />
      </SettingsProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  saveSettings.mockClear();
  setSelectionAutoPopup.mockClear();
});

describe("BasicSettings", () => {
  it("lists providers as toggle-able enable chips", async () => {
    setup();
    await waitFor(() => expect(screen.getByRole("button", { name: /ChatGPT 启用状态/ })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Claude 启用状态/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Google AI Studio 启用状态/ })).toBeInTheDocument();
  });

  it("toggles a non-default provider enabled and persists", async () => {
    setup();
    await waitFor(() => screen.getByRole("button", { name: /Claude 启用状态/ }));
    await act(async () => {
      (await screen.findByRole("button", { name: /Claude 启用状态/ })).click();
    });
    expect(saveSettings).toHaveBeenCalled();
    const last = saveSettings.mock.calls.at(-1)![0];
    expect(last.providers.find((p: any) => p.id === "claude").enabled).toBe(false);
  });

  it("switches quickAskProviderId when disabling the in-use provider (others enabled)", async () => {
    setup();
    await waitFor(() => screen.getByRole("button", { name: /ChatGPT 启用状态/ }));
    await act(async () => {
      // ChatGPT 是默认 quickAskProviderId，但仍有其它启用项，可停用并自动切换默认
      (await screen.findByRole("button", { name: /ChatGPT 启用状态/ })).click();
    });
    const last = saveSettings.mock.calls.at(-1)![0];
    expect(last.providers.find((p: any) => p.id === "chatgpt").enabled).toBe(false);
    expect(last.quickAskProviderId).toBe("claude");
  });

  it("blocks disabling the last enabled provider", async () => {
    setup();
    await waitFor(() => screen.getByRole("button", { name: /ChatGPT 启用状态/ }));
    await act(async () => {
      (await screen.findByRole("button", { name: /Claude 启用状态/ })).click();
    });
    await act(async () => {
      (await screen.findByRole("button", { name: /Google AI Studio 启用状态/ })).click();
    });
    saveSettings.mockClear();
    await act(async () => {
      // 此时仅剩 ChatGPT 启用，停用应被拦下
      (await screen.findByRole("button", { name: /ChatGPT 启用状态/ })).click();
    });
    expect(screen.getByText("至少需要保留一个启用的AI")).toBeInTheDocument();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("toggles keepStateOnSwitch", async () => {
    setup();
    await waitFor(() => screen.getByRole("switch", { name: "切出保留状态" }));
    await userEvent.click(screen.getByRole("switch", { name: "切出保留状态" }));
    const last = saveSettings.mock.calls.at(-1)![0];
    expect(last.keepStateOnSwitch).toBe(false);
  });

  it("persists quick ask reset policy changes", async () => {
    setup();
    const select = await screen.findByRole("combobox", { name: "快捷提问重置为新对话" });
    expect(select).toHaveValue("after5m");

    await userEvent.selectOptions(select, "after10m");

    const last = saveSettings.mock.calls.at(-1)![0];
    expect(last.quickAskResetPolicy).toBe("after10m");
  });

  it("toggles selectionAutoPopup: persists and syncs to backend", async () => {
    setup();
    await waitFor(() => screen.getByRole("switch", { name: "划词自动弹出" }));
    await userEvent.click(screen.getByRole("switch", { name: "划词自动弹出" }));
    const last = saveSettings.mock.calls.at(-1)![0];
    expect(last.selectionAutoPopup).toBe(false);
    expect(setSelectionAutoPopup).toHaveBeenCalledWith(false);
  });
});
