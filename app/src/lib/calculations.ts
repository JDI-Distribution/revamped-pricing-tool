import {
  Column,
  MoqRow,
  ProjectFormData,
  SummaryRow,
  SummaryTableRow,
  DetailSection,
  DetailRow,
} from "./types";

const n = (s: string | undefined): number => parseFloat(s || "0") || 0;

/** Grams per display unit — used to convert unitWeight to grams before any calculation. */
const GRAMS_PER_UNIT: Record<string, number> = {
  g:     1,
  oz:    28.3495,
  lb:    453.592,
  kg:    1000,
  "fl oz": 29.5735,
};

function toGrams(value: number, unit: string): number {
  return value * (GRAMS_PER_UNIT[unit] ?? 1);
}


function computeColumn(
  col: Column,
  index: number,
  unitWeightG: number,
): {
  section: DetailSection;
  summaryTableRow: SummaryTableRow;
  summaryLabel: string;
  customerTotalCost: number;
  ourTotalCost: number;
} {
  // ── Overage ────────────────────────────────────────────────────
  // overageRate is entered as an integer percent (e.g. 15 = 15%).
  const overageRate = n(col.rows?.["Overage Rate"]);
  const units       = n(col.units);
  const unitsReq    = Math.ceil(Math.round(units * (1 + overageRate / 100) * 1e9) / 1e9);

  // ── Throughput ────────────────────────────────────────────────
  const hoursPerShiftEarly = n(col.rows?.["Hrs / Shift"]);
  const numStationsEarly   = n(col.rows?.["No. of Staff / Stations"]);
  const workingDaysEarly   = n(col.rows?.["Working Days"]) || 5;

  const isInnerLevel = col.level === "Inner / Case";

  const unitsPerMin = (() => {
    const base     = n(col.rows?.["Unit Fill Rate / min"]);
    const hvThresh = n(col.hvThreshold);
    const hvRate   = n(col.hvFillRate);
    if (hvThresh > 0 && hvRate > 0 && units > hvThresh) return hvRate;
    return base;
  })();
  const labelApplyRate = n(col.rows?.["Label Apply Rate / min"]);
  // efficiency is entered as an integer percent (e.g. 20 = 20% buffer).
  const efficiency  = n(col.efficiency);

  // When a label apply rate is present, the bottleneck throughput is the harmonic
  // mean of fill rate and label apply rate (two sequential operations on the same line).
  const nominalRate = unitsPerMin > 0 && labelApplyRate > 0
    ? (unitsPerMin * labelApplyRate) / (unitsPerMin + labelApplyRate)
    : unitsPerMin;

  // effectiveRate = nominalRate × (1 − efficiency/100)
  // Staff/stations does NOT multiply throughput — wage_rate represents the total
  // line cost and staff is a capacity-planning input only.
  const effectiveRate = nominalRate > 0 && efficiency < 100
    ? nominalRate * (1 - efficiency / 100)
    : nominalRate;

  const totalMinReq = effectiveRate > 0 ? unitsReq / effectiveRate : 0;
  const totalHrsReq = totalMinReq / 60;

  // Display rate shown in UI (after efficiency buffer); not shown for Inner/Case
  const displayPerMin = effectiveRate;

  // ── Labor ─────────────────────────────────────────────────────
  // wage_rate is the total line rate (already includes all staff cost).
  // CustomerLaborPrice = ourLaborCost × (1 + laborMarkup/100)
  const wageRate        = n(col.rows?.["Wage Rate"]);
  const laborMarkup     = n(col.labor);

  const ourLaborCost      = totalHrsReq * wageRate;
  const customerLaborCost = ourLaborCost * (1 + laborMarkup / 100);

  // ── Packaging materials ────────────────────────────────────────
  // Label print cost is part of our cost basis and is marked up with packaging.
  const packagingCostPerUnit = n(col.rows?.["Packaging Cost / unit"]);
  const labelCostPerUnit     = n(col.rows?.["Label Print Cost / unit"]);
  const tabCostPerUnit       = col.tabs ? n(col.rows?.["Tab Cost / unit"]) : 0;

  // unitCostMarkup is entered as an integer percent (e.g. 125 = 125% markup → ×2.25).
  const unitCostMarkup        = n(col.unitCost);
  const ourPackagingCost      = (packagingCostPerUnit + labelCostPerUnit + tabCostPerUnit) * unitsReq;
  const customerPackagingCost = ourPackagingCost * (1 + unitCostMarkup / 100);

  // ── Totals ─────────────────────────────────────────────────────
  const ourTotalCost      = ourLaborCost + ourPackagingCost;
  const customerTotalCost = customerLaborCost + customerPackagingCost;

  // ── Lead time ──────────────────────────────────────────────────
  // productionDays = totalHrsReq / (hoursPerShift × numStations)
  // Staff increases available capacity per day, reducing production days.
  const productionDays = hoursPerShiftEarly > 0 && numStationsEarly > 0
    ? totalHrsReq / (hoursPerShiftEarly * numStationsEarly)
    : null;
  const leadTimeWeeks  = productionDays !== null
    ? productionDays / workingDaysEarly
    : null;

  // ── Level helpers ──────────────────────────────────────────────
  const isContainerLevel =
    col.level === "Inner / Case" ||
    col.level === "Shipper / Outer" ||
    col.level === "Pallet";
  const isIndividual = col.level === "Individual Units";

  const unitsLabel = isContainerLevel ? "Packs Req" : "Units Req";
  const costLabel  = isContainerLevel ? "Labor Cost (Wage)" : "Wage Rate";

  // ── Detail rows ────────────────────────────────────────────────
  const rows: DetailRow[] = [
    { label: unitsLabel,      projectDetails: unitsReq || null,        projectCosts: null,                    isCurrency: false },
    { label: costLabel,       projectDetails: wageRate || null,         projectCosts: null,                    isCurrency: true  },
    { label: "Total Labor",   projectDetails: customerLaborCost || null, projectCosts: ourLaborCost || null,   isCurrency: true  },
    { label: "Packaging Cost",projectDetails: customerPackagingCost || null, projectCosts: ourPackagingCost || null, isCurrency: true },
    { label: "Total Cost",    projectDetails: customerTotalCost || null, projectCosts: ourTotalCost || null,   isCurrency: true  },
  ];

  const summaryLabel = col.type || col.level || `Column ${index + 1}`;

  // PPU: each level's PPU = that level's customer total ÷ that level's own delivered qty.
  // Using the global ppuDenominator here would be wrong — levels have different unit counts.
  const costPerUnit = units > 0 ? customerTotalCost / units : null;

  const summaryTableRow: SummaryTableRow = {
    label:         summaryLabel,
    throughput:    !isInnerLevel && displayPerMin > 0 ? displayPerMin * 60 : null,
    leadTimeWeeks,
    costPerUnit,
    totalWeight:   isIndividual && unitWeightG > 0
      ? units * unitWeightG           // base units (not overage-inflated) per spec
      : n(col.rows?.["Packaging Weight (g)"]) > 0
        ? units * n(col.rows?.["Packaging Weight (g)"])  // base units per spec
        : null,
    // totalUnits = DELIVERED qty (what the customer receives), not overage-inflated unitsReq.
    // PPU = customerTotalCost / totalUnits so they must use the same denominator.
    totalUnits:    units || null,
    totalCost:     ourTotalCost || null,
    totalPrice:    customerTotalCost || null,
  };

  return {
    section: {
      title:             summaryLabel,
      overageReq:        overageRate > 0 ? overageRate : null,
      rows,
      totalCustomerCost: customerTotalCost,
      totalOurCost:      ourTotalCost,
    },
    summaryTableRow,
    summaryLabel,
    customerTotalCost,
    ourTotalCost,
  };
}

