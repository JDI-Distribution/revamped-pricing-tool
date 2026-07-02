/**
 * Converts PackagingLevel[] → Column[] for the existing calculation engine.
 * This is the bridge between the new unified PackagingLevels UI and the
 * existing computeDetailSections / computeColumn math.
 */
import { Column, PackagingLevel } from "./types";

// Stable numeric id from a string id — take last 8 hex chars of the string
// as an integer so Column.id (number) stays stable across renders.
function numId(strId: string): number {
  let h = 0;
  for (let i = 0; i < strId.length; i++) {
    h = (Math.imul(31, h) + strId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

// Effective unit count for a level — explicit units take priority, then perOuter cascade, then 0
export function effectiveUnitsForLevel(
  lvl: PackagingLevel,
  index: number,
  allLevels: PackagingLevel[],
  moqQty: number,
  unitsPerInner: number,
  innersPerMaster: number,
): number {
  if (lvl.units > 0) return lvl.units;
  if (index === 0) return moqQty;
  if (lvl.perOuter > 0) {
    const parentUnits = effectiveUnitsForLevel(
      allLevels[index - 1], index - 1, allLevels, moqQty, unitsPerInner, innersPerMaster,
    );
    return parentUnits > 0 ? Math.ceil(parentUnits / lvl.perOuter) : 0;
  }
  return 0;
}

export function packagingLevelsToColumns(
  levels: PackagingLevel[],
  moqQty: number,
  unitsPerInner: number,
  innersPerMaster: number,
): Column[] {
  return levels.map((lvl, index) => {
    // Prefer cpoRequiredQty when set — it is the CPO cascade Required Qty and represents
    // the actual units needed (including any packaging-level overage in the cascade).
    // Fall back to the MOQ-based auto-derivation when no CPO sync has run.
    const units = (lvl.cpoRequiredQty != null && lvl.cpoRequiredQty > 0)
      ? lvl.cpoRequiredQty
      : effectiveUnitsForLevel(lvl, index, levels, moqQty, unitsPerInner, innersPerMaster);
    const typeName = lvl.packagingType === "custom_mode"
      ? (lvl.customTypeName || "")
      : lvl.packagingType;

    const col: Column = {
      id:         numId(lvl.id),
      level:      lvl.customLevelName || lvl.packagingLevel || `Level ${index + 1}`,
      type:       typeName,
      units:      String(units),
      efficiency: String(lvl.efficiencyBuffer),
      labor:      String(lvl.laborMarkup),
      unitCost:   String(lvl.unitCostMarkup),
      tabs:       lvl.tabsEnabled,
      hvThreshold: lvl.hvThreshold > 0 ? String(lvl.hvThreshold) : undefined,
      hvFillRate:  lvl.hvFillRate  > 0 ? String(lvl.hvFillRate)  : undefined,
      rows: {
        "Overage Rate":            String(lvl.overageRate),
        "Wage Rate":               String(lvl.wageRate),
        "Unit Fill Rate / min":    String(lvl.fillRatePerMin),
        "Packaging Cost / unit":   String(lvl.costPerUnit),
        "Label Print Cost / unit": lvl.labelEnabled ? String(lvl.labelPrintCost) : "0",
        "Label Apply Rate / min":  String(lvl.labelApplyRate), // always pass — throughput bottleneck independent of labelEnabled
        "Packaging Weight (g)":    String(lvl.packagingWeightG),
        "No. of Staff / Stations": String(lvl.numStaff),
        "Hrs / Shift":             String(lvl.hrsPerShift),
        "Working Days":            String(lvl.workingDays),
        "Tab Cost / unit":         lvl.tabsEnabled ? String(lvl.tabCostPerUnit) : "0",
      },
    };

    return col;
  });
}
