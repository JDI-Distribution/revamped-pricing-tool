

import { createContext, useContext, useState, useMemo, useEffect, ReactNode } from "react";
import { MoqRow, Column, PackagingLevel, ProjectFormData, SummaryRow, SummaryTableRow, DetailSection, ProjectType, CoPackingState, CoPackingResult, AdditionalFeeRow, CoPackingScenario, CoPackingPackagingSummaryRow, CoPackingColumn, TestingRow, CoPackingProcess } from "./types";
import { computeDetailSections } from "./calculations";
import { computeCoPackingResults, computeCoPackingTotals } from "./coPackingCalculations";
import { packagingLevelsToColumns } from "./packagingLevelsCompat";

import { BrandId, CustomerInfo } from "./generateQuotePDF";

const initialMoqRows: MoqRow[] = [];

const initialFormData: ProjectFormData = {
  unitWeight:              "113.4",
  costPerGram:             "0.00922737306843267",
  numSkus:                 "1",
  rawMaterialSkus:         "1",
  leftOverInventoryCost:   "0",
  leftOverInventoryAbsorb: "0",
  intakeFee:               "195",
  numPallets:              "1",
  numIntakePallets:        "",
  inventoryHandlingFee:    "350",
  numShipments:            "1",
  intakePalletWeightValue: "",
  intakePalletWeightUom:   "lbs",
  outboundFee:             "350",
  outboundFeeMarkup:       "40",
  maxPalletWeightLbs:      "2000",
  maxPalletWeightUom:      "lbs",
  palletBuffer:            "0",
  testingEnabled:          "true",
  testingRows: [
    { id: "1", testType: "FSQ, Administration, and Testing Documents", customTestName: "", cost: 350 },
  ],
  testingMarkup:           "20",
  setupFeeOur:             "598",
  setupFeeCustomer:        "1495",
  projectManagementFee:    "350",
  ppuDenominator:          "6600",
  manufacturingMoqQty:     "",
  manufacturingMoqUom:     "kg",
  manufacturingMoqNetFillG:"",
  manufacturingMoqReservePct: "0",
  manufacturingMoqReserveUnits: "0",
  manufacturingMoqRoundingMode: "down",
  manufacturingMoqRoundingIncrement: "1000",
  manufacturingMoqApplyToPpu: "false",
  leadTimeBufferDays:      "57",
  startDate:               (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })(),
  rawMaterialProvider:     "customer",
  materialOverage:         "25",
  rawMaterialMarkup:       "300",
  intakeFeeMarkup:         "25",
  unitWeightUnit:          "g",
  // Co-packing extras (inactive in standard mode)
  rawMaterialSource:       "customer",
  blendingEnabled:         "false",
  blendingDescription:     "",
  blendingUnits:           "1",
  blendingOverage:         "0",
  blendingUnitsPerMin:     "1",
  blendingEfficiencyBuffer:"0.15",
  blendingWageRate:        "30",
  blendingLaborMarkup:     "0.35",
  blendingMinLaborHrs:     "0",
};


import { defaultPackagingLevel } from "@/components/project/PackagingLevels";

const n = (s: string | undefined) => parseFloat(s || "0") || 0;

const initialPackagingLevels: PackagingLevel[] = [
  {
    ...defaultPackagingLevel(),
    customLevelName: "Individual Units",
    packagingType: "4oz Sachets",
    units: 6600, isAutoUnits: false,
    overageRate: 15, efficiencyBuffer: 20, laborMarkup: 35, unitCostMarkup: 125,
    wageRate: 26, fillRatePerMin: 12, packagingWeightG: 1.6,
    numStaff: 5, hrsPerShift: 7.3, workingDays: 5,
    costPerUnit: 0.035,
  },
  {
    ...defaultPackagingLevel(),
    customLevelName: "Final Kit Units",
    packagingType: "4oz Tins",
    units: 6600, isAutoUnits: false,
    overageRate: 3, efficiencyBuffer: 20, laborMarkup: 35, unitCostMarkup: 125,
    wageRate: 26, fillRatePerMin: 15, packagingWeightG: 71,
    numStaff: 3, hrsPerShift: 7.3, workingDays: 5,
    costPerUnit: 0.55, labelEnabled: true, labelPrintCost: 0.2,
  },
  {
    ...defaultPackagingLevel(),
    customLevelName: "Inners",
    packagingType: "Inners",
    units: 275, isAutoUnits: false,
    overageRate: 2, efficiencyBuffer: 20, laborMarkup: 35, unitCostMarkup: 125,
    wageRate: 26, fillRatePerMin: 1, packagingWeightG: 454,
    numStaff: 1, hrsPerShift: 7.3, workingDays: 5,
    costPerUnit: 0.2,
  },
  {
    ...defaultPackagingLevel(),
    customLevelName: "Shippers",
    packagingType: "Shippers",
    units: 12, isAutoUnits: false,
    overageRate: 1, efficiencyBuffer: 25, laborMarkup: 35, unitCostMarkup: 125,
    wageRate: 26, fillRatePerMin: 1, packagingWeightG: 454,
    numStaff: 1, hrsPerShift: 7.3, workingDays: 5,
    costPerUnit: 0.2,
  },
];

