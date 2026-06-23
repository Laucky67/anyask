# 划词按钮导致 QuickAsk 卡死

## 现象

划词工具条点击“解释 / 翻译 / 总结”后，QuickAsk 不出现，应用卡死；“复制”正常。

## 原因

非复制按钮会从 `selection-toolbar` WebView 发起 IPC：`show_quick_ask`。

旧实现里，该命令直接同步执行 `quick_ask::show()`。首次打开 QuickAsk 时会创建 `quick-ask` 窗口和 `quick-ask-ai` 子 WebView；这个过程需要和 Tauri/Wry 事件循环通信。当前 WebView IPC 尚未返回时，再同步创建另一个 WebView，在 Windows/WebView2 上可能形成等待环。

## 修复方式

保留前端按钮行为不变，只拆后端 IPC 调用链：

- `show_quick_ask` 不再直接调用 `quick_ask::show(&app)`。
- 新增 `quick_ask::show_deferred(app)`，把显示 QuickAsk 投递到异步任务中。
- 任务延后 1ms 后再执行 `show(&app)`，让划词工具条的 IPC 先返回。

这样 QuickAsk 的窗口创建和子 WebView 创建不再嵌在 `selection-toolbar` 的 IPC 调用栈里，避免互相等待导致卡死。
