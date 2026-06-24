import { CoPackingState, CoPackingResult, CoPackingProcess, PricingTier } from "./types";

// ── Process speed → labor hours ───────────────────────────────────────────────
function calculateProcessHours(
  proc: CoPackingProcess,
  totalQtyWithOverage: number,
): number {
  const { processSpeedValue: speed, processSpeedUnit: unit,
          batchSizeValue: batchSize, efficiencyBuffer } = proc;
  if (speed === 0) return 0;
  const buffer = 1 - efficiencyBuffer / 100;
  if (buffer <= 0) return 0;

  switch (unit) {
    case "units / min":
      return (totalQtyWithOverage / (speed * buffer)) / 60;
    case "units / hr":
      return totalQtyWithOverage / (speed * buffer);
    case "kg / hr":
    case "lbs / hr":
      return totalQtyWithOverage / (speed * buffer);
    case "g / min":
      return (totalQtyWithOverage / (speed * buffer)) / 60;
    case "batches / hr": {
      const totalBatches = batchSize > 0 ? Math.ceil(totalQtyWithOverage / batchSize) : 1;
      return totalBatches / (speed * buffer);
    }
    case "min / unit":
      return (totalQtyWithOverage * (speed / buffer)) / 60;
    case "min / batch": {
      const totalBatches = batchSize > 0 ? Math.ceil(totalQtyWithOverage / batchSize) : 1;
      return (totalBatches * (speed / buffer)) / 60;
    }
    case "hrs / batch": {
      const totalBatches = batchSize > 0 ? Math.ceil(totalQtyWithOverage / batchSize) : 1;
      return totalBatches * (speed / buffer);
    }
    default:
      return 0;
  }
}

// ── Labor calc helper ────────────────────────────────────────────────────────
// Returns billed hours, applying per-section minimum labor if set.
function billedHrs(
  calcHrs:    number,
  minLaborHrs: number,
): { billed: number; minimumApplied: boolean } {
  const min = minLaborHrs ?? 0;
  if (min > 0 && calcHrs < min) return { billed: min, minimumApplied: true };
  return { billed: calcHrs, minimumApplied: false };
}

