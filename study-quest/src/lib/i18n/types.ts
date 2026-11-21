import type { EnMessages } from "./dictionaries/en";

export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

type IsPlural<T> = T extends { other: string } ? true : false;

/** Same tree as English, with plural objects widened so other languages can add forms. */
export type Shape<T> = {
  [K in keyof T]: T[K] extends string ? string : IsPlural<T[K]> extends true ? PluralForms : Shape<T[K]>;
};
export type Messages = Shape<EnMessages>;

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : IsPlural<T[K]> extends true
      ? never
      : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

type Plurals<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? never
    : IsPlural<T[K]> extends true
      ? `${P}${K}`
      : Plurals<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<EnMessages>;
export type PluralKey = Plurals<EnMessages>;
export type Vars = Record<string, string | number>;
