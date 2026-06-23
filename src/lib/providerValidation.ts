import type { AiProvider, ValidationErrors } from "../state/types";

const MAX_NAME_LEN = 20;

export function validateName(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return "errors.nameRequired";
  if (Array.from(trimmed).length > MAX_NAME_LEN) return "errors.nameTooLong";
  return undefined;
}

export function validateUrl(url: string): string | undefined {
  const trimmed = url.trim();
  if (!trimmed) return "errors.urlRequired";
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "errors.urlInvalid";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "errors.urlInvalid";
  return undefined;
}

export function validateProvider(draft: { name: string; url: string }): ValidationErrors {
  const errors: ValidationErrors = {};
  const name = validateName(draft.name);
  const url = validateUrl(draft.url);
  if (name) errors.name = name;
  if (url) errors.url = url;
  return errors;
}

/** 是否允许停用某个 provider：启用数 > 1 时才可停用（至少保留一个启用） */
export function canDisableProvider(providers: AiProvider[]): boolean {
  return providers.filter((p) => p.enabled).length > 1;
}
