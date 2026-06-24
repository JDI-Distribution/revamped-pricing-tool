import { useState } from "react";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { FileText } from "lucide-react";
import Navbar from "@/components/navbar/Navbar";
import DatePicker from "@/components/ui/DatePicker";
import { useProject } from "@/lib/ProjectContext";
import { QuotePreview, buildQuotePreviews, buildCustomQtyPreview } from "@/lib/generateQuotePDF";
import { buildCoPackingQuotePreview } from "@/lib/generateCoPackingQuotePDF";
import { generateCoPackingExcel } from "@/lib/generateCoPackingExcel";
import PdfPreviewModal from "@/components/quote/PdfPreviewModal";
import { CustomerInfo } from "@/lib/generateQuotePDF";
import SaveQuoteButton from "@/components/quote/SaveQuoteButton";
import excelLogo     from "@/assets/excel.png";
import { generateQuoteXLSX } from "@/lib/generateQuoteXLSX";
import XlsxMoqModal from "@/components/quote/XlsxMoqModal";
import workdriveLogo from "@/assets/zoho-workdrive.png";
import crmLogo       from "@/assets/zoho-crm.png";
import { computePricingTiers, computeCoPackingTotals, computeCoPackingResults as calcCPResults } from "@/lib/coPackingCalculations";
import SummaryTables from "@/components/project/SummaryTables";

const fmt        = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtPct     = (v: number) => `${v.toFixed(1)}%`;
const calcMargin = (price: number, cost: number) => price > 0 ? ((price - cost) / price) * 100 : 0;

const labelCls = "text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider mb-0.5";

