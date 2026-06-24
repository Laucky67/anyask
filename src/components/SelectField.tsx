import { useState, useRef, useEffect, useCallback, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

export interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
  labelledby?: string;
  labelledbyLabel?: string;
}

const triggerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "9px 12px 9px 14px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--fg)",
  fontSize: 15,
  cursor: "pointer",
  outline: "none",
  minWidth: 220,
  textAlign: "left" as const,
};

const menuStyle: CSSProperties = {
  position: "fixed",
  zIndex: 1000,
  background: "var(--bg)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  padding: 4,
  overflow: "hidden",
};

const itemBase: CSSProperties = {
  display: "block",
  width: "100%",
  padding: "9px 12px",
  border: "none",
  borderRadius: "var(--radius-sm)",
  background: "transparent",
  color: "var(--fg)",
  fontSize: 14,
  cursor: "pointer",
  textAlign: "left" as const,
};

// inject menu keyframe once
let injected = false;
function injectKeyframe() {
  if (injected) return;
  injected = true;
  const s = document.createElement("style");
  s.textContent = `
    @keyframes selectMenuIn {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(s);
}

export function SelectField({ value, options, onChange, disabled, labelledby, labelledbyLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  injectKeyframe();

  const updateRect = useCallback(() => {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
  }, []);

  // keep position in sync on scroll/resize while open
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open, updateRect]);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        disabled={disabled}
        aria-labelledby={labelledby}
        aria-label={labelledbyLabel}
        aria-expanded={open}
        onClick={() => { updateRect(); setOpen(!open); }}
        style={{
          ...triggerStyle,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
          borderColor: open ? "var(--accent)" : "var(--border)",
        }}
      >
        <span style={{ flex: 1 }}>{selectedLabel}</span>
        <ChevronDown
          size={14}
          style={{
            color: "var(--fg-muted)",
            transition: "transform 0.2s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {open && rect && (() => {
          const estHeight = Math.min(options.length * 38 + 8, 300);
          const below = rect.bottom + 4 + estHeight <= window.innerHeight;
          const top = below ? rect.bottom + 4 : rect.top - 4 - estHeight;
          return createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={{
            ...menuStyle,
            top,
            left: rect.left,
            minWidth: rect.width,
            maxHeight: 300,
            overflowY: "auto",
            animation: "selectMenuIn 0.15s var(--ease-out-expo) both",
          }}
        >
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  ...itemBase,
                  background: selected ? "var(--bg-elev)" : "transparent",
                  fontWeight: selected ? 600 : 400,
                  transition: `background 0.15s var(--ease-out-expo)`,
                }}
                onMouseEnter={(e) => {
                  if (!selected) (e.currentTarget as HTMLElement).style.background = "var(--bg-elev)";
                }}
                onMouseLeave={(e) => {
                  if (!selected) (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>,
        document.body
      );
      })()}
    </div>
  );
}