export interface MoqPricingRow {
  moqRow:            MoqRow;
  casePack:          string;   // "unitsPerInner × innersPerMaster" or just unitsPerInner
  totalCustomerPrice: number;
  totalOurCost:      number;
  ppuDenominator:    number;
  ppu:               number;   // totalCustomerPrice / ppuDenominator
  ppuCost:           number;   // totalOurCost / ppuDenominator
  marginDollars:     number;
  marginPct:         number;
}

export interface MoqRowError {
  rowId:           number;
  unitsPerInner?:  string;   // error message for units-per-inner field
  innersPerMaster?: string;  // error message for inners-per-master field
}

export interface SaveState {
  savedQuoteId:    string | null;
  savedQuoteName:  string | null;
  hasUnsavedChanges: boolean;
  lastSavedAt:     Date | null;
}

const initialCoPackingPackagingSummaryRows: CoPackingPackagingSummaryRow[] = [
  { id: "default-1", packagingLevel: "Individual Units", packagingType: "", units: 75000, isAutoUnits: false, costPerUnit: 0 },
];

const initialCoPackingColumns: CoPackingColumn[] = [
  {
    id: "default-1",
    efficiencyBuffer: 0.20, laborMarkup: 0.35, unitCostMarkup: 1.25,
    level: "Individual Units", type: "",
    labelEnabled: false, labelPrintCost: 0, labelApplyRate: 0,
    tabsEnabled: false, tabCostPerUnit: 0,
    overageRate: 0.15, wageRate: 26, fillRatePerMin: 12,
    packagingWeightG: 2, numStaff: 1, hrsPerShift: 7, workingDays: 5,
  },
];

const initialCoPackingState: CoPackingState = {
  // Project Overview
  unitsDelivered:    75000,
  sachetSizeG:       5,
  unitSizeUnit:      "g",
  sachetsPerInner:   30,
  innersPerMaster:   20,
  rawMaterialSource: "customer",
  setupFeeCustomer:  3500,
  setupFeeOurCost:   700,
  setupFeeMargin:    0.80,
  // Blending
  blendingEnabled:            false,
  blendingDescription:        "",
  blendingUnits:              1,
  blendingOverage:            0,
  blendingUnitsPerMin:        1,
  blendingEfficiencyBuffer:   0.15,
  blendingWageRate:           30,
  blendingLaborMarkup:        0.35,
  blendingBatchSize:          0,
  blendingBatchSizeUnit:      "kg",
  blendingRecipe:             [],
  // Inbound
  inboundOverage:    0.15,
  intakeFeePerPallet:    595,
  inboundPallets:        5,
  intakePalletWeightLbs: 1200,
  intakeMarkup:      0.25,
  numSkus:           1,
  testingMarkup:     0.20,
  // Testing
  testingEnabled: true,
  testingRows: [
    { id: "default-1", testType: "Certificate of Analysis (COA)", customTestName: "", cost: 350 },
    { id: "default-2", testType: "Safety Data Sheet (SDS)",       customTestName: "", cost: 250 },
  ],
  // Packaging Summary + Packaging & Packout columns
  coPackingPackagingSummaryRows: initialCoPackingPackagingSummaryRows,
  coPackingColumns:              initialCoPackingColumns,
  // Pallets
  outboundPallets:      4,
  outboundFeePerPallet: 195,
  outboundMarkup:       0.30,
  // Minimum Job Charge
  minimumJobCharge: 0,
  // JDI raw material fields
  costPerGram:       0,
  rawOverage:        0,
  rawMaterialMarkup: 3.0,
  // Addition 2 — Packaging Type
  packagingType:   "retail",
  // Addition 3 — Overhead
  overheadEnabled:     false,
  overheadRate:        0.15,
  overheadMarkup:      0.20,
  fixedOverheadFee:    0,
  fixedOverheadMarkup: 0.20,
  // Addition 4 — Minimum labor
  blendingMinLaborHrs:    0,
  globalMinLaborHrs:      0,
  // Addition 5 — Pricing Tiers
  tiersEnabled:  false,
  pricingTiers:  [],
  // Meta
  pricingAssumptions: "",
};

