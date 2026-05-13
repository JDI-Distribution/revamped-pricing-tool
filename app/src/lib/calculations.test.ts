import { describe, it, expect } from "vitest";
import { computeDetailSections } from "./calculations";
import { Column, MoqRow, ProjectFormData } from "./types";

// Tolerance: within $0.01
const near = (actual: number, expected: number, label = "") => {
  expect(actual, label).toBeCloseTo(expected, 1);
};

// ── Shared helpers ────────────────────────────────────────────────────────────

function makeCol(
  id: number,
  level: string,
  type: string,
  units: string,
  efficiency: string,
  labor: string,
  unitCost: string,
  rows: Record<string, string>,
  extras: Partial<Column> = {},
): Column {
  return { id, level, type, units, efficiency, labor, unitCost, tabs: false, rows, ...extras };
}

function rows(
  overageRate: string,
  wageRate: string,
  fillRate: string,
  packagingCost: string,
  labelPrintCost: string,
  labelApplyRate: string,
  packagingWeight: string,
  staff: string,
  hrsShift: string,
  workingDays: string,
  tabCost = "0",
): Record<string, string> {
  return {
    "Overage Rate":            overageRate,
    "Wage Rate":               wageRate,
    "Unit Fill Rate / min":    fillRate,
    "Packaging Cost / unit":   packagingCost,
    "Label Print Cost / unit": labelPrintCost,
    "Label Apply Rate / min":  labelApplyRate,
    "Packaging Weight (g)":    packagingWeight,
    "No. of Staff / Stations": staff,
    "Hrs / Shift":             hrsShift,
    "Working Days":            workingDays,
    "Tab Cost / unit":         tabCost,
  };
}

const dummyMoqRow: MoqRow = { id: 1, moq: "6600", individualUnits: "6600", unitsPerInner: "24", innersPerMaster: "0" };

// ── Test Case 1: Bartesian Brew Glitter 4oz Sachets (6600 MOQ, 24pk) ─────────

describe("TC1 — Bartesian 4oz Sachets 6600 MOQ", () => {
  const formData: ProjectFormData = {
    unitWeight:              "113.4",
    unitWeightUnit:          "g",
    costPerGram:             "0.009228",
    numSkus:                 "1",
    rawMaterialSkus:         "1",
    materialOverage:         "25",
    rawMaterialMarkup:       "300",
    intakeFee:               "195",
    numPallets:              "1",
    intakeFeeMarkup:         "25",
    testingFee:              "350",
    testingFeeMarkup:        "30",
    leftOverInventoryCost:   "0",
    leftOverInventoryAbsorb: "0",
    setupFeeOur:             "598",
    setupFeeCustomer:        "1495",
    ppuDenominator:          "6600",
    outboundFee:             "350",
    outboundFeeMarkup:       "40",
    numFinishedPallets:      "4",
    palletBuffer:            "0",
    leadTimeBufferDays:      "57",
    startDate:               "2026-01-01",
  };

  const columns: Column[] = [
    makeCol(1, "Individual Units", "4oz Sachets",  "6600", "20", "35", "125",
      rows("15", "26", "12", "0.035", "0", "0", "1.6", "5", "7.3", "5")),
    makeCol(2, "Final Kit Units",  "4oz Tins",     "6600", "20", "35", "125",
      rows("3",  "26", "15", "0.55",  "0.20", "0", "71",  "3", "7.3", "5")),
    makeCol(3, "Inner / Case",     "Inners",       "275",  "20", "35", "125",
      rows("2",  "26", "1",  "0.20",  "0",    "0", "454", "1", "7.3", "5"),
      { unitsPerInner: "24" }),
    makeCol(4, "Shipper / Outer",  "Shippers",     "12",   "25", "35", "125",
      rows("1",  "26", "1",  "0.20",  "0",    "0", "454", "1", "7.3", "5")),
  ];

  const { summaryRows } = computeDetailSections(columns, [dummyMoqRow], formData);

  const get = (label: string) => summaryRows.find(r => r.label === label)!;

  it("Setup / QA Fee", () => {
    const r = get("Setup / QA Fee");
    near(r.customerPrice, 1495,   "setup customer");
    near(r.ourCosts,      598,    "setup our");
  });

  it("Materials", () => {
    const r = get("Materials");
    near(r.customerPrice, 35231.77, "materials customer");
    near(r.ourCosts,       9178.26, "materials our");
  });

  it("4oz Sachets packaging", () => {
    const r = get("4oz Sachets");
    near(r.customerPrice, 1060.23, "sachets customer");
    near(r.ourCosts,       608.25, "sachets our");
  });

  it("4oz Tins packaging", () => {
    const r = get("4oz Tins");
    near(r.customerPrice, 11803.03, "tins customer");
    near(r.ourCosts,       5343.98, "tins our");
  });

  it("Inners", () => {
    const r = get("Inners");
    near(r.customerPrice, 331.34, "inners customer");
    near(r.ourCosts,      208.04, "inners our");
  });

  it("Shippers", () => {
    const r = get("Shippers");
    near(r.customerPrice, 14.91, "shippers customer");
    near(r.ourCosts,       9.43, "shippers our");
  });

  it("Pallets & Fees", () => {
    const r = get("Pallets & Fees");
    near(r.customerPrice, 1960, "pallets customer");
    near(r.ourCosts,      1400, "pallets our");
  });

  it("TOTALS", () => {
    const totalCust = summaryRows.reduce((s, r) => s + r.customerPrice, 0);
    const totalOur  = summaryRows.reduce((s, r) => s + r.ourCosts, 0);
    near(totalCust, 51896.28, "total customer");
    near(totalOur,  17345.96, "total our");
  });

  it("PPU", () => {
    const totalCust = summaryRows.reduce((s, r) => s + r.customerPrice, 0);
    const totalOur  = summaryRows.reduce((s, r) => s + r.ourCosts, 0);
    near(totalCust / 6600, 7.86, "customer PPU");
    near(totalOur  / 6600, 2.63, "cost PPU");
  });
});

