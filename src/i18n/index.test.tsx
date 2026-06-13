import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { translate } from "./index";
import { I18nProvider, useT } from "./index";

describe("translate", () => {
  it("returns the mapped string", () => {
    expect(translate("settings.title")).toBe("设置");
  });
  it("falls back to the key when missing", () => {
    expect(translate("nonexistent.key")).toBe("nonexistent.key");
  });
});

function Probe() {
  const t = useT();
  return <span>{t("settings.basic")}</span>;
}

describe("useT", () => {
  it("provides translation function", () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );
    expect(screen.getByText("基础配置")).toBeInTheDocument();
  });
});