const initialCustomer: CustomerInfo = {
  customer:         "Bartesian",
  customerId:       "13421-25",
  name:             "Will Heinzmann",
  phone:            "(616) 916-4057",
  email:            "will@bartesian.com",
  salesRep:         "Greg Portnoy",
  productName:      "4oz Sachets",
  productCategory:  "",
  projectOverview:  "",
};

const initialBrand: BrandId = "brewglitter";

const initialAdditionalFees: AdditionalFeeRow[] = [
  { id: "default-1", type: "Co-marketing and Return Fees", amount: 0, mode: "%" },
  { id: "default-2", type: "EDI Transaction Fees",          amount: 0, mode: "$" },
];

interface ProjectContextValue {
  // Project type selector
  projectType:    ProjectType;
  setProjectType: React.Dispatch<React.SetStateAction<ProjectType>>;
  // Co-packing state (flat single object)
  coPackingState:    CoPackingState;
  setCoPackingField: <K extends keyof CoPackingState>(field: K, value: CoPackingState[K]) => void;
  // Co-packing processes (labor steps)
  coPackingProcesses:    CoPackingProcess[];
  setCoPackingProcesses: React.Dispatch<React.SetStateAction<CoPackingProcess[]>>;
  // Derived co-packing results
  coPackingResults: CoPackingResult[];
  coPackingTotals:  { totalOur: number; totalCustomer: number; margin: number };
  // Raw state
  moqRows:      MoqRow[];
  setMoqRows:   React.Dispatch<React.SetStateAction<MoqRow[]>>;
  // Packaging levels — unified source of truth (replaces columns + packagingSummaryRows)
  packagingLevels:    PackagingLevel[];
  setPackagingLevels: React.Dispatch<React.SetStateAction<PackagingLevel[]>>;
  // Process levels — separate PackagingLevel state for the Processes section
  processLevels:      PackagingLevel[];
  setProcessLevels:   React.Dispatch<React.SetStateAction<PackagingLevel[]>>;
  // Overall process cost markup %
  processCostMarkup:    number;
  setProcessCostMarkup: React.Dispatch<React.SetStateAction<number>>;
  // Derived columns (for internal calc compatibility — do not expose to UI)
  columns:      Column[];
  setColumns:   React.Dispatch<React.SetStateAction<Column[]>>;
  formData:     ProjectFormData;
  setFormField: (field: keyof ProjectFormData, value: string) => void;
  setTestingRows: (rows: TestingRow[]) => void;
  activeMoqId:  number;
  setActiveMoqId: React.Dispatch<React.SetStateAction<number>>;
  // Customer / brand info (shared across pages)
  customer:     CustomerInfo;
  setCustomer:  React.Dispatch<React.SetStateAction<CustomerInfo>>;
  setCustomerField: (field: keyof CustomerInfo, value: string) => void;
  selectedBrand:    BrandId;
  setSelectedBrand: React.Dispatch<React.SetStateAction<BrandId>>;
  // CRM linkage (Zoho CRM account/contact ids — session-only)
  crmAccountId:    string;
  setCrmAccountId: React.Dispatch<React.SetStateAction<string>>;
  crmContactId:    string;
  setCrmContactId: React.Dispatch<React.SetStateAction<string>>;
  // columns + auto-generated derived columns from MOQ pack sizes
  effectiveColumns: Column[];
  // Derived — active MOQ
  scaledColumns:    Column[];
  detailSections:   DetailSection[];
  summaryRows:      SummaryRow[];
  summaryTableRows: SummaryTableRow[];
  ppuUnits:         number;
  // Derived — all MOQs (for the MOQ pricing table)
  allMoqResults:       MoqPricingRow[];
  perMoqSummaryRows:   Map<number, SummaryRow[]>;
  // Compute costs for an arbitrary unit count (interstitial pricing)
  computeForQty: (qty: number, unitsPerInner: number) => { summaryRows: SummaryRow[]; summaryTableRows: SummaryTableRow[]; totalCustomer: number; totalOur: number; ppuCost: number; ppuCustomer: number } | null;
  // MOQ row validation errors (derived from moqRows)
  moqErrors:    MoqRowError[];
  hasMoqErrors: boolean;
  // Additional Costs & Fees (standard mode, internal only)
  additionalFees:    AdditionalFeeRow[];
  setAdditionalFees: React.Dispatch<React.SetStateAction<AdditionalFeeRow[]>>;
  // Price adjustment state (MOQ Pricing Table + Price Adjustment on Home; used by PDF on Quote page)
  moqMargins:    Record<number, string>;
  setMoqMargins: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  moqPpuInputs:  Record<number, string>;
  setMoqPpuInputs: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  moqLastEdited: Record<number, "margin" | "ppu">;
  setMoqLastEdited: React.Dispatch<React.SetStateAction<Record<number, "margin" | "ppu">>>;
  whatIfPpus:    Record<number, string>;
  setWhatIfPpus: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  costPpuOverrides:    Record<number, string>;
  setCostPpuOverrides: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  resolvedMoqMargins: Record<number, string>;
  // Addition 6 — Scenario comparison
  scenarioA: CoPackingScenario | null;
  scenarioB: CoPackingScenario | null;
  saveScenario: (slot: 'A' | 'B', name: string) => void;
  clearScenarios: () => void;
  // Restore all project state from a saved quote snapshot
  loadQuoteState: (state: { moqRows: MoqRow[]; columns: Column[]; formData: ProjectFormData; customer?: CustomerInfo; selectedBrand?: BrandId; packagingLevels?: PackagingLevel[]; packagingSummaryRows?: unknown; packagingCasePack?: number; projectType?: ProjectType; coPackingState?: CoPackingState; additionalFees?: AdditionalFeeRow[]; coPackingProcesses?: CoPackingProcess[]; crmAccountId?: string; crmContactId?: string }, savedId?: string, savedName?: string) => void;
  // Save state — tracks whether current quote has been saved and if there are unsaved changes
  saveState:    SaveState;
  markSaved:    (id: string, name: string) => void;
  clearSave:    () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  // Rehydrate from localStorage on first render
  const _draft = (() => {
    try { return JSON.parse(localStorage.getItem("jdi_draft_v1") ?? "{}"); } catch { return {}; }
  })();