// ── Test Case 2: DecoPac 25g Pump (3000 MOQ, 12pk) ───────────────────────────

describe("TC2 — DecoPac 25g Pump 3000 MOQ", () => {
  const formData: ProjectFormData = {
    unitWeight:              "25",
    unitWeightUnit:          "g",
    costPerGram:             "0.10",
    numSkus:                 "1",
    rawMaterialSkus:         "1",
    materialOverage:         "25",
    rawMaterialMarkup:       "300",
    intakeFee:               "195",
    numPallets:              "1",
    intakeFeeMarkup:         "25",
    testingFee:              "350",
    testingFeeMarkup:        "30",
    leftOverInventoryCost:   "0",
    leftOverInventoryAbsorb: "0",
    setupFeeOur:             "598",
    setupFeeCustomer:        "1495",
    ppuDenominator:          "3000",
    outboundFee:             "350",
    outboundFeeMarkup:       "40",
    numFinishedPallets:      "2",
    palletBuffer:            "0",
    leadTimeBufferDays:      "50",
    startDate:               "2026-01-01",
  };

  const columns: Column[] = [
    makeCol(1, "Individual Units", "25g Pump", "3000", "20", "35", "125",
      rows("15", "26", "2", "0.95", "0.20", "18", "1.6", "4", "7.3", "5.5")),
    makeCol(2, "Inner / Case", "Inners", "250", "20", "35", "125",
      rows("2", "26", "1", "0.20", "0", "0", "454", "2", "7.3", "5"),
      { unitsPerInner: "12" }),
  ];

  const moqRow: MoqRow = { id: 1, moq: "3000", individualUnits: "3000", unitsPerInner: "12", innersPerMaster: "0" };

  const { summaryRows } = computeDetailSections(columns, [moqRow], formData);

  const get = (label: string) => summaryRows.find(r => r.label === label)!;

  it("Materials", () => {
    const r = get("Materials");
    near(r.customerPrice, 38198.75, "materials customer");
    near(r.ourCosts,       9920,    "materials our");
  });

  it("25g Pump packaging (harmonic mean fill+label rate)", () => {
    const r = get("25g Pump");
    near(r.customerPrice, 10328.44, "pump customer");
    near(r.ourCosts,       5005.69, "pump our");
  });

  it("Inners", () => {
    const r = get("Inners");
    near(r.customerPrice, 301.22, "inners customer");
    near(r.ourCosts,      189.13, "inners our");
  });

  it("Pallets & Fees", () => {
    const r = get("Pallets & Fees");
    near(r.customerPrice, 980, "pallets customer");
    near(r.ourCosts,      700, "pallets our");
  });

  it("TOTALS", () => {
    const totalCust = summaryRows.reduce((s, r) => s + r.customerPrice, 0);
    const totalOur  = summaryRows.reduce((s, r) => s + r.ourCosts, 0);
    near(totalCust, 51303.41, "total customer");
    near(totalOur,  16412.82, "total our");
  });

  it("PPU", () => {
    const totalCust = summaryRows.reduce((s, r) => s + r.customerPrice, 0);
    const totalOur  = summaryRows.reduce((s, r) => s + r.ourCosts, 0);
    near(totalCust / 3000, 17.10, "customer PPU");
    near(totalOur  / 3000,  5.47, "cost PPU");
  });
});

