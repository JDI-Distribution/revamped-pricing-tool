export const WEIGHT_FACTORS_TO_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  mg: 0.001,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
  "metric ton": 1000000,
  t: 1000000,
  mL: 1,
  ml: 1,
  L: 1000,
  l: 1000,
  "fl oz": 29.5735,
};

export const WEIGHT_INPUT_UNITS = ["g", "kg", "oz", "lbs", "mg", "metric ton", "mL", "L", "fl oz"] as const;
export const PALLET_WEIGHT_UNITS = ["lbs", "kg", "g", "oz", "metric ton"] as const;
export const PROCESS_WEIGHT_UNITS = ["g", "kg", "oz", "lbs"] as const;
export const PROCESS_SPEED_WEIGHT_UNITS = [
  "g / min",
  "g / hr",
  "kg / min",
  "kg / hr",
  "oz / min",
  "oz / hr",
  "lbs / min",
  "lbs / hr",
] as const;

export function isWeightUnit(unit?: string) {
  return !!unit && WEIGHT_FACTORS_TO_GRAMS[unit] != null;
}

export function toGrams(value: number, unit: string) {
  return value * (WEIGHT_FACTORS_TO_GRAMS[unit] ?? 1);
}

export function fromGrams(grams: number, unit: string) {
  return grams / (WEIGHT_FACTORS_TO_GRAMS[unit] ?? 1);
}

export function convertWeightValue(value: number, fromUnit: string, toUnit: string) {
  return fromGrams(toGrams(value, fromUnit), toUnit);
}

export function roundForDisplay(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value === 0) return 0;
  return Number.parseFloat(value.toPrecision(6));
}

function splitRateUnit(unit: string) {
  const [measure = "", period = ""] = unit.split("/").map(part => part.trim());
  return { measure, period };
}

export function processSpeedToGramsPerHour(value: number, unit: string) {
  const { measure, period } = splitRateUnit(unit);
  const factor = WEIGHT_FACTORS_TO_GRAMS[measure];
  if (!factor || value <= 0) return 0;
  if (period === "min") return value * factor * 60;
  if (period === "hr") return value * factor;
  return 0;
}

export function processSpeedFromGramsPerHour(gramsPerHour: number, unit: string) {
  const { measure, period } = splitRateUnit(unit);
  const factor = WEIGHT_FACTORS_TO_GRAMS[measure];
  if (!factor || gramsPerHour <= 0) return 0;
  if (period === "min") return gramsPerHour / factor / 60;
  if (period === "hr") return gramsPerHour / factor;
  return 0;
}

export function convertProcessSpeedValue(value: number, fromUnit: string, toUnit: string) {
  const gramsPerHour = processSpeedToGramsPerHour(value, fromUnit);
  if (gramsPerHour > 0 && processSpeedToGramsPerHour(1, toUnit) > 0) {
    return roundForDisplay(processSpeedFromGramsPerHour(gramsPerHour, toUnit));
  }
  return value;
}