export interface ColumnOutputs {
  unitsReq:          number;
  effRate:           number;   // effective fill rate per min
  perHr:             number;   // effective units per hour
  totalHrsReq:       number;
  totalMinReq:       number;
  costPerMin:        number;   // labor cost per minute (our)
  ourLaborCost:      number;   // totalHrsReq × wageRate
  customerLaborCost: number;   // ourLaborCost × (1 + laborMarkup/100)
  totalLabor:        number;   // alias for ourLaborCost (backward compat)
  costPerUnit:       number;   // customer labor cost per delivered unit
  pkgWeight:         number;   // total packaging weight in g
  leadTimeDays:      number;
  leadTimeWeeks:     number;
}

export function computeColumnOutputs(
  fillRatePerMin:   number,
  efficiencyBuffer: number,   // integer percent, e.g. 20 = 20%
  wageRate:         number,   // total line wage rate (covers all staff cost)
  numStaff:         number,   // used for lead time capacity only, not labor cost
  hrsPerShift:      number,
  workingDays:      number,
  packagingWeightG: number,
  baseUnits:        number,
  overageRate:      number,   // integer percent, e.g. 15 = 15%
  _cpoCostPerUnit:  number,   // Cost/Unit entered in CPO section for this level
  laborMarkup:      number,   // integer percent, e.g. 35 = 35%
  labelApplyRate:   number = 0, // optional: when > 0, harmonic mean with fillRate
): ColumnOutputs {
  const unitsReq = Math.ceil(baseUnits * (1 + overageRate / 100));
  // Harmonic mean when both fill and label rates exist (sequential ops on same line)
  const nominalRate = fillRatePerMin > 0 && labelApplyRate > 0
    ? (fillRatePerMin * labelApplyRate) / (fillRatePerMin + labelApplyRate)
    : fillRatePerMin;
  const effRate = nominalRate > 0
    ? nominalRate * (1 - efficiencyBuffer / 100)
    : nominalRate;
  const totalMinReq = effRate > 0 ? unitsReq / effRate : 0;
  const totalHrsReq = totalMinReq / 60;
  const perHr       = effRate * 60;
  const costPerMin  = wageRate / 60;
  // Total labor = ((hrs × wage) × markupFraction) + (wage × hrs)
  //             = hrs × wage × (1 + laborMarkup/100)
  const ourLaborCost      = totalHrsReq * wageRate;
  const customerLaborCost = (ourLaborCost * (laborMarkup / 100)) + ourLaborCost;
  const costPerUnit       = unitsReq > 0 ? customerLaborCost / unitsReq : 0;
  // pkg weight uses base units (what the customer receives), not overage-inflated units
  const pkgWeight         = baseUnits * packagingWeightG;
  // staff multiplies available capacity per day → fewer production days
  const productionDays = hrsPerShift > 0 && numStaff > 0
    ? totalHrsReq / (hrsPerShift * numStaff)
    : hrsPerShift > 0 ? totalHrsReq / hrsPerShift : 0;
  const effectiveWorkingDays = workingDays > 0 ? workingDays : 5;
  const leadTimeWeeks = productionDays / effectiveWorkingDays;
  const leadTimeDays  = productionDays;

  return { unitsReq, effRate, perHr, totalHrsReq, totalMinReq, costPerMin, ourLaborCost, customerLaborCost, totalLabor: ourLaborCost, costPerUnit, pkgWeight, leadTimeDays, leadTimeWeeks };
}