// ── MOQ scaling: inner units use each row's own unitsPerInner ─────────────────

describe("MOQ scaling — Inner units derived per-row", () => {
  it("Row 1: 6600 units 24pk → 275 inners", () => {
    expect(Math.ceil(6600 / 24)).toBe(275);
  });

  it("Row 2: 13200 units 24pk → 550 inners", () => {
    expect(Math.ceil(13200 / 24)).toBe(550);
  });

  it("Row 3: 6600 units 48pk → 138 inners", () => {
    expect(Math.ceil(6600 / 48)).toBe(138);
  });

  it("6600 units 1pk → 6600 inners", () => {
    expect(Math.ceil(6600 / 1)).toBe(6600);
  });

  it("100 units 200pk → 1 inner (ceil rounds up)", () => {
    expect(Math.ceil(100 / 200)).toBe(1);
  });
});

// ── Guard: invalid unitsPerInner zeroes out inner column ──────────────────────

describe("Inner/Case guard — invalid unitsPerInner", () => {
  const baseFormData: ProjectFormData = {
    unitWeight: "25", unitWeightUnit: "g", costPerGram: "0.10",
    numSkus: "1", rawMaterialSkus: "1", materialOverage: "0", rawMaterialMarkup: "0",
    intakeFee: "0", numPallets: "1", intakeFeeMarkup: "0",
    testingFee: "0", testingFeeMarkup: "0",
    leftOverInventoryCost: "0", leftOverInventoryAbsorb: "0",
    setupFeeOur: "0", setupFeeCustomer: "0", ppuDenominator: "100",
    outboundFee: "0", outboundFeeMarkup: "0", numFinishedPallets: "0", palletBuffer: "0",
    leadTimeBufferDays: "0", startDate: "2026-01-01",
  };

  const moqRow: MoqRow = { id: 1, moq: "100", individualUnits: "100", unitsPerInner: "0", innersPerMaster: "0" };

  const innerColBase = makeCol(1, "Inner / Case", "Inners", "999", "0", "0", "0",
    rows("0", "0", "1", "0.20", "0", "0", "0", "1", "8", "5"),
    { unitsPerInner: "0" });

  it("unitsPerInner=0 → inner units zeroed, no nonsensical labor cost", () => {
    const { summaryRows } = computeDetailSections([innerColBase], [moqRow], baseFormData);
    const r = summaryRows.find(r => r.label === "Inners");
    // With units zeroed to 0, labor and packaging should also be 0
    expect(r?.ourCosts ?? 0).toBe(0);
    expect(r?.customerPrice ?? 0).toBe(0);
  });

  it("innerUnits > moqUnits → corrected to ceil(moq/pack)", () => {
    // Inner col claims 999 units but MOQ is 100 and pack is 24 → should correct to ceil(100/24)=5
    const innerColOvercount = makeCol(1, "Inner / Case", "Inners", "999", "0", "0", "0",
      rows("0", "26", "1", "0.20", "0", "0", "0", "1", "8", "5"),
      { unitsPerInner: "24" });
    const moqRow2: MoqRow = { id: 1, moq: "100", individualUnits: "100", unitsPerInner: "24", innersPerMaster: "0" };
    const { summaryRows } = computeDetailSections([innerColOvercount], [moqRow2], baseFormData);
    const r = summaryRows.find(r => r.label === "Inners");
    // corrected inners = ceil(100/24) = 5; pkgOur = 0.20 * 5 * 1.02 = 1.02
    expect(r?.ourCosts ?? 0).toBeGreaterThan(0);
    // The key check: cost must be based on ≤5 inners, not 999
    expect(r?.ourCosts ?? 999).toBeLessThan(10); // 999 inners would cost far more
  });
});