  const [projectType, setProjectType] = useState<ProjectType>(_draft.projectType ?? "standard");
  const [coPackingState, setCoPackingStateRaw] = useState<CoPackingState>(_draft.coPackingState ?? initialCoPackingState);
  const [coPackingProcesses, setCoPackingProcesses] = useState<CoPackingProcess[]>(_draft.coPackingProcesses ?? []);

  const [moqRows,  setMoqRows]  = useState<MoqRow[]>(_draft.moqRows ?? initialMoqRows);
  const [packagingLevels, setPackagingLevels] = useState<PackagingLevel[]>(
    _draft.packagingLevels && _draft.packagingLevels.length > 0
      ? _draft.packagingLevels.map((l: PackagingLevel) => ({ ...l, manualCharges: l.manualCharges ?? [] }))
      : initialPackagingLevels
  );
  const [processLevels, setProcessLevels] = useState<PackagingLevel[]>(
    (_draft as any).processLevels && (_draft as any).processLevels.length > 0
      ? (_draft as any).processLevels.map((l: PackagingLevel) => ({ ...l, manualCharges: l.manualCharges ?? [] }))
      : []
  );
  const [processCostMarkup, setProcessCostMarkup] = useState<number>((_draft as any).processCostMarkup ?? 0);

  const [formData, setFormData] = useState<ProjectFormData>(_draft.formData ? { ...initialFormData, ..._draft.formData } : initialFormData);
  const [activeMoqId, setActiveMoqId] = useState<number>(1);
  const [customer, setCustomer] = useState<CustomerInfo>(_draft.customer ?? initialCustomer);
  const [selectedBrand, setSelectedBrand] = useState<BrandId>(_draft.selectedBrand ?? initialBrand);
  const [crmAccountId, setCrmAccountId] = useState(_draft.crmAccountId ?? "");
  const [crmContactId, setCrmContactId] = useState(_draft.crmContactId ?? "");
  const [additionalFees, setAdditionalFees] = useState<AdditionalFeeRow[]>(_draft.additionalFees ?? initialAdditionalFees);
  const [scenarioA, setScenarioA] = useState<CoPackingScenario | null>(null);
  const [scenarioB, setScenarioB] = useState<CoPackingScenario | null>(null);

