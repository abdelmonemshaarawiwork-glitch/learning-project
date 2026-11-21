import { describe, expect, it } from "vitest";
import { ar } from "@/lib/i18n/dictionaries/ar";
import { en } from "@/lib/i18n/dictionaries/en";
import { createTranslator } from "@/lib/i18n/core";

function shape(obj: unknown, prefix = ""): string[] {
  if (typeof obj === "string") return [prefix];
  const o = obj as Record<string, unknown>;
  if ("other" in o && typeof o.other === "string") return [prefix + "#plural"];
  return Object.keys(o).flatMap((k) => shape(o[k], prefix ? `${prefix}.${k}` : k));
}

function placeholders(obj: unknown, prefix = "", out = new Map<string, string>()): Map<string, string> {
  if (typeof obj === "string") {
    out.set(prefix, [...obj.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(","));
    return out;
  }
  const o = obj as Record<string, unknown>;
  if ("other" in o && typeof o.other === "string") return out;
  for (const k of Object.keys(o)) placeholders(o[k], prefix ? `${prefix}.${k}` : k, out);
  return out;
}

describe("dictionaries", () => {
  it("Arabic has exactly the same keys as English", () => {
    expect(shape(ar).sort()).toEqual(shape(en).sort());
  });
  it("uses the same placeholders in both languages", () => {
    const a = placeholders(ar);
    for (const [key, vars] of placeholders(en)) expect(a.get(key), key).toBe(vars);
  });
  it("has no empty strings", () => {
    const empty = (o: unknown): boolean =>
      typeof o === "string" ? o.trim() === "" : Object.values(o as object).some(empty);
    expect(empty(en)).toBe(false);
    expect(empty(ar)).toBe(false);
  });
});

describe("translator", () => {
  it("interpolates and pluralizes", () => {
    const t = createTranslator("en");
    expect(t.t("greeting.morning", { name: "Sam" })).toBe("Good morning, Sam");
    expect(t.tp("units.missions", 1)).toBe("1 mission");
    expect(t.tp("units.missions", 4)).toBe("4 missions");
    expect(t.formatMinutes(80)).toBe("1 h 20 min");
    expect(t.formatMinutes(45)).toBe("45 min");
  });
  it("uses Arabic plural categories", () => {
    const t = createTranslator("ar");
    expect(t.tp("units.missions", 1)).toBe("مهمة واحدة");
    expect(t.tp("units.missions", 2)).toBe("مهمتان");
    expect(t.tp("units.missions", 5)).toBe("5 مهام");
    expect(t.tp("units.missions", 11)).toBe("11 مهمة");
    expect(t.dir).toBe("rtl");
  });
});
