/**
 * UI strings. PMI terminology stays in English in both locales — that is how
 * it appears on the exam. Lesson bodies carry their own Burmese summary.
 */
import en from "./en.json";
import my from "./my.json";

export type Locale = "en" | "my";
export type Dict = typeof en;
const dicts: Record<Locale, Record<string, string>> = { en, my: { ...en, ...my } };

export function dict(locale: Locale): Dict {
  return dicts[locale] as Dict;
}

export function translate(locale: Locale, key: keyof Dict, vars: Record<string, string | number> = {}): string {
  let s = dicts[locale][key] ?? dicts.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export const LOCALES: Array<{ code: Locale; label: string }> = [
  { code: "en", label: "English" },
  { code: "my", label: "မြန်မာ" },
];