  const setFormField = (field: keyof ProjectFormData, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const setTestingRows = (rows: TestingRow[]) =>
    setFormData((prev) => ({ ...prev, testingRows: rows }));

  const setCustomerField = (field: keyof CustomerInfo, value: string) =>
    setCustomer((prev) => ({ ...prev, [field]: value }));

  const setCoPackingField = <K extends keyof CoPackingState>(field: K, value: CoPackingState[K]) =>
    setCoPackingStateRaw((prev) => ({ ...prev, [field]: value }));

  const saveScenario = (slot: 'A' | 'B', name: string) => {
    const scenario: CoPackingScenario = { name, state: coPackingState };
    if (slot === 'A') setScenarioA(scenario);
    else setScenarioB(scenario);
  };

  const clearScenarios = () => { setScenarioA(null); setScenarioB(null); };

  const coPackingResults = useMemo(
    () => computeCoPackingResults(coPackingState, coPackingProcesses),
    [coPackingState, coPackingProcesses],
  );

  const coPackingTotals = useMemo(
    () => computeCoPackingTotals(coPackingResults),
    [coPackingResults],
  );

  // Derive Column[] from packagingLevels for the active MOQ.
  // packagingLevelsToColumns handles unit derivation and maps all fields.
  const scaledColumns = useMemo(() => {
    const active = moqRows.find((r) => r.id === activeMoqId) ?? moqRows[0];
    const qty          = active ? (n(active.individualUnits) || n(active.moq) || 0) : 0;
    const upi          = active ? n(active.unitsPerInner)   : 0;
    const ipm          = active ? n(active.innersPerMaster) : 0;
    return packagingLevelsToColumns(packagingLevels, qty, upi, ipm);
  }, [packagingLevels, moqRows, activeMoqId]);

  const { detailSections, summaryRows, summaryTableRows, ppuUnits } = useMemo(
    () => computeDetailSections(scaledColumns, moqRows, formData),
    [scaledColumns, moqRows, formData],
  );

  const effectiveColumns = scaledColumns;

  // ── Per-MOQ pricing rows + per-MOQ summary line items ────────────────────────
  const { allMoqResults, perMoqSummaryRows } = useMemo(() => {
    if (!moqRows[0]) return { allMoqResults: [] as MoqPricingRow[], perMoqSummaryRows: new Map<number, SummaryRow[]>() };
    const ppuDenom     = n(formData.ppuDenominator);
    const pricing:     MoqPricingRow[]              = [];
    const summaryMap = new Map<number, SummaryRow[]>();

    for (const row of moqRows) {
      const rowPack         = n(row.unitsPerInner);
      const rowQty          = n(row.individualUnits) || n(row.moq) || 1;
      const rowInnersPerMaster = n(row.innersPerMaster);

      // Derive columns for this specific MOQ row from packagingLevels
      const rowColsBase = packagingLevelsToColumns(packagingLevels, rowQty, rowPack, rowInnersPerMaster);
      const rowColumns = rowColsBase
        .map((col) => {
          // Apply per-MOQ fill rate override for this column if set
          const fillOverride = row.fillRateOverrides?.[col.id];
          return (fillOverride !== undefined && fillOverride !== "")
            ? { ...col, rows: { ...col.rows, "Unit Fill Rate / min": fillOverride } }
            : col;
        });

      const rowFormData = {
        ...formData,
        ppuDenominator: String(rowQty),
        // Per-MOQ manual pallet count: when set, skips weight-based auto-calc
        ...(row.pallets !== undefined && row.pallets !== ""
          ? { manualPallets: row.pallets }
          : {}),
        // Per-MOQ cost/gram override: feeds directly into raw material cost
        ...(row.costPerGram !== undefined && row.costPerGram !== ""
          ? { costPerGram: row.costPerGram }
          : {}),
      };
      const { summaryRows: sRows } = computeDetailSections(rowColumns, [row], rowFormData);
      summaryMap.set(row.id, sRows);

      const totalCustomerPrice = sRows.reduce((s, r) => s + r.customerPrice, 0);
      const totalOurCost       = sRows.reduce((s, r) => s + r.ourCosts, 0);
      const moqVal    = n(row.moq);
      const innerVal  = n(row.unitsPerInner);
      const masterVal = n(row.innersPerMaster);
      const casePack  = masterVal > 0 ? `${innerVal} × ${masterVal}` : innerVal > 0 ? String(innerVal) : "—";
      const effectivePpuDenom = ppuDenom > 0 ? ppuDenom : moqVal || 1;
      const ppu       = effectivePpuDenom > 0 ? totalCustomerPrice / effectivePpuDenom : 0;
      const ppuCost   = effectivePpuDenom > 0 ? totalOurCost / effectivePpuDenom : 0;
      const marginDollars = totalCustomerPrice - totalOurCost;
      const marginPct = totalCustomerPrice > 0 ? ((totalCustomerPrice - totalOurCost) / totalCustomerPrice) * 100 : 0;

      pricing.push({ moqRow: row, casePack, totalCustomerPrice, totalOurCost,
                     ppuDenominator: effectivePpuDenom, ppu, ppuCost, marginDollars, marginPct });
    }

    return { allMoqResults: pricing, perMoqSummaryRows: summaryMap };
  }, [effectiveColumns, moqRows, formData, packagingLevels]);

  // ── Interstitial pricing: compute costs for any arbitrary unit count ──────────
  // Substitutes qty into Individual/Final Kit columns, scales container columns
  // proportionally, then runs the full calculation engine.
  const computeForQty = useMemo(() => {
    return (qty: number, unitsPerInner: number) => {
      if (qty <= 0) return null;

      // Find the base qty from the Individual Units column (the reference MOQ)
      // Derive container units from the custom qty directly
      const customInners   = unitsPerInner > 0 ? Math.ceil(qty / unitsPerInner) : 0;

      // Pick the right inner column for this pack size
      const rowColumns = effectiveColumns
        .filter((col) => {
          if (col.level !== "Inner / Case") return true;
          const colPack = n(col.unitsPerInner);
          if (colPack === 0) return true;
          return colPack === unitsPerInner;
        })
        .map((col) => {
          if (col.level === "Individual Units" || col.level === "Final Kit Units") {
            return { ...col, units: String(qty) };
          }
          if (col.level === "Inner / Case") {
            return { ...col, units: String(customInners) };
          }
          if (col.level === "Shipper / Outer") {
            // innersPerMaster unknown for custom qty — derive from base MOQ if available
            const baseMoq = moqRows[0];
            const ipm = baseMoq ? n(baseMoq.innersPerMaster) : 0;
            const shippers = ipm > 0 ? Math.ceil(customInners / ipm) : 0;
            return { ...col, units: String(shippers) };
          }
          return col;
        });

      // Build a synthetic MOQ row for this custom quantity
      const syntheticMoqRow: MoqRow = {
        id: -999,
        moq:             String(qty),
        individualUnits: String(qty),
        unitsPerInner:   String(unitsPerInner),
        innersPerMaster: "0",
      };

      const formDataForQty = {
        ...formData,
        ppuDenominator: String(qty),
      };

      const { summaryRows: sRows, summaryTableRows: sTableRows } =
        computeDetailSections(rowColumns, [syntheticMoqRow], formDataForQty);

      const totalCustomer = sRows.reduce((s, r) => s + r.customerPrice, 0);
      const totalOur      = sRows.reduce((s, r) => s + r.ourCosts, 0);
      const ppuCost       = totalOur      / qty;
      const ppuCustomer   = totalCustomer / qty;

      return { summaryRows: sRows, summaryTableRows: sTableRows, totalCustomer, totalOur, ppuCost, ppuCustomer };
    };
  }, [effectiveColumns, formData, moqRows]);

  // ── MOQ row validation ────────────────────────────────────────────────────
  const moqErrors = useMemo((): MoqRowError[] => {
    return moqRows
      .map((row): MoqRowError | null => {
        const qty   = parseFloat(row.individualUnits) || 0;
        const inner = parseFloat(row.unitsPerInner)   || 0;
        const ipm   = parseFloat(row.innersPerMaster) || 0;
        const err: MoqRowError = { rowId: row.id };
        let hasError = false;

        // Only validate if the field has been filled in (non-empty)
        if (row.unitsPerInner !== "") {
          if (inner < 1) {
            err.unitsPerInner = "Units / Inner must be ≥ 1";
            hasError = true;
          } else if (qty > 0 && !Number.isInteger(qty / inner)) {
            err.unitsPerInner = `# of Units (${qty}) must be divisible by Units / Inner (${inner})`;
            hasError = true;
          }
        }

        if (row.innersPerMaster !== "" && ipm !== 0) {
          const inners = inner > 0 ? qty / inner : 0;
          if (ipm < 1) {
            err.innersPerMaster = "Inners / Master must be ≥ 1";
            hasError = true;
          } else if (inners > 0 && !Number.isInteger(inners / ipm)) {
            err.innersPerMaster = `Inners (${Math.ceil(inners)}) must be divisible by Inners / Master (${ipm})`;
            hasError = true;
          }
        }

        return hasError ? err : null;
      })
      .filter((e): e is MoqRowError => e !== null);
  }, [moqRows]);

  const hasMoqErrors = moqErrors.length > 0;

  // ── Price adjustment state (shared: Home renders tables, QuotePage uses for PDF) ──
  const [moqMargins,    setMoqMargins]    = useState<Record<number, string>>({});
  const [moqPpuInputs,  setMoqPpuInputs]  = useState<Record<number, string>>({});
  const [moqLastEdited, setMoqLastEdited] = useState<Record<number, "margin" | "ppu">>({});
  const [whatIfPpus,       setWhatIfPpus]       = useState<Record<number, string>>({});
  const [costPpuOverrides, setCostPpuOverrides] = useState<Record<number, string>>({});

  const resolvedMoqMargins = useMemo(() => {
    const merged: Record<number, string> = {};
    for (const r of allMoqResults) {
      const lastEdited = moqLastEdited[r.moqRow.id] ?? "margin";
      if (lastEdited === "ppu") {
        const ppuVal = parseFloat(moqPpuInputs[r.moqRow.id] ?? "");
        if (!isNaN(ppuVal) && ppuVal > 0 && r.ppuCost > 0) {
          merged[r.moqRow.id] = (((ppuVal - r.ppuCost) / ppuVal) * 100).toFixed(4);
        }
      } else {
        const m = moqMargins[r.moqRow.id];
        if (m !== undefined) merged[r.moqRow.id] = m;
      }
    }
    return merged;
  }, [moqMargins, moqLastEdited, moqPpuInputs, allMoqResults]);

  // ── Save state ────────────────────────────────────────────────
  const [saveState, setSaveState] = useState<SaveState>({
    savedQuoteId:    null,
    savedQuoteName:  null,
    hasUnsavedChanges: false,
    lastSavedAt:     null,
  });

  // Track a snapshot of state at last save to detect changes
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string>("");

  // Current snapshot — recomputed whenever project state changes
  const currentSnapshot = useMemo(
    () => JSON.stringify({ moqRows, packagingLevels, formData, customer, selectedBrand, projectType, coPackingState, additionalFees, coPackingProcesses }),
    [moqRows, packagingLevels, formData, customer, selectedBrand, projectType, coPackingState, additionalFees, coPackingProcesses],
  );

  // Persist draft to localStorage on every state change
  useEffect(() => {
    try {
      localStorage.setItem("jdi_draft_v1", JSON.stringify({ moqRows, packagingLevels, formData, customer, selectedBrand, crmAccountId, crmContactId, projectType, coPackingState, additionalFees, coPackingProcesses }));
    } catch { /* quota exceeded or private browsing */ }
  }, [currentSnapshot, crmAccountId, crmContactId]);

  // Detect unsaved changes whenever snapshot drifts from saved baseline
  useMemo(() => {
    if (!lastSavedSnapshot) return;
    const hasChanges = currentSnapshot !== lastSavedSnapshot;
    setSaveState((prev) =>
      prev.hasUnsavedChanges === hasChanges ? prev : { ...prev, hasUnsavedChanges: hasChanges }
    );
  }, [currentSnapshot, lastSavedSnapshot]);

  const markSaved = (id: string, name: string) => {
    setSaveState({ savedQuoteId: id, savedQuoteName: name, hasUnsavedChanges: false, lastSavedAt: new Date() });
    setLastSavedSnapshot(currentSnapshot);
  };

  const clearSave = () => {
    setSaveState({ savedQuoteId: null, savedQuoteName: null, hasUnsavedChanges: false, lastSavedAt: null });
    setLastSavedSnapshot("");
  };

  const loadQuoteState = (state: { moqRows: MoqRow[]; columns: Column[]; formData: ProjectFormData; customer?: CustomerInfo; selectedBrand?: BrandId; packagingLevels?: PackagingLevel[]; packagingSummaryRows?: unknown; packagingCasePack?: number; projectType?: ProjectType; coPackingState?: CoPackingState; additionalFees?: AdditionalFeeRow[]; coPackingProcesses?: CoPackingProcess[]; crmAccountId?: string; crmContactId?: string; moqMargins?: Record<number, string>; moqPpuInputs?: Record<number, string>; moqLastEdited?: Record<number, "margin" | "ppu">; whatIfPpus?: Record<number, string>; costPpuOverrides?: Record<number, string> }, savedId?: string, savedName?: string) => {
    // Reconstruct packagingLevels from legacy columns when missing (quotes saved before packagingLevels was added)
    const resolvedLevels: PackagingLevel[] = (() => {
      if (state.packagingLevels && state.packagingLevels.length > 0) {
        return state.packagingLevels.map(l => ({ ...l, manualCharges: l.manualCharges ?? [] }));
      }
      if (state.columns && state.columns.length > 0) {
        return state.columns.map((col, i) => ({
          ...defaultPackagingLevel(),
          id: String(col.id ?? (Date.now() + i)),
          customLevelName: col.level || `Level ${i + 1}`,
          packagingType:   col.type || "",
          customTypeName:  col.customType ? (col.type || "") : "",
          units:           parseFloat(col.units) || 0,
          isAutoUnits:     false,
          costPerUnit:     parseFloat(col.rows?.["costPerUnit"] ?? col.rows?.["unitCost"] ?? "0") || 0,
          overageRate:     parseFloat(col.rows?.["overageRate"] ?? "15") || 15,
          efficiencyBuffer: parseFloat(col.rows?.["efficiencyBuffer"] ?? col.efficiency ?? "20") || 20,
          laborMarkup:     parseFloat(col.rows?.["laborMarkup"] ?? col.labor ?? "35") || 35,
          wageRate:        parseFloat(col.rows?.["wageRate"] ?? "26") || 26,
          fillRatePerMin:  parseFloat(col.rows?.["fillRatePerMin"] ?? "12") || 12,
          packagingWeightG: parseFloat(col.rows?.["packagingWeightG"] ?? "0") || 0,
          numStaff:        parseFloat(col.rows?.["numStaff"] ?? "1") || 1,
          hrsPerShift:     parseFloat(col.rows?.["hrsPerShift"] ?? "7") || 7,
          workingDays:     parseFloat(col.rows?.["workingDays"] ?? "5") || 5,
          manualCharges:   [],
        }));
      }
      return initialPackagingLevels;
    })();
    const resolvedFormData = { ...state.formData, numIntakePallets: state.formData.numIntakePallets ?? "" };
    const resolvedCustomer = state.customer ?? initialCustomer;
    const resolvedBrand = state.selectedBrand ?? initialBrand;
    const resolvedProjectType = state.projectType ?? "standard";
    const resolvedCoPackingState = state.coPackingState ?? initialCoPackingState;
    const resolvedAdditionalFees = state.additionalFees ?? initialAdditionalFees;
    const resolvedProcesses = state.coPackingProcesses ?? [];

    setMoqRows(state.moqRows);
    setPackagingLevels(resolvedLevels);
    setFormData(resolvedFormData);
    setCustomer(resolvedCustomer);
    setSelectedBrand(resolvedBrand);
    setProjectType(resolvedProjectType);
    setCoPackingStateRaw(resolvedCoPackingState);
    setAdditionalFees(resolvedAdditionalFees);
    setCoPackingProcesses(resolvedProcesses);
    setActiveMoqId(state.moqRows[0]?.id ?? 1);
    if (state.crmAccountId   !== undefined) setCrmAccountId(state.crmAccountId);
    if (state.crmContactId   !== undefined) setCrmContactId(state.crmContactId);
    if (state.moqMargins     !== undefined) setMoqMargins(state.moqMargins);
    if (state.moqPpuInputs   !== undefined) setMoqPpuInputs(state.moqPpuInputs);
    if (state.moqLastEdited  !== undefined) setMoqLastEdited(state.moqLastEdited);
    if (state.whatIfPpus     !== undefined) setWhatIfPpus(state.whatIfPpus);
    if (state.costPpuOverrides !== undefined) setCostPpuOverrides(state.costPpuOverrides);

    // Write loaded state to localStorage immediately so a page refresh restores this quote
    try {
      localStorage.setItem("jdi_draft_v1", JSON.stringify({
        moqRows: state.moqRows,
        packagingLevels: resolvedLevels,
        formData: resolvedFormData,
        customer: resolvedCustomer,
        selectedBrand: resolvedBrand,
        crmAccountId: state.crmAccountId ?? "",
        crmContactId: state.crmContactId ?? "",
        projectType: resolvedProjectType,
        coPackingState: resolvedCoPackingState,
        additionalFees: resolvedAdditionalFees,
        coPackingProcesses: resolvedProcesses,
      }));
    } catch { /* ignore */ }
    const snap = JSON.stringify(state);
    setLastSavedSnapshot(snap);
    setSaveState({
      savedQuoteId:   savedId ?? null,
      savedQuoteName: savedName ?? null,
      hasUnsavedChanges: false,
      lastSavedAt: savedId ? new Date() : null,
    });
  };

  // columns is derived from packagingLevels; setColumns is a no-op shim kept
  // for interfaces that still type-check against it (e.g. ColumnsSection removed, but
  // generateQuoteXLSX may still reference it via context). Real edits go through setPackagingLevels.
  const columns = scaledColumns;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const setColumns: React.Dispatch<React.SetStateAction<Column[]>> = () => {};

  return (
    <ProjectContext.Provider value={{
      projectType, setProjectType,
      coPackingState, setCoPackingField,
      coPackingProcesses, setCoPackingProcesses,
      coPackingResults,
      coPackingTotals,
      moqRows, setMoqRows,
      packagingLevels, setPackagingLevels,
      processLevels, setProcessLevels,
      processCostMarkup, setProcessCostMarkup,
      columns, setColumns,
      formData, setFormField,
      setTestingRows,
      activeMoqId, setActiveMoqId,
      customer, setCustomer, setCustomerField,
      selectedBrand, setSelectedBrand,
      crmAccountId, setCrmAccountId,
      crmContactId, setCrmContactId,
      effectiveColumns,
      scaledColumns,
      detailSections, summaryRows, summaryTableRows, ppuUnits,
      allMoqResults,
      perMoqSummaryRows,
      computeForQty,
      moqErrors, hasMoqErrors,
      additionalFees, setAdditionalFees,
      moqMargins, setMoqMargins,
      moqPpuInputs, setMoqPpuInputs,
      moqLastEdited, setMoqLastEdited,
      whatIfPpus, setWhatIfPpus,
      costPpuOverrides, setCostPpuOverrides,
      resolvedMoqMargins,
      scenarioA, scenarioB, saveScenario, clearScenarios,
      loadQuoteState,
      saveState, markSaved, clearSave,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used inside <ProjectProvider>");
  return ctx;
}
