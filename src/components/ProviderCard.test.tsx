import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProviderCard } from "./ProviderCard";
import type { ProviderLogo as ProviderLogoType } from "../state/types";

const letterLogo: ProviderLogoType = { type: "letter", color: "#10A37F" };

describe("ProviderCard", () => {
  it("renders the provider name", () => {
    render(<ProviderCard name="ChatGPT" logo={letterLogo} />);
    expect(screen.getByText("ChatGPT")).toBeInTheDocument();
  });

  it("fires onClick when clicked", async () => {
    const onClick = vi.fn();
    render(<ProviderCard name="Claude" logo={letterLogo} onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: "Claude" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("reflects selected via aria-pressed", () => {
    render(<ProviderCard name="Claude" logo={letterLogo} selected onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Claude" })).toHaveAttribute("aria-pressed", "true");
  });

  it("renders an image logo when logo.type is image", () => {
    const imgLogo: ProviderLogoType = { type: "image", src: "https://example.com/x.png" };
    render(<ProviderCard name="Custom" logo={imgLogo} />);
    expect(screen.getByRole("img", { name: "Custom" })).toBeInTheDocument();
  });

  it("renders no chevron by default", () => {
    const { container } = render(<ProviderCard name="ChatGPT" logo={letterLogo} />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("renders a chevron when arrow is set", () => {
    const { container } = render(<ProviderCard name="ChatGPT" logo={letterLogo} arrow="down" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
