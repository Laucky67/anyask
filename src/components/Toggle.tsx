import styles from "./Toggle.module.css";

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
      className={styles.toggle}
    >
      <span className={styles.knob} />
    </button>
  );
}
