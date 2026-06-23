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

const addProvider = vi.fn();
const saveProvider = vi.fn();
const deleteProvider = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lib/commands", () => ({
  addProvider: (i: unknown) => addProvider(i),
  saveProvider: (i: unknown) => saveProvider(i),
  deleteProvider: (id: string) => deleteProvider(id),
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

beforeEach(() => {
  saveSettings.mockClear();
  addProvider.mockReset();
  saveProvider.mockReset().mockResolvedValue({ type: "letter", color: "#10A37F" });
  deleteProvider.mockReset().mockResolvedValue(undefined);
});

describe("AiConfigSettings", () => {
  it("renders a row per provider", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("ChatGPT")).toBeInTheDocument());
    expect(screen.getByText("Claude")).toBeInTheDocument();
  });

  it("does not persist while editing; saves only on save button", async () => {
    setup();
    await waitFor(() => screen.getByText("ChatGPT"));
    await userEvent.click(screen.getByRole("button", { name: "ChatGPT" }));
    const urlInput = await screen.findByLabelText("官网地址");
    await userEvent.clear(urlInput);
    await userEvent.type(urlInput, "https://chat.openai.com");
    expect(saveSettings).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(saveProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chatgpt", url: "https://chat.openai.com" })
    );
    await waitFor(() => {
      const last = saveSettings.mock.calls.at(-1)![0];
      expect(last.providers.find((p: any) => p.id === "chatgpt").url).toBe("https://chat.openai.com");
    });
  });

  it("shows validation errors and does not call backend on empty name", async () => {
    setup();
    await waitFor(() => screen.getByText("ChatGPT"));
    await userEvent.click(screen.getByRole("button", { name: "ChatGPT" }));
    await userEvent.clear(await screen.findByLabelText("服务商名称"));
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByText("名称不能为空")).toBeInTheDocument();
    expect(saveProvider).not.toHaveBeenCalled();
  });

  it("adds a provider via the temp card", async () => {
    addProvider.mockResolvedValue({ id: "newid", logo: { type: "letter", color: "#9333EA" } });
    setup();
    await waitFor(() => screen.getByText("ChatGPT"));
    await userEvent.click(screen.getByRole("button", { name: "添加AI服务商" }));
    await userEvent.type(await screen.findByLabelText("服务商名称"), "X");
    await userEvent.type(screen.getByLabelText("官网地址"), "https://x.com");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(addProvider).toHaveBeenCalled();
    await waitFor(() => {
      const last = saveSettings.mock.calls.at(-1)![0];
      expect(last.providers.some((p: any) => p.id === "newid")).toBe(true);
    });
  });

  it("deletes a provider after confirm", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    setup();
    await waitFor(() => screen.getByText("Claude"));
    await userEvent.click(screen.getByRole("button", { name: "Claude" }));
    await userEvent.click(await screen.findByRole("button", { name: "删除" }));
    expect(deleteProvider).toHaveBeenCalledWith("claude");
    await waitFor(() => {
      const last = saveSettings.mock.calls.at(-1)![0];
      expect(last.providers.some((p: any) => p.id === "claude")).toBe(false);
    });
  });
});
