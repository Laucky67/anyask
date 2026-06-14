import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
import { AiConfigSettings } from "./AiConfigSettings";

function setup() {
  return render(
    <I18nProvider>
      <SettingsProvider>
        <AiConfigSettings />
      </SettingsProvider>
    </I18nProvider>
  );
}

beforeEach(() => saveSettings.mockClear());

describe("AiConfigSettings", () => {
  it("renders a row per provider", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("ChatGPT")).toBeInTheDocument());
    expect(screen.getByText("Claude")).toBeInTheDocument();
  });

  it("expands a row and edits the url", async () => {
    setup();
    await waitFor(() => screen.getByText("ChatGPT"));
    await userEvent.click(screen.getByRole("button", { name: /展开 ChatGPT/ }));
    const urlInput = await screen.findByLabelText("ChatGPT 官网地址");
    await userEvent.clear(urlInput);
    await userEvent.type(urlInput, "https://chat.openai.com");
    const last = saveSettings.mock.calls.at(-1)![0];
    expect(last.providers.find((p: any) => p.id === "chatgpt").url).toBe("https://chat.openai.com");
  });

  it("blocks disabling the provider quick-ask is using, and shows a hint", async () => {
    setup();
    await waitFor(() => screen.getByText("ChatGPT"));
    await userEvent.click(screen.getByRole("button", { name: /展开 ChatGPT/ }));
    // ChatGPT 是 DEFAULT_SETTINGS.quickAskProviderId，关闭其启用开关应被拦下
    const toggle = await screen.findByRole("switch", { name: "ChatGPT 是否启用" });
    await userEvent.click(toggle);
    expect(screen.getByText("快捷提问正在使用，无法停用")).toBeInTheDocument();
    expect(saveSettings).not.toHaveBeenCalled();
  });
});
