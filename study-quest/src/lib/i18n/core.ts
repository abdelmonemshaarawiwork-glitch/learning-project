import type { Locale } from "@/lib/domain/types";
import { ar } from "./dictionaries/ar";
import { en } from "./dictionaries/en";
import type { Messages, MessageKey, PluralForms, PluralKey, Vars } from "./types";

export const LOCALES: Locale[] = ["en", "ar"];
export const LOCALE_COOKIE = "sq_locale";
export const THEME_COOKIE = "sq_theme";

const DICTS: Record<Locale, Messages> = { en, ar };

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "ar";
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** Intl locale tag: Arabic text with Western digits for clean mixed content. */
export function intlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-u-nu-latn" : "en-US";
}

function lookup(dict: Messages, key: string): unknown {
  let cur: unknown = dict;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  );
}

const pluralRules = new Map<Locale, Intl.PluralRules>();

export function createTranslator(locale: Locale) {
  const dict = DICTS[locale];
  const numberFmt = new Intl.NumberFormat(intlLocale(locale));
  const fmtVars = (vars?: Vars): Vars | undefined => {
    if (!vars) return vars;
    const out: Vars = {};
    for (const [k, v] of Object.entries(vars)) out[k] = typeof v === "number" ? numberFmt.format(v) : v;
    return out;
  };

  function t(key: MessageKey | string, vars?: Vars): string {
    const v = lookup(dict, key) ?? lookup(en as unknown as Messages, key);
    return typeof v === "string" ? interpolate(v, fmtVars(vars)) : key;
  }

  function tp(key: PluralKey, count: number, vars?: Vars): string {
    let rules = pluralRules.get(locale);
    if (!rules) {
      rules = new Intl.PluralRules(locale);
      pluralRules.set(locale, rules);
    }
    const forms = (lookup(dict, key) ?? lookup(en as unknown as Messages, key)) as PluralForms | undefined;
    if (!forms) return key;
    const cat = count === 0 && forms.zero ? "zero" : rules.select(count);
    const template = forms[cat as keyof PluralForms] ?? forms.other;
    return interpolate(template, fmtVars({ count, ...vars }));
  }

  function formatNumber(n: number): string {
    return numberFmt.format(n);
  }

  /** Compact human duration from minutes: "45 min", "1 h 20 min". */
  function formatMinutes(totalMinutes: number): string {
    const m = Math.max(0, Math.round(totalMinutes));
    const h = Math.floor(m / 60);
    const rest = m % 60;
    const H = t("units.h");
    const M = t("units.min");
    if (h === 0) return `${formatNumber(rest)} ${M}`;
    if (rest === 0) return `${formatNumber(h)} ${H}`;
    return `${formatNumber(h)} ${H} ${formatNumber(rest)} ${M}`;
  }

  function formatSeconds(totalSeconds: number): string {
    return formatMinutes(Math.round(totalSeconds / 60));
  }

  function formatDate(value: number | Date, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }, timeZone?: string): string {
    return new Intl.DateTimeFormat(intlLocale(locale), { ...opts, timeZone }).format(value);
  }

  return { locale, dir: dirFor(locale), t, tp, formatNumber, formatMinutes, formatSeconds, formatDate };
}

export type Translator = ReturnType<typeof createTranslator>;
