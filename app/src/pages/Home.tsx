import { Fragment, useState, useCallback, useEffect, useRef } from "react";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { SlidersHorizontal, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { RequiredToggle, useSectionRequired } from "@/lib/SectionRequiredContext";
import Navbar from "@/components/navbar/Navbar";
import ProjectInfoSection from "@/components/project/ProjectInfoSection";
import ProjectDetails, { PackagingCostDatabaseModal } from "@/components/project/ProjectDetails";
import PackagingLevels from "@/components/project/PackagingLevels";
import CoPackingProcesses from "@/components/project/CoPackingProcesses";
import SectionSidebar, { SidebarSection } from "@/components/SectionSidebar";
import CrmStartModal, { CrmParams as CrmStartParams } from "@/components/CrmStartModal";
import { useProject } from "@/lib/ProjectContext";
import { MoqRow, ProjectFormData, AdditionalFeeRow, PackagingLevel, CoPackingProcess, Column, SummaryRow, SummaryTableRow } from "@/lib/types";
import { MoqPricingRow } from "@/lib/ProjectContext";
import { uid } from "@/lib/uid";
import { qtyWithOverage } from "@/lib/quantityMath";
import { computeColumnOutputs } from "@/lib/calculations";
import { convertWeightValue, PALLET_WEIGHT_UNITS, processSpeedToGramsPerHour, roundForDisplay } from "@/lib/weightUnits";
import { fetchPackagingCostAudit, fetchPackagingCostItems, loadPackagingCostAudit, loadPackagingCostItems, savePackagingCostAudit, savePackagingCostItems, PackagingCostAuditEntry, PackagingCostItem } from "@/lib/packagingCostDatabase";

const fmt    = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const REVISION_SOURCE_STORAGE_KEY = "jdi_revision_source";
const SAVED_QUOTES_API = "https://jdi-pricing-tool-914416811.development.catalystserverless.com/server/quotes-api/quotes";

type ProcessCostTotals = { our: number; selling: number };
type ProjectCostBreakdownRow = {
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
type ProjectCostRow = ProjectCostBreakdownRow & {
  isFirstPackaging?: boolean;
  breakdownRows?: ProjectCostBreakdownRow[];
};
type ProjectCostBuildArgs = {
  formData: ProjectFormData;
  summaryRows: SummaryRow[];
  summaryTableRows: SummaryTableRow[];
  packagingLevels: PackagingLevel[];
  processes: CoPackingProcess[];
  processRows: ReturnType<typeof calculateProcessCosts>["rows"];
  processCostTotals: ProcessCostTotals;
  additionalFees: AdditionalFeeRow[];
  notRequired: Record<string, boolean>;
};

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
  if (isUnitProcessSpeed(proc.processSpeedUnit)) {
    return unitWeightG > 0 ? weightG / unitWeightG : weightG;
  }
  return weightG;
}

function calculateProcessCosts(processes: CoPackingProcess[], unitWeightG: number) {
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

function makeProjectCostRow(
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

function buildProjectCostRows({
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
  const n = (value: unknown) => {
    const parsed = parseFloat(String(value ?? ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const summaryTableFor = (label: string) =>
    summaryTableRows.find(row => row.label === label && !row.isLeadTimeSummary);

  const materialTableRow = summaryTableFor("Materials");
  const materialBaseUnits = materialTableRow?.totalUnits ?? 0;
  const unitWeightG = n(formData.unitWeight) * ({ g: 1, oz: 28.3495, lb: 453.592, lbs: 453.592, kg: 1000, mg: 0.001, mL: 1, L: 1000, "fl oz": 29.5735, "metric ton": 1000000 }[formData.unitWeightUnit ?? "g"] ?? 1);
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
  const intakePalletWeightLbs = intakePalletWeightValue * ({ lbs: 1, kg: 2.20462, g: 0.00220462, oz: 0.0625, "metric ton": 2204.62, t: 2204.62 }[intakePalletWeightUom] ?? 1);
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

    if (isMaterial) {
      return materialTotalRow ? [materialTotalRow] : [];
    }
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

function ppuUnitsFromRows(rows: ProjectCostRow[]) {
  return rows.find(row => row.deliverableQty && row.deliverableQty > 1)?.deliverableQty
    ?? rows.find(row => row.intakeQty && row.intakeQty > 1)?.intakeQty
    ?? 1;
}

/** Plain text input that holds local string state while typing; commits parsed float on blur. */
function NumInput({ value, onChange, className, placeholder }: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value === 0 ? "" : String(value));
  useEffect(() => { setLocal(value === 0 ? "" : String(value)); }, [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={local}
      placeholder={placeholder}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { const n = parseFloat(local); onChange(isNaN(n) ? 0 : n); }}
      className={className}
    />
  );
}

// â"€â"€ Shared input styles (mirrors ProjectDetails token set) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const palletInputBase = "h-9 w-full px-3 border border-amber-200 text-xs text-zinc-950 placeholder:text-zinc-500 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition";
const palletInputKey  = `${palletInputBase} rounded-md`;
const palletPrefix    = "text-[0.6rem] font-medium text-zinc-600 border border-r-0 border-amber-200 h-9 flex items-center px-2.5 bg-amber-50/50 shrink-0 rounded-l-md select-none";
const palletSuffix    = "text-[0.6rem] font-medium text-zinc-600 border border-l-0 border-amber-200 h-9 flex items-center px-2.5 bg-amber-50/50 shrink-0 rounded-r-md select-none";
const palletWithPfx   = `${palletInputBase} rounded-r-md flex-1`;
const palletWithSfx   = `${palletInputBase} rounded-l-md flex-1`;
const palletLabel     = "text-[0.65rem] text-zinc-600 mb-1 truncate";

function PalletizationSection({
  formData,
  setFormField,
  scaledColumns,
  moqQty,
}: {
  formData: ProjectFormData;
  setFormField: (field: keyof ProjectFormData, value: string) => void;
  scaledColumns: Column[];
  moqQty: number;
}) {
  const WEIGHT_TO_LBS: Record<string, number> = { lbs: 1, kg: 2.20462, g: 0.00220462, oz: 0.0625, "metric ton": 2204.62, t: 2204.62 };
  const n = (v: string | number | undefined) => parseFloat(String(v ?? "0")) || 0;
  const maxWtRaw = n(formData.maxPalletWeightLbs) || 2000;
  const maxWtUom = (formData as any).maxPalletWeightUom ?? "lbs";
  const maxWtLbs = maxWtRaw * (WEIGHT_TO_LBS[maxWtUom] ?? 1);
  const handleMaxWeightUnitChange = (newUnit: string) => {
    if (maxWtRaw > 0 && maxWtUom !== newUnit) {
      setFormField("maxPalletWeightLbs", String(roundForDisplay(convertWeightValue(maxWtRaw, maxWtUom, newUnit))));
    }
    setFormField("maxPalletWeightUom" as keyof ProjectFormData, newUnit);
  };

  // Raw material weight - same formula as calculations.ts
  const GRAMS_PER_UNIT: Record<string, number> = { g: 1, oz: 28.3495, lb: 453.592, lbs: 453.592, kg: 1000, mg: 0.001, mL: 1, L: 1000, "fl oz": 29.5735, "metric ton": 1000000 };
  const unitWeightG    = n(formData.unitWeight) * (GRAMS_PER_UNIT[formData.unitWeightUnit ?? "g"] ?? 1);
  const materialOverage = n(formData.materialOverage);
  const baseQty        = moqQty > 0 ? moqQty : n(scaledColumns[0]?.units);
  const rawWeightLbs = (baseQty * unitWeightG) / 453.592;
  const rawWeightWithOverageLbs = (baseQty * (1 + materialOverage / 100) * unitWeightG) / 453.592;

  // Per-level packaging weight: col.units (already the correct effective qty from packagingLevelsToColumns)
  // x packagingWeightG - exactly matching computeColumnOutputs pkgWeight = baseUnits * packagingWeightG
  const levelWeightsG = scaledColumns.map(col => {
    const pwg   = n(col.rows?.["Packaging Weight (g)"]);
    const units = n(col.units);
    return units * pwg;
  });

  const levelWeightsLbs   = levelWeightsG.map(g => g / 453.592);
  const totalPkgWeightLbs = levelWeightsLbs.reduce((s, w) => s + w, 0);
  const totalWeightLbs    = rawWeightLbs + totalPkgWeightLbs;

  const buffer     = n(formData.palletBuffer);
  const autoPallets = totalWeightLbs > 0 ? Math.ceil(totalWeightLbs / maxWtLbs) + buffer : null;
  const calculatedPallets = totalWeightLbs > 0 && maxWtLbs > 0 ? Math.ceil(totalWeightLbs / maxWtLbs) : 0;
  const outboundFee = n(formData.outboundFee);
  const outboundMarkup = n(formData.outboundFeeMarkup);
  const palletOur = outboundFee * (autoPallets ?? 0);
  const palletSelling = outboundFee * (1 + outboundMarkup / 100) * (autoPallets ?? 0);
  const baselinePalletOur = outboundFee * calculatedPallets;
  const palletMargin = palletSelling > 0 ? ((palletSelling - palletOur) / palletSelling) * 100 : 0;
  const fmtN = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const fmtN2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtD = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });


  const otherFields: { label: string; field: keyof ProjectFormData; sym: string }[] = [
    { label: "Outbound Fee / Pallet", field: "outboundFee",         sym: "$"   },
    { label: "Outbound Fee Markup %", field: "outboundFeeMarkup",   sym: "%"   },
  ];

  const { notRequired: _palletNR } = useSectionRequired();
  const palletNR = !!_palletNR["section-palletization"];
  const [palletOpen, setPalletOpen] = useState(true);
  const [weightOpen, setWeightOpen] = useState(true);

  return (
    <div className="flex gap-5 items-start px-4 md:px-6 mb-4">
    <div id="section-palletization" className="bg-white border border-gray-200 rounded-xl overflow-hidden max-w-4xl flex-1 min-w-0"><div className="px-5 pt-4 pb-5">
      {/* Header - matches SectionHeader pattern */}
      <div className="flex items-center gap-3 mb-4">
        <button type="button" onClick={() => setPalletOpen(o => !o)} className="flex items-center gap-1.5 group min-w-0">
          <span className="text-sm font-bold text-zinc-950 group-hover:text-[#e8473f] transition-colors">Palletization</span>
          {palletOpen && !palletNR
            ? <ChevronUp size={13} className="text-zinc-500 group-hover:text-[#e8473f] transition-colors shrink-0" />
            : <ChevronDown size={13} className="text-zinc-500 group-hover:text-[#e8473f] transition-colors shrink-0" />}
        </button>
        <div className="ml-auto shrink-0"><RequiredToggle sectionId="section-palletization" /></div>
      </div>
      {palletOpen && !palletNR && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-5 gap-y-4 items-start">

        {/* Max Pallet Weight + UOM */}
        <div>
          <p className={palletLabel}>Max Pallet Weight</p>
          <div className="flex items-center w-full">
            <NumInput
              value={maxWtRaw}
              onChange={v => setFormField("maxPalletWeightLbs", String(v))}
              className={palletWithSfx}
            />
            <select
              value={maxWtUom}
              onChange={e => handleMaxWeightUnitChange(e.target.value)}
              className="text-[0.6rem] font-medium text-zinc-600 border border-l-0 border-amber-200 h-9 px-1 bg-amber-50/50 shrink-0 rounded-r-md focus:outline-none transition cursor-pointer"
            >
              {PALLET_WEIGHT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div>
          <p className={palletLabel}>Pallet Weight</p>
          <div className="h-9 px-3 border border-gray-200 bg-gray-50 rounded-md flex items-center text-xs font-semibold text-zinc-900 tabular-nums">
            {totalWeightLbs > 0 ? `${fmtN2(totalWeightLbs)} lbs` : "-"}
          </div>
        </div>

        {otherFields.map(({ label, field, sym }) => {
          const isPrefix = sym === "$";
          const numVal   = parseFloat(formData[field] as string || "0") || 0;
          return (
            <div key={field}>
              <p className={palletLabel}>{label}</p>
              <div className="flex items-center w-full">
                {sym && isPrefix  && <span className={palletPrefix}>{sym}</span>}
                {sym && !isPrefix && sym !== "%" ? (
                  <>
                    <NumInput value={numVal}
                      onChange={v => setFormField(field, String(v))}
                      className={palletWithSfx} />
                    <span className={palletSuffix}>{sym}</span>
                  </>
                ) : sym === "%" ? (
                  <>
                    <NumInput value={numVal}
                      onChange={v => setFormField(field, String(v))}
                      className={palletWithSfx} />
                    <span className={palletSuffix}>%</span>
                  </>
                ) : sym === "$" ? (
                  <NumInput value={numVal}
                    onChange={v => setFormField(field, String(v))}
                    className={palletWithPfx} />
                ) : (
                  <NumInput value={numVal}
                    onChange={v => setFormField(field, String(v))}
                    className={palletInputKey} />
                )}
              </div>
            </div>
          );
        })}
      </div>}

      {/* Weight breakdown output panel - toggleable, collapsed when section collapsed */}
      {palletOpen && !palletNR && (
        <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 overflow-hidden">
          <button type="button"
            onClick={() => setWeightOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-1.5 bg-gray-100 border-b border-gray-200 hover:bg-gray-200/60 transition-colors">
            <span className="text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Weight Breakdown</span>
            {weightOpen
              ? <ChevronUp size={11} className="text-zinc-600" />
              : <ChevronDown size={11} className="text-zinc-600" />}
          </button>
          {weightOpen && <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="px-3 py-1.5 text-left text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Weight Component</th>
                <th className="px-3 py-1.5 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">lbs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-3 py-1 text-zinc-700">Raw Material</td>
                <td className="px-3 py-1 text-right tabular-nums text-zinc-900">
                  {rawWeightLbs > 0 ? rawWeightLbs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}
                </td>
              </tr>
              {scaledColumns.map((col, i) => (
                <tr key={col.id}>
                  <td className="px-3 py-1 text-zinc-700">{col.level} Packaging</td>
                  <td className="px-3 py-1 text-right tabular-nums text-zinc-900">
                    {levelWeightsLbs[i] > 0 ? levelWeightsLbs[i].toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-gray-300 bg-gray-100">
                <td className="px-3 py-1.5 font-semibold text-zinc-800">Pallet Weight</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-zinc-950">
                  {totalWeightLbs > 0 ? totalWeightLbs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}
                </td>
              </tr>
              <tr className="bg-gray-50">
                <td className="px-3 py-1 text-zinc-600">Max Pallet Weight</td>
                <td className="px-3 py-1 text-right tabular-nums text-zinc-700">
                  {maxWtLbs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </td>
              </tr>
              <tr className="bg-gray-100 border-t border-gray-300">
                <td className="px-3 py-1.5 font-semibold text-zinc-800">Pallets Required</td>
                <td className="px-3 py-1.5 text-right font-semibold text-zinc-950">
                  {autoPallets != null ? Math.ceil(totalWeightLbs / maxWtLbs) : "-"}
                </td>
              </tr>
              <tr className="bg-white">
                <td className="px-3 py-1 text-zinc-700">+ Buffer</td>
                <td className="px-3 py-1 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-[0.65rem] text-zinc-600 tabular-nums">{buffer > 0 ? `+${buffer}` : "+0"}</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={formData.palletBuffer || ""}
                      onChange={e => setFormField("palletBuffer", e.target.value)}
                      placeholder="0"
                      className="w-14 h-6 px-2 text-xs text-right border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#e8473f] tabular-nums"
                    />
                  </div>
                </td>
              </tr>
              <tr className="bg-blue-50 border-t-2 border-blue-300">
                <td className="px-3 py-2 font-bold text-blue-900">Total Pallets</td>
                <td className="px-3 py-2 text-right font-bold text-blue-700 tabular-nums text-sm">
                  {autoPallets != null ? autoPallets : "-"}
                </td>
              </tr>
            </tbody>
          </table>}
        </div>
      )}
    </div></div>
    {palletOpen && !palletNR && (
      <div className="w-56 shrink-0 sticky top-14 bg-[#EFF6FF] border border-blue-200 rounded-xl overflow-hidden shadow-sm shadow-blue-100">
        <div className="px-3 py-2.5 text-[0.55rem] font-semibold text-blue-700 uppercase tracking-widest border-b border-blue-200 bg-blue-100/60">
          Palletization Outputs
        </div>
        <div className="flex items-start justify-between gap-3 px-3 py-2.5 border-b border-blue-100">
          <span className="text-[0.68rem] text-zinc-600 leading-tight">Raw Material Weight</span>
          <span className="text-[0.72rem] font-semibold text-zinc-900 tabular-nums text-right">{rawWeightLbs > 0 ? `${fmtN2(rawWeightLbs)} lbs` : "-"}</span>
        </div>
        <div className="flex items-start justify-between gap-3 px-3 py-2.5 border-b border-blue-100">
          <span className="text-[0.68rem] text-zinc-600 leading-tight">Raw Material With Overage</span>
          <span className="text-[0.72rem] font-semibold text-zinc-900 tabular-nums text-right">{rawWeightWithOverageLbs > 0 ? `${fmtN2(rawWeightWithOverageLbs)} lbs` : "-"}</span>
        </div>
        <div className="flex items-start justify-between gap-3 px-3 py-2.5 border-b border-blue-100">
          <span className="text-[0.68rem] text-zinc-600 leading-tight">Packaging Weight</span>
          <span className="text-[0.72rem] font-semibold text-zinc-900 tabular-nums text-right">{totalPkgWeightLbs > 0 ? `${fmtN2(totalPkgWeightLbs)} lbs` : "-"}</span>
        </div>
        <div className="flex items-start justify-between gap-3 px-3 py-2.5 border-b border-blue-100">
          <span className="text-[0.68rem] text-zinc-600 leading-tight">Pallet Weight</span>
          <span className="text-[0.72rem] font-semibold text-zinc-900 tabular-nums text-right">{totalWeightLbs > 0 ? `${fmtN2(totalWeightLbs)} lbs` : "-"}</span>
        </div>
        <div className="flex items-start justify-between gap-3 px-3 py-2.5 border-b border-blue-100">
          <span className="text-[0.68rem] text-zinc-600 leading-tight">Calculated Pallets</span>
          <span className="text-[0.72rem] font-semibold text-zinc-900 tabular-nums text-right">{calculatedPallets > 0 ? fmtN(calculatedPallets) : "-"}</span>
        </div>
        <div className="flex items-start justify-between gap-3 px-3 py-2.5 border-b border-blue-100">
          <span className="text-[0.68rem] text-zinc-600 leading-tight">Buffer Pallets</span>
          <span className="text-[0.72rem] font-semibold text-zinc-900 tabular-nums text-right">{buffer > 0 ? `+${fmtN(buffer)}` : "0"}</span>
        </div>
        <div className="flex items-start justify-between gap-3 px-3 py-2.5 border-b border-blue-100">
          <span className="text-[0.68rem] text-zinc-600 leading-tight">Total Pallets</span>
          <span className="text-[0.72rem] font-bold text-zinc-900 tabular-nums text-right">{autoPallets != null ? fmtN(autoPallets) : "-"}</span>
        </div>
        <div className="px-3 py-1.5 text-[0.52rem] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 border-b border-blue-200">Outbound Costs</div>
        <div className="flex items-start justify-between gap-3 px-3 py-2.5 border-b border-blue-100">
          <span className="text-[0.68rem] text-zinc-600 leading-tight">Baseline Project Cost</span>
          <span className="text-[0.72rem] font-semibold text-zinc-900 tabular-nums text-right">{baselinePalletOur > 0 ? fmtD(baselinePalletOur) : "-"}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 px-3 py-2.5 border-b border-blue-100">
          <div>
            <p className="text-[0.68rem] text-zinc-600 leading-tight mb-1">Project Cost</p>
            <p className="text-[0.72rem] font-semibold text-zinc-800 tabular-nums">{palletOur > 0 ? fmtD(palletOur) : "-"}</p>
          </div>
          <div className="text-right">
            <p className="text-[0.68rem] text-zinc-600 leading-tight mb-1">Selling Price</p>
            <p className="text-[0.72rem] font-bold text-[#e8473f] tabular-nums">{palletSelling > 0 ? fmtD(palletSelling) : "-"}</p>
          </div>
        </div>
        {palletSelling > 0 && (
          <div className="px-3 py-2.5">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[0.65rem] font-bold tabular-nums ${palletMargin >= 50 ? "bg-green-50 border-green-200 text-green-700" : palletMargin >= 30 ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-red-50 border-red-200 text-red-600"}`}>
              <span className="text-[0.5rem] font-semibold opacity-70">MARGIN</span>
              {palletMargin.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    )}
    </div>
  );
}

// â"€â"€ LeftContent lifted out of Home so React never remounts it on re-render â"€â"€
interface LeftContentProps {
  expanded:     boolean;
  moqRows:      MoqRow[];
  setMoqRows:   React.Dispatch<React.SetStateAction<MoqRow[]>>;
  formData:     ProjectFormData;
  setFormField: (field: keyof ProjectFormData, value: string) => void;
  packagingLevels:    PackagingLevel[];
  setPackagingLevels: React.Dispatch<React.SetStateAction<PackagingLevel[]>>;
  scaledColumns: Column[];
  moqQty:    number;
  projectType: string;
  setProjectType: React.Dispatch<React.SetStateAction<"standard" | "copacking">>;
  coPackingProcesses: CoPackingProcess[];
  setCoPackingProcesses: React.Dispatch<React.SetStateAction<CoPackingProcess[]>>;
  summaryRows:      SummaryRow[];
  summaryTableRows: SummaryTableRow[];
  ppuUnits:         number;
  allMoqResults:    MoqPricingRow[];
  whatIfPpus:       Record<number, string>;
  setWhatIfPpus:    React.Dispatch<React.SetStateAction<Record<number, string>>>;
  costPpuOverrides: Record<number, string>;
  additionalFees:    AdditionalFeeRow[];
  setAdditionalFees: React.Dispatch<React.SetStateAction<AdditionalFeeRow[]>>;
  processLevels:     PackagingLevel[];
  setProcessLevels:  React.Dispatch<React.SetStateAction<PackagingLevel[]>>;
  activeMoqId:        number;
  packagingCostItems: PackagingCostItem[];
  onOpenPackagingCostDatabase: () => void;
}

function LeftContent({ expanded: _expanded, moqRows: _moqRows, setMoqRows: _setMoqRows, formData, setFormField, packagingLevels, setPackagingLevels, scaledColumns, moqQty, projectType: _projectType, setProjectType: _setProjectType, coPackingProcesses: _coPackingProcesses, setCoPackingProcesses: _setCoPackingProcesses, summaryRows, summaryTableRows, ppuUnits, allMoqResults, whatIfPpus, setWhatIfPpus, costPpuOverrides, additionalFees, setAdditionalFees, processLevels: _processLevels, setProcessLevels: _setProcessLevels, activeMoqId, packagingCostItems, onOpenPackagingCostDatabase }: LeftContentProps) {
  const { notRequired } = useSectionRequired();
  const [pkgLineOpen, setPkgLineOpen] = useState(true);
  const [additionalFeesOpen, setAdditionalFeesOpen] = useState(true);
  const [additionalFeesOutputsOpen, setAdditionalFeesOutputsOpen] = useState(true);
  const [recipeOpenRequest, setRecipeOpenRequest] = useState(0);
  const recipeButtonRef = useRef<HTMLButtonElement | null>(null);
  const localNumber = (value: string | number | undefined) => parseFloat(String(value ?? "0")) || 0;
  const localGramsPerUnit: Record<string, number> = { g: 1, oz: 28.3495, lb: 453.592, lbs: 453.592, kg: 1000, mg: 0.001, mL: 1, L: 1000, "fl oz": 29.5735, "metric ton": 1000000 };
  const unitWeightG = localNumber(formData.unitWeight) * (localGramsPerUnit[formData.unitWeightUnit ?? "g"] ?? 1);
  const processCostSummary = notRequired["section-processes"]
    ? { rows: [], totals: { our: 0, selling: 0 } }
    : calculateProcessCosts(_coPackingProcesses, unitWeightG);
  const projectCostSummary = buildProjectCostRows({
    formData,
    summaryRows,
    summaryTableRows,
    packagingLevels,
    processes: _coPackingProcesses,
    processRows: processCostSummary.rows,
    processCostTotals: processCostSummary.totals,
    additionalFees: notRequired["section-additional-costs"] ? [] : additionalFees,
    notRequired,
  });
  const adjustedProjectRevenue = (() => {
    const parsePositive = (raw: string | undefined) => {
      if (raw === undefined || raw === "") return null;
      const parsed = parseFloat(raw);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };
    const activeMoqResult = allMoqResults.find(result => result.moqRow.id === activeMoqId);
    const activeMoqPpu = parsePositive(activeMoqResult ? whatIfPpus[activeMoqResult.moqRow.id] : undefined);
    if (activeMoqResult && activeMoqPpu != null) return activeMoqPpu * activeMoqResult.ppuDenominator;

    const projectPpu = parsePositive(whatIfPpus[0]);
    const denom = projectCostSummary.totalPpuDenom > 0 ? projectCostSummary.totalPpuDenom : ppuUnits;
    if (projectPpu != null && denom > 0) return projectPpu * denom;

    return undefined;
  })();
  return (
    <>
      <ProjectInfoSection />
      <ProjectDetails
        formData={formData}
        setFormField={setFormField}
        hasBlendingRecipe={_coPackingProcesses.some(p => (p.processType || p.name) === "Blending/Batching")}
        onOpenRecipe={() => setRecipeOpenRequest(prev => prev + 1)}
        recipeButtonRef={recipeButtonRef}
      />
      {/* Processes section + side output panel */}
      {(() => {
        const fmtD = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
        const fmtPct = (v: number) => `${v.toFixed(1)}%`;
        const marginBg = (pct: number) => pct >= 50 ? "bg-green-50 border-green-200 text-green-700" : pct >= 30 ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-red-50 border-red-200 text-red-600";

        const procOutputs = processCostSummary.rows;
        const totalProcOur  = processCostSummary.totals.our;
        const totalProcCust = processCostSummary.totals.selling;
        const totalProcMargin = totalProcCust > 0 ? ((totalProcCust - totalProcOur) / totalProcCust) * 100 : 0;
        const hasAnyProc = procOutputs.some(p => p.laborCust > 0);

        return (
          <div className="flex gap-5 items-start px-4 md:px-6 mb-4">
            <CoPackingProcesses
              processes={_coPackingProcesses}
              setProcesses={_setCoPackingProcesses}
              openRecipeRequest={recipeOpenRequest}
              recipeAnchorRef={recipeButtonRef}
            />
            {!notRequired["section-processes"] && hasAnyProc && (
              <div className="w-56 shrink-0 sticky top-14 bg-[#EFF6FF] border border-blue-200 rounded-xl overflow-hidden shadow-sm shadow-blue-100">
                <div className="px-3 py-2.5 text-[0.55rem] font-semibold text-blue-700 uppercase tracking-widest border-b border-blue-200 bg-blue-100/60">
                  Process Costs
                </div>
                {_coPackingProcesses.map((proc, i) => {
                  const { laborOur, laborCust, baselineOur, margin } = procOutputs[i];
                  if (laborCust <= 0) return null;
                  return (
                    <div key={proc.id} className="border-b border-blue-100 last:border-0 px-3 py-2.5 space-y-1.5">
                      <div className="text-[0.6rem] font-bold text-zinc-800 uppercase tracking-wider truncate">{proc.name || `Process ${i + 1}`}</div>
                      <div className="flex items-center justify-between gap-2 text-[0.62rem]">
                        <span className="text-zinc-600">Baseline Project Cost</span>
                        <span className="font-semibold text-zinc-900 tabular-nums">{baselineOur > 0 ? fmtD(baselineOur) : "-"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[0.52rem] text-zinc-600 mb-0.5">Project Cost</div>
                          <div className="text-[0.72rem] font-semibold text-zinc-800 tabular-nums">{fmtD(laborOur)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[0.52rem] text-zinc-600 mb-0.5">Selling Price</div>
                          <div className="text-[0.72rem] font-bold text-[#e8473f] tabular-nums">{fmtD(laborCust)}</div>
                        </div>
                      </div>
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[0.65rem] font-bold tabular-nums ${marginBg(margin)}`}>
                        <span className="text-[0.5rem] font-semibold opacity-70">MARGIN</span>
                        {fmtPct(margin)}
                      </div>
                    </div>
                  );
                })}
                {_coPackingProcesses.length > 1 && totalProcCust > 0 && (
                  <div className="px-3 py-2.5 bg-blue-100/60 border-t-2 border-blue-300 space-y-1.5">
                    <div className="text-[0.55rem] font-bold text-blue-700 uppercase tracking-widest">Total</div>
                    <div className="flex items-center justify-between gap-2 text-[0.62rem]">
                      <span className="text-zinc-600">Baseline Project Cost</span>
                      <span className="font-semibold text-zinc-900 tabular-nums">
                        {fmtD(procOutputs.reduce((sum, proc) => sum + proc.baselineOur, 0))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[0.52rem] text-zinc-600 mb-0.5">Project Cost</div>
                        <div className="text-[0.75rem] font-bold text-zinc-900 tabular-nums">{fmtD(totalProcOur)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[0.52rem] text-zinc-600 mb-0.5">Selling Price</div>
                        <div className="text-[0.75rem] font-bold text-[#e8473f] tabular-nums">{fmtD(totalProcCust)}</div>
                      </div>
                    </div>
                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[0.65rem] font-bold tabular-nums ${marginBg(totalProcMargin)}`}>
                      <span className="text-[0.5rem] font-semibold opacity-70">MARGIN</span>
                      {fmtPct(totalProcMargin)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      <div className="flex gap-5 items-start px-4 md:px-6 mb-4">
        <PackagingLevels
          packagingLevels={packagingLevels}
          setPackagingLevels={setPackagingLevels}
          packagingCostItems={packagingCostItems}
          onOpenPackagingCostDatabase={onOpenPackagingCostDatabase}
          className="bg-white border border-gray-200 rounded-xl overflow-hidden max-w-4xl w-full"
          onOpenChange={setPkgLineOpen}
        />
        {pkgLineOpen && !notRequired["section-packaging-summary"] && summaryRows.length > 0 && (() => {
          const fmtD = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
          const fmtPct = (v: number) => `${v.toFixed(1)}%`;
          const marginBg = (pct: number) => pct >= 50 ? "bg-green-50 border-green-200 text-green-700" : pct >= 30 ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-red-50 border-red-200 text-red-600";
          const allCharges = packagingLevels[0]?.manualCharges ?? [];
          const pkgRows = summaryRows.filter(r => !["Setup / QA Fee", "Materials", "Pallets & Fees"].includes(r.label) && !r.label.startsWith("Testing -"));

          const manualChargeTotal = (lvl: (typeof packagingLevels)[0]): number => {
            const lvlCharges = allCharges.filter(c => !c.levelId || c.levelId === lvl.id);
            const baseUnits = lvl.cpoRequiredQty != null && lvl.cpoRequiredQty > 0 ? lvl.cpoRequiredQty : (lvl.units > 0 ? lvl.units : 0);
            const unitsWithOverage = Math.ceil(baseUnits * (1 + lvl.overageRate / 100));
            return lvlCharges.reduce((sum, c) => sum + (c.basis === "per_unit" ? c.amount * unitsWithOverage : c.amount), 0);
          };
          const baselineChargeTotal = (lvl: (typeof packagingLevels)[0]): number => {
            const lvlCharges = allCharges.filter(c => !c.levelId || c.levelId === lvl.id);
            const baseUnits = lvl.cpoRequiredQty != null && lvl.cpoRequiredQty > 0 ? lvl.cpoRequiredQty : (lvl.units > 0 ? lvl.units : 0);
            return lvlCharges.reduce((sum, c) => sum + (c.basis === "per_unit" ? c.amount * baseUnits : c.amount), 0);
          };
          const baselineLevelCost = (lvl: (typeof packagingLevels)[0]): number => {
            const baseUnits = lvl.cpoRequiredQty != null && lvl.cpoRequiredQty > 0 ? lvl.cpoRequiredQty : (lvl.units > 0 ? lvl.units : 0);
            const out = computeColumnOutputs(
              lvl.fillRatePerMin, lvl.efficiencyBuffer, lvl.wageRate, lvl.numStaff,
              lvl.hrsPerShift, lvl.workingDays, lvl.packagingWeightG, baseUnits,
              0, lvl.costPerUnit, 0, lvl.labelApplyRate, lvl.tabsEnabled ? (lvl.tabApplyRate ?? 0) : 0,
            );
            const labelCost = lvl.labelEnabled ? lvl.labelPrintCost : 0;
            const tabCost = lvl.tabsEnabled ? lvl.tabCostPerUnit : 0;
            return out.ourLaborCost + baseUnits * (lvl.costPerUnit + labelCost + tabCost) + baselineChargeTotal(lvl);
          };

          const totalOur = pkgRows.reduce((s, r, i) => s + r.ourCosts + (packagingLevels[i] ? manualChargeTotal(packagingLevels[i]) : 0), 0);
          const totalCx  = pkgRows.reduce((s, r, i) => s + r.customerPrice + (packagingLevels[i] ? manualChargeTotal(packagingLevels[i]) : 0), 0);
          const totalBaselineOur = pkgRows.reduce((s, _r, i) => s + (packagingLevels[i] ? baselineLevelCost(packagingLevels[i]) : 0), 0);
          const totalMargin = totalCx > 0 ? ((totalCx - totalOur) / totalCx) * 100 : 0;

          return (
            <div className="w-56 shrink-0 sticky top-14 bg-[#EFF6FF] border border-blue-200 rounded-xl overflow-hidden shadow-sm shadow-blue-100">
              <div className="px-3 py-2.5 text-[0.55rem] font-semibold text-blue-700 uppercase tracking-widest border-b border-blue-200 bg-blue-100/60">
                Packout Costs
              </div>
              {pkgRows.map((r, i) => {
                const lvl = packagingLevels[i];
                const chargeTotal = lvl ? manualChargeTotal(lvl) : 0;
                const our = r.ourCosts + chargeTotal;
                const cx  = r.customerPrice + chargeTotal;
                const baselineOur = lvl ? baselineLevelCost(lvl) : our;
                const margin = cx > 0 ? ((cx - our) / cx) * 100 : 0;
                return (
                  <div key={i} className="border-b border-blue-100 last:border-0 px-3 py-2.5 space-y-1.5">
                    <div className="text-[0.6rem] font-bold text-zinc-800 uppercase tracking-wider">{r.label}</div>
                    <div className="flex items-center justify-between gap-2 text-[0.62rem]">
                      <span className="text-zinc-600">Baseline Project Cost</span>
                      <span className="font-semibold text-zinc-900 tabular-nums">{baselineOur > 0 ? fmtD(baselineOur) : "-"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[0.52rem] text-zinc-600 mb-0.5">Project Cost</div>
                        <div className="text-[0.72rem] font-semibold text-zinc-800 tabular-nums">{our > 0 ? fmtD(our) : "-"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[0.52rem] text-zinc-600 mb-0.5">Customer</div>
                        <div className="text-[0.72rem] font-bold text-[#e8473f] tabular-nums">{cx > 0 ? fmtD(cx) : "-"}</div>
                      </div>
                    </div>
                    {cx > 0 && (
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[0.65rem] font-bold tabular-nums ${marginBg(margin)}`}>
                        <span className="text-[0.5rem] font-semibold opacity-70">MARGIN</span>
                        {fmtPct(margin)}
                      </div>
                    )}
                    {chargeTotal > 0 && (
                      <div className="text-[0.55rem] text-amber-600 italic">incl. {fmtD(chargeTotal)} charges</div>
                    )}
                  </div>
                );
              })}
              {pkgRows.length > 1 && totalCx > 0 && (
                <div className="px-3 py-2.5 bg-blue-100/60 border-t-2 border-blue-300 space-y-1.5">
                  <div className="text-[0.55rem] font-bold text-blue-700 uppercase tracking-widest">Total</div>
                  <div className="flex items-center justify-between gap-2 text-[0.62rem]">
                    <span className="text-zinc-600">Baseline Project Cost</span>
                    <span className="font-semibold text-zinc-900 tabular-nums">{fmtD(totalBaselineOur)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[0.52rem] text-zinc-600 mb-0.5">Project Cost</div>
                      <div className="text-[0.75rem] font-bold text-zinc-900 tabular-nums">{fmtD(totalOur)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[0.52rem] text-zinc-600 mb-0.5">Customer</div>
                      <div className="text-[0.75rem] font-bold text-[#e8473f] tabular-nums">{fmtD(totalCx)}</div>
                    </div>
                  </div>
                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[0.65rem] font-bold tabular-nums ${marginBg(totalMargin)}`}>
                    <span className="text-[0.5rem] font-semibold opacity-70">MARGIN</span>
                    {fmtPct(totalMargin)}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
      <PalletizationSection
        formData={formData}
        setFormField={setFormField}
        scaledColumns={scaledColumns}
        moqQty={moqQty}
      />
      {/* â"€â"€ Additional Costs & Fees â"€â"€ */}
      <div id="section-additional-costs" className="mx-4 md:mx-6 mb-4 flex flex-col xl:flex-row gap-5 items-start scroll-mt-20">
        <div className="border border-gray-200 rounded-xl overflow-hidden max-w-4xl flex-1 min-w-0">
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAdditionalFeesOpen(open => !open)}
                className="flex items-center gap-1.5 text-left group"
                aria-expanded={additionalFeesOpen}
              >
                <span className="text-sm font-semibold text-zinc-950">Additional Costs & Fees</span>
                {additionalFeesOpen ? <ChevronUp size={13} className="text-zinc-500 group-hover:text-zinc-800" /> : <ChevronDown size={13} className="text-zinc-500 group-hover:text-zinc-800" />}
              </button>
              <span className="text-[0.55rem] font-semibold text-zinc-600 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded uppercase tracking-wider">Internal Only</span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              {additionalFeesOpen && !notRequired["section-additional-costs"] && (
                <button
                  type="button"
                  onClick={() => setAdditionalFees(prev => [...prev, { id: String(uid()), type: "", amount: 0, mode: "$" }])}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[0.68rem] font-semibold text-[#e8473f] border border-[#e8473f]/40 rounded-md hover:bg-red-50 hover:border-[#e8473f]/70 transition-colors"
                >
                  <Plus size={11} strokeWidth={2.5} />Add Row
                </button>
              )}
              <RequiredToggle sectionId="section-additional-costs" />
            </div>
          </div>
          {additionalFeesOpen && !notRequired["section-additional-costs"] && (additionalFees.length === 0 ? (
            <p className="py-3 text-center text-[0.65rem] text-zinc-600 italic">No additional fees - click Add Row</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {additionalFees.map((row) => (
                <div key={row.id} className="flex items-center gap-2 px-4 py-2">
                  <input
                    type="text"
                    value={row.type}
                    onChange={(e) => setAdditionalFees(prev => prev.map(r => r.id === row.id ? { ...r, type: e.target.value } : r))}
                    placeholder="Fee label..."
                    className="flex-1 h-7 px-2 text-xs text-zinc-950 border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition placeholder:text-zinc-500 rounded"
                  />
                  <div className="flex items-center border border-gray-200 rounded overflow-hidden h-7 shrink-0">
                    <button
                      type="button"
                      onClick={() => setAdditionalFees(prev => prev.map(r => r.id === row.id ? { ...r, mode: r.mode === "$" ? "%" : "$" } : r))}
                      className={`px-2 h-7 text-[0.65rem] font-semibold transition-colors border-r border-gray-200 ${row.mode === "$" ? "bg-[#e8473f] text-white" : "bg-gray-50 text-zinc-600 hover:text-zinc-900"}`}
                    >$</button>
                    <button
                      type="button"
                      onClick={() => setAdditionalFees(prev => prev.map(r => r.id === row.id ? { ...r, mode: r.mode === "%" ? "$" : "%" } : r))}
                      className={`px-2 h-7 text-[0.65rem] font-semibold transition-colors ${row.mode === "%" ? "bg-[#e8473f] text-white" : "bg-gray-50 text-zinc-600 hover:text-zinc-900"}`}
                    >%</button>
                  </div>
                  <div className="w-28 shrink-0">
                    <CurrencyInput
                      type={row.mode === "$" ? "dollar" : "percent"}
                      value={row.mode === "$" ? row.amount : row.amount * 100}
                      onChange={(v) => setAdditionalFees(prev => prev.map(r =>
                        r.id === row.id ? { ...r, amount: row.mode === "$" ? v : v / 100 } : r
                      ))}
                      className="h-7 w-full px-2 text-xs text-right border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#e8473f] rounded"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setAdditionalFees(prev => prev.filter(r => r.id !== row.id))}
                    className="shrink-0 text-zinc-500 hover:text-red-400 transition-colors text-sm leading-none"
                    title="Remove row"
                  >x</button>
                </div>
              ))}
            </div>
          ))}
        </div>
        {additionalFeesOpen && !notRequired["section-additional-costs"] && (() => {
            const feeRows = projectCostSummary.rows.filter(row => row.id.startsWith("additional-fee-"));
            const feeOur = feeRows.reduce((sum, row) => sum + row.ourCost, 0);
            const feeDenom = projectCostSummary.totalPpuDenom > 0 ? projectCostSummary.totalPpuDenom : 1;
            const feePpu = feeOur / feeDenom;
            return (
              <div className="w-56 shrink-0 sticky top-14 bg-[#EFF6FF] border border-blue-200 rounded-xl overflow-hidden shadow-sm shadow-blue-100">
                <button
                  type="button"
                  onClick={() => setAdditionalFeesOutputsOpen(open => !open)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-[0.55rem] font-semibold text-blue-700 uppercase tracking-widest border-b border-blue-200 bg-blue-100/60"
                  aria-expanded={additionalFeesOutputsOpen}
                >
                  <span>Additional Costs Outputs</span>
                  <span className="inline-flex items-center gap-1 text-[0.55rem] text-blue-600">
                    {additionalFeesOutputsOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    {additionalFeesOutputsOpen ? "Hide" : "Show"}
                  </span>
                </button>
                {additionalFeesOutputsOpen && (feeRows.length === 0 ? (
                  <div className="px-3 py-4 text-[0.65rem] text-zinc-500 italic">No internal fees entered.</div>
                ) : (
                  <>
                    {feeRows.map(row => (
                      <div key={row.id} className="px-3 py-2 border-b border-blue-100 flex items-center justify-between gap-2">
                        <span className="text-[0.65rem] text-zinc-600 truncate">{row.label}</span>
                        <span className="text-[0.7rem] font-bold text-zinc-900 tabular-nums">{fmt(row.ourCost)}</span>
                      </div>
                    ))}
                    <div className="px-3 py-2 border-b border-blue-100 flex items-center justify-between gap-2">
                      <span className="text-[0.65rem] text-zinc-600">Baseline Project Cost</span>
                      <span className="text-[0.7rem] font-bold text-zinc-900 tabular-nums">{fmt(feeOur)}</span>
                    </div>
                    <div className="px-3 py-2 border-b border-blue-100 flex items-center justify-between gap-2">
                      <span className="text-[0.65rem] text-zinc-600">Cost PPU Impact</span>
                      <span className="text-[0.7rem] font-bold text-zinc-900 tabular-nums">{fmt(feePpu)}</span>
                    </div>
                    <div className="px-3 py-2 bg-blue-100/50 flex items-center justify-between gap-2">
                      <span className="text-[0.58rem] font-bold text-blue-700 uppercase tracking-wider">Total Internal Fees</span>
                      <span className="text-[0.75rem] font-bold text-zinc-950 tabular-nums">{fmt(feeOur)}</span>
                    </div>
                  </>
                ))}
              </div>
            );
        })()}
      </div>
      <div id="section-price-adjustment" className="mx-4 md:mx-6 mb-4 flex flex-col xl:flex-row gap-5 items-start scroll-mt-20">
        <PriceAdjustmentSection
          summaryRows={summaryRows}
          ppuUnits={ppuUnits}
          allMoqResults={allMoqResults}
          whatIfPpus={whatIfPpus}
          setWhatIfPpus={setWhatIfPpus}
          costPpuOverrides={costPpuOverrides}
          processCostTotals={processCostSummary.totals}
          projectCostTotals={projectCostSummary.totals}
          projectCostPpuDenom={projectCostSummary.totalPpuDenom}
        />
        <PriceAdjustmentOutputPanel
          projectCostSummary={projectCostSummary}
          adjustedRevenue={adjustedProjectRevenue}
        />
      </div>
    </>
  );
}

// â"€â"€ Price Adjustment section (end of left column) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
interface PriceAdjustmentSectionProps {
  summaryRows:   SummaryRow[];
  ppuUnits:      number;
  allMoqResults: MoqPricingRow[];
  whatIfPpus:    Record<number, string>;
  setWhatIfPpus: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  costPpuOverrides: Record<number, string>;
  processCostTotals: ProcessCostTotals;
  projectCostTotals: { sellingPrice: number; ourCost: number };
  projectCostPpuDenom: number;
}

function PriceAdjustmentSection({
  summaryRows, ppuUnits, allMoqResults,
  whatIfPpus, setWhatIfPpus, costPpuOverrides, processCostTotals, projectCostTotals, projectCostPpuDenom,
}: PriceAdjustmentSectionProps) {
  const marginColor = (pct: number) =>
    pct >= 65 ? "text-green-700" : pct >= 50 ? "text-amber-600" : "text-red-600";

  const whatIfRows = allMoqResults.map((r) => {
    const processCostPPU = r.ppuDenominator > 0 ? processCostTotals.our / r.ppuDenominator : 0;
    const processSellingPPU = r.ppuDenominator > 0 ? processCostTotals.selling / r.ppuDenominator : 0;
    const basePPU = r.ppu + processSellingPPU;
    const inputStr = whatIfPpus[r.moqRow.id];
    const adjPPU   = inputStr !== undefined && inputStr !== "" ? parseFloat(inputStr) : basePPU;
    const isCustom = inputStr !== undefined && inputStr !== "" && !isNaN(adjPPU) && adjPPU !== basePPU;
    const costStr  = costPpuOverrides[r.moqRow.id];
    const costPPU  = costStr !== undefined && costStr !== "" ? parseFloat(costStr) : r.ppuCost + processCostPPU;
    const marginPct = adjPPU > 0 && costPPU > 0 ? ((adjPPU - costPPU) / adjPPU) * 100 : 0;
    const revenue   = adjPPU * r.ppuDenominator;
    const ourTotal  = r.totalOurCost + processCostTotals.our;
    return { r, adjPPU, costPPU, marginPct, revenue, ourTotal, isCustom };
  });

  const wiTotalRevenue = whatIfRows.reduce((s, w) => s + w.revenue,  0);
  const wiTotalOur     = whatIfRows.reduce((s, w) => s + w.ourTotal, 0);
  const wiAvgMargin    = wiTotalRevenue > 0 ? ((wiTotalRevenue - wiTotalOur) / wiTotalRevenue) * 100 : 0;
  const hasAdj         = Object.keys(whatIfPpus).length > 0;

  const baseCustomer = projectCostTotals.sellingPrice || (summaryRows.reduce((s, r) => s + r.customerPrice, 0) + processCostTotals.selling);
  const baseOur      = projectCostTotals.ourCost || (summaryRows.reduce((s, r) => s + r.ourCosts, 0) + processCostTotals.our);
  const effectivePpuUnits = projectCostPpuDenom > 0 ? projectCostPpuDenom : ppuUnits;
  const computedCost = effectivePpuUnits > 0 && baseOur > 0 ? baseOur / effectivePpuUnits : 0;
  const adjPpuStr0   = whatIfPpus[0];
  const baselinePPU  = effectivePpuUnits > 0 && baseCustomer > 0 ? baseCustomer / effectivePpuUnits : 0;
  const adjPpuVal0   = adjPpuStr0 !== undefined && adjPpuStr0 !== "" ? parseFloat(adjPpuStr0) : baselinePPU;
  const adjRevenue0  = effectivePpuUnits > 0 ? adjPpuVal0 * effectivePpuUnits : baseCustomer;
  const effectiveCostTotal0 = computedCost > 0 && effectivePpuUnits > 0 ? computedCost * effectivePpuUnits : baseOur;
  const marginPct0   = adjRevenue0 > 0 ? ((adjRevenue0 - effectiveCostTotal0) / adjRevenue0) * 100 : 0;
  const isCustom0    = adjPpuStr0 !== undefined && adjPpuStr0 !== "";

  return (
    <div className="w-full max-w-4xl">
      <div className="rounded-xl border-2 border-amber-400 shadow-lg shadow-amber-100 overflow-hidden">
        {/* Header */}
        <div className="bg-amber-400 px-4 py-2.5 flex items-center gap-3">
          <SlidersHorizontal size={14} className="text-white shrink-0" />
          <span className="text-xs font-bold text-white uppercase tracking-wide">Price Adjustment</span>
          <span className="text-[0.6rem] text-amber-100">- adjust sale price to see impact on margin and revenue</span>
          {hasAdj && (
            <button
              type="button"
              onClick={() => setWhatIfPpus({})}
              className="ml-auto text-[0.6rem] font-semibold text-amber-900 hover:text-black border border-amber-300 bg-white/70 hover:bg-white px-2 h-5 rounded transition-colors"
            >
              Reset All
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto bg-white">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-amber-50/60">
                <th className="py-2 px-3 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider border-b-2 border-gray-900">Cost PPU</th>
                <th className="py-2 px-3 text-center text-[0.6rem] font-semibold text-amber-700 uppercase tracking-wider border-b-2 border-gray-900">Adjusted PPU</th>
                <th className="py-2 px-3 text-center text-[0.6rem] font-semibold text-amber-700 uppercase tracking-wider border-b-2 border-gray-900">Margin %</th>
                <th className="py-2 px-3 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider border-b-2 border-gray-900 bg-[#FEF2F2]">Total Revenue</th>
              </tr>
            </thead>
            <tbody>
              {whatIfRows.length === 0 ? (
                <tr className="border-b border-gray-100">
                  <td className="py-1.5 px-3 text-right text-xs text-zinc-600 font-medium tabular-nums">
                    {computedCost > 0 ? fmt(computedCost) : "-"}
                  </td>
                  <td className="py-1 px-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-xs text-zinc-600">$</span>
                      <CurrencyInput type="dollar"
                        value={adjPpuVal0}
                        onChange={(v) => setWhatIfPpus(prev => ({ ...prev, [0]: String(v) }))}
                        className="w-24 h-6 px-2 text-xs text-right border border-amber-300 bg-[#FFFDE7] focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium"
                      />
                      {isCustom0 && (
                        <button type="button"
                          onClick={() => setWhatIfPpus(prev => { const n = { ...prev }; delete n[0]; return n; })}
                          className="text-zinc-500 hover:text-zinc-700 text-sm leading-none" title="Reset">Reset</button>
                      )}
                    </div>
                  </td>
                  <td className="py-1 px-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <CurrencyInput type="percent"
                        value={marginPct0}
                        onChange={(m) => {
                          const clampedM = Math.min(m / 100, 0.9999);
                          const newAdj = clampedM < 1 && computedCost > 0 ? computedCost / (1 - clampedM) : adjPpuVal0;
                          setWhatIfPpus(prev => ({ ...prev, [0]: String(newAdj) }));
                        }}
                        className={`w-20 h-6 px-2 text-xs text-right border border-amber-300 bg-[#FFFDE7] focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium ${marginColor(marginPct0)}`}
                      />
                      <span className="text-xs text-zinc-600">%</span>
                    </div>
                  </td>
                  <td className="py-1.5 px-3 text-right text-xs font-semibold text-zinc-900 bg-[#FEF2F2]">
                    {adjRevenue0 > 0 ? fmt(adjRevenue0) : "-"}
                  </td>
                </tr>
              ) : (
                whatIfRows.map(({ r, adjPPU, costPPU, marginPct, revenue, isCustom }) => {
                  const onAdjPpuChange = (v: number) => setWhatIfPpus(prev => ({ ...prev, [r.moqRow.id]: String(v) }));
                  const onMarginChange = (m: number) => {
                    const clampedM = Math.min(m / 100, 0.9999);
                    const newAdj = clampedM < 1 && costPPU > 0 ? costPPU / (1 - clampedM) : adjPPU;
                    setWhatIfPpus(prev => ({ ...prev, [r.moqRow.id]: String(newAdj) }));
                  };
                  return (
                    <tr key={r.moqRow.id} className="border-b border-gray-100 hover:bg-amber-50/20">
                      <td className="py-1.5 px-3 text-right text-xs text-zinc-600 font-medium tabular-nums">
                        {costPPU > 0 ? fmt(costPPU) : "-"}
                      </td>
                      <td className="py-1 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-xs text-zinc-600">$</span>
                          <NumInput
                            value={whatIfPpus[r.moqRow.id] !== undefined ? parseFloat(whatIfPpus[r.moqRow.id]) : adjPPU}
                            onChange={onAdjPpuChange}
                            className="w-24 h-6 px-2 text-xs text-right border border-amber-300 bg-[#FFFDE7] focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium"
                          />
                          {isCustom && (
                            <button type="button"
                              onClick={() => setWhatIfPpus(prev => { const n = { ...prev }; delete n[r.moqRow.id]; return n; })}
                              className="text-zinc-500 hover:text-zinc-700 text-sm leading-none" title="Reset to original">Reset</button>
                          )}
                        </div>
                      </td>
                      <td className="py-1 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <NumInput
                            value={marginPct}
                            onChange={onMarginChange}
                            className={`w-20 h-6 px-2 text-xs text-right border border-amber-300 bg-[#FFFDE7] focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium ${marginColor(marginPct)}`}
                          />
                          <span className="text-xs text-zinc-600">%</span>
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-right text-xs font-semibold text-zinc-900 bg-[#FEF2F2]">
                        {fmt(revenue)}
                      </td>
                    </tr>
                  );
                })
              )}
              {whatIfRows.length > 0 && (
                <tr className="border-t-2 border-gray-900 bg-amber-50">
                  <td className="py-2 px-3 text-xs font-bold text-zinc-950 italic">TOTALS</td>
                  <td className="py-2 px-3 text-right text-xs text-zinc-600">-</td>
                  <td className={`py-2 px-3 text-right text-xs font-bold bg-[#FEF2F2] ${marginColor(wiAvgMargin)}`}>
                    {fmtPct(wiAvgMargin)}
                  </td>
                  <td className="py-2 px-3 text-right text-xs font-bold text-zinc-950 bg-[#FEF2F2]">
                    {fmt(wiTotalRevenue)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface PriceAdjustmentOutputPanelProps {
  projectCostSummary: ReturnType<typeof buildProjectCostRows>;
  adjustedRevenue?: number;
}

function PriceAdjustmentOutputPanel({ projectCostSummary, adjustedRevenue }: PriceAdjustmentOutputPanelProps) {
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const fmtMoney = (v: number) => v > 0 ? fmt(v) : "$0.00";
  const fmtQty = (v: number | null) => v == null || !isFinite(v)
    ? "-"
    : v.toLocaleString("en-US", { maximumFractionDigits: v >= 100 ? 0 : 2 });
  const fmtPpu = (v: number) => v > 0 ? fmt(v) : "$0.00";
  const rows = (() => {
    const baseRows = projectCostSummary.rows;
    if (adjustedRevenue === undefined || baseRows.length === 0) return baseRows;
    const naturalSelling = projectCostSummary.totals.sellingPrice;
    const delta = adjustedRevenue - naturalSelling;
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
  })();
  const adjustedTotals = rows.reduce(
    (sum, row) => ({ sellingPrice: sum.sellingPrice + row.sellingPrice, ourCost: sum.ourCost + row.ourCost }),
    { sellingPrice: 0, ourCost: 0 },
  );
  const totalMarginDollars = adjustedTotals.sellingPrice - adjustedTotals.ourCost;
  const totalMarginPct = adjustedTotals.sellingPrice > 0 ? (totalMarginDollars / adjustedTotals.sellingPrice) * 100 : 0;
  const totalPpuDenom = projectCostSummary.totalPpuDenom;

  return (
    <div className="w-full xl:w-[720px] shrink-0 rounded-xl border border-blue-200 bg-[#EFF6FF] shadow-sm shadow-blue-100 overflow-hidden">
      <div className="px-3 py-2.5 text-[0.55rem] font-semibold text-blue-700 uppercase tracking-widest border-b border-blue-200 bg-blue-100/60">
        Total Project Costs
      </div>
      <div className="overflow-x-auto bg-white">
        <table className="w-full min-w-[780px] border-collapse text-[0.64rem]">
          <thead>
            <tr className="bg-blue-50 text-blue-800 uppercase tracking-wider">
              {["Line Item", "Baseline Qty", "Intake Qty", "Deliverable Qty", "Selling Price", "Selling PPU", "Project Cost", "Project Cost PPU", "Margin %", "Margin $$"].map((label, index) => (
                <th key={label} className={`px-2 py-2 border-b border-blue-200 font-bold ${index === 0 ? "text-left" : "text-right"}`}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <Fragment key={row.id}>
                <tr className="border-b border-blue-100 hover:bg-blue-50/40">
                  <td className="px-2 py-1.5 text-zinc-800 font-semibold">
                    <div className="flex items-center gap-1">
                      {row.breakdownRows && row.breakdownRows.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setOpenRows(open => ({ ...open, [row.id]: !open[row.id] }))}
                          className="h-5 w-5 inline-flex items-center justify-center rounded border border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
                          title={openRows[row.id] ? "Hide cost breakdown" : "Show cost breakdown"}
                        >
                          {openRows[row.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                      )}
                      <span>{row.label}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-zinc-600">{fmtQty(row.baselineQty)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700">{fmtQty(row.intakeQty)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700">{fmtQty(row.deliverableQty)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-[#e8473f]">{fmtMoney(row.sellingPrice)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-zinc-800">{fmtPpu(row.sellingPpu)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-zinc-900">{fmtMoney(row.ourCost)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-zinc-800">{fmtPpu(row.ourPpu)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums bg-green-50 text-green-700 font-semibold">{fmtPct(row.marginPct)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums bg-green-50 text-green-800 font-semibold">{fmtMoney(row.marginDollars)}</td>
                </tr>
                {row.breakdownRows && openRows[row.id] && row.breakdownRows.map(detail => (
                  <tr key={detail.id} className="border-b border-blue-50 bg-blue-50/35">
                    <td className="px-2 py-1.5 pl-8 text-zinc-600 font-medium">{detail.label}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-zinc-500">{fmtQty(detail.baselineQty)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-zinc-600">{fmtQty(detail.intakeQty)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-zinc-600">{fmtQty(detail.deliverableQty)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-[#e8473f]">{fmtMoney(detail.sellingPrice)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700">{fmtPpu(detail.sellingPpu)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-zinc-800">{fmtMoney(detail.ourCost)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700">{fmtPpu(detail.ourPpu)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums bg-green-50 text-green-700">{fmtPct(detail.marginPct)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums bg-green-50 text-green-800">{fmtMoney(detail.marginDollars)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr className="border-t-2 border-blue-300 bg-blue-100/70 font-bold">
              <td className="px-2 py-2 text-blue-900 uppercase">Totals</td>
              <td className="px-2 py-2 text-right text-blue-900">-</td>
              <td className="px-2 py-2 text-right text-blue-900">-</td>
              <td className="px-2 py-2 text-right text-blue-900">-</td>
              <td className="px-2 py-2 text-right tabular-nums text-[#e8473f]">{fmtMoney(adjustedTotals.sellingPrice)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-blue-900">{fmtPpu(adjustedTotals.sellingPrice / totalPpuDenom)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-zinc-950">{fmtMoney(adjustedTotals.ourCost)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-blue-900">{fmtPpu(adjustedTotals.ourCost / totalPpuDenom)}</td>
              <td className="px-2 py-2 text-right tabular-nums bg-green-100 text-green-800">{fmtPct(totalMarginPct)}</td>
              <td className="px-2 py-2 text-right tabular-nums bg-green-100 text-green-900">{fmtMoney(totalMarginDollars)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Home() {
  const {
    projectType, setProjectType,
    moqRows, setMoqRows,
    packagingLevels, setPackagingLevels,
    processLevels, setProcessLevels,
    scaledColumns,
    formData, setFormField,
    summaryRows, summaryTableRows, ppuUnits,
    allMoqResults,
    whatIfPpus, setWhatIfPpus,
    costPpuOverrides,
    additionalFees, setAdditionalFees,
    coPackingProcesses, setCoPackingProcesses,
    customer,
    quoteApproval, setQuoteApproval,
    currentUser,
    activeMoqId,
    setCrmAccountId,
    setCrmContactId,
    loadQuoteState,
    saveState,
    markSaved,
  } = useProject();

  // â"€â"€ CRM start modal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const [crmParams, setCrmParams] = useState<CrmStartParams | null>(null);
  const [crmLoading, setCrmLoading] = useState(false);
  const [revisionNotice, setRevisionNotice] = useState<string | null>(null);
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [customerApprovalStatus, setCustomerApprovalStatus] = useState("Not sent to CRM");
  const [packagingDbOpen, setPackagingDbOpen] = useState(false);
  const [packagingCostItems, setPackagingCostItems] = useState<PackagingCostItem[]>(() => loadPackagingCostItems());
  const [packagingCostAudit, setPackagingCostAudit] = useState<PackagingCostAuditEntry[]>(() => loadPackagingCostAudit());

  useEffect(() => {
    fetchPackagingCostItems()
      .then(items => {
        setPackagingCostItems(items);
        savePackagingCostItems(items);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchPackagingCostAudit()
      .then(entries => {
        setPackagingCostAudit(entries);
        savePackagingCostAudit(entries);
      })
      .catch(() => {});
  }, []);

  const approvalPillClasses = (status: string, type: "internal" | "customer" = "customer") => {
    const normalized = status.toLowerCase();
    if (normalized.includes("approved")) return "border-green-200 bg-green-50 text-green-700";
    if (normalized.includes("rejected")) return "border-red-200 bg-red-50 text-red-700";
    if (normalized.includes("expired")) return "border-zinc-300 bg-zinc-100 text-zinc-700";
    if (normalized.includes("review")) return "border-amber-200 bg-amber-50 text-amber-700";
    return type === "internal" ? "border-zinc-200 bg-zinc-50 text-zinc-700" : "border-blue-200 bg-blue-50 text-blue-700";
  };

  useEffect(() => {
    const hashQuery = window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "";
    const params = new URLSearchParams(hashQuery || window.location.search);
    const savedQuoteId = params.get("savedQuoteId") || params.get("quoteShareId");
    if (!savedQuoteId) return;

    let cancelled = false;
    setCrmLoading(true);
    setRevisionError(null);
    fetch(`${SAVED_QUOTES_API}/${encodeURIComponent(savedQuoteId)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `Server error ${res.status}`);
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        const detail = typeof data.quote_data === "string" ? JSON.parse(data.quote_data) : data.quote_data;
        if (!detail?.moqRows || !detail?.formData) throw new Error("The shared quote is missing pricing-tool source data.");
        loadQuoteState({
          ...detail,
          moqRows: detail.moqRows,
          columns: detail.columns ?? [],
          formData: detail.formData,
          customer: detail.customer,
          selectedBrand: detail.selectedBrand,
          packagingLevels: detail.packagingLevels,
          projectType: detail.projectType,
          coPackingState: detail.coPackingState,
          coPackingProcesses: detail.coPackingProcesses,
          additionalFees: detail.additionalFees,
          crmAccountId: detail.crmAccountId,
          crmContactId: detail.crmContactId,
          quoteApproval: detail.quoteApproval,
          moqMargins: detail.moqMargins,
          moqPpuInputs: detail.moqPpuInputs,
          moqLastEdited: detail.moqLastEdited,
          whatIfPpus: detail.whatIfPpus,
          costPpuOverrides: detail.costPpuOverrides,
        }, data.id, data.quote_name);
        setRevisionNotice(`Loaded shared quote "${data.quote_name}".`);
        window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash.split("?")[0] || "#/"}`);
      })
      .catch((err) => {
        if (!cancelled) setRevisionError(err instanceof Error ? err.message : "Could not load the shared quote.");
      })
      .finally(() => {
        if (!cancelled) setCrmLoading(false);
      });

    return () => { cancelled = true; };
  }, [loadQuoteState]);

  useEffect(() => {
    let cancelled = false;
    const quoteId = saveState.crmQuoteId;
    if (!quoteId) {
      setCustomerApprovalStatus("Not sent to CRM");
      return;
    }
    fetch(`/server/quotes-api/crm/quote-status?quoteId=${encodeURIComponent(quoteId)}`)
      .then((res) => {
        if (res.status === 404) {
          if (saveState.savedQuoteId && saveState.savedQuoteName) {
            markSaved(saveState.savedQuoteId, saveState.savedQuoteName, { crmQuoteId: "", crmQuoteNumber: "" });
          }
          return { customerApprovalStatus: "Not sent to CRM" };
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        if (cancelled || !data) return;
        setCustomerApprovalStatus(String(data.customerApprovalStatus || "In review"));
      })
      .catch(() => {
        if (!cancelled) setCustomerApprovalStatus("Not sent to CRM");
      });
    return () => { cancelled = true; };
  }, [saveState.crmQuoteId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") !== "crm") return;

    const mode        = params.get("mode");
    const company     = params.get("company");
    const contactName = params.get("contactName");
    const email       = params.get("email");
    const salesRep    = params.get("salesRep");
    const crmDealId   = params.get("crmDealId");
    const crmQuoteId  = params.get("crmQuoteId") || params.get("quoteId");

    const initialParams: CrmStartParams = { company, contactName, email, phone: null, salesRep, crmDealId, crmContactId: null, customerId: null };

    const withDealContact = async (dealId = crmDealId, paramsBase = initialParams) => {
      if (!dealId) return paramsBase;
      const response = await fetch(`/server/quotes-api/crm/deal-contact?dealId=${encodeURIComponent(dealId)}`);
      const result = await response.json();
      const data = result?.data;
      return {
        ...paramsBase,
        ...(data?.phone ? { phone: data.phone } : {}),
        ...(data?.email ? { email: data.email } : {}),
        crmContactId: data?.contactId || null,
        ...(data?.accountNumber ? { customerId: data.accountNumber } : {}),
      };
    };

    const startRevisionFromQuote = async (quoteStateUrl: string, fallbackDealId = crmDealId) => {
      const quoteRes = await fetch(quoteStateUrl);
      const quoteJson = await quoteRes.json();
      if (!quoteRes.ok || !quoteJson.success || !quoteJson.quote?.quote_data) {
        throw new Error(quoteJson.error || "No previous app quote was found.");
      }

      const source = quoteJson.quote;
      const detail = source.quote_data;
      if (!detail?.moqRows || !detail?.columns || !detail?.formData) {
        throw new Error("The selected quote is missing pricing-tool source data.");
      }

      const resolvedDealId = detail.crmDealId || detail.crmAccountId || fallbackDealId || "";
      const mergedParams = await withDealContact(resolvedDealId, { ...initialParams, crmDealId: resolvedDealId || initialParams.crmDealId });
      const mergedCustomer = {
        ...(detail.customer ?? {}),
        ...(mergedParams.company     && { customer: mergedParams.company }),
        ...(mergedParams.contactName && { name: mergedParams.contactName }),
        ...(mergedParams.email       && { email: mergedParams.email }),
        ...(mergedParams.phone       && { phone: mergedParams.phone }),
        ...(mergedParams.salesRep    && { salesRep: mergedParams.salesRep }),
        ...(mergedParams.customerId  && { customerId: mergedParams.customerId }),
      };

      loadQuoteState({
        ...detail,
        customer: mergedCustomer,
        crmAccountId: resolvedDealId,
        crmContactId: mergedParams.crmContactId || detail.crmContactId || "",
        quoteApproval: {
          status: "Draft",
          decidedAt: "",
          decidedBy: "",
          decidedByEmail: "",
          decidedByCrmUserId: "",
        },
      });
      if (resolvedDealId) setCrmAccountId(resolvedDealId);
      if (mergedParams.crmContactId) setCrmContactId(mergedParams.crmContactId);
      localStorage.setItem(REVISION_SOURCE_STORAGE_KEY, JSON.stringify({
        crmDealId: resolvedDealId,
        crmQuoteId: source.crmQuoteId || detail.crmQuoteId || crmQuoteId || "",
        crmQuoteNumber: source.crmQuoteNumber || detail.crmQuoteNumber || "",
        sourceSavedQuoteId: source.id || "",
        sourceSavedQuoteName: source.quote_name || "",
        sourceQuoteVersion: source.quoteVersion || detail.quoteVersion || "",
        startedAt: new Date().toISOString(),
      }));
      setRevisionNotice(`Revision started from ${source.crmQuoteNumber || source.quote_name || "the selected CRM quote"}. Sending to CRM will create a new version.`);
      window.history.replaceState({}, "", window.location.pathname);
    };

    if (mode === "revise" && (crmQuoteId || crmDealId)) {
      setCrmLoading(true);
      setRevisionError(null);
      const quoteStateUrl = crmQuoteId
        ? `/server/quotes-api/crm/quote-state?quoteId=${encodeURIComponent(crmQuoteId)}`
        : `/server/quotes-api/crm/deal-latest-quote-state?dealId=${encodeURIComponent(crmDealId || "")}`;
      startRevisionFromQuote(quoteStateUrl, crmDealId)
        .catch((err) => {
          console.error("CRM revision load error:", err);
          setRevisionError(err instanceof Error ? err.message : "Could not start quote revision.");
          setCrmParams(initialParams);
        })
        .finally(() => setCrmLoading(false));
      return;
    }

    localStorage.removeItem(REVISION_SOURCE_STORAGE_KEY);
    if (crmDealId) {
      setCrmLoading(true);
      withDealContact()
        .then(setCrmParams)
        .catch(err => {
          console.error("Contact fetch error:", err);
          setCrmParams(initialParams);
        })
        .finally(() => setCrmLoading(false));
    } else {
      setCrmParams(initialParams);
    }
    // Run only once on initial CRM launch. Context setters are intentionally not dependencies here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCrmModalComplete = useCallback(() => {
    setCrmParams(null);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const activeRow   = moqRows.find(r => r.id === activeMoqId) ?? moqRows[0];
  const moqQty      = activeRow ? (parseFloat(activeRow.individualUnits) || parseFloat(activeRow.moq) || 0) : 0;
  const quoteApprovalBy = currentUser?.name || quoteApproval.decidedBy || customer.salesRep || customer.name || "Current user";
  const quoteApprovalByEmail = currentUser?.email || quoteApproval.decidedByEmail || "";
  const quoteApprovalDate = quoteApproval.decidedAt
    ? new Date(quoteApproval.decidedAt).toLocaleDateString()
    : "Not set";
  const updateQuoteApproval = (status: "Draft" | "Approved" | "Rejected") => {
    setQuoteApproval(status === "Draft"
      ? { status, decidedAt: "", decidedBy: "", decidedByEmail: "", decidedByCrmUserId: "" }
      : { status, decidedAt: new Date().toISOString(), decidedBy: quoteApprovalBy, decidedByEmail: quoteApprovalByEmail, decidedByCrmUserId: "" });
  };

  const sections: SidebarSection[] = [
    { id: "section-project-info",       label: "Project Info",       visible: true },
    { id: "section-manufacturing-moq",  label: "Mfg MOQ",            visible: true },
    { id: "section-raw-materials",      label: "Raw Materials",      visible: true },
    { id: "section-inventory-handling", label: "Inventory Handling", visible: true },
    { id: "section-testing",            label: "Testing",            visible: true },
    { id: "section-processes",          label: "Processes",          visible: true },
    { id: "section-packaging-summary",  label: "Packout Config",     visible: true },
    { id: "section-palletization",      label: "Palletization",      visible: true },
    { id: "section-additional-costs",   label: "Additional Fees",    visible: true },
    { id: "section-price-adjustment",   label: "Price Adjustment",   visible: true },
  ];

  return (
    <main className="min-h-screen flex flex-col">
      {crmParams && !crmLoading && (
        <CrmStartModal crmParams={crmParams} onComplete={handleCrmModalComplete} />
      )}
      {revisionNotice && (
        <div className="fixed top-20 right-5 z-70 max-w-md rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-xs font-semibold text-green-800 shadow-lg">
          <button type="button" onClick={() => setRevisionNotice(null)} className="float-right ml-3 text-green-700 hover:text-green-950">x</button>
          {revisionNotice}
        </div>
      )}
      {revisionError && (
        <div className="fixed top-20 right-5 z-70 max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 shadow-lg">
          <button type="button" onClick={() => setRevisionError(null)} className="float-right ml-3 text-red-500 hover:text-red-800">x</button>
          {revisionError}
        </div>
      )}
      <Navbar />
      <SectionSidebar sections={sections} />

      <div className="flex flex-1 lg:pl-42">
        <div className="flex-1 min-w-0">
          <div className="pb-6">
          <div className="px-4 md:px-6 pt-4">
            <div className="max-w-[56rem] rounded-xl border border-blue-200 bg-blue-50/70 shadow-sm shadow-blue-100 overflow-hidden">
              <div className="flex items-center justify-between gap-4 border-b border-blue-100 bg-blue-100/60 px-4 py-2.5">
                <div>
                  <div className="text-[0.6rem] font-semibold uppercase tracking-widest text-blue-700">Quote Approval</div>
                  <div className="text-xs text-zinc-600">Status and approval details for the CRM quote</div>
                </div>
                <select
                  value={quoteApproval.status}
                  onChange={(e) => updateQuoteApproval(e.target.value as "Draft" | "Approved" | "Rejected")}
                  className="h-8 rounded-lg border border-blue-200 bg-white px-2 text-xs font-semibold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#e8473f]"
                  title="Quote approval status"
                >
                  <option value="Draft">Draft</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-blue-100 bg-white/70">
                <div className="px-4 py-3">
                  <div className="text-[0.58rem] font-semibold uppercase tracking-widest text-zinc-500">Internal Approval</div>
                  <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${approvalPillClasses(quoteApproval.status, "internal")}`}>
                    {quoteApproval.status}
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[0.58rem] font-semibold uppercase tracking-widest text-zinc-500">Customer Approval</div>
                  <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${approvalPillClasses(customerApprovalStatus)}`}>
                    {customerApprovalStatus}
                  </div>
                  {saveState.crmQuoteNumber && <div className="mt-0.5 text-[0.68rem] text-zinc-500">CRM #{saveState.crmQuoteNumber}</div>}
                </div>
                <div className="px-4 py-3">
                  <div className="text-[0.58rem] font-semibold uppercase tracking-widest text-zinc-500">Approved / Rejected By</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{quoteApproval.decidedBy || "Not set"}</div>
                  {quoteApproval.decidedByEmail && <div className="mt-0.5 text-[0.68rem] text-zinc-500">{quoteApproval.decidedByEmail}</div>}
                </div>
                <div className="px-4 py-3">
                  <div className="text-[0.58rem] font-semibold uppercase tracking-widest text-zinc-500">Decision Date</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{quoteApprovalDate}</div>
                </div>
              </div>
            </div>
          </div>
          <LeftContent
            expanded={false}
            moqRows={moqRows}
            setMoqRows={setMoqRows}
            formData={formData}
            setFormField={setFormField}
            packagingLevels={packagingLevels}
            setPackagingLevels={setPackagingLevels}
            scaledColumns={scaledColumns}
            moqQty={moqQty}
            projectType={projectType}
            setProjectType={setProjectType}
            coPackingProcesses={coPackingProcesses}
            setCoPackingProcesses={setCoPackingProcesses}
            summaryRows={summaryRows}
            summaryTableRows={summaryTableRows}
            ppuUnits={ppuUnits}
            allMoqResults={allMoqResults}
            whatIfPpus={whatIfPpus}
            setWhatIfPpus={setWhatIfPpus}
            costPpuOverrides={costPpuOverrides}
            additionalFees={additionalFees}
            setAdditionalFees={setAdditionalFees}
            processLevels={processLevels}
            setProcessLevels={setProcessLevels}
            activeMoqId={activeMoqId}
            packagingCostItems={packagingCostItems}
            onOpenPackagingCostDatabase={() => setPackagingDbOpen(true)}
          />
          </div>
        </div>
      </div>

      {packagingDbOpen && (
        <PackagingCostDatabaseModal
          items={packagingCostItems}
          setItems={setPackagingCostItems}
          audit={packagingCostAudit}
          setAudit={setPackagingCostAudit}
          onClose={() => setPackagingDbOpen(false)}
        />
      )}

    </main>
  );
}
