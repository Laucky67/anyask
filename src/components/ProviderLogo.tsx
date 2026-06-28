import type { ProviderLogo as Logo } from "../state/types";
import styles from "./ProviderLogo.module.css";

export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : "?";
}

interface Props {
  name: string;
  logo: Logo;
  size: number;
}

export function ProviderLogo({ name, logo, size }: Props) {
  if (logo.type === "image") {
    return (
      <img
        src={logo.src}
        alt={name}
        width={size}
        height={size}
        className={styles.img}
        style={{ borderRadius: size * 0.25 }}
      />
    );
  }
  return (
    <span
      aria-label={name}
      className={styles.letter}
      style={{ width: size, height: size, borderRadius: size * 0.25, background: logo.color, fontSize: size * 0.5 }}
    >
      {initialOf(name)}
    </span>
  );
}
