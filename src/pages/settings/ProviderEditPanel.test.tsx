import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../../i18n";
import { ProviderEditPanel } from "./ProviderEditPanel";
import type { DraftProvider } from "../../state/types";

const draft: DraftProvider = {
  id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com", enabled: true,
  logo: { type: "letter", color: "#10A37F" },
};

function setup(overrides: Partial<React.ComponentProps<typeof ProviderEditPanel>> = {}) {
  const props = {
    draft, errors: {}, isTemp: false, canDisable: true, saving: false,
    onChange: vi.fn(), onSave: vi.fn(), onCancel: vi.fn(), onDelete: vi.fn(),
    ...overrides,
  };
  render(
    <I18nProvider>
      <ProviderEditPanel {...props} />
    </I18nProvider>
  );
  return props;
}

describe("ProviderEditPanel", () => {
  it("edits name via onChange", async () => {
    const props = setup();
    await userEvent.type(screen.getByLabelText("服务商名称"), "!");
    expect(props.onChange).toHaveBeenCalledWith({ name: "ChatGPT!" });
  });

  it("shows field errors", () => {
    setup({ errors: { name: "errors.nameRequired", url: "errors.urlInvalid" } });
    expect(screen.getByText("名称不能为空")).toBeInTheDocument();
    expect(screen.getByText("URL格式不正确")).toBeInTheDocument();
  });

  it("disables the enable toggle and delete, and shows hint, when it is the only enabled", () => {
    setup({ canDisable: false });
    expect(screen.getByText("至少需要保留一个启用的AI")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeDisabled();
  });

  it("hides delete button for a temp provider", () => {
    setup({ isTemp: true });
    expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
  });

  it("calls save / cancel", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(props.onSave).toHaveBeenCalled();
    expect(props.onCancel).toHaveBeenCalled();
  });
});
