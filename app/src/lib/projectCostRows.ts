import { computeColumnOutputs } from "@/lib/calculations";
import { qtyWithOverage } from "@/lib/quantityMath";
import { processSpeedToGramsPerHour } from "@/lib/weightUnits";
import { AdditionalFeeRow, CoPackingProcess, PackagingLevel, ProjectFormData, SummaryRow, SummaryTableRow } from "@/lib/types";

export type ProcessCostTotals = { our: number; selling: number };

export type ProjectCostBreakdownRow = {
  id: string;
  label: string;
  baselineQty: number | null;
  intakeQty: number | null;
  deliverableQty: number | null;
  sellingPrice: number;
  sellingPpu: number;
  ourCost: number;
  baselineOurCost: number;
  ourPpu: number;
  marginPct: number;
  marginDollars: number;
};

export type ProjectCostRow = ProjectCostBreakdownRow & {
  isFirstPackaging?: boolean;
  breakdownRows?: ProjectCostBreakdownRow[];
};

type ProjectCostBuildArgs = {
  formData: ProjectFormData;
  summaryRows: SummaryRow[];
  summaryTableRows: SummaryTableRow[];
  packagingLevels: PackagingLevel[];
  processes: CoPackingProcess[];
  processRows: ReturnType<typeof calculateProjectProcessCosts>["rows"];
  processCostTotals: ProcessCostTotals;
  additionalFees: AdditionalFeeRow[];
  notRequired: Record<string, boolean>;
};