export function computeDetailSections(
  columns: Column[],
  _moqRows: MoqRow[],
  formData: ProjectFormData
): {
  detailSections: DetailSection[];
  summaryRows: SummaryRow[];
  summaryTableRows: SummaryTableRow[];
  ppuUnits: number;
} {
  const unitWeight          = toGrams(n(formData.unitWeight), formData.unitWeightUnit ?? "g");
  const customerProvidesRawMaterial = (formData.rawMaterialProvider || formData.rawMaterialSource || "customer") === "customer";
  const costPerGramInput     = customerProvidesRawMaterial ? 0 : n(formData.costPerGram);
  const numSkus             = n(formData.numSkus) || 1;
  const intakeFee           = n((formData as ProjectFormData).inventoryHandlingFee);
  const numIntakePallets    = n((formData as ProjectFormData).numIntakePallets ?? formData.numPallets);
  const numPallets          = n(formData.numPallets);
  const outboundFee         = n(formData.outboundFee);
  const testingEnabled      = formData.testingEnabled !== "false";
  const testingRows         = formData.testingRows ?? [];
  const testingMarkup       = n(formData.testingMarkup);
  const setupFeeOur         = n(formData.setupFeeOur);
  const setupFeeCustomer    = n(formData.setupFeeCustomer);
  const ppuDenominator      = n(formData.ppuDenominator);
  const ppuUnits            = ppuDenominator;
  // materialOverage is entered as an integer percent (e.g. 25 = 25%).
  const materialOverage          = n(formData.materialOverage);
  const rawMaterialMarkupPct     = n(formData.rawMaterialMarkup);
  const intakeFeeMarkup          = n(formData.intakeFeeMarkup);
  const leftOverInventoryCost    = n(formData.leftOverInventoryCost);
  const leftOverInventoryAbsorb  = n(formData.leftOverInventoryAbsorb);
  const leadTimeBufferDays       = n(formData.leadTimeBufferDays);

  // ── Materials ──────────────────────────────────────────────────
  // The first column is always the individual units level — use it for raw material weight.
  // Fall back to name-match for legacy data where the first column might be labelled differently.
  const individualCols = columns.filter((col) => col.level === "Individual Units");
  const totalBaseUnits = individualCols.length > 0
    ? individualCols.reduce((sum, col) => sum + n(col.units), 0)
    : n(columns[0]?.units ?? "0");

  // materialOverage is a standalone field (separate from per-column packout overage)
  const totalUnitsWithOverage = Math.ceil(totalBaseUnits * (1 + materialOverage / 100));

  const reqGrams = totalUnitsWithOverage * unitWeight;
  const reqOz    = reqGrams / 28.3495;
  const reqLbs   = reqGrams / 453.592;

  // Excel formula: effectiveCostPerGram = (K9 + (1 - K11) * K10 / K27) * (K19 + 1)
  // K9 = costPerGram input, K10 = leftOverCost, K11 = absorbPct/100, K27 = reqGrams, K19 = markupPct/100
  const absorbFraction     = leftOverInventoryAbsorb / 100;
  const unabsorbedLeftOver = reqGrams > 0 ? (1 - absorbFraction) * leftOverInventoryCost / reqGrams : 0;
  const effectiveCostPerGram = (costPerGramInput + unabsorbedLeftOver) * (1 + rawMaterialMarkupPct / 100);

  const rawMaterialOur      = reqGrams * costPerGramInput;
  const rawMaterialCustomer = reqGrams * effectiveCostPerGram;

  const intakeTotalOur      = intakeFee * numIntakePallets;
  const intakeTotalCustomer = intakeTotalOur * (1 + intakeFeeMarkup / 100);

  const totalTestingOur        = testingEnabled ? testingRows.reduce((sum, row) => sum + (row.cost ?? 0) * (row.numSkus ?? numSkus), 0) : 0;
  const totalTestingCustomer   = totalTestingOur * (1 + testingMarkup / 100);

  const materialOurTotal      = rawMaterialOur + intakeTotalOur + totalTestingOur;
  const materialCustomerTotal = rawMaterialCustomer + intakeTotalCustomer + totalTestingCustomer;

  // ── Per-column results (needed for auto-pallet weight) ────────────────────────
  // Guard: Inner/Case units must never exceed the moq quantity.
  // unitsPerInner=0 is invalid and produces no inners (units stays 0).
  const moqUnits_pre = ppuDenominator || totalBaseUnits;
  const guardedColumns_pre = columns.map((col) => {
    if (col.level !== "Inner / Case") return col;
    const innerUnits    = n(col.units);
    const unitsPerInner = n(col.unitsPerInner);
    if (unitsPerInner <= 0) {
      if (innerUnits > 0) console.warn("[calc] Inner/Case column has unitsPerInner <= 0; zeroing units", { col: col.type });
      return { ...col, units: "0" };
    }
    if (moqUnits_pre > 0 && innerUnits > moqUnits_pre) {
      const corrected = Math.ceil(moqUnits_pre / unitsPerInner);
      console.warn("[calc] innerUnits > moqUnits — recorrecting", { innerUnits, moqUnits: moqUnits_pre, unitsPerInner, corrected, col: col.type });
      return { ...col, units: String(corrected) };
    }
    return col;
  });

  const colResults_pre = guardedColumns_pre.map((col, i) =>
    computeColumn(col, i, unitWeight),
  );

  // ── Pallets — auto-calculated from total project weight ───────────────────────
  const outboundFeeMarkup    = n(formData.outboundFeeMarkup);
  const palletBuffer         = n(formData.palletBuffer);
  const WEIGHT_TO_LBS: Record<string, number> = { lbs: 1, kg: 2.20462, g: 0.00220462, oz: 0.0625, t: 2204.62 };
  const maxPalletWeightRaw   = n(formData.maxPalletWeightLbs) || 2000;
  const maxPalletWeightUom   = formData.maxPalletWeightUom ?? "lbs";
  const maxPalletWeightLbs   = maxPalletWeightRaw * (WEIGHT_TO_LBS[maxPalletWeightUom] ?? 1);
  const maxPalletWeightG     = maxPalletWeightLbs * 453.592;

  // Sum packaging weights: delivered units (no overage) × per-unit packaging weight
  // matches computeColumnOutputs pkgWeight = baseUnits * packagingWeightG
  const packagingWeightG = colResults_pre.reduce((sum, _r, i) => {
    const col = guardedColumns_pre[i];
    const pwg = n(col.rows?.["Packaging Weight (g)"]);
    if (pwg <= 0) return sum;
    return sum + n(col.units) * pwg;
  }, 0);

  const totalProjectWeightG  = reqGrams + packagingWeightG;
  const calculatedPallets    = maxPalletWeightG > 0 ? Math.ceil(totalProjectWeightG / maxPalletWeightG) : 0;
  // manualPallets: per-MOQ override skips weight-based auto-calc entirely.
  const manualPallets        = formData.manualPallets !== undefined && formData.manualPallets !== ""
    ? n(formData.manualPallets)
    : null;
  const totalPallets         = manualPallets !== null ? manualPallets : calculatedPallets + palletBuffer;
  const outboundTotalFee     = outboundFee * totalPallets;
  const outboundCustomerFee  = outboundFee * (1 + outboundFeeMarkup / 100) * totalPallets;
  const palletOurTotal       = outboundTotalFee;
  const palletCustomerTotal  = outboundCustomerFee;

  const colResults = colResults_pre;


  // ── Detail sections ────────────────────────────────────────────
  const materialSection: DetailSection = {
    title:      "Materials",
    overageReq: materialOverage > 0 ? materialOverage : null,
    rows: [
      { label: "Req (g)",             projectDetails: reqGrams || null,              projectCosts: null,                      isCurrency: false },
      { label: "Req (oz)",            projectDetails: reqOz || null,                 projectCosts: null,                      isCurrency: false },
      { label: "Req (lbs)",           projectDetails: reqLbs || null,                projectCosts: null,                      isCurrency: false },
      { label: "# of SKUs",           projectDetails: numSkus,                       projectCosts: null,                      isCurrency: false },
      { label: "# of Pallets",        projectDetails: numPallets || null,            projectCosts: null,                      isCurrency: false },
      { label: "Intake Fee / Pallet", projectDetails: intakeTotalCustomer || null,   projectCosts: intakeTotalOur || null,     isCurrency: true  },
      ...(testingEnabled ? testingRows
        .filter(row => (row.cost ?? 0) > 0)
        .map(row => {
          const testName = row.testType === "Custom" ? (row.customTestName || "Custom") : row.testType;
          const our      = (row.cost ?? 0) * (row.numSkus ?? numSkus);
          const customer = our * (1 + testingMarkup / 100);
          return { label: `Testing – ${testName}`, projectDetails: customer || null, projectCosts: our || null, isCurrency: true } satisfies DetailRow;
        }) : []),
      { label: "Raw Material Cost",   projectDetails: rawMaterialCustomer || null,   projectCosts: rawMaterialOur || null,     isCurrency: true  },
      { label: "Total Material Cost", projectDetails: materialCustomerTotal || null, projectCosts: materialOurTotal || null,   isCurrency: true  },
    ],
    totalCustomerCost: materialCustomerTotal,
    totalOurCost:      materialOurTotal,
  };

  const palletSection: DetailSection = {
    title:      "Pallets",
    overageReq: null,
    rows: [
      { label: "# of Finished Pallets",  projectDetails: (manualPallets !== null ? manualPallets : calculatedPallets) || null, projectCosts: null, isCurrency: false },
      ...(manualPallets === null ? [{ label: "Pallet Buffer", projectDetails: palletBuffer || null, projectCosts: null, isCurrency: false } satisfies DetailRow] : []),
      { label: "Total Pallets",           projectDetails: totalPallets || null,                                 projectCosts: null,               isCurrency: false },
      { label: "Outbound Fee / Pallet",   projectDetails: outboundFee * (1 + outboundFeeMarkup / 100) || null, projectCosts: outboundFee || null, isCurrency: true  },
      { label: "Total Fees",              projectDetails: palletCustomerTotal || null,                          projectCosts: palletOurTotal || null, isCurrency: true },
    ],
    totalCustomerCost: palletCustomerTotal,
    totalOurCost:      palletOurTotal,
  };

  const detailSections: DetailSection[] = [
    materialSection,
    ...colResults.map((r) => r.section),
    palletSection,
  ];

  // Per-test line items for summary (split out of Materials)
  const testLineItemsForSummary = testingEnabled
    ? testingRows.filter(row => (row.cost ?? 0) > 0).map(row => {
        const testName = row.testType === "Custom" ? (row.customTestName || "Custom") : row.testType;
        const our      = (row.cost ?? 0) * (row.numSkus ?? numSkus);
        const cx       = our * (1 + testingMarkup / 100);
        return { label: `Testing – ${testName}`, our, cx };
      })
    : [];

  // Materials row excludes testing (testing gets its own rows)
  const matOnlyOur = materialOurTotal - totalTestingOur;
  const matOnlyCx  = materialCustomerTotal - totalTestingCustomer;

  // ── Summary rows ───────────────────────────────────────────────
  const summaryRows: SummaryRow[] = [
    ...(setupFeeOur > 0 || setupFeeCustomer > 0
      ? [{ label: "Setup / QA Fee", customerPrice: setupFeeCustomer, ourCosts: setupFeeOur }]
      : []),
    ...(matOnlyCx > 0
      ? [{ label: "Materials", customerPrice: matOnlyCx, ourCosts: matOnlyOur }]
      : []),
    ...testLineItemsForSummary.map(t => ({ label: t.label, customerPrice: t.cx, ourCosts: t.our })),
    ...colResults
      .filter((r) => r.customerTotalCost > 0 || r.ourTotalCost > 0)
      .map((r) => ({ label: r.summaryLabel, customerPrice: r.customerTotalCost, ourCosts: r.ourTotalCost })),
    ...(palletCustomerTotal > 0 || palletOurTotal > 0
      ? [{ label: "Pallets & Fees", customerPrice: palletCustomerTotal, ourCosts: palletOurTotal }]
      : []),
  ];

  // ── Summary table rows ─────────────────────────────────────────
  const summaryTableRows: SummaryTableRow[] = [
    ...(setupFeeOur > 0 || setupFeeCustomer > 0
      ? [{
          label:         "Setup / QA Fee",
          throughput:    null,
          leadTimeWeeks: null,
          costPerUnit:   setupFeeCustomer || null,
          totalWeight:   null,
          totalUnits:    null,
          totalCost:     setupFeeOur || null,
          totalPrice:    setupFeeCustomer || null,
        } satisfies SummaryTableRow]
      : []),
    {
      label:         "Materials",
      throughput:    null,
      leadTimeWeeks: null,
      costPerUnit:   totalBaseUnits > 0 ? matOnlyCx / totalBaseUnits : null,
      totalWeight:   reqGrams || null,
      totalUnits:    totalBaseUnits || null,
      totalCost:     matOnlyOur || null,
      totalPrice:    matOnlyCx || null,
    },
    ...testLineItemsForSummary.map(t => ({
      label:         t.label,
      throughput:    null,
      leadTimeWeeks: null,
      costPerUnit:   null,
      totalWeight:   null,
      totalUnits:    null,
      totalCost:     t.our || null,
      totalPrice:    t.cx || null,
    } satisfies SummaryTableRow)),
    ...colResults.map((r) => r.summaryTableRow),
    ...(palletCustomerTotal > 0 || palletOurTotal > 0
      ? [{
          label:         "Pallets & Fees",
          throughput:    null,
          leadTimeWeeks: null,
          costPerUnit:   totalPallets > 0 ? palletCustomerTotal / totalPallets : null,
          totalWeight:   null,
          totalUnits:    totalPallets || null,
          totalCost:     palletOurTotal || null,
          totalPrice:    palletCustomerTotal || null,
        } satisfies SummaryTableRow]
      : []),
  ];

  // ── Project-level lead time summary rows ──────────────────────
  const componentWeeks = colResults
    .map((r) => r.summaryTableRow.leadTimeWeeks)
    .filter((w): w is number => w !== null);
  if (componentWeeks.length > 0) {
    const bufferWeeks        = leadTimeBufferDays / 5;
    const maxProductionWeeks = Math.max(...componentWeeks);
    const totalLeadTimeWeeks = maxProductionWeeks + bufferWeeks;
    const makeLeadRow = (label: string, weeks: number): SummaryTableRow => ({
      label, isLeadTimeSummary: true,
      throughput: null, costPerUnit: null, totalWeight: null,
      totalUnits: null, totalCost: null, totalPrice: null,
      leadTimeWeeks: weeks,
    });
    summaryTableRows.push(
      makeLeadRow("Estimated Production Lead Time", maxProductionWeeks),
      makeLeadRow("Lead Time Buffer",               bufferWeeks),
      makeLeadRow("Estimated Total Lead Time",      totalLeadTimeWeeks),
    );
  }

  return { detailSections, summaryRows, summaryTableRows, ppuUnits };
}
