interface ToggleProps {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ checked, label, onChange, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        padding: 2,
        background: checked ? "var(--accent)" : "var(--border)",
        transition: `background 0.25s var(--ease-out-expo)`,
        display: "inline-flex",
        justifyContent: checked ? "flex-end" : "flex-start",
        alignItems: "center",
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: checked ? "0 1px 4px rgba(0,0,0,0.15)" : "0 1px 2px rgba(0,0,0,0.1)",
          transition: `box-shadow 0.25s var(--ease-out-expo)`,
        }}
      />
    </button>
  );
}
