interface ToggleProps {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}

export function Toggle({ checked, label, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        border: "none",
        cursor: "pointer",
        padding: 2,
        background: checked ? "var(--accent)" : "var(--border)",
        transition: "background 0.15s",
        display: "inline-flex",
        justifyContent: checked ? "flex-end" : "flex-start",
        alignItems: "center",
      }}
    >
      <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff" }} />
    </button>
  );
}