// ── Core calc engine ─────────────────────────────────────────────────────────
// Accepts an optional units override for scaled-pricing tiers.
export function computeCoPackingResults(
  s: CoPackingState,
  coPackingProcesses: CoPackingProcess[],
  unitsOverride?: number,
  inboundPalletsOverride?: number,
): CoPackingResult[] {
  const results: CoPackingResult[] = [];

  const units = unitsOverride ?? s.unitsDelivered;
  const pallets = inboundPalletsOverride ?? s.inboundPallets;

  const gramsDelivered = units * s.sachetSizeG;
  const gramsRequired  = gramsDelivered * (1 + s.inboundOverage);

  // ── 1. Inbound Material Handling ─────────────────────────────────────────
  // Testing cost: sum of testingRows (new structured approach), or 0 if disabled
  const testingCostPerSku = s.testingEnabled && s.testingRows?.length
    ? s.testingRows.reduce((sum, row) => sum + (row.cost ?? 0), 0)
    : 0;
  const testingOur = testingCostPerSku * s.numSkus;
  const testingCx  = testingOur * (1 + (s.testingMarkup ?? 0.20));

  const inboundHandlingOur = s.intakeFeePerPallet * pallets + testingOur;
  const inboundHandlingCx  = s.intakeFeePerPallet * pallets * (1 + s.intakeMarkup) + testingCx;

  // JDI-supplied raw materials (rawMaterialSource replaces old materialModel)
  let rawMaterialOur = 0;
  let rawMaterialCx  = 0;
  const isJdiSupplied = s.rawMaterialSource === "jdi" || (s as any).materialModel === "jdi-supplied";
  if (isJdiSupplied) {
    const rawReq = gramsDelivered * (1 + (s.rawOverage ?? 0));
    rawMaterialOur = rawReq * (s.costPerGram ?? 0);
    rawMaterialCx  = rawMaterialOur * (1 + (s.rawMaterialMarkup ?? 3.0));
  }

  const inboundOur = inboundHandlingOur + rawMaterialOur;
  const inboundCx  = inboundHandlingCx  + rawMaterialCx;
  const inboundPPU = gramsDelivered > 0 ? inboundCx / gramsDelivered : 0;

  const inboundDesc = isJdiSupplied
    ? "Receiving, inspection, staging & raw materials"
    : "Receiving, inspection & staging";

  results.push({
    label:         "Inbound Material Handling & Intake",
    description:   inboundDesc,
    deliveredQty:  gramsDelivered,
    requiredQty:   gramsRequired,
    ourCost:       inboundOur,
    customerPrice: inboundCx,
    ppu:           inboundPPU,
  });

  // ── 2. Project Setup + QA (fixed — not scaled with units) ────────────────
  results.push({
    label:         "Project Setup, Line Dial-In & QA",
    description:   "",
    deliveredQty:  1,
    requiredQty:   1,
    ourCost:       s.setupFeeOurCost,
    customerPrice: s.setupFeeCustomer,
    ppu:           s.setupFeeCustomer,
  });

  // ── 3. Blending (optional) ───────────────────────────────────────────────
  let blendOur = 0;
  if (s.blendingEnabled) {
    const blendReq  = s.blendingUnits * (1 + s.blendingOverage);
    const blendRate = s.blendingUnitsPerMin * (1 - s.blendingEfficiencyBuffer);
    const calcH     = blendRate > 0 ? (blendReq / blendRate) / 60 : 0;
    const { billed, minimumApplied } = billedHrs(calcH, s.blendingMinLaborHrs ?? 0);
    blendOur          = billed * s.blendingWageRate;
    const blendCx     = blendOur * (1 + s.blendingLaborMarkup);
    const blendPPU    = s.blendingUnits > 0 ? blendCx / s.blendingUnits : 0;
    const minNote     = minimumApplied ? ` (min ${(s.blendingMinLaborHrs ?? 0).toFixed(2)} hrs applied)` : "";
    results.push({
      label:         "Blending",
      description:   (s.blendingDescription || "Blending") + minNote,
      deliveredQty:  s.blendingUnits,
      requiredQty:   blendReq,
      ourCost:       blendOur,
      customerPrice: blendCx,
      ppu:           blendPPU,
    });
  }

  // ── 3b. Processes — co-packing labor steps ───────────────────────────────
  let processesLaborOur = 0;

  for (let i = 0; i < coPackingProcesses.length; i++) {
    const proc = coPackingProcesses[i];
    const deliveredQty = proc.units;
    const totalQtyWithOverage = deliveredQty * (1 + proc.overageRate / 100);

    let calcHrs = calculateProcessHours(proc, totalQtyWithOverage);

    // min labor floor
    let minimumApplied = false;
    if (proc.minLaborHrs > 0 && calcHrs < proc.minLaborHrs) {
      calcHrs = proc.minLaborHrs;
      minimumApplied = true;
    }

    const laborOur = calcHrs * proc.laborRate;
    const laborCx  = laborOur * (1 + proc.laborMarkup / 100);
    const ppu      = deliveredQty > 0 ? laborCx / deliveredQty : 0;
    processesLaborOur += laborOur;

    const minNote = minimumApplied ? ` (min ${proc.minLaborHrs.toFixed(2)} hrs applied)` : "";
    results.push({
      label:         proc.pdfLabel || proc.name || `Process ${i + 1}`,
      description:   (proc.name || `Process ${i + 1}`) + minNote,
      deliveredQty,
      requiredQty:   totalQtyWithOverage,
      ourCost:       laborOur,
      customerPrice: laborCx,
      ppu,
    });
  }

  // ── 6. Palletization & Outbound ───────────────────────────────────────────
  const palletOur = s.outboundPallets * s.outboundFeePerPallet;
  const palletCx  = palletOur * (1 + s.outboundMarkup);
  const palletPPU = s.outboundPallets > 0 ? palletCx / s.outboundPallets : 0;
  results.push({
    label:         "Palletization & Outbound Staging",
    description:   `${pallets} inbound / ${s.outboundPallets} outbound`,
    deliveredQty:  s.outboundPallets,
    requiredQty:   pallets,
    ourCost:       palletOur,
    customerPrice: palletCx,
    ppu:           palletPPU,
  });

  // ── Addition 3 — Overhead ─────────────────────────────────────────────────
  if (s.overheadEnabled) {
    const totalLaborOur = blendOur + processesLaborOur;
    const ovhVarOur  = totalLaborOur * (s.overheadRate ?? 0.15);
    const ovhVarCx   = ovhVarOur    * (1 + (s.overheadMarkup ?? 0.20));
    const ovhFixOur  = s.fixedOverheadFee ?? 0;
    const ovhFixCx   = ovhFixOur * (1 + (s.fixedOverheadMarkup ?? 0.20));
    const ovhOur     = ovhVarOur  + ovhFixOur;
    const ovhCx      = ovhVarCx   + ovhFixCx;
    const ovhPPU     = units > 0 ? ovhCx / units : 0;
    results.push({
      label:         "Overhead & Indirect Costs",
      description:   `${((s.overheadRate ?? 0.15) * 100).toFixed(0)}% of labor + fixed`,
      deliveredQty:  units,
      requiredQty:   units,
      ourCost:       ovhOur,
      customerPrice: ovhCx,
      ppu:           ovhPPU,
    });
  }

  // ── Addition 4 — Global Minimum Labor Adjustment ──────────────────────────
  const globalMin = s.globalMinLaborHrs ?? 0;
  if (globalMin > 0) {
    // Sum calculated hours for each section that had work
    const blendCalcH  = s.blendingEnabled ? (() => {
      const req  = s.blendingUnits * (1 + s.blendingOverage);
      const rate = s.blendingUnitsPerMin * (1 - s.blendingEfficiencyBuffer);
      return rate > 0 ? (req / rate) / 60 : 0;
    })() : 0;
    // Process-level min is handled per-process above; global min applies to blending only for now
    const totalCalcH = blendCalcH;
    if (totalCalcH < globalMin) {
      const deficit = globalMin - totalCalcH;
      // Average wage rate / markup across active sections
      const rates:   number[] = [];
      const markups: number[] = [];
      if (s.blendingEnabled) { rates.push(s.blendingWageRate ?? 0); markups.push(s.blendingLaborMarkup); }
      const avgWage   = rates.length   ? rates.reduce((a, b) => a + b, 0)   / rates.length   : 0;
      const avgMarkup = markups.length ? markups.reduce((a, b) => a + b, 0) / markups.length : 0;
      const adjOur = deficit * avgWage;
      const adjCx  = adjOur * (1 + avgMarkup);
      const adjPPU = units > 0 ? adjCx / units : 0;
      results.push({
        label:         "Minimum Labor Adjustment",
        description:   `Global min ${globalMin.toFixed(2)} hrs (calculated: ${totalCalcH.toFixed(2)} hrs)`,
        deliveredQty:  units,
        requiredQty:   units,
        ourCost:       adjOur,
        customerPrice: adjCx,
        ppu:           adjPPU,
      });
    }
  }

  return results;
}