export default function QuotePage() {
  const {
    projectType,
    coPackingState,
    coPackingResults, coPackingTotals,
    coPackingProcesses,
    summaryRows, summaryTableRows, detailSections, ppuUnits,
    allMoqResults, perMoqSummaryRows, computeForQty,
    formData, setFormField, moqRows, columns, hasMoqErrors,
    customer, selectedBrand,
    resolvedMoqMargins,
    whatIfPpus,
    moqMargins, moqPpuInputs, moqLastEdited, costPpuOverrides,
    packagingLevels,
    additionalFees,
    scenarioA, scenarioB, saveScenario, clearScenarios,
    crmAccountId, crmContactId,
    saveState,
  } = useProject();

  const [generating,      setGenerating]      = useState(false);
  const [previews,        setPreviews]        = useState<QuotePreview[] | null>(null);
  const [activeSummaryMoq, setActiveSummaryMoq] = useState<number>(() => moqRows[0]?.id ?? 0);
  const [customPreviewing, setCustomPreviewing] = useState(false);
  const [xlsxModalOpen,   setXlsxModalOpen]   = useState(false);
  const [xlsxGenerating,  setXlsxGenerating]  = useState(false);
  const [bufferUnit,       setBufferUnit]       = useState<"days" | "weeks">("days");
  const [cpXlsxGenerating, setCpXlsxGenerating] = useState(false);
  // Co-packing project-level Price Adjustment (single PPU/margin override)
  const [cpGlobalAdjPpu,    setCpGlobalAdjPpu]    = useState("");  // "" = not set
  const [cpGlobalAdjMargin, setCpGlobalAdjMargin] = useState("");  // "" = not set
  const [cpLastEdited,      setCpLastEdited]       = useState<"ppu" | "margin">("ppu");
  // Co-packing per-line Price Adjustment — keyed by result index
  const [cpAdjPpus, setCpAdjPpus] = useState<Record<number, string>>({});
  // Scenario naming
  const [scenarioNameInput, setScenarioNameInput] = useState("");
  const [scenarioSlot, setScenarioSlot] = useState<'A' | 'B'>('A');
  const [showScenarioSave, setShowScenarioSave] = useState(false);
  // CRM push state
  const [crmStatus, setCrmStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [crmError, setCrmError] = useState("");
  // PDF editor regenerate mode
  const [pdfMode, setPdfMode] = useState<"standard" | "copacking" | "custom">("standard");

  // Addition 5 — Pricing tiers (computed live)
  const tierResults = coPackingState.tiersEnabled ? computePricingTiers(coPackingState, coPackingProcesses) : [];

  // Co-packing project-level Price Adjustment derived values
  const cpUnitsDelivered = coPackingState.unitsDelivered;
  const cpNaturalTotal   = (() => {
    const minCharge  = coPackingState.minimumJobCharge ?? 0;
    const minApplies = minCharge > 0 && coPackingTotals.totalCustomer < minCharge;
    return minApplies ? minCharge : coPackingTotals.totalCustomer;
  })();
  const cpCostPPU = cpUnitsDelivered > 0 ? coPackingTotals.totalOur / cpUnitsDelivered : 0;
  const cpBasePPU = cpUnitsDelivered > 0 ? cpNaturalTotal / cpUnitsDelivered : 0;

  // Resolve the live adjusted PPU from whichever field was last edited
  const cpAdjPPUval = (() => {
    if (cpLastEdited === "ppu" && cpGlobalAdjPpu !== "") {
      const v = parseFloat(cpGlobalAdjPpu);
      return isFinite(v) && v > 0 ? v : cpBasePPU;
    }
    if (cpLastEdited === "margin" && cpGlobalAdjMargin !== "") {
      const m = parseFloat(cpGlobalAdjMargin) / 100;
      return isFinite(m) && m < 1 && cpCostPPU > 0 ? cpCostPPU / (1 - m) : cpBasePPU;
    }
    return cpBasePPU;
  })();
  const cpAdjMarginPct = cpAdjPPUval > 0 ? ((cpAdjPPUval - cpCostPPU) / cpAdjPPUval) * 100 : 0;
  const cpAdjRevenue   = cpAdjPPUval * cpUnitsDelivered;
  const cpHasAdj       = (cpGlobalAdjPpu !== "" || cpGlobalAdjMargin !== "") && Math.abs(cpAdjPPUval - cpBasePPU) > 0.00001;

  // ── Interstitial pricing ──────────────────────────────────────────────────
  const [customQty,        setCustomQty]        = useState("");
  const [customPack,       setCustomPack]        = useState("");
  const [customMargin,     setCustomMargin]      = useState("");
  const [customPpuInput,   setCustomPpuInput]    = useState("");
  const [customLastEdited, setCustomLastEdited]  = useState<"margin" | "ppu">("margin");

  const activeSummaryRows = perMoqSummaryRows.get(activeSummaryMoq) ?? summaryRows;
  const activeMoqResult   = allMoqResults.find(r => r.moqRow.id === activeSummaryMoq);

  const totalCustomerPrice = activeSummaryRows.reduce((s, r) => s + r.customerPrice, 0);
  const totalOurCosts      = activeSummaryRows.reduce((s, r) => s + r.ourCosts, 0);

  // Adjusted customer PPU for the active MOQ — Price Adjustment (whatIfPpus) takes priority,
  // then MOQ Pricing Table (resolvedMoqMargins), then unadjusted.
  const activeMoqAdjPPU = (() => {
    if (!activeMoqResult) return 0;
    // 1. Price Adjustment section (whatIfPpus)
    const wiStr = whatIfPpus[activeMoqResult.moqRow.id];
    if (wiStr !== undefined && wiStr !== "") {
      const wiPpu = parseFloat(wiStr);
      if (!isNaN(wiPpu) && wiPpu > 0) return wiPpu;
    }
    // 2. MOQ Pricing Table (resolvedMoqMargins)
    const marginStr = resolvedMoqMargins[activeMoqResult.moqRow.id];
    if (marginStr !== undefined && marginStr !== "") {
      const adjMargin = parseFloat(marginStr) / 100;
      if (!isNaN(adjMargin) && adjMargin < 1 && activeMoqResult.ppuCost > 0) {
        return activeMoqResult.ppuCost / (1 - adjMargin);
      }
    }
    return 0; // no adjustment
  })();

  // Adjusted revenue for additional fees and TOTALS display
  const adjustedRevenue = activeMoqAdjPPU > 0 && activeMoqResult
    ? activeMoqAdjPPU * activeMoqResult.ppuDenominator
    : totalCustomerPrice;

  // Compute additional fee costs for the active MOQ
  const additionalFeeCosts = (additionalFees ?? []).map(fee => ({
    ...fee,
    cost: fee.mode === "$" ? fee.amount : adjustedRevenue * fee.amount,
  }));

  // ── Interstitial calc ────────────────────────────────────────────────────────
  const parsedQty    = parseInt(customQty)  || 0;
  const parsedPack   = parseInt(customPack) || (moqRows[0] ? parseInt(moqRows[0].unitsPerInner) || 24 : 24);
  const parsedMargin = parseFloat(customMargin);
  const hasMargin    = customMargin !== "" && !isNaN(parsedMargin) && parsedMargin < 100;

  const sortedMoqs = [...allMoqResults]
    .filter(r => parseInt(r.moqRow.unitsPerInner) === parsedPack || parsedPack === 0)
    .sort((a, b) => parseInt(a.moqRow.moq) - parseInt(b.moqRow.moq));

  const lowerTier = sortedMoqs.filter(r => parseInt(r.moqRow.moq) <= parsedQty).at(-1) ?? null;
  const upperTier = sortedMoqs.find(r => parseInt(r.moqRow.moq) > parsedQty) ?? null;
  const isExact   = sortedMoqs.some(r => parseInt(r.moqRow.moq) === parsedQty);
  const belowMin  = parsedQty > 0 && sortedMoqs.length > 0 && parseInt(sortedMoqs[0].moqRow.moq) > parsedQty;

  const interstitialResult = parsedQty > 0 ? computeForQty(parsedQty, parsedPack) : null;

  const customPpuVal = parseFloat(customPpuInput);
  const hasPpuAdj    = customPpuInput !== "" && !isNaN(customPpuVal) && customPpuVal > 0;
  const custPPU = interstitialResult
    ? customLastEdited === "ppu" && hasPpuAdj
      ? customPpuVal
      : customLastEdited === "margin" && hasMargin
        ? interstitialResult.ppuCost / (1 - parsedMargin / 100)
        : interstitialResult.ppuCustomer
    : 0;
  const custMarginPct = custPPU > 0 && interstitialResult
    ? ((custPPU - interstitialResult.ppuCost) / custPPU) * 100
    : 0;
  const custTotal    = custPPU * (parsedQty || 1);
  const hasCustomAdj = hasMargin || hasPpuAdj;

  // Compute delivered qtys and primary product name for PDF/Excel exports
  const colItems = summaryTableRows.filter(str =>
    !str.isLeadTimeSummary &&
    !str.label.toLowerCase().includes("material") &&
    !str.label.toLowerCase().includes("pallet") &&
    !str.label.toLowerCase().includes("setup")
  );
  // Delivered qtys: use totalUnits from summaryTableRows (columns drive this via scaledColumns)
  const deliveredQtys = colItems.map(col => col.totalUnits ?? 0);
  const primaryLevel = packagingLevels[0];
  const primaryProductName = (primaryLevel
    ? (primaryLevel.packagingType === "custom_mode" ? primaryLevel.customTypeName : primaryLevel.packagingType)
    : "") || customer.productName || "";

  const quoteArgs = {
    brandId: selectedBrand, moqResults: allMoqResults, moqMargins: resolvedMoqMargins,
    whatIfPpus, deliveredQtys, primaryProductName,
    summaryRows, summaryTableRows, formData, customer,
  };

  // ── CRM push: derive totals/lead-time for the active MOQ (standard mode) ──
  const crmTotalFeeCost  = additionalFeeCosts.reduce((s, f) => s + f.cost, 0);
  const crmGrandOurCost  = totalOurCosts + crmTotalFeeCost;
  const crmGrandCustomer = adjustedRevenue;
  const crmMarginPercent = calcMargin(crmGrandCustomer, crmGrandOurCost);
  const crmLeadTimeWeeks = summaryTableRows.find(r => r.label === "Estimated Total Lead Time")?.leadTimeWeeks ?? 0;

  const handlePushToCrm = async () => {
    setCrmStatus("sending");
    setCrmError("");
    try {
      const res = await fetch("https://jdi-pricing-tool-914416811.development.catalystserverless.com/server/quotes-api/crm/push-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customer.customer,
          contactName:  customer.name,
          phone:        customer.phone,
          email:        customer.email,
          crmAccountId, crmContactId,
          quoteId: saveState.savedQuoteId ?? "DRAFT",
          productName: customer.productName || primaryProductName,
          brand: selectedBrand,
          projectType,
          totalRevenue: crmGrandCustomer,
          adjustedRevenue: activeMoqAdjPPU > 0 && activeMoqResult ? activeMoqAdjPPU * (deliveredQtys[0] ?? activeMoqResult.ppuDenominator) : undefined,
          ourCost: crmGrandOurCost,
          marginPercent: crmMarginPercent,
          leadTimeWeeks: crmLeadTimeWeeks,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to push to CRM");
      setCrmStatus("success");
      setTimeout(() => setCrmStatus("idle"), 3000);
    } catch (err) {
      setCrmStatus("error");
      setCrmError(err instanceof Error ? err.message : "Failed to push to CRM");
    }
  };

  const handlePreview = async () => {
    setPdfMode(projectType === "copacking" ? "copacking" : "standard");
    setGenerating(true);
    try {
      if (projectType === "copacking") {
        const preview = await buildCoPackingQuotePreview({
          brandId: selectedBrand, customer, coPackingState,
          coPackingResults, coPackingProcesses,
          adjustedRevenue: cpHasAdj ? cpAdjRevenue : undefined,
        });
        setPreviews([preview]);
      } else {
        setPreviews(await buildQuotePreviews(quoteArgs));
      }
    } finally { setGenerating(false); }
  };

  const handleCustomPreview = async () => {
    if (!interstitialResult || parsedQty <= 0) return;
    setPdfMode("custom");
    setCustomPreviewing(true);
    try {
      setPreviews([await buildCustomQtyPreview({
        brandId: selectedBrand, qty: parsedQty, unitsPerInner: parsedPack,
        ppuCost: interstitialResult.ppuCost, custPPU,
        summaryRows: interstitialResult.summaryRows,
        summaryTableRows: interstitialResult.summaryTableRows,
        formData: { ...formData, ppuDenominator: String(parsedQty) },
        customer,
      })]);
    } finally { setCustomPreviewing(false); }
  };

  // Called from inside PdfPreviewModal when user edits text and hits Apply
  const handleRegenerate = async (overrides: CustomerInfo, idx: number) => {
    if (pdfMode === "copacking") {
      const preview = await buildCoPackingQuotePreview({
        brandId: selectedBrand, customer: overrides, coPackingState,
        coPackingResults, coPackingProcesses,
        adjustedRevenue: cpHasAdj ? cpAdjRevenue : undefined,
      });
      setPreviews([preview]);
    } else if (pdfMode === "custom") {
      if (!interstitialResult || parsedQty <= 0) return;
      const preview = await buildCustomQtyPreview({
        brandId: selectedBrand, qty: parsedQty, unitsPerInner: parsedPack,
        ppuCost: interstitialResult.ppuCost, custPPU,
        summaryRows: interstitialResult.summaryRows,
        summaryTableRows: interstitialResult.summaryTableRows,
        formData: { ...formData, ppuDenominator: String(parsedQty) },
        customer: overrides,
      });
      setPreviews([preview]);
    } else {
      const results = await buildQuotePreviews({ ...quoteArgs, customer: overrides });
      setPreviews(results);
    }
    void idx; // idx could be used for per-tab regeneration in future
  };

  const th  = "py-2 px-3 text-left text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider border-b-2 border-gray-900";
  const thr = "py-2 px-3 text-right text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider border-b-2 border-gray-900";
  const td  = "py-2 px-3 text-xs text-gray-700";
  const tdr = "py-2 px-3 text-xs text-right text-gray-700";

  const marginColor = (pct: number) =>
    pct >= 65 ? "text-green-700" : pct >= 50 ? "text-amber-600" : "text-red-600";

  return (
    <main className="min-h-screen flex flex-col bg-white">
      <Navbar />
      {previews && (
        <PdfPreviewModal
          previews={previews}
          onClose={() => setPreviews(null)}
          onRegenerate={handleRegenerate}
          initialCustomer={customer}
        />
      )}
      {xlsxModalOpen && (
        <XlsxMoqModal
          moqResults={allMoqResults}
          defaultMoqId={activeSummaryMoq}
          generating={xlsxGenerating}
          onClose={() => setXlsxModalOpen(false)}
          onConfirm={async (selectedMoq) => {
            setXlsxGenerating(true);
            try {
              await generateQuoteXLSX({ formData, columns, allMoqResults, perMoqSummaryRows, customer, selectedBrand, moqMargins: resolvedMoqMargins, selectedMoq, primaryProductName, primaryDelivQty: deliveredQtys[0] ?? 0 });
              setXlsxModalOpen(false);
            } finally {
              setXlsxGenerating(false);
            }
          }}
        />
      )}

      <div className="flex-1 overflow-auto px-6 py-6 w-full">

        {/* ── Page header ── */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-1 h-5 rounded-full bg-[#e8473f] shrink-0" />
              <div>
                <h1 className="text-sm font-semibold text-gray-900 tracking-tight leading-none">Quote Overview</h1>
                <p className="text-[0.65rem] text-gray-400 mt-0.5">Review pricing and export the quote</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0 h-7 border border-gray-200 overflow-hidden">
                <span className="text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap px-2 bg-gray-50 h-full flex items-center border-r border-gray-200">
                  Start Date
                </span>
                <div className="w-32">
                  <DatePicker
                    value={formData.startDate}
                    onChange={(v) => setFormField("startDate", v)}
                    placeholder="Pick date"
                  />
                </div>
              </div>

              <div className="flex items-center h-7 border border-gray-200 overflow-hidden">
                <span className="text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap px-2 bg-gray-50 h-full flex items-center border-r border-gray-200">
                  Buffer
                </span>
                <input
                  type="number"
                  value={
                    bufferUnit === "weeks"
                      ? formData.leadTimeBufferDays ? (parseFloat(formData.leadTimeBufferDays) / 5).toFixed(1) : ""
                      : formData.leadTimeBufferDays
                  }
                  onChange={(e) => {
                    const raw = parseFloat(e.target.value);
                    if (isNaN(raw)) { setFormField("leadTimeBufferDays", ""); return; }
                    setFormField("leadTimeBufferDays", bufferUnit === "weeks" ? String(Math.round(raw * 5)) : String(raw));
                  }}
                  className="w-12 h-full px-1.5 text-[0.7rem] text-right bg-white border-r border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#e8473f] font-medium"
                  placeholder="0"
                  step={bufferUnit === "weeks" ? "0.5" : "1"}
                />
                {(["days", "weeks"] as const).map((u) => (
                  <button
                    type="button"
                    key={u}
                    onClick={() => setBufferUnit(u)}
                    className={`h-7 px-2 text-[0.6rem] font-semibold transition-colors ${
                      bufferUnit === u ? "bg-[#e8473f] text-white" : "text-gray-400 hover:text-gray-700 bg-gray-50"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 flex-wrap">
            {projectType === "standard" && hasMoqErrors && (
              <span className="text-[0.6rem] text-red-500 font-medium">
                Fix MOQ configuration errors to enable exports
              </span>
            )}
            <button
              type="button"
              onClick={handlePreview}
              disabled={generating || (projectType === "standard" && hasMoqErrors)}
              title={hasMoqErrors ? "Fix MOQ configuration errors before exporting" : undefined}
              className="flex items-center gap-2 bg-[#e8473f] hover:bg-[#d43f37] disabled:opacity-50 text-white text-xs font-semibold px-4 h-7 rounded-lg transition-colors"
            >
              <FileText size={12} />
              {generating ? "Generating…" : projectType === "copacking" ? "Preview & Export" : allMoqResults.length > 0 ? `Preview & Export (${allMoqResults.length})` : "Preview & Export"}
            </button>
            <SaveQuoteButton
              quotePageState={{ customer, selectedBrand, moqMargins, moqPpuInputs, moqLastEdited, whatIfPpus, costPpuOverrides, additionalFees }}
              disabled={projectType === "standard" && hasMoqErrors}
              disabledReason={hasMoqErrors ? "Fix MOQ configuration errors before saving" : undefined}
            />
            {projectType === "standard" && (
              <button
                type="button"
                onClick={() => {
                  if (allMoqResults.length === 0) {
                    // No MOQ rows — export directly with a synthetic base-quote row
                    const totalCustomer = summaryRows.reduce((s, r) => s + r.customerPrice, 0);
                    const totalOur      = summaryRows.reduce((s, r) => s + r.ourCosts, 0);
                    const denom         = parseFloat(formData.ppuDenominator) || 1;
                    const baseRow = {
                      moqRow: { id: 0, moq: "Base", individualUnits: String(denom), unitsPerInner: "0", innersPerMaster: "0" },
                      casePack: "—", totalCustomerPrice: totalCustomer, totalOurCost: totalOur,
                      ppuDenominator: denom, ppu: totalCustomer / denom, ppuCost: totalOur / denom,
                      marginDollars: totalCustomer - totalOur,
                      marginPct: totalCustomer > 0 ? ((totalCustomer - totalOur) / totalCustomer) * 100 : 0,
                    };
                    const syntheticMap = new Map([[-1, summaryRows]]);
                    setXlsxGenerating(true);
                    generateQuoteXLSX({ formData, columns, allMoqResults: [baseRow], perMoqSummaryRows: syntheticMap, customer, selectedBrand, moqMargins: {}, selectedMoq: baseRow, primaryProductName, primaryDelivQty: deliveredQtys[0] ?? 0 })
                      .finally(() => setXlsxGenerating(false));
                  } else {
                    setXlsxModalOpen(true);
                  }
                }}
                disabled={xlsxGenerating || hasMoqErrors}
                title={hasMoqErrors ? "Fix MOQ configuration errors before exporting" : undefined}
                className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 text-gray-600 text-xs font-medium px-3 h-7 rounded-lg transition-colors"
              >
                <img src={excelLogo} alt="Excel" className="w-3 h-3 object-contain" />
                {xlsxGenerating ? "…" : ".xlsx"}
              </button>
            )}
            {projectType === "copacking" && (
              <button
                type="button"
                onClick={async () => {
                  setCpXlsxGenerating(true);
                  try {
                    await generateCoPackingExcel({
                      brandId: selectedBrand, customer,
                      coPackingState, coPackingResults,
                    });
                  } finally { setCpXlsxGenerating(false); }
                }}
                disabled={cpXlsxGenerating || coPackingResults.length === 0}
                className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 text-gray-600 text-xs font-medium px-3 h-7 rounded-lg transition-colors"
              >
                <img src={excelLogo} alt="Excel" className="w-3 h-3 object-contain" />
                {cpXlsxGenerating ? "Generating…" : ".xlsx"}
              </button>
            )}
            <button type="button" className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-xs font-medium px-3 h-7 rounded-lg transition-colors">
              <img src={workdriveLogo} alt="WorkDrive" className="w-3 h-3 object-contain" />
              WorkDrive
            </button>
            <button
              type="button"
              onClick={handlePushToCrm}
              disabled={crmStatus === "sending"}
              className={`flex items-center gap-1.5 border text-xs font-medium px-3 h-7 rounded-lg transition-colors disabled:opacity-60 ${
                crmStatus === "success"
                  ? "border-green-300 bg-green-50 text-green-700"
                  : "border-gray-200 bg-white hover:bg-gray-50 text-gray-600"
              }`}
            >
              {crmStatus === "success" ? (
                "✓ Sent to CRM"
              ) : (
                <>
                  <img src={crmLogo} alt="CRM" className="w-3 h-3 object-contain" />
                  {crmStatus === "sending" ? "Sending…" : "CRM"}
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Co-Packing Cost Summary ── */}
        {projectType === "copacking" && (<>
          <div className="border border-gray-100 rounded-sm overflow-hidden mb-4">
            <div className="bg-gray-50 border-b border-gray-100 px-3 py-2">
              <span className="text-xs font-semibold text-black uppercase tracking-wide">Cost Summary — Co-Packing</span>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className={th}>Description</th>
                  <th className={thr}>Req Qty (w/ overage)</th>
                  <th className={thr}>Delivered Qty</th>
                  <th className={thr}>Our Cost</th>
                  <th className={thr}>Customer Price</th>
                  <th className={thr}>PPU</th>
                  <th className={thr}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {coPackingResults.map((r, i) => {
                  const margin = r.customerPrice > 0 ? ((r.customerPrice - r.ourCost) / r.customerPrice) * 100 : 0;
                  const fmtQtyCell = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
                  return (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className={td}>
                        <p className="font-medium">{r.label}</p>
                        {r.description && <p className="text-[0.6rem] text-gray-400">{r.description}</p>}
                      </td>
                      <td className={tdr + " text-gray-400"}>{fmtQtyCell(r.requiredQty)}</td>
                      <td className={tdr}>{fmtQtyCell(r.deliveredQty)}</td>
                      <td className={tdr}>{fmt(r.ourCost)}</td>
                      <td className={tdr}>{fmt(r.customerPrice)}</td>
                      <td className={tdr}>{fmt(r.ppu)}</td>
                      <td className={`${tdr} ${marginColor(margin)}`}>{fmtPct(margin)}</td>
                    </tr>
                  );
                })}
                {/* Minimum job charge adjustment row */}
                {(() => {
                  const minCharge = coPackingState.minimumJobCharge ?? 0;
                  const minApplies = minCharge > 0 && coPackingTotals.totalCustomer < minCharge;
                  if (!minApplies) return null;
                  const diff = minCharge - coPackingTotals.totalCustomer;
                  return (
                    <tr className="border-b border-amber-200 bg-amber-50/30">
                      <td className={td}>
                        <p className="font-medium text-amber-700">Minimum Job Charge Adjustment</p>
                        <p className="text-[0.6rem] text-amber-500">⚠ Project total ({fmt(coPackingTotals.totalCustomer)}) is below minimum job charge ({fmt(minCharge)})</p>
                      </td>
                      <td colSpan={3} />
                      <td className={tdr + " font-semibold text-amber-700"}>{fmt(diff)}</td>
                      <td colSpan={2} />
                    </tr>
                  );
                })()}
                {(() => {
                  const displayTotal = cpHasAdj ? cpAdjRevenue : cpNaturalTotal;
                  const displayMargin = displayTotal > 0 ? ((displayTotal - coPackingTotals.totalOur) / displayTotal) * 100 : 0;
                  return (
                    <tr className="border-t-2 border-gray-900 bg-sky-50 font-bold">
                      <td className={`${td} font-bold italic`}>TOTALS{cpHasAdj && <span className="ml-1 text-[0.55rem] text-green-600 font-semibold">(adjusted)</span>}</td>
                      <td /><td />
                      <td className={`${tdr} font-bold`}>{fmt(coPackingTotals.totalOur)}</td>
                      <td className={`${tdr} font-bold ${cpHasAdj ? "text-green-700" : ""}`}>{fmt(displayTotal)}</td>
                      <td />
                      <td className={`${tdr} font-bold ${marginColor(displayMargin)}`}>{fmtPct(displayMargin)}</td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>

          {/* ── Co-Packing Project-Level Price Adjustment ── */}
          {coPackingResults.length > 0 && (
            <div className="border border-amber-200 rounded-sm overflow-hidden mb-4">
              <div className="bg-amber-50/60 border-b border-amber-200 px-3 py-2 flex items-center gap-3">
                <span className="text-xs font-semibold text-amber-900 uppercase tracking-wide">Price Adjustment</span>
                <span className="text-[0.6rem] text-amber-600">— adjust sale price to see impact on margin and revenue</span>
                {cpHasAdj && (
                  <button type="button"
                    onClick={() => { setCpGlobalAdjPpu(""); setCpGlobalAdjMargin(""); }}
                    className="ml-auto text-[0.6rem] font-semibold text-amber-700 hover:text-amber-900 border border-amber-300 bg-white hover:bg-amber-50 px-2 h-5 rounded transition-colors">
                    Reset
                  </button>
                )}
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={thr}>Cost PPU</th>
                    <th className="py-2 px-3 text-center text-[0.6rem] font-semibold text-amber-700 uppercase tracking-wider border-b-2 border-gray-900">Adjusted PPU</th>
                    <th className="py-2 px-3 text-center text-[0.6rem] font-semibold text-amber-700 uppercase tracking-wider border-b-2 border-gray-900">Margin %</th>
                    <th className={thr + " bg-[#FEF2F2]"}>Total Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={tdr + " text-gray-400"}>{fmt(cpCostPPU)}</td>
                    <td className="py-1 px-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-xs text-gray-400">$</span>
                        <CurrencyInput type="dollar"
                          value={cpGlobalAdjPpu !== "" ? parseFloat(cpGlobalAdjPpu) : cpBasePPU}
                          onChange={v => {
                            setCpGlobalAdjPpu(String(v));
                            setCpLastEdited("ppu");
                            // Sync margin
                            const margin = v > 0 ? ((v - cpCostPPU) / v) * 100 : 0;
                            setCpGlobalAdjMargin(margin.toFixed(4));
                          }}
                          className="w-28 h-6 px-2 text-xs text-right border border-amber-300 bg-[#FFFDE7] focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium"
                        />
                      </div>
                    </td>
                    <td className="py-1 px-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <CurrencyInput type="percent"
                          value={cpGlobalAdjMargin !== "" ? parseFloat(cpGlobalAdjMargin) : cpAdjMarginPct}
                          max={99.99}
                          onChange={v => {
                            setCpGlobalAdjMargin(String(v));
                            setCpLastEdited("margin");
                            // Sync PPU
                            const ppu = cpCostPPU > 0 && v < 100 ? cpCostPPU / (1 - v / 100) : cpBasePPU;
                            setCpGlobalAdjPpu(String(ppu));
                          }}
                          className="w-24 h-6 px-2 text-xs text-right border border-amber-300 bg-[#FFFDE7] focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium"
                        />
                        <span className="text-xs text-gray-400">%</span>
                      </div>
                    </td>
                    <td className={`${tdr} bg-[#FEF2F2] font-semibold ${cpHasAdj ? "text-green-700" : "text-gray-800"}`}>
                      {fmt(cpHasAdj ? cpAdjRevenue : cpNaturalTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* ── Co-Packing Per-Line Price Adjustment ── */}
          {coPackingResults.length > 0 && (
            <div className="border border-amber-200 rounded-sm overflow-x-auto mb-4">
              <div className="bg-amber-50/60 border-b border-amber-200 px-3 py-2 flex items-center gap-3">
                <span className="text-xs font-semibold text-amber-900 uppercase tracking-wide">Per-Line Price Adjustment</span>
                <span className="text-[0.6rem] text-amber-600">— adjust PPU per line to see impact on margin and total</span>
                {Object.keys(cpAdjPpus).length > 0 && (
                  <button type="button" onClick={() => setCpAdjPpus({})}
                    className="ml-auto text-[0.6rem] font-semibold text-amber-700 hover:text-amber-900 border border-amber-300 bg-white hover:bg-amber-50 px-2 h-5 rounded transition-colors">
                    Reset All
                  </button>
                )}
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={th}>Line Item</th>
                    <th className={thr}>Current PPU</th>
                    <th className="py-2 px-3 text-center text-[0.6rem] font-semibold text-amber-700 uppercase tracking-wider border-b-2 border-gray-900">Adjusted PPU</th>
                    <th className={thr + " bg-[#FEF2F2]"}>Margin %</th>
                    <th className={thr + " bg-[#FEF2F2]"}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {coPackingResults.map((r, i) => {
                    const adjStr  = cpAdjPpus[i];
                    const adjPPU  = adjStr !== undefined && adjStr !== "" ? parseFloat(adjStr) : r.ppu;
                    const isCustom = adjStr !== undefined && adjStr !== "" && !isNaN(adjPPU) && adjPPU !== r.ppu;
                    const margin  = adjPPU > 0 && r.ourCost > 0
                      ? ((adjPPU * r.deliveredQty - r.ourCost) / (adjPPU * r.deliveredQty)) * 100
                      : r.customerPrice > 0 ? calcMargin(r.customerPrice, r.ourCost) : 0;
                    const total   = adjPPU * r.deliveredQty;
                    return (
                      <tr key={i} className="border-b border-gray-100 hover:bg-amber-50/20">
                        <td className={td}>
                          <p className="font-medium">{r.label}</p>
                          {r.description && <p className="text-[0.6rem] text-gray-400">{r.description}</p>}
                        </td>
                        <td className={tdr + " text-gray-400"}>{fmt(r.ppu)}</td>
                        <td className="py-1 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-xs text-gray-400">$</span>
                            <CurrencyInput type="dollar"
                              value={adjStr !== undefined && adjStr !== "" ? parseFloat(adjStr) : r.ppu}
                              onChange={(v) => setCpAdjPpus(prev => ({ ...prev, [i]: String(v) }))}
                              className="w-28 h-6 px-2 text-xs text-right border border-amber-300 bg-[#FFFDE7] focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium"
                            />
                            {isCustom && (
                              <button type="button"
                                onClick={() => setCpAdjPpus(prev => { const n = { ...prev }; delete n[i]; return n; })}
                                className="text-gray-300 hover:text-gray-600 text-sm leading-none" title="Reset">↺</button>
                            )}
                          </div>
                        </td>
                        <td className={`${tdr} bg-[#FEF2F2] ${marginColor(margin)}`}>{fmtPct(margin)}</td>
                        <td className={`${tdr} bg-[#FEF2F2] font-semibold text-gray-800`}>{fmt(total)}</td>
                      </tr>
                    );
                  })}
                  {(() => {
                    const adjTotal = coPackingResults.reduce((s, r, i) => {
                      const adjStr = cpAdjPpus[i];
                      const adjPPU = adjStr !== undefined && adjStr !== "" ? parseFloat(adjStr) : r.ppu;
                      return s + adjPPU * r.deliveredQty;
                    }, 0);
                    const overallMargin = adjTotal > 0
                      ? ((adjTotal - coPackingTotals.totalOur) / adjTotal) * 100 : 0;
                    return (
                      <tr className="border-t-2 border-gray-900 bg-amber-50">
                        <td className="py-2 px-3 text-xs font-bold text-gray-900 italic" colSpan={3}>TOTALS</td>
                        <td className={`py-2 px-3 text-right text-xs font-bold bg-[#FEF2F2] ${marginColor(overallMargin)}`}>{fmtPct(overallMargin)}</td>
                        <td className="py-2 px-3 text-right text-xs font-bold text-gray-900 bg-[#FEF2F2]">{fmt(adjTotal)}</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Addition 5 — Pricing Tiers comparison table ── */}
          {coPackingState.tiersEnabled && tierResults.length > 0 && (
            <div className="border border-gray-100 rounded-sm overflow-x-auto mb-4">
              <div className="bg-gray-50 border-b border-gray-100 px-3 py-2">
                <span className="text-xs font-semibold text-black uppercase tracking-wide">Volume Pricing Scenarios</span>
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className={th}>Cost Component</th>
                    {tierResults.map(tr => (
                      <th key={tr.tier.id} className={thr}>{tr.tier.label}<br /><span className="font-normal text-gray-400">{tr.tier.units.toLocaleString()} units</span></th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* One row per unique label across all tiers */}
                  {Array.from(new Set(tierResults.flatMap(tr => tr.results.map(r => r.label)))).map(label => (
                    <tr key={label} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className={td}>{label}</td>
                      {tierResults.map(tr => {
                        const r = tr.results.find(r => r.label === label);
                        return <td key={tr.tier.id} className={tdr}>{r ? fmt(r.customerPrice) : "—"}</td>;
                      })}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-900 bg-sky-50 font-bold">
                    <td className={`${td} font-bold italic`}>Total</td>
                    {tierResults.map((tr, i) => {
                      const best = i === tierResults.reduce((bi, t, j) => t.margin > tierResults[bi].margin ? j : bi, 0);
                      return <td key={tr.tier.id} className={`${tdr} font-bold ${best ? "text-green-700" : ""}`}>{fmt(tr.totalCustomer)}</td>;
                    })}
                  </tr>
                  <tr className="bg-sky-50">
                    <td className={`${td} font-bold italic`}>PPU</td>
                    {tierResults.map(tr => <td key={tr.tier.id} className={`${tdr} font-bold`}>{fmt(tr.ppu)}</td>)}
                  </tr>
                  <tr className="bg-sky-50">
                    <td className={`${td} font-bold italic`}>Margin %</td>
                    {tierResults.map((tr, i) => {
                      const best = i === tierResults.reduce((bi, t, j) => t.margin > tierResults[bi].margin ? j : bi, 0);
                      return <td key={tr.tier.id} className={`${tdr} font-bold ${marginColor(tr.margin)} ${best ? "underline" : ""}`}>{fmtPct(tr.margin)}</td>;
                    })}
                  </tr>
                  {/* Savings vs pilot (first tier) */}
                  {tierResults.length > 1 && (() => {
                    const pilotPPU = tierResults[0].ppu;
                    return (
                      <tr className="bg-gray-50">
                        <td className={td}>Savings vs {tierResults[0].tier.label}</td>
                        {tierResults.map((tr, i) => (
                          <td key={tr.tier.id} className={tdr}>
                            {i === 0 ? "—" : (
                              <span className={tr.ppu < pilotPPU ? "text-green-600 font-semibold" : "text-gray-400"}>
                                {tr.ppu < pilotPPU ? `-${fmt(pilotPPU - tr.ppu)}/unit` : "—"}
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Addition 6 — Scenario Comparison ── */}
          <div className="border border-gray-100 rounded-sm mb-4">
            <div className="bg-gray-50 border-b border-gray-100 px-3 py-2 flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold text-black uppercase tracking-wide">Scenario Comparison</span>
              <div className="flex items-center gap-2 ml-auto">
                {!showScenarioSave ? (
                  <button type="button" onClick={() => setShowScenarioSave(true)}
                    className="text-[0.6rem] font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 px-2 h-5 rounded transition-colors">
                    Save Scenario
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <input type="text" value={scenarioNameInput} onChange={e => setScenarioNameInput(e.target.value)}
                      placeholder="Scenario name…"
                      className="h-5 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#e8473f]" />
                    {(["A", "B"] as const).map(slot => (
                      <button key={slot} type="button" onClick={() => setScenarioSlot(slot)}
                        className={`h-5 px-2 text-[0.6rem] font-semibold rounded transition-colors ${scenarioSlot === slot ? "bg-[#e8473f] text-white" : "bg-gray-100 text-gray-500"}`}>
                        {slot}
                      </button>
                    ))}
                    <button type="button"
                      onClick={() => { saveScenario(scenarioSlot, scenarioNameInput || `Scenario ${scenarioSlot}`); setShowScenarioSave(false); setScenarioNameInput(""); }}
                      className="h-5 px-2 text-[0.6rem] font-semibold bg-[#e8473f] text-white rounded hover:bg-[#d43f37] transition-colors">
                      Save
                    </button>
                    <button type="button" onClick={() => setShowScenarioSave(false)}
                      className="text-gray-400 hover:text-gray-700 text-sm leading-none">×</button>
                  </div>
                )}
                {(scenarioA || scenarioB) && (
                  <button type="button" onClick={clearScenarios}
                    className="text-[0.6rem] text-gray-400 hover:text-red-500 transition-colors">Clear</button>
                )}
              </div>
            </div>
            {scenarioA && scenarioB ? (() => {
              const ra = computeCoPackingTotals(calcCPResults(scenarioA.state, coPackingProcesses));
              const rb = computeCoPackingTotals(calcCPResults(scenarioB.state, coPackingProcesses));
              const ppuA = scenarioA.state.unitsDelivered > 0 ? ra.totalCustomer / scenarioA.state.unitsDelivered : 0;
              const ppuB = scenarioB.state.unitsDelivered > 0 ? rb.totalCustomer / scenarioB.state.unitsDelivered : 0;
              const rows: Array<{ label: string; a: string; b: string; delta: string }> = [
                { label: "Units", a: scenarioA.state.unitsDelivered.toLocaleString(), b: scenarioB.state.unitsDelivered.toLocaleString(), delta: `+${(scenarioB.state.unitsDelivered - scenarioA.state.unitsDelivered).toLocaleString()}` },
                { label: "Total Cost (Our)", a: fmt(ra.totalOur), b: fmt(rb.totalOur), delta: `+${fmt(rb.totalOur - ra.totalOur)}` },
                { label: "Total Revenue", a: fmt(ra.totalCustomer), b: fmt(rb.totalCustomer), delta: `+${fmt(rb.totalCustomer - ra.totalCustomer)}` },
                { label: "PPU (Customer)", a: fmt(ppuA), b: fmt(ppuB), delta: `${ppuB < ppuA ? "-" : "+"}${fmt(Math.abs(ppuB - ppuA))}` },
                { label: "Margin %", a: fmtPct(ra.margin), b: fmtPct(rb.margin), delta: `${rb.margin > ra.margin ? "+" : ""}${(rb.margin - ra.margin).toFixed(1)}%` },
              ];
              return (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className={th}>Metric</th>
                      <th className={thr}>{scenarioA.name}</th>
                      <th className={thr}>{scenarioB.name}</th>
                      <th className={thr}>Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.label} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className={td}>{row.label}</td>
                        <td className={tdr}>{row.a}</td>
                        <td className={tdr}>{row.b}</td>
                        <td className={tdr + " text-gray-500 italic"}>{row.delta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })() : (
              <div className="px-4 py-3 text-[0.65rem] text-gray-400">
                {!scenarioA && !scenarioB ? "Save two scenarios to compare them side by side." : scenarioA && !scenarioB ? `Scenario A saved: "${scenarioA.name}". Save Scenario B to compare.` : scenarioB ? `Scenario B saved: "${scenarioB.name}". Save Scenario A to compare.` : ""}
              </div>
            )}
          </div>
        </>)}

        {/* ── Standard: Details + Lead Time + Custom Quantity Pricing ── */}
        {projectType === "standard" && (
          <>
            {/* ── Details table (replaces Cost Summary) ── */}
            <SummaryTables
              summaryRows={activeSummaryRows}
              summaryTableRows={summaryTableRows}
              detailSections={detailSections}
              ppuUnits={ppuUnits}
            />

            {/* MOQ switcher row */}
            {allMoqResults.length > 0 && (
              <div className="flex items-center gap-2 px-4 mb-3 flex-wrap">
                <span className="text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider shrink-0">MOQ:</span>
                {allMoqResults.map((r) => (
                  <button
                    type="button"
                    key={r.moqRow.id}
                    onClick={() => setActiveSummaryMoq(r.moqRow.id)}
                    className={`h-5 px-2 text-[0.6rem] font-semibold rounded-full transition-colors whitespace-nowrap ${
                      r.moqRow.id === activeSummaryMoq
                        ? "bg-[#e8473f] text-white"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {r.moqRow.moq || "—"} MOQ · {r.casePack}pk
                  </button>
                ))}
                {activeMoqResult && (
                  <span className="ml-auto text-[0.6rem] text-gray-400 whitespace-nowrap">
                    Cost PPU: <span className="font-semibold text-gray-600">{fmt(activeMoqResult.ppuCost)}</span>
                  </span>
                )}
              </div>
            )}

            {/* ── Lead Time ── */}
            {summaryTableRows.some(r => r.leadTimeWeeks != null) && (
              <div className="border border-gray-100 rounded-sm overflow-hidden mb-4">
                <div className="bg-gray-50 border-b border-gray-100 px-3 py-2">
                  <span className="text-xs font-semibold text-black uppercase tracking-wide">Lead Time</span>
                </div>
                <div className="p-4">
                  <table className="w-full border-collapse mb-3">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-1.5 px-2 text-left text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider">Component</th>
                        <th className="py-1.5 px-2 text-right text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider">Prod. Days</th>
                        <th className="py-1.5 px-2 text-right text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider">Total Wks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryTableRows.filter(r => r.leadTimeWeeks != null && !r.isLeadTimeSummary).map((r) => (
                        <tr key={r.label} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="py-1.5 px-2 text-xs text-gray-700">{r.label}</td>
                          <td className="py-1.5 px-2 text-right text-xs text-gray-500">{(r.leadTimeWeeks! * 5).toFixed(1)}</td>
                          <td className="py-1.5 px-2 text-right text-xs font-semibold text-gray-900">{r.leadTimeWeeks!.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="border border-gray-100 rounded-sm overflow-hidden">
                    {summaryTableRows.filter(r => r.isLeadTimeSummary).map((r) => {
                      const isTotal = r.label === "Estimated Total Lead Time";
                      return (
                        <div key={r.label} className={`flex items-center justify-between px-3 py-2 border-b border-gray-100 last:border-0 ${isTotal ? "bg-blue-50/60" : "bg-gray-50/40"}`}>
                          <span className={`text-xs ${isTotal ? "font-semibold text-gray-900" : "text-gray-500"}`}>{r.label}</span>
                          <span className={`text-xs ${isTotal ? "font-bold text-gray-900" : "text-gray-600"}`}>
                            {r.leadTimeWeeks != null ? `${r.leadTimeWeeks.toFixed(2)} wks` : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── Custom Quantity Pricing ── */}
            <div className="border border-gray-100 rounded-sm overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-100 px-3 py-2 flex items-center gap-2">
                <span className="text-xs font-semibold text-black uppercase tracking-wide">Custom Quantity Pricing</span>
                <span className="text-[0.6rem] text-gray-400">— calculate price for a quantity between MOQ breakpoints</span>
                <button
                  type="button"
                  onClick={handleCustomPreview}
                  disabled={customPreviewing || !interstitialResult || parsedQty <= 0}
                  className="ml-auto flex items-center gap-1.5 h-6 px-3 text-[0.65rem] font-semibold bg-[#e8473f] hover:bg-[#d43f37] disabled:opacity-40 text-white rounded-lg transition-colors whitespace-nowrap"
                >
                  <FileText size={11} />
                  {customPreviewing ? "Generating…" : "Preview Quote"}
                </button>
              </div>
              <div className="p-4">
                <div className="flex items-end gap-3 mb-4 flex-wrap">
                  <div>
                    <p className={labelCls}>Custom Qty</p>
                    <input type="number" value={customQty} onChange={(e) => setCustomQty(e.target.value)} placeholder="e.g. 10000" className="h-8 w-36 px-3 text-xs border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition" />
                  </div>
                  <div>
                    <p className={labelCls}>Case Pack</p>
                    <input type="number" value={customPack} onChange={(e) => setCustomPack(e.target.value)} placeholder={String(moqRows[0] ? parseInt(moqRows[0].unitsPerInner) || 24 : 24)} className="h-8 w-24 px-3 text-xs border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition" />
                  </div>
                  <div>
                    <p className={labelCls}>Adj. Margin %</p>
                    <div className="flex items-center h-8 gap-1">
                      <input
                        type="number"
                        value={customLastEdited === "ppu" && hasPpuAdj ? custMarginPct.toFixed(2) : customMargin}
                        onChange={(e) => {
                          setCustomMargin(e.target.value);
                          setCustomLastEdited("margin");
                          setCustomPpuInput("");
                        }}
                        placeholder={interstitialResult ? (((interstitialResult.ppuCustomer - interstitialResult.ppuCost) / interstitialResult.ppuCustomer) * 100).toFixed(1) : "0.0"}
                        className="w-24 h-8 px-2 text-xs text-right border border-amber-300 bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium"
                      />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                  </div>
                  <div>
                    <p className={labelCls}>Adj. PPU</p>
                    <div className="flex items-center h-8 gap-1">
                      <span className="text-xs text-gray-400">$</span>
                      <input
                        type="number"
                        value={customLastEdited === "margin" && hasMargin ? custPPU.toFixed(4) : customPpuInput}
                        onChange={(e) => {
                          setCustomPpuInput(e.target.value);
                          setCustomLastEdited("ppu");
                          setCustomMargin("");
                        }}
                        placeholder={interstitialResult?.ppuCustomer.toFixed(2) ?? "0.00"}
                        className="w-24 h-8 px-2 text-xs text-right border border-blue-300 bg-blue-50 focus:outline-none focus:ring-1 focus:ring-blue-400 font-medium"
                      />
                    </div>
                  </div>
                  {parsedQty > 0 && (
                    <div className="flex items-center gap-2 ml-2 pb-0.5">
                      {belowMin ? (
                        <span className="text-[0.65rem] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded">Below minimum MOQ of {sortedMoqs[0]?.moqRow.moq}</span>
                      ) : isExact ? (
                        <span className="text-[0.65rem] font-semibold text-green-600 bg-green-50 border border-green-200 px-2 py-1 rounded">Exact MOQ match</span>
                      ) : (
                        <span className="text-[0.65rem] text-gray-500 bg-gray-50 border border-gray-200 px-2 py-1 rounded">
                          Between <span className="font-semibold text-gray-700">{lowerTier?.moqRow.moq ?? "—"}</span> and <span className="font-semibold text-gray-700">{upperTier?.moqRow.moq ?? "no upper tier"}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {interstitialResult && parsedQty > 0 ? (
                  <>
                    <div className="grid grid-cols-5 gap-3 mb-4">
                      <div className="rounded p-3 border border-gray-100 bg-gray-50">
                        <p className="text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider mb-1">Cost PPU</p>
                        <p className="text-sm font-bold text-gray-900">{fmt(interstitialResult.ppuCost)}</p>
                      </div>
                      <div className="rounded p-3 border border-[#e8473f]/30 bg-red-50">
                        <p className="text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                          {hasCustomAdj ? "Adj. PPU" : "Customer PPU"}
                        </p>
                        <p className="text-sm font-bold text-[#e8473f]">{fmt(custPPU)}</p>
                        {hasCustomAdj && interstitialResult.ppuCustomer > 0 && (
                          <p className="text-[0.6rem] text-gray-400 mt-0.5">was {fmt(interstitialResult.ppuCustomer)}</p>
                        )}
                      </div>
                      <div className="rounded p-3 border border-gray-100 bg-gray-50">
                        <p className="text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider mb-1">Margin</p>
                        <p className={`text-sm font-bold ${custMarginPct < 0 ? "text-red-500" : "text-gray-900"}`}>{fmtPct(custMarginPct)}</p>
                        {hasCustomAdj && (
                          <p className="text-[0.6rem] text-gray-400 mt-0.5">
                            was {fmtPct(interstitialResult.totalCustomer > 0 ? ((interstitialResult.totalCustomer - interstitialResult.totalOur) / interstitialResult.totalCustomer) * 100 : 0)}
                          </p>
                        )}
                      </div>
                      <div className="rounded p-3 border border-gray-100 bg-gray-50">
                        <p className="text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider mb-1">Δ PPU</p>
                        {hasCustomAdj ? (
                          <p className={`text-sm font-bold ${custPPU - interstitialResult.ppuCustomer > 0 ? "text-green-600" : custPPU - interstitialResult.ppuCustomer < 0 ? "text-red-500" : "text-gray-400"}`}>
                            {custPPU - interstitialResult.ppuCustomer > 0 ? "+" : ""}{fmt(custPPU - interstitialResult.ppuCustomer)}
                          </p>
                        ) : <p className="text-sm font-bold text-gray-300">—</p>}
                      </div>
                      <div className="rounded p-3 border border-gray-100 bg-gray-50">
                        <p className="text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider mb-1">Total Revenue</p>
                        <p className="text-sm font-bold text-gray-900">{fmt(custTotal)}</p>
                        {hasCustomAdj && (
                          <p className="text-[0.6rem] text-gray-400 mt-0.5">was {fmt(interstitialResult.totalCustomer)}</p>
                        )}
                      </div>
                    </div>
                    {(lowerTier || upperTier) && !belowMin && (
                      <div className="mb-4">
                        <p className="text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider mb-2">Comparison vs MOQ Tiers</p>
                        <table className="w-full border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="py-1.5 px-2 text-left text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider">Tier</th>
                              <th className="py-1.5 px-2 text-right text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider">MOQ</th>
                              <th className="py-1.5 px-2 text-right text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider">Cost PPU</th>
                              <th className="py-1.5 px-2 text-right text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider">vs Custom</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              lowerTier ? { label: "Lower tier", tier: lowerTier } : null,
                              { label: `Custom (${parsedQty.toLocaleString()})`, tier: null },
                              upperTier ? { label: "Upper tier", tier: upperTier } : null,
                            ].filter(Boolean).map((row) => {
                              const tierPpuCost = row!.tier?.ppuCost ?? interstitialResult.ppuCost;
                              const diff = tierPpuCost - interstitialResult.ppuCost;
                              const isCustomRow = !row!.tier;
                              return (
                                <tr key={row!.label} className={`border-b border-gray-50 ${isCustomRow ? "bg-red-50/50 font-semibold" : ""}`}>
                                  <td className="py-1.5 px-2 text-gray-700">{row!.label}</td>
                                  <td className="py-1.5 px-2 text-right text-gray-700">{isCustomRow ? parsedQty.toLocaleString() : parseInt(row!.tier!.moqRow.moq).toLocaleString()}</td>
                                  <td className="py-1.5 px-2 text-right text-gray-700">{fmt(tierPpuCost)}</td>
                                  <td className="py-1.5 px-2 text-right">{isCustomRow ? <span className="text-gray-400">—</span> : <span className={diff > 0 ? "text-red-500" : "text-green-600"}>{diff > 0 ? "+" : ""}{fmt(diff)}</span>}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <details className="group">
                      <summary className="cursor-pointer text-[0.65rem] font-semibold text-gray-400 hover:text-gray-600 uppercase tracking-wider select-none list-none flex items-center gap-1">
                        <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                        Full cost breakdown ({parsedQty.toLocaleString()} units)
                      </summary>
                      <table className="w-full border-collapse mt-2">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="py-1.5 px-2 text-left text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider">Line Item</th>
                            <th className="py-1.5 px-2 text-right text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider">Our Cost</th>
                            <th className="py-1.5 px-2 text-right text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider">Cost PPU</th>
                            <th className="py-1.5 px-2 text-right text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider">Customer Price</th>
                            <th className="py-1.5 px-2 text-right text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider">Cust. PPU</th>
                            <th className="py-1.5 px-2 text-right text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider">Margin %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {interstitialResult.summaryRows.map((row) => (
                            <tr key={row.label} className="border-b border-gray-50 hover:bg-gray-50/50">
                              <td className="py-1.5 px-2 text-xs text-gray-700">{row.label}</td>
                              <td className="py-1.5 px-2 text-right text-xs text-gray-700">{fmt(row.ourCosts)}</td>
                              <td className="py-1.5 px-2 text-right text-xs text-gray-400">{fmt(row.ourCosts / parsedQty)}</td>
                              <td className="py-1.5 px-2 text-right text-xs text-gray-700">{fmt(row.customerPrice)}</td>
                              <td className="py-1.5 px-2 text-right text-xs text-gray-400">{fmt(row.customerPrice / parsedQty)}</td>
                              <td className="py-1.5 px-2 text-right text-xs text-gray-700">{fmtPct(calcMargin(row.customerPrice, row.ourCosts))}</td>
                            </tr>
                          ))}
                          <tr className="border-t-2 border-gray-900 bg-sky-50">
                            <td className="py-2 px-2 text-xs font-bold text-gray-900 italic">TOTALS</td>
                            <td className="py-2 px-2 text-right text-xs font-bold text-gray-900">{fmt(interstitialResult.totalOur)}</td>
                            <td className="py-2 px-2 text-right text-xs font-bold text-gray-900">{fmt(interstitialResult.ppuCost)}</td>
                            <td className="py-2 px-2 text-right text-xs font-bold text-gray-900">{fmt(interstitialResult.totalCustomer)}</td>
                            <td className="py-2 px-2 text-right text-xs font-bold text-gray-900">{fmt(interstitialResult.ppuCustomer)}</td>
                            <td className="py-2 px-2 text-right text-xs font-bold text-gray-900">{fmtPct(calcMargin(interstitialResult.totalCustomer, interstitialResult.totalOur))}</td>
                          </tr>
                        </tbody>
                      </table>
                    </details>
                  </>
                ) : parsedQty > 0 ? (
                  <p className="text-xs text-gray-400 italic">No column data available to calculate.</p>
                ) : (
                  <p className="text-xs text-gray-400 italic">Enter a quantity above to see pricing.</p>
                )}
              </div>
            </div>
          </>
        )}

      </div>

      {crmStatus === "error" && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs font-medium px-4 py-2 rounded-lg shadow-lg">
          {crmError || "Failed to push to CRM"}
          <button type="button" onClick={() => setCrmStatus("idle")} className="text-red-400 hover:text-red-700 text-sm leading-none ml-1">×</button>
        </div>
      )}
    </main>
  );
}
