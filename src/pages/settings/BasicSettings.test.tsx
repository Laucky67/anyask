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

beforeEach(() => saveSettings.mockClear());

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

  it("blocks disabling the provider quick-ask is using, and shows a hint", async () => {
    setup();
    await waitFor(() => screen.getByRole("button", { name: /ChatGPT 启用状态/ }));
    await act(async () => {
      // ChatGPT 是 DEFAULT_SETTINGS.quickAskProviderId
      (await screen.findByRole("button", { name: /ChatGPT 启用状态/ })).click();
    });
    expect(screen.getByText("快捷提问正在使用，无法停用")).toBeInTheDocument();
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
});
