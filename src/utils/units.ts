/** Exact conversion factors (international definitions). */
export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export type WeightUnit = 'kg' | 'lb';
export type HeightUnit = 'cm' | 'in';
export type TemperatureUnit = 'C' | 'F';

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const inToCm = (inch: number) => inch * CM_PER_IN;
export const cToF = (c: number) => (c * 9) / 5 + 32;
export const fToC = (f: number) => ((f - 32) * 5) / 9;

export function weightToDisplay(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kgToLb(kg);
}
export function weightFromDisplay(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : lbToKg(value);
}
export function heightToDisplay(cm: number, unit: HeightUnit): number {
  return unit === 'cm' ? cm : cmToIn(cm);
}
export function heightFromDisplay(value: number, unit: HeightUnit): number {
  return unit === 'cm' ? value : inToCm(value);
}
export function temperatureToDisplay(c: number, unit: TemperatureUnit): number {
  return unit === 'C' ? c : cToF(c);
}
export function temperatureFromDisplay(value: number, unit: TemperatureUnit): number {
  return unit === 'C' ? value : fToC(value);
}
