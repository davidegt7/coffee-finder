import { useCallback } from "react";
import { useStore } from "../store";
import { t as translate, type Lang, type StringKey } from "./i18n";

/**
 * Bound translator for the current language, plus the raw `lang` for the few
 * spots that pick between a data label's `.es` / `.en` directly.
 */
export function useT(): {
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  lang: Lang;
} {
  const lang = useStore((s) => s.lang);
  const t = useCallback(
    (key: StringKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );
  return { t, lang };
}
