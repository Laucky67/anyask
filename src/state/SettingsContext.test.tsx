import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "./defaults";

const loadSettings = vi.fn();
const saveSettings = vi.fn();
vi.mock("./settingsStore", () => ({
  loadSettings: () => loadSettings(),
  saveSettings: (s: unknown) => saveSettings(s),
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
});
