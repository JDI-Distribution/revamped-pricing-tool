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
  leadTimeBufferDays: number,
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
  const unitsPerMin = n(col.rows?.["Unit Fill Rate / min"]);
  // efficiency is entered as an integer percent (e.g. 20 = 20% buffer).
  // TotalMinReq = (unitsReq / unitsPerMin) / (1 - efficiency/100)
  // e.g. 20% buffer → divide by 0.80, time increases by 25%.
  const efficiency  = n(col.efficiency);

  const baseMinReq    = unitsPerMin > 0 && efficiency < 100
    ? (unitsReq / unitsPerMin) / (1 - efficiency / 100)
    : unitsPerMin > 0 ? unitsReq / unitsPerMin : 0;

  // Tab application — additive time, only when tabs enabled (no separate rate row now)
  const tabMinReq   = 0;

  const totalMinReq = baseMinReq + tabMinReq;
  const totalHrsReq = totalMinReq / 60;

  // Effective display rate — buffer slows throughput: nominal * (1 - efficiency/100)
  const displayPerMin = unitsPerMin > 0 && efficiency < 100
    ? unitsPerMin * (1 - efficiency / 100)
    : unitsPerMin;

  // ── Labor ─────────────────────────────────────────────────────
  // CustomerLaborPrice = ourLaborCost × (1 + laborMarkup/100)
  // laborMarkup is entered as an integer percent (e.g. 35 = 35% markup).
  const wageRate        = n(col.rows?.["Wage Rate"]);
  const laborMarkup     = n(col.labor);

  const ourLaborCost      = totalHrsReq * wageRate;
  const customerLaborCost = ourLaborCost * (1 + laborMarkup / 100);

  // ── Packaging materials ────────────────────────────────────────
  const packagingCostPerUnit = n(col.rows?.["Packaging Cost / unit"]);
  const labelCostPerUnit     = n(col.rows?.["Label Print Cost / unit"]);
  const tabCostPerUnit       = col.tabs ? n(col.rows?.["Tab Cost / unit"]) : 0;

  const ourPackagingCost      = (packagingCostPerUnit + labelCostPerUnit + tabCostPerUnit) * unitsReq;
  // unitCostMarkup is entered as an integer percent (e.g. 125 = 125% markup).
  const unitCostMarkup        = n(col.unitCost);
  const customerPackagingCost = ourPackagingCost * (1 + unitCostMarkup / 100);

  // ── Totals ─────────────────────────────────────────────────────
  const ourTotalCost      = ourLaborCost + ourPackagingCost;
  const customerTotalCost = customerLaborCost + customerPackagingCost;

  // ── Lead time ──────────────────────────────────────────────────
  // productionDays = totalHrsReq / (hoursPerShift × numStations)
  // leadTimeWeeks  = (productionDays + bufferDays) / 5  (5-day work week)
  const hoursPerShift  = n(col.rows?.["Hrs / Shift"]);
  const numStations    = n(col.rows?.["No. of Staff / Stations"]);
  const productionDays = hoursPerShift > 0 && numStations > 0
    ? totalHrsReq / (hoursPerShift * numStations)
    : null;
  const leadTimeWeeks  = productionDays !== null
    ? (productionDays + leadTimeBufferDays) / 5
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
  const numFinishedPallets  = n(formData.numFinishedPallets);
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

  // ── Pallets — outbound only ────────────────────────────────────
  const outboundFeeMarkup    = n(formData.outboundFeeMarkup);
  const outboundTotalFee     = outboundFee * numFinishedPallets;
  const outboundCustomerFee  = outboundFee * (1 + outboundFeeMarkup / 100) * numFinishedPallets;
  const palletOurTotal       = outboundTotalFee;
  const palletCustomerTotal  = outboundCustomerFee;

  // ── Per-column results ─────────────────────────────────────────
  const colResults = columns.map((col, i) =>
    computeColumn(col, i, unitWeight, ppuDenominator, leadTimeBufferDays),
  );

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
      { label: "# of Finished Pallets",  projectDetails: numFinishedPallets || null,                          projectCosts: null,               isCurrency: false },
      { label: "Outbound Fee / Pallet",  projectDetails: outboundFee * (1 + outboundFeeMarkup / 100) || null, projectCosts: outboundFee || null, isCurrency: true  },
      { label: "Total Fees",             projectDetails: palletCustomerTotal || null,                          projectCosts: palletOurTotal || null, isCurrency: true },
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
          totalUnits:    numFinishedPallets || null,
          totalCost:     palletOurTotal || null,
          totalPrice:    palletCustomerTotal || null,
        } satisfies SummaryTableRow]
      : []),
  ];

  return { detailSections, summaryRows, summaryTableRows, ppuUnits };
}