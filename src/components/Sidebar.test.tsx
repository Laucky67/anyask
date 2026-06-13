import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "./Sidebar";
import type { AiProvider } from "../state/types";

const providers: AiProvider[] = [
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com", enabled: true, logo: { type: "letter", color: "#10A37F" } },
  { id: "claude", name: "Claude", url: "https://claude.ai", enabled: true, logo: { type: "letter", color: "#D97757" } },
];

describe("Sidebar", () => {
  it("renders one button per provider plus settings", () => {
    render(<Sidebar providers={providers} activeId="chatgpt" settingsActive={false} onSelect={() => {}} onOpenSettings={() => {}} />);
    expect(screen.getByRole("button", { name: "ChatGPT" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claude" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
  });
  it("calls onSelect with provider id", async () => {
    const onSelect = vi.fn();
    render(<Sidebar providers={providers} activeId="chatgpt" settingsActive={false} onSelect={onSelect} onOpenSettings={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Claude" }));
    expect(onSelect).toHaveBeenCalledWith("claude");
  });
  it("calls onOpenSettings", async () => {
    const onOpenSettings = vi.fn();
    render(<Sidebar providers={providers} activeId="chatgpt" settingsActive={false} onSelect={() => {}} onOpenSettings={onOpenSettings} />);
    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(onOpenSettings).toHaveBeenCalled();
  });
});