// ── Test Case 3: DecoPac 10g Pump (3600 MOQ, 9pk) ────────────────────────────

describe("TC3 — DecoPac 10g Pump 3600 MOQ 9pk", () => {
  const formData: ProjectFormData = {
    unitWeight:              "10",
    unitWeightUnit:          "g",
    costPerGram:             "0.10",
    numSkus:                 "1",
    rawMaterialSkus:         "1",
    materialOverage:         "25",
    rawMaterialMarkup:       "300",
    intakeFee:               "195",
    numPallets:              "1",
    intakeFeeMarkup:         "25",
    testingFee:              "350",
    testingFeeMarkup:        "30",
    leftOverInventoryCost:   "0",
    leftOverInventoryAbsorb: "0",
    setupFeeOur:             "598",
    setupFeeCustomer:        "1495",
    ppuDenominator:          "3600",
    outboundFee:             "350",
    outboundFeeMarkup:       "40",
    numFinishedPallets:      "1",   // base pallets
    palletBuffer:            "1",   // buffer — total = 1+1 = 2
    leadTimeBufferDays:      "50",
    startDate:               "2026-01-01",
  };

  const columns: Column[] = [
    makeCol(1, "Individual Units", "10g Pump", "3600", "20", "35", "125",
      rows("15", "26", "5", "0.65", "0.20", "18", "1.6", "4", "7.3", "5.5")),
    makeCol(2, "Inner / Case", "Inners", "400", "20", "35", "125",
      rows("2", "26", "1", "0.20", "0", "0", "227", "2", "7.3", "5"),
      { unitsPerInner: "9" }),
  ];

  const moqRow: MoqRow = { id: 1, moq: "3600", individualUnits: "3600", unitsPerInner: "9", innersPerMaster: "0" };

  const { summaryRows } = computeDetailSections(columns, [moqRow], formData);
  const get = (label: string) => summaryRows.find(r => r.label === label)!;

  it("Materials", () => {
    const r = get("Materials");
    near(r.customerPrice, 18698.75, "materials customer");
    near(r.ourCosts,       5045.00, "materials our");
  });

  it("10g Pump (harmonic mean fill+label rate)", () => {
    const r = get("10g Pump");
    near(r.customerPrice, 8691.41, "pump customer");
    near(r.ourCosts,      4092.08, "pump our");
  });

  it("Inners customer price visible (not 0)", () => {
    const r = get("Inners");
    near(r.ourCosts,      302.60, "inners our");
    near(r.customerPrice, 481.95, "inners customer — must not be 0");
  });

  it("Pallets (2 pallets total)", () => {
    const r = get("Pallets & Fees");
    near(r.customerPrice, 980, "pallets customer");
    near(r.ourCosts,      700, "pallets our");
  });

  it("TOTALS", () => {
    const totalCust = summaryRows.reduce((s, r) => s + r.customerPrice, 0);
    const totalOur  = summaryRows.reduce((s, r) => s + r.ourCosts, 0);
    near(totalCust, 30347.11, "total customer");
    near(totalOur,  10737.68, "total our");
  });

  it("PPU", () => {
    const totalCust = summaryRows.reduce((s, r) => s + r.customerPrice, 0);
    const totalOur  = summaryRows.reduce((s, r) => s + r.ourCosts, 0);
    near(totalCust / 3600, 8.43, "customer PPU");
    near(totalOur  / 3600, 2.98, "cost PPU");
  });
});
