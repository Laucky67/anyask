import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_SETTINGS } from "./state/defaults";

vi.mock("./state/settingsStore", () => ({
  loadSettings: () => Promise.resolve(DEFAULT_SETTINGS),
  saveSettings: () => Promise.resolve(),
}));

vi.mock("./lib/commands", () => ({
  syncAiWebviews: vi.fn().mockResolvedValue(undefined),
  hideAiWebviews: vi.fn().mockResolvedValue(undefined),
  repositionAiWebviews: vi.fn().mockResolvedValue(undefined),
}));

import App from "./App";
import { SettingsProvider } from "./state/SettingsContext";
import { I18nProvider } from "./i18n";

function renderApp() {
  return render(
    <I18nProvider>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </I18nProvider>
  );
}

beforeEach(() => {});

describe("App", () => {
  it("shows the active AI placeholder by default", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId("content-area")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "ChatGPT" })).toBeInTheDocument();
  });

  it("opens settings when gear clicked", async () => {
    renderApp();
    await waitFor(() => screen.getByRole("button", { name: "设置" }));
    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(screen.getByText("基础配置")).toBeInTheDocument();
  });
});
