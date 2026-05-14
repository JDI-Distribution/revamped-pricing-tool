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

/** Markup formula: CustomerPrice = OurCost * (1 + markupPct/100). Used for raw material and packaging markups. */
function applyMarkup(ourCost: number, markupPct: number): number {
  return ourCost * (1 + markupPct / 100);
}

function computeColumn(
  col: Column,
  index: number,
  unitWeightG: number,
  ppuDenominator: number,
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
  const unitsReq    = units * (1 + overageRate / 100);

  // ── Throughput ────────────────────────────────────────────────
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

  // Display rate shown in UI (after efficiency buffer)
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
  const hoursPerShift  = n(col.rows?.["Hrs / Shift"]);
  const numStations    = n(col.rows?.["No. of Staff / Stations"]);
  const productionDays = hoursPerShift > 0 && numStations > 0
    ? totalHrsReq / (hoursPerShift * numStations)
    : null;
  const leadTimeWeeks  = productionDays !== null
    ? productionDays / 5
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
    { label: unitsLabel,      projectDetails: unitsReq || null,                                    projectCosts: null,                    isCurrency: false },
    { label: "Per / Min",     projectDetails: displayPerMin || null,                               projectCosts: null,                    isCurrency: false },
    { label: "Per / Hr",      projectDetails: displayPerMin > 0 ? displayPerMin * 60 : null,       projectCosts: null,                    isCurrency: false },
    { label: "Total Min Req", projectDetails: totalMinReq || null,                                 projectCosts: null,                    isCurrency: false },
    { label: "Total Hrs Req", projectDetails: totalHrsReq || null,                                 projectCosts: null,                    isCurrency: false },
    { label: costLabel,       projectDetails: wageRate || null,                                    projectCosts: null,                    isCurrency: true  },
    { label: "Total Labor",   projectDetails: customerLaborCost || null,                           projectCosts: ourLaborCost || null,     isCurrency: true  },
    { label: "Packaging Cost",projectDetails: customerPackagingCost || null,                       projectCosts: ourPackagingCost || null, isCurrency: true  },
    { label: "Total Cost",    projectDetails: customerTotalCost || null,                           projectCosts: ourTotalCost || null,     isCurrency: true  },
  ];

  const summaryLabel = col.type || col.level || `Column ${index + 1}`;

  // PPU: every row uses ppuDenominator so individual PPUs sum to the total.
  const costPerUnit = ppuDenominator > 0 ? customerTotalCost / ppuDenominator : null;

  const summaryTableRow: SummaryTableRow = {
    label:         summaryLabel,
    throughput:    displayPerMin > 0 ? displayPerMin * 60 : null,
    leadTimeWeeks,
    costPerUnit,
    totalWeight:   isIndividual && unitWeightG > 0
      ? unitsReq * unitWeightG
      : n(col.rows?.["Packaging Weight (g)"]) > 0
        ? unitsReq * n(col.rows?.["Packaging Weight (g)"])
        : null,
    totalUnits:    unitsReq || null,
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
  const costPerGram         = n(formData.costPerGram);
  const numSkus             = n(formData.numSkus) || 1;
  const intakeFee           = n(formData.intakeFee);
  const numPallets          = n(formData.numPallets);
  const outboundFee         = n(formData.outboundFee);
  const testingFee          = n(formData.testingFee);
  const testingFeeMarkup    = n(formData.testingFeeMarkup);
  const setupFeeOur         = n(formData.setupFeeOur);
  const setupFeeCustomer    = n(formData.setupFeeCustomer);
  const ppuDenominator      = n(formData.ppuDenominator);
  const ppuUnits            = ppuDenominator;
  // materialOverage is entered as an integer percent (e.g. 25 = 25%).
  const materialOverage          = n(formData.materialOverage);
  const rawMaterialMarginPct     = n(formData.rawMaterialMarkup);
  const intakeFeeMarkup          = n(formData.intakeFeeMarkup);
  const leftOverInventoryCost    = n(formData.leftOverInventoryCost);
  const leftOverInventoryAbsorb  = n(formData.leftOverInventoryAbsorb);
  const leadTimeBufferDays       = n(formData.leadTimeBufferDays);

  // ── Materials ──────────────────────────────────────────────────
  // Only "Individual Units" columns contribute to raw material weight
  const individualCols = columns.filter((col) => col.level === "Individual Units");
  const totalBaseUnits = individualCols.reduce((sum, col) => sum + n(col.units), 0);

  // materialOverage is a standalone field (separate from per-column packout overage)
  const totalUnitsWithOverage = Math.ceil(totalBaseUnits * (1 + materialOverage / 100));

  const reqGrams = totalUnitsWithOverage * unitWeight;
  const reqOz    = reqGrams / 28.3495;
  const reqLbs   = reqGrams / 453.592;

  // Raw material: markup formula
  const rawMaterialOur      = reqGrams * costPerGram;
  const rawMaterialCustomer = applyMarkup(rawMaterialOur, rawMaterialMarginPct);

  const intakeTotalOur      = intakeFee * numPallets;
  const intakeTotalCustomer = intakeTotalOur * (1 + intakeFeeMarkup / 100);

  const testingFeeOur      = testingFee * numSkus;
  const testingFeeCustomer = testingFee * (1 + testingFeeMarkup / 100) * numSkus;

  // Left Over Inventory — absorbed portion is a pass-through line item
  const leftOverAbsorbed      = leftOverInventoryCost * (leftOverInventoryAbsorb / 100);

  const materialOurTotal      = rawMaterialOur + intakeTotalOur + testingFeeOur + leftOverAbsorbed;
  const materialCustomerTotal = rawMaterialCustomer + intakeTotalCustomer + testingFeeCustomer + leftOverAbsorbed;

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
    computeColumn(col, i, unitWeight, ppuDenominator),
  );

  // ── Pallets — auto-calculated from total project weight ───────────────────────
  const outboundFeeMarkup    = n(formData.outboundFeeMarkup);
  const palletBuffer         = n(formData.palletBuffer);
  const maxPalletWeightLbs   = n(formData.maxPalletWeightLbs) || 1000;
  const maxPalletWeightG     = maxPalletWeightLbs * 453.592;

  // Sum all per-column packaging weights (units_req × packaging_weight_g)
  const packagingWeightG = colResults_pre.reduce((sum, _r, i) => {
    const col = guardedColumns_pre[i];
    const pwg = n(col.rows?.["Packaging Weight (g)"]);
    if (pwg <= 0) return sum;
    const over = n(col.rows?.["Overage Rate"]);
    const uReq = n(col.units) * (1 + over / 100);
    return sum + uReq * pwg;
  }, 0);

  const totalProjectWeightG  = reqGrams + packagingWeightG;
  const calculatedPallets    = maxPalletWeightG > 0 ? Math.ceil(totalProjectWeightG / maxPalletWeightG) : 0;
  const totalPallets         = calculatedPallets + palletBuffer;
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
      { label: "Testing Fee / SKU",   projectDetails: testingFeeCustomer || null,    projectCosts: testingFeeOur || null,      isCurrency: true  },
      { label: "Raw Material Cost",   projectDetails: rawMaterialCustomer || null,   projectCosts: rawMaterialOur || null,     isCurrency: true  },
      ...(leftOverAbsorbed > 0 ? [
        { label: "Left Over Inventory", projectDetails: leftOverAbsorbed,            projectCosts: leftOverAbsorbed,           isCurrency: true  } satisfies DetailRow,
      ] : []),
      { label: "Total Material Cost", projectDetails: materialCustomerTotal || null, projectCosts: materialOurTotal || null,   isCurrency: true  },
    ],
    totalCustomerCost: materialCustomerTotal,
    totalOurCost:      materialOurTotal,
  };

  const palletSection: DetailSection = {
    title:      "Pallets",
    overageReq: null,
    rows: [
      { label: "# of Finished Pallets",  projectDetails: calculatedPallets || null,                            projectCosts: null,               isCurrency: false },
      { label: "Pallet Buffer",           projectDetails: palletBuffer || null,                                 projectCosts: null,               isCurrency: false },
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

  // ── Summary rows ───────────────────────────────────────────────
  const summaryRows: SummaryRow[] = [
    ...(setupFeeOur > 0 || setupFeeCustomer > 0
      ? [{ label: "Setup / QA Fee", customerPrice: setupFeeCustomer, ourCosts: setupFeeOur }]
      : []),
    ...(materialCustomerTotal > 0
      ? [{ label: "Materials", customerPrice: materialCustomerTotal, ourCosts: materialOurTotal }]
      : []),
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
          costPerUnit:   ppuDenominator > 0 ? setupFeeCustomer / ppuDenominator : null,
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
      costPerUnit:   ppuDenominator > 0 ? materialCustomerTotal / ppuDenominator : null,
      totalWeight:   reqGrams || null,
      totalUnits:    totalUnitsWithOverage || null,
      totalCost:     materialOurTotal || null,
      totalPrice:    materialCustomerTotal || null,
    },
    ...colResults.map((r) => r.summaryTableRow),
    ...(palletCustomerTotal > 0 || palletOurTotal > 0
      ? [{
          label:         "Pallets & Fees",
          throughput:    null,
          leadTimeWeeks: null,
          costPerUnit:   ppuDenominator > 0 ? palletCustomerTotal / ppuDenominator : null,
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