function n(value: unknown) {
  const parsed = parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function unitToGrams(unit: string) {
  return ({ g: 1, oz: 28.3495, lb: 453.592, lbs: 453.592, kg: 1000, mg: 0.001, mL: 1, L: 1000, "fl oz": 29.5735, "metric ton": 1000000 }[unit] ?? 1);
}

function palletUnitToLbs(unit: string) {
  return ({ lbs: 1, kg: 2.20462, g: 0.00220462, oz: 0.0625, "metric ton": 2204.62, t: 2204.62 }[unit] ?? 1);
}

function calculateProcessHours(proc: CoPackingProcess, totalQty: number): number {
  const { processSpeedValue: speed, processSpeedUnit: unit, batchSizeValue: batchSize, efficiencyBuffer } = proc;
  if (speed === 0 || totalQty <= 0) return 0;
  const buffer = 1 - efficiencyBuffer / 100;
  if (buffer <= 0) return 0;
  const gramsPerHour = processSpeedToGramsPerHour(speed, unit);
  if (gramsPerHour > 0) return totalQty / (gramsPerHour * buffer);
  switch (unit) {
    case "units / min": return (totalQty / (speed * buffer)) / 60;
    case "units / hr": return totalQty / (speed * buffer);
    case "batches / hr": {
      const batches = batchSize > 0 ? Math.ceil(totalQty / batchSize) : 1;
      return batches / (speed * buffer);
    }
    case "min / unit": return (totalQty * (speed / buffer)) / 60;
    case "min / batch": {
      const batches = batchSize > 0 ? Math.ceil(totalQty / batchSize) : 1;
      return (batches * (speed / buffer)) / 60;
    }
    case "hrs / batch": {
      const batches = batchSize > 0 ? Math.ceil(totalQty / batchSize) : 1;
      return batches * (speed / buffer);
    }
    default: return 0;
  }
}

function isUnitProcessSpeed(unit: string): boolean {
  return unit.includes("unit") || unit.includes("batch");
}

function processLaborQty(proc: CoPackingProcess, weightG: number, unitWeightG: number): number {
  if (isUnitProcessSpeed(proc.processSpeedUnit)) return unitWeightG > 0 ? weightG / unitWeightG : weightG;
  return weightG;
}

export function calculateProjectProcessCosts(processes: CoPackingProcess[], unitWeightG: number) {
  const rows = processes.map(proc => {
    const totalWeightG = qtyWithOverage(proc.units, proc.overageRate);
    const totalUnits = unitWeightG > 0 ? totalWeightG / unitWeightG : totalWeightG;
    const qtyForLabor = processLaborQty(proc, totalWeightG, unitWeightG);
    const hrsRequired = calculateProcessHours(proc, qtyForLabor);
    const operators = proc.numStaff > 0 ? proc.numStaff : 1;
    const laborOur = hrsRequired * proc.laborRate * operators;
    const laborCust = laborOur * (1 + proc.laborMarkup / 100) * (1 + ((proc as any).costMarkup ?? 0) / 100);
    const baselineQtyForLabor = processLaborQty(proc, proc.units, unitWeightG);
    const baselineOur = calculateProcessHours(proc, baselineQtyForLabor) * proc.laborRate * operators;
    const margin = laborCust > 0 ? ((laborCust - laborOur) / laborCust) * 100 : 0;
    return { totalUnits, totalWeightG, laborOur, laborCust, baselineOur, margin };
  });

  const totals: ProcessCostTotals = rows.reduce(
    (sum, row) => ({ our: sum.our + row.laborOur, selling: sum.selling + row.laborCust }),
    { our: 0, selling: 0 },
  );

  return { rows, totals };
}

export function makeProjectCostRow(
  label: string,
  intakeQty: number | null,
  deliverableQty: number | null,
  sellingPrice: number,
  ourCost: number,
  extra: Partial<ProjectCostRow> = {},
): ProjectCostRow {
  const sellingPpuDenom = deliverableQty && deliverableQty > 0
    ? deliverableQty
    : intakeQty && intakeQty > 0
      ? intakeQty
      : null;
  const projectCostPpuDenom = deliverableQty && deliverableQty > 0
    ? deliverableQty
    : intakeQty && intakeQty > 0
      ? intakeQty
      : null;
  const sellingPpu = sellingPpuDenom ? sellingPrice / sellingPpuDenom : sellingPrice;
  const ourPpu = projectCostPpuDenom ? ourCost / projectCostPpuDenom : ourCost;
  const baselineQty = extra.baselineQty ?? deliverableQty ?? intakeQty ?? null;
  const baselineOurCost = extra.baselineOurCost ?? ourCost;
  const marginDollars = sellingPrice - ourCost;
  const marginPct = sellingPrice > 0 ? (marginDollars / sellingPrice) * 100 : 0;
  return {
    id: extra.id ?? label,
    label,
    baselineQty,
    intakeQty,
    deliverableQty,
    sellingPrice,
    sellingPpu,
    ourCost,
    baselineOurCost,
    ourPpu,
    marginPct,
    marginDollars,
    ...extra,
  };
}

export function buildProjectCostRows({
  formData,
  summaryRows,
  summaryTableRows,
  packagingLevels,
  processes,
  processRows,
  processCostTotals,
  additionalFees,
  notRequired,
}: ProjectCostBuildArgs) {
  const summaryTableFor = (label: string) =>
    summaryTableRows.find(row => row.label === label && !row.isLeadTimeSummary);

  const materialTableRow = summaryTableFor("Materials");
  const materialBaseUnits = materialTableRow?.totalUnits ?? 0;
  const unitWeightG = n(formData.unitWeight) * unitToGrams(formData.unitWeightUnit ?? "g");
  const materialOverage = n(formData.materialOverage);
  const materialIntakeUnits = materialBaseUnits > 0 ? Math.ceil(materialBaseUnits * (1 + materialOverage / 100)) : null;
  const materialReqGrams = materialTableRow?.totalWeight ?? 0;
  const customerProvidesRawMaterial = (formData.rawMaterialProvider || "customer") === "customer";
  const includeSetup = !notRequired["section-cpo"];
  const includeRawMaterials = !notRequired["section-raw-materials"];
  const includeInventoryHandling = !notRequired["section-inventory-handling"];
  const includeTesting = !notRequired["section-testing"];
  const includePackaging = !notRequired["section-packaging-summary"];
  const includePalletization = !notRequired["section-palletization"];
  const costPerGram = customerProvidesRawMaterial ? 0 : n(formData.costPerGram);
  const rawMaterialMarkup = n(formData.rawMaterialMarkup);
  const leftoverInventoryCost = customerProvidesRawMaterial ? 0 : n(formData.leftOverInventoryCost);
  const leftoverInventoryAbsorb = n(formData.leftOverInventoryAbsorb);
  const unabsorbedLeftoverPerGram = materialReqGrams > 0
    ? (1 - leftoverInventoryAbsorb / 100) * leftoverInventoryCost / materialReqGrams
    : 0;
  const rawMaterialOur = includeRawMaterials ? materialReqGrams * costPerGram : 0;
  const rawMaterialSelling = includeRawMaterials ? materialReqGrams * (costPerGram + unabsorbedLeftoverPerGram) * (1 + rawMaterialMarkup / 100) : 0;
  const rawMaterialBaselineOur = includeRawMaterials ? materialBaseUnits * unitWeightG * costPerGram : 0;
  const intakePallets = n((formData as ProjectFormData).numIntakePallets ?? formData.numPallets);
  const intakeFee = n((formData as ProjectFormData).inventoryHandlingFee);
  const intakeMarkup = n(formData.intakeFeeMarkup);
  const intakePalletWeightValue = n((formData as ProjectFormData).intakePalletWeightValue) || 1200;
  const intakePalletWeightUom = (formData as ProjectFormData).intakePalletWeightUom ?? "lbs";
  const intakePalletWeightLbs = intakePalletWeightValue * palletUnitToLbs(intakePalletWeightUom);
  const baselineIntakePallets = materialBaseUnits > 0 && unitWeightG > 0 && intakePalletWeightLbs > 0
    ? Math.ceil((materialBaseUnits * unitWeightG / 453.592) / intakePalletWeightLbs)
    : 0;
  const inventoryHandlingBaselineOur = includeInventoryHandling ? intakeFee * baselineIntakePallets : 0;
  const inventoryHandlingOur = includeInventoryHandling ? intakeFee * intakePallets : 0;
  const inventoryHandlingSelling = inventoryHandlingOur * (1 + intakeMarkup / 100);
  const projectMgmtFee = includeSetup ? n((formData as ProjectFormData).projectManagementFee) : 0;
  const testingEnabled = includeTesting && formData.testingEnabled !== "false";
  const testingMarkup = n(formData.testingMarkup);
  const testingRows = testingEnabled
    ? (formData.testingRows ?? []).filter(row => (row.cost ?? 0) > 0)
    : [];
  const testingDetailRows = testingRows.map((row, index) => {
    const testName = row.testType === "Custom" ? (row.customTestName || "Custom") : row.testType;
    const skus = (row.numSkus ?? n(formData.numSkus)) || 1;
    const our = (row.cost ?? 0) * skus;
    const selling = our * (1 + testingMarkup / 100);
    return makeProjectCostRow(
      `Testing - ${testName || `Test ${index + 1}`}`,
      skus,
      skus,
      selling,
      our,
      { id: `testing-${row.id ?? index}`, baselineQty: skus },
    );
  }).filter(row => row.sellingPrice > 0 || row.ourCost > 0);
  const testingSelling = testingDetailRows.reduce((sum, row) => sum + row.sellingPrice, 0);
  const testingOur = testingDetailRows.reduce((sum, row) => sum + row.ourCost, 0);

  const packagingLabels = summaryTableRows
    .filter(row =>
      !row.isLeadTimeSummary &&
      !["Setup / QA Fee", "Materials", "Pallets & Fees"].includes(row.label) &&
      !row.label.startsWith("Testing"),
    )
    .map(row => row.label);
  const firstPackagingLabel = packagingLabels[0] ?? "";
  const getPackagingLevel = (label: string) => {
    const index = packagingLabels.indexOf(label);
    return index >= 0 ? packagingLevels[index] : undefined;
  };
  const allCharges = packagingLevels[0]?.manualCharges ?? [];
  const manualChargeRowsForLevel = (level: PackagingLevel | undefined): ProjectCostBreakdownRow[] => {
    if (!level) return [];
    const baseUnits = level.cpoRequiredQty != null && level.cpoRequiredQty > 0 ? level.cpoRequiredQty : (level.units > 0 ? level.units : 0);
    const unitsWithOverage = Math.ceil(baseUnits * (1 + level.overageRate / 100));
    return allCharges
      .filter(charge => !charge.levelId || charge.levelId === level.id)
      .map(charge => {
        const total = charge.basis === "per_unit" ? charge.amount * unitsWithOverage : charge.amount;
        return makeProjectCostRow(
          `Manual Charge - ${charge.name}`,
          charge.basis === "per_unit" ? unitsWithOverage : 1,
          charge.basis === "per_unit" ? baseUnits : 1,
          total,
          total,
          { id: `manual-${level.id}-${charge.id}`, baselineQty: charge.basis === "per_unit" ? baseUnits : 1 },
        );
      })
      .filter(row => row.sellingPrice > 0 || row.ourCost > 0);
  };

  const processDetailRows = processes.map((proc, index) => {
    const detail = processRows[index];
    const deliverableQty = unitWeightG > 0 ? proc.units / unitWeightG : (proc.units || null);
    const intakeQty = detail?.totalUnits ?? (proc.units ? qtyWithOverage(proc.units, proc.overageRate) : null);
    return makeProjectCostRow(
      proc.name || `Process ${index + 1}`,
      intakeQty,
      deliverableQty,
      detail?.laborCust ?? 0,
      detail?.laborOur ?? 0,
      {
        id: proc.id,
        baselineQty: deliverableQty,
        baselineOurCost: detail?.baselineOur ?? 0,
      },
    );
  }).filter(row => row.sellingPrice > 0 || row.ourCost > 0);

  const makeMaterialTotalRow = () => {
    const breakdownRows = [
      makeProjectCostRow("Raw Material", materialIntakeUnits, materialBaseUnits || null, rawMaterialSelling, rawMaterialOur, { id: "raw-material", baselineQty: materialBaseUnits || null, baselineOurCost: rawMaterialBaselineOur }),
      makeProjectCostRow("Inventory Handling", intakePallets || null, intakePallets || null, inventoryHandlingSelling, inventoryHandlingOur, { id: "inventory-handling", baselineQty: baselineIntakePallets || null, baselineOurCost: inventoryHandlingBaselineOur }),
    ].filter(detail => detail.sellingPrice > 0 || detail.ourCost > 0);
    const combinedSelling = breakdownRows.reduce((sum, detail) => sum + detail.sellingPrice, 0);
    const combinedOur = breakdownRows.reduce((sum, detail) => sum + detail.ourCost, 0);
    const combinedBaselineOur = breakdownRows.reduce((sum, detail) => sum + detail.baselineOurCost, 0);
    return combinedSelling > 0 || combinedOur > 0
      ? makeProjectCostRow("Material - Total", materialIntakeUnits, materialBaseUnits || null, combinedSelling, combinedOur, { id: "material-total", baselineQty: materialBaseUnits || null, breakdownRows, baselineOurCost: combinedBaselineOur })
      : null;
  };
  const materialTotalRow = makeMaterialTotalRow();
  const baseRows = [
    ...(!summaryRows.some(row => row.label === "Materials") && materialTotalRow ? [materialTotalRow] : []),
    ...summaryRows.flatMap(row => {
      const tableRow = summaryTableFor(row.label);
      const level = getPackagingLevel(row.label);
      const isSetup = row.label === "Setup / QA Fee";
      const isMaterial = row.label === "Materials";
      const isFirstPackaging = row.label === firstPackagingLabel;

      if (isSetup) {
        if (!includeSetup) return [];
        const setupRows = [makeProjectCostRow(row.label, 1, 1, row.customerPrice, row.ourCosts)];
        if (projectMgmtFee > 0) setupRows.push(makeProjectCostRow("Project Mgmt Fee", 1, 1, projectMgmtFee, 0));
        return setupRows;
      }

      if (isMaterial) return materialTotalRow ? [materialTotalRow] : [];
      if (row.label.startsWith("Testing")) return [];
      if (row.label === "Pallets & Fees" && !includePalletization) return [];
      if (!includePackaging && row.label !== "Pallets & Fees") return [];

      const deliverableQty = level
        ? (level.cpoRequiredQty ?? level.units ?? tableRow?.totalUnits ?? null)
        : tableRow?.totalUnits ?? (isSetup ? 1 : null);
      const intakeQty = level && deliverableQty != null
        ? Math.ceil(deliverableQty * (1 + level.overageRate / 100))
        : tableRow?.totalUnits ?? null;
      const manualChargeRows = manualChargeRowsForLevel(level);
      const manualSelling = manualChargeRows.reduce((sum, detail) => sum + detail.sellingPrice, 0);
      const manualOur = manualChargeRows.reduce((sum, detail) => sum + detail.ourCost, 0);
      const baseSelling = row.customerPrice;
      const baseOur = row.ourCosts;
      const baseUnits = level && deliverableQty != null ? deliverableQty : (tableRow?.totalUnits ?? 0);
      const baselinePackoutOutput = level
        ? computeColumnOutputs(
            level.fillRatePerMin,
            level.efficiencyBuffer,
            level.wageRate,
            level.numStaff,
            level.hrsPerShift,
            level.workingDays,
            level.packagingWeightG,
            baseUnits,
            0,
            level.costPerUnit,
            0,
            level.labelApplyRate,
            level.tabsEnabled ? (level.tabApplyRate ?? 0) : 0,
          )
        : null;
      const baselineLabelCost = level?.labelEnabled ? level.labelPrintCost : 0;
      const baselineTabCost = level?.tabsEnabled ? level.tabCostPerUnit : 0;
      const baselineManual = level ? (level.manualCharges ?? []).reduce((sum, charge) => sum + (charge.basis === "per_unit" ? charge.amount * baseUnits : charge.amount), 0) : 0;
      const baselinePackoutOur = level
        ? (baseUnits * ((level.costPerUnit ?? 0) + baselineLabelCost + baselineTabCost)) + (baselinePackoutOutput?.ourLaborCost ?? 0) + baselineManual
        : baseOur;
      const sellingPrice = baseSelling + manualSelling + (isFirstPackaging ? processCostTotals.selling + testingSelling : 0);
      const ourCost = baseOur + manualOur + (isFirstPackaging ? processCostTotals.our + testingOur : 0);
      const baselineOurCost = baselinePackoutOur
        + (isFirstPackaging ? processDetailRows.reduce((sum, detail) => sum + detail.baselineOurCost, 0) + testingOur : 0);
      const breakdownRows = [
        makeProjectCostRow(`${row.label} Packaging Cost`, intakeQty, deliverableQty, baseSelling, baseOur, { id: `${row.label}-packaging`, baselineQty: baseUnits || null, baselineOurCost: baselinePackoutOur }),
        ...manualChargeRows,
        ...(isFirstPackaging ? testingDetailRows : []),
        ...(isFirstPackaging ? processDetailRows : []),
      ].filter(detail => detail.sellingPrice > 0 || detail.ourCost > 0);

      return [makeProjectCostRow(row.label, intakeQty, deliverableQty, sellingPrice, ourCost, {
        id: row.label,
        baselineQty: baseUnits || null,
        isFirstPackaging,
        breakdownRows,
        baselineOurCost,
      })];
    })];
  const internalSellingBase = baseRows.reduce((sum, row) => sum + row.sellingPrice, 0);
  const feeDenom = ppuUnitsFromRows(baseRows);
  const additionalFeeRows = (additionalFees ?? [])
    .filter(fee => fee.amount > 0)
    .map(fee => {
      const label = fee.type?.trim() || "Additional Cost / Fee";
      const our = fee.mode === "%"
        ? internalSellingBase * fee.amount
        : fee.amount * feeDenom;
      return makeProjectCostRow(label, feeDenom || null, feeDenom || null, 0, our, { id: `additional-fee-${fee.id}` });
    })
    .filter(row => row.ourCost > 0);
  const rows = [...baseRows, ...additionalFeeRows];

  const totals = rows.reduce(
    (sum, row) => ({ sellingPrice: sum.sellingPrice + row.sellingPrice, ourCost: sum.ourCost + row.ourCost }),
    { sellingPrice: 0, ourCost: 0 },
  );
  const totalPpuDenom = ppuUnitsFromRows(rows);
  return { rows, totals, totalPpuDenom };
}

export function ppuUnitsFromRows(rows: ProjectCostRow[]) {
  return rows.find(row => row.deliverableQty && row.deliverableQty > 1)?.deliverableQty
    ?? rows.find(row => row.intakeQty && row.intakeQty > 1)?.intakeQty
    ?? 1;
}

export function applyAdjustedRevenueToProjectCostRows(projectCostSummary: ReturnType<typeof buildProjectCostRows>, adjustedRevenue?: number) {
  const baseRows = projectCostSummary.rows;
  if (adjustedRevenue === undefined || baseRows.length === 0) return baseRows;
  const delta = adjustedRevenue - projectCostSummary.totals.sellingPrice;
  if (Math.abs(delta) < 0.005) return baseRows;
  const targetIndex = Math.max(
    0,
    baseRows.findIndex(row => row.isFirstPackaging || row.label.toLowerCase().includes("material")),
  );
  return baseRows.map((row, index) => {
    if (index !== targetIndex) return row;
    return makeProjectCostRow(
      row.label,
      row.intakeQty,
      row.deliverableQty,
      row.sellingPrice + delta,
      row.ourCost,
      {
        id: row.id,
        baselineQty: row.baselineQty,
        isFirstPackaging: row.isFirstPackaging,
        breakdownRows: row.breakdownRows,
        baselineOurCost: row.baselineOurCost,
      },
    );
  });
}
