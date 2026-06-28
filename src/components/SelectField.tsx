import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import styles from "./SelectField.module.css";

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

export function SelectField({ value, options, onChange, disabled, labelledby, labelledbyLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
    <div className={styles.wrap}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        disabled={disabled}
        aria-labelledby={labelledby}
        aria-label={labelledbyLabel}
        aria-expanded={open}
        onClick={() => { updateRect(); setOpen(!open); }}
        className={styles.trigger}
        data-open={open || undefined}
      >
        <span className={styles.label}>{selectedLabel}</span>
        <ChevronDown size={14} className={styles.chevron} />
      </button>

      {open && rect && (() => {
          const estHeight = Math.min(options.length * 38 + 8, 300);
          const below = rect.bottom + 4 + estHeight <= window.innerHeight;
          const top = below ? rect.bottom + 4 : rect.top - 4 - estHeight;
          return createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className={styles.menu}
          style={{ top, left: rect.left, minWidth: rect.width }}
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
                className={styles.item}
                data-selected={selected || undefined}
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
