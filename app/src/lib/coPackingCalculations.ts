import { CoPackingState, CoPackingResult, CoPackingProcess, PricingTier } from "./types";
import { qtyWithOverage } from "./quantityMath";
import { processSpeedToGramsPerHour } from "./weightUnits";

// -- Process speed -> labor hours -----------------------------------------------
export function calculateProcessHours(
  proc: CoPackingProcess,
  totalQtyWithOverage: number,
): number {
  const { processSpeedValue: speed, processSpeedUnit: unit,
          batchSizeValue: batchSize, efficiencyBuffer } = proc;
  if (speed === 0) return 0;
  const buffer = 1 - efficiencyBuffer / 100;
  if (buffer <= 0) return 0;
  const gramsPerHour = processSpeedToGramsPerHour(speed, unit);
  if (gramsPerHour > 0) return totalQtyWithOverage / (gramsPerHour * buffer);

  switch (unit) {
    case "units / min":
      return (totalQtyWithOverage / (speed * buffer)) / 60;
    case "units / hr":
      return totalQtyWithOverage / (speed * buffer);
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

// -- Core calc engine ---------------------------------------------------------
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

  // -- 1. Inbound Material Handling -----------------------------------------
  // Testing cost: sum of testingRows (new structured approach), or 0 if disabled
  const testingCostPerSku = s.testingEnabled && s.testingRows?.length
    ? s.testingRows.reduce((sum, row) => sum + (row.cost ?? 0), 0)
    : 0;
  const testingOur = testingCostPerSku * s.numSkus;
  const testingCx  = testingOur * (1 + (s.testingMarkup ?? 0.20));

  // Auto-calculate intake pallets: raw material grams -> lbs / pallet weight
  const rawGramsRequired   = units * s.sachetSizeG * (1 + s.inboundOverage);
  const rawLbsRequired     = rawGramsRequired / 453.592;
  const palletWeightLbs    = s.intakePalletWeightLbs ?? 1200;
  const autoPallets        = palletWeightLbs > 0 ? Math.ceil(rawLbsRequired / palletWeightLbs) : pallets;
  const inboundHandlingOur = s.intakeFeePerPallet * autoPallets + testingOur;
  const inboundHandlingCx  = s.intakeFeePerPallet * autoPallets * (1 + s.intakeMarkup) + testingCx;

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

  // -- 2. Project Setup + QA (fixed - not scaled with units) ----------------
  results.push({
    label:         "Project Setup, Line Dial-In & QA",
    description:   "",
    deliveredQty:  1,
    requiredQty:   1,
    ourCost:       s.setupFeeOurCost,
    customerPrice: s.setupFeeCustomer,
    ppu:           s.setupFeeCustomer,
  });

  // -- 3b. Processes - co-packing labor steps -------------------------------
  let processesLaborOur = 0;

  for (let i = 0; i < coPackingProcesses.length; i++) {
    const proc = coPackingProcesses[i];
    const deliveredQty = proc.units;
    const totalQtyWithOverage = qtyWithOverage(deliveredQty, proc.overageRate);

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

  // -- 6. Palletization & Outbound -------------------------------------------
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

  // -- Addition 3 - Overhead -------------------------------------------------
  if (s.overheadEnabled) {
    const totalLaborOur = processesLaborOur;
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

// -- Addition 5 - Scaled Pricing Tiers ----------------------------------------
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
