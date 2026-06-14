import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "./defaults";

const loadSettings = vi.fn();
const saveSettings = vi.fn();
vi.mock("./settingsStore", () => ({
  loadSettings: () => loadSettings(),
  saveSettings: (s: unknown) => saveSettings(s),
  SETTINGS_CHANGED_EVENT: "settings:changed",
}));

// 捕获 listen 回调，模拟另一个窗口的广播
const ev = vi.hoisted(() => ({ cb: null as null | ((e: { payload: unknown }) => void) }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: (_name: string, cb: (e: { payload: unknown }) => void) => {
    ev.cb = cb;
    return Promise.resolve(() => {});
  },
}));

import { SettingsProvider, useSettings } from "./SettingsContext";

function Probe() {
  const { settings, updateSettings } = useSettings();
  return (
    <div>
      <span data-testid="theme">{settings.theme}</span>
      <button onClick={() => updateSettings({ theme: "dark" })}>dark</button>
    </div>
  );
}

beforeEach(() => {
  loadSettings.mockReset();
  saveSettings.mockReset();
  loadSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, theme: "light" });
  saveSettings.mockResolvedValue(undefined);
  ev.cb = null;
});

describe("SettingsContext", () => {
  it("loads settings and provides them", async () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );
    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("light"));
  });

  it("updateSettings merges and persists", async () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );
    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("light"));
    await act(async () => {
      screen.getByText("dark").click();
    });
    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("dark"));
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ theme: "dark" }));
  });

  it("syncs in-memory settings when another window broadcasts a change", async () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );
    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("light"));
    // 模拟另一个窗口写设置后广播
    await act(async () => {
      ev.cb?.({ payload: { ...DEFAULT_SETTINGS, theme: "dark" } });
    });
    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("dark"));
    // 仅同步内存，不应再次写回（避免跨窗口回环）
    expect(saveSettings).not.toHaveBeenCalled();
  });
});
