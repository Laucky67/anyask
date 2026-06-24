import type { ProviderLogo as Logo } from "../state/types";

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
    return <img src={logo.src} alt={name} width={size} height={size} style={{ borderRadius: size * 0.25, objectFit: "cover", display: "block" }} />;
  }
  return (
    <span
      aria-label={name}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.25,
        background: logo.color,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        fontSize: size * 0.5,
        userSelect: "none",
      }}
    >
      {initialOf(name)}
    </span>
  );
}
