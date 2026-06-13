const MODIFIER_CODES = new Set([
  "ControlLeft", "ControlRight", "AltLeft", "AltRight",
  "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight",
]);

/** 从 code 推导加速器主键名；不支持的返回 null */
function codeToKey(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code; // F1..F12
  const map: Record<string, string> = {
    Space: "Space",
    Enter: "Enter",
    Tab: "Tab",
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
  };
  return map[code] ?? null;
}

/** 键盘事件 -> Tauri 加速器字符串；仅按下修饰键时返回 null */
export function eventToAccelerator(e: KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(e.code)) return null;
  const key = codeToKey(e.code);
  if (!key) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

/** 必须含至少一个非修饰键才有效 */
export function isValidAccelerator(acc: string): boolean {
  if (!acc) return false;
  const parts = acc.split("+");
  const last = parts[parts.length - 1];
  return last !== "CommandOrControl" && last !== "Alt" && last !== "Shift" && last !== "Super" && last.length > 0;
}

/** 友好显示（Windows 风格） */
export function formatAccelerator(acc: string): string {
  return acc
    .split("+")
    .map((p) => (p === "CommandOrControl" ? "Ctrl" : p === "Super" ? "Win" : p))
    .join(" + ");
}

export function hasConflict(a: string, b: string): boolean {
  return a.length > 0 && a === b;
}
