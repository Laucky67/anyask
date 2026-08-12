import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
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

// jsdom 没有布局信息，无法让 dnd-kit 计算真实碰撞位置；以一个确定的拖放结果验证
// 配置页自身的重排、暂存与持久化行为。
vi.mock("@dnd-kit/core", async () => {
  const React = await import("react");
  return {
    DndContext: ({ children, onDragEnd }: { children: ReactNode; onDragEnd: (event: unknown) => void }) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(
          "button",
          { type: "button", onClick: () => onDragEnd({ active: { id: "claude" }, over: { id: "chatgpt" } }) },
          "完成模拟拖动"
        ),
        children
      ),
    KeyboardSensor: class KeyboardSensor {},
    PointerSensor: class PointerSensor {},
    closestCenter: () => null,
    useSensor: () => ({}),
    useSensors: (...sensors: unknown[]) => sensors,
  };
});

vi.mock("@dnd-kit/sortable", () => {
  return {
    SortableContext: ({ children }: { children: ReactNode }) => children,
    arrayMove: <T,>(items: T[], from: number, to: number) => {
      const next = [...items];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    },
    sortableKeyboardCoordinates: () => ({ x: 0, y: 0 }),
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setActivatorNodeRef: () => {},
      setNodeRef: () => {},
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
    verticalListSortingStrategy: () => [],
  };
});

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

function renderedProviderIds() {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-provider-id]")).map((el) => el.dataset.providerId);
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

  it("previews a dragged order and persists it only after saving the order", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("ChatGPT")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "完成模拟拖动" }));
    expect(renderedProviderIds()).toEqual(["claude", "chatgpt", "aistudio"]);
    expect(saveSettings).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "保存排序" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "保存排序" }));
    await waitFor(() => {
      const last = saveSettings.mock.calls.at(-1)![0];
      expect(last.providers.map((p: any) => p.id)).toEqual(["claude", "chatgpt", "aistudio"]);
    });
  });

  it("cancels a pending sort and does not persist it", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("ChatGPT")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "完成模拟拖动" }));

    await userEvent.click(screen.getByRole("button", { name: "取消排序" }));
    expect(renderedProviderIds()).toEqual(["chatgpt", "claude", "aistudio"]);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("does not add a drag handle for an unsaved provider", async () => {
    setup();
    await waitFor(() => screen.getByText("ChatGPT"));
    await userEvent.click(screen.getByRole("button", { name: "添加AI服务商" }));
    expect(screen.queryByRole("button", { name: "拖动以排序：新建服务商" })).not.toBeInTheDocument();
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

  it("keeps the built-in image logo when editing & saving a default provider", async () => {
    // 模拟后端 keep 返回一个指向不存在文件的路径(真实回归场景)
    saveProvider.mockResolvedValue({ type: "image", src: "asset://localhost/provider-logos/chatgpt.png?bad" });
    setup();
    await waitFor(() => screen.getByText("ChatGPT"));
    await userEvent.click(screen.getByRole("button", { name: "ChatGPT" }));
    const urlInput = await screen.findByLabelText("官网地址");
    await userEvent.clear(urlInput);
    await userEvent.type(urlInput, "https://chat.openai.com");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    // 应以 keep 操作保存
    expect(saveProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chatgpt", logoAction: { type: "keep" } })
    );
    // 持久化后的 logo 应沿用内置图,而非后端返回的坏路径
    await waitFor(() => {
      const last = saveSettings.mock.calls.at(-1)![0];
      const chatgpt = last.providers.find((p: any) => p.id === "chatgpt");
      expect(chatgpt.logo).toEqual({ type: "image", src: "/providers/chatgpt.png" });
    });
  });
});
