# Bug 修复报告：快捷提问首次呼出在左上角闪现虚影

- **日期**：2026-06-16ㅤ**分支**：`dev`
- **改动**：`src-tauri/src/quick_ask.rs`（+1 行）

## 现象
快捷提问首次呼出、或「完全注销」（reset 销毁窗口）后再呼出时，窗口先在屏幕左上角闪一帧虚影，再跳到设定的中下部就位。后续呼出不闪。

## 根因（单一）
`toggle()` 的首次创建分支里，`WebviewWindowBuilder` 未设 `visible`，Tauri v2 默认 `visible: true`，所以 `build()` 一执行窗口就以系统默认位置（Windows `CW_USEDEFAULT`，屏幕左上）显示；其后 `center_bottom()` 才用 `set_position` 挪到中下部。这一前一后的时间差就是那帧虚影。

后续呼出走已存在分支、只 `show`/`raise` 不重新定位，故不闪；「完全注销」调 `win.close()` 销毁窗口，再呼出又走创建分支，虚影重现。

## 修复（一处）
builder 链加 `.visible(false)`：窗口隐身创建 → `add_child` → `center_bottom` 隐身定位 → `raise()`（内部已含 `show()`）首次显示。窗口从不在错误位置露脸。

## 验证
`cargo check` 通过。
