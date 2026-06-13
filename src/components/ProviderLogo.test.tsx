import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProviderLogo, initialOf } from "./ProviderLogo";

describe("initialOf", () => {
  it("returns first uppercased character", () => {
    expect(initialOf("chatgpt")).toBe("C");
    expect(initialOf("Claude")).toBe("C");
  });
  it("handles empty name", () => {
    expect(initialOf("")).toBe("?");
  });
});

describe("ProviderLogo", () => {
  it("renders letter fallback with background color", () => {
    render(<ProviderLogo name="ChatGPT" logo={{ type: "letter", color: "#10A37F" }} size={32} />);
    const el = screen.getByText("C");
    expect(el).toBeInTheDocument();
  });
  it("renders image when provided", () => {
    render(<ProviderLogo name="ChatGPT" logo={{ type: "image", src: "/x.png" }} size={32} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/x.png");
  });
});
