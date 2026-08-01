import type { Lang } from "./i18n";

export const DEFAULT_COUNTRY = "Chile";
export const DEFAULT_COUNTRY_CODE = "cl";

export function normalizeCountryCode(value?: string | null): string {
  const clean = value?.trim().toLowerCase();
  return clean && /^[a-z]{2}$/.test(clean) ? clean : "";
}

export function countryName(code: string, fallback: string, lang: Lang): string {
  const normalized = normalizeCountryCode(code);
  if (!normalized || typeof Intl.DisplayNames !== "function") return fallback;
  try {
    return new Intl.DisplayNames([lang], { type: "region" }).of(normalized.toUpperCase()) ?? fallback;
  } catch {
    return fallback;
  }
}