export function computeCoPackingTotals(results: CoPackingResult[]): {
  totalOur: number;
  totalCustomer: number;
  margin: number;
} {
  const totalOur      = results.reduce((s, r) => s + r.ourCost,       0);
  const totalCustomer = results.reduce((s, r) => s + r.customerPrice, 0);
  const margin        = totalCustomer > 0 ? ((totalCustomer - totalOur) / totalCustomer) * 100 : 0;
  return { totalOur, totalCustomer, margin };
}

// ── Addition 5 — Scaled Pricing Tiers ────────────────────────────────────────
export interface TierResult {
  tier:          PricingTier;
  results:       CoPackingResult[];
  totalOur:      number;
  totalCustomer: number;
  margin:        number;
  ppu:           number;
}

export function computePricingTiers(s: CoPackingState, coPackingProcesses: CoPackingProcess[]): TierResult[] {
  if (!s.tiersEnabled || !s.pricingTiers || s.pricingTiers.length === 0) return [];
  return s.pricingTiers.map(tier => {
    const units = tier.units > 0 ? tier.units : s.unitsDelivered;
    const results = computeCoPackingResults(
      s,
      coPackingProcesses,
      units,
      tier.inboundPalletsOverride ?? undefined,
    );
    const { totalOur, totalCustomer, margin } = computeCoPackingTotals(results);
    const ppu = units > 0 ? totalCustomer / units : 0;
    return { tier, results, totalOur, totalCustomer, margin, ppu };
  });
}
