import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toggle } from "./Toggle";

describe("Toggle", () => {
  it("reflects checked state via aria-checked", () => {
    render(<Toggle checked label="保留" onChange={() => {}} />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });
  it("calls onChange with toggled value", async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} label="保留" onChange={onChange} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
  it("does not call onChange when disabled", async () => {
    const onChange = vi.fn();
    render(<Toggle checked={true} label="启用" disabled onChange={onChange} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
