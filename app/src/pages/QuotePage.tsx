import { useState } from "react";
import { Check, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect } from "react";
import Navbar from "@/components/navbar/Navbar";
import DatePicker from "@/components/ui/DatePicker";
import { useProject } from "@/lib/ProjectContext";
import { QuotePreview, buildQuotePreviews, buildCustomQtyPreview } from "@/lib/generateQuotePDF";
import { generateCoPackingExcel } from "@/lib/generateCoPackingExcel";
import PdfPreviewModal from "@/components/quote/PdfPreviewModal";
import { CustomerInfo } from "@/lib/generateQuotePDF";
import SaveQuoteButton from "@/components/quote/SaveQuoteButton";
import excelLogo     from "@/assets/excel.png";
import { generateQuoteXLSX } from "@/lib/generateQuoteXLSX";
import XlsxMoqModal from "@/components/quote/XlsxMoqModal";
import workdriveLogo from "@/assets/zoho-workdrive.png";
import crmLogo       from "@/assets/zoho-crm.png";
import { calculateProcessHours, computePricingTiers } from "@/lib/coPackingCalculations";
import { qtyWithOverage } from "@/lib/quantityMath";
import { buildQuoteBaseName, buildVersionedQuoteName, nextQuoteRevisionVersion, parseQuoteVersion, quoteFamilyKey } from "@/lib/quoteVersioning";
import { useSectionRequired } from "@/lib/SectionRequiredContext";
import { toGrams } from "@/lib/weightUnits";
import { applyAdjustedRevenueToProjectCostRows, buildProjectCostRows, calculateProjectProcessCosts, ProjectCostRow } from "@/lib/projectCostRows";

const fmt        = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtPct     = (v: number) => `${v.toFixed(1)}%`;
const calcMargin = (price: number, cost: number) => price > 0 ? ((price - cost) / price) * 100 : 0;
const QUOTES_API = "https://jdi-pricing-tool-914416811.development.catalystserverless.com/server/quotes-api/quotes";
const CRM_PUSH_API = "https://jdi-pricing-tool-914416811.development.catalystserverless.com/server/quotes-api/crm/push-quote";
const CRM_PDF_UPLOAD_API = "https://jdi-pricing-tool-914416811.development.catalystserverless.com/server/quotes-api/crm/upload-quote-pdf";
const REVISION_SOURCE_STORAGE_KEY = "jdi_revision_source";
const blobToBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const labelCls = "text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider mb-0.5";
const isPackagingCostRow = (label: string) =>
  label !== "Setup / QA Fee" &&
  label !== "Materials" &&
  label !== "Pallets & Fees" &&
  !label.startsWith("Testing");
const isUnitProcessSpeed = (unit: string) => unit.includes("unit") || unit.includes("batch");
const fmtDays = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtWeeks = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type OverviewRow = { rowIdx: number; desc: string; qty: number | null; total: number; ourCost: number; summaryLabel: string; levelIdx: number | null };

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
    quoteApproval, setQuoteApproval,
    currentUser,
    activeMoqId,
    scenarioA: _scenarioA, scenarioB: _scenarioB, saveScenario: _saveScenario, clearScenarios: _clearScenarios,
    crmAccountId, crmContactId,
    saveState,
    markSaved,
  } = useProject();

  const [generating,      setGenerating]      = useState(false);
  const [previews,        setPreviews]        = useState<QuotePreview[] | null>(null);
  const [activeSummaryMoq, setActiveSummaryMoq] = useState<number>(() => activeMoqId || moqRows[0]?.id || 0);
  const [customPreviewing, setCustomPreviewing] = useState(false);
  const [xlsxModalOpen,   setXlsxModalOpen]   = useState(false);
  const [xlsxGenerating,  setXlsxGenerating]  = useState(false);
  const [bufferUnit,       setBufferUnit]       = useState<"days" | "weeks">("days");
  const [cpXlsxGenerating, setCpXlsxGenerating] = useState(false);
  // CRM push state
  const [crmStatus, setCrmStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [crmError, setCrmError] = useState("");
  // PDF editor regenerate mode
  const [pdfMode, setPdfMode] = useState<"standard" | "copacking" | "custom">("standard");
  // Overview table: expanded rows and process inclusion checkboxes
  const [overviewExpanded, setOverviewExpanded] = useState<Record<number, boolean>>({});
  // "total" = folded into Level 1, "line" = separate line item, "exclude" = not shown
  const [processIncluded, setProcessIncluded] = useState<Record<string, "total" | "line" | "exclude">>({});
  const { notRequired } = useSectionRequired();
  const includeSetup = !notRequired["section-cpo"];
  const includeRawMaterials = !notRequired["section-raw-materials"];
  const includeTesting = !notRequired["section-testing"];
  const includeProcesses = !notRequired["section-processes"];
  const includePackaging = !notRequired["section-packaging-summary"];
  const includePalletization = !notRequired["section-palletization"];
  const includeAdditionalFees = !notRequired["section-additional-costs"];
  const includeSummaryRow = (label: string) => {
    if (label === "Setup / QA Fee") return includeSetup;
    if (label === "Materials") return includeRawMaterials;
    if (label === "Pallets & Fees") return includePalletization;
    if (label.startsWith("Testing")) return includeTesting;
    if (isPackagingCostRow(label)) return includePackaging;
    return true;
  };

  // Addition 5  -- Pricing tiers (computed live)
  const tierResults = coPackingState.tiersEnabled ? computePricingTiers(coPackingState, coPackingProcesses) : [];

  // Co-packing totals
  const cpNaturalTotal   = (() => {
    const minCharge  = coPackingState.minimumJobCharge ?? 0;
    const minApplies = minCharge > 0 && coPackingTotals.totalCustomer < minCharge;
    return minApplies ? minCharge : coPackingTotals.totalCustomer;
  })();
  // Read adjusted PPU from the main page's Price Adjustment section (whatIfPpus[0] for co-packing / no-MOQ mode)
  const cpUnits      = coPackingState.unitsDelivered;
  const cpAdjPpuStr  = whatIfPpus[0];
  const cpAdjPpuVal  = cpAdjPpuStr !== undefined && cpAdjPpuStr !== "" ? parseFloat(cpAdjPpuStr) : 0;
  const cpNaturalPPU = cpUnits > 0 ? cpNaturalTotal / cpUnits : 0;
  const cpHasAdj     = cpAdjPpuVal > 0 && Math.abs(cpAdjPpuVal - cpNaturalPPU) > 0.00001;
  void (cpHasAdj ? cpAdjPpuVal * cpUnits : cpNaturalTotal); // cpAdjRevenue  -- no longer used for PDF routing

  // -- Interstitial pricing --------------------------------------------------
  const [customQty,        setCustomQty]        = useState("");
  const [customPack,       setCustomPack]        = useState("");
  const [customMargin,     setCustomMargin]      = useState("");
  const [customPpuInput,   setCustomPpuInput]    = useState("");
  const [customLastEdited, setCustomLastEdited]  = useState<"margin" | "ppu">("margin");

  const rawActiveSummaryRows = perMoqSummaryRows.get(activeSummaryMoq) ?? summaryRows;
  const activeSummaryRows = rawActiveSummaryRows.filter(row => includeSummaryRow(row.label));
  const activeSummaryTableRows = summaryTableRows.filter(row => row.isLeadTimeSummary || includeSummaryRow(row.label));
  const activeMoqResult   = allMoqResults.find(r => r.moqRow.id === activeSummaryMoq);
  const overviewPpuDenominator = (() => {
    const materialTableRow = activeSummaryTableRows.find(row => row.label === "Materials" && !row.isLeadTimeSummary);
    const materialBaseQty = materialTableRow?.totalUnits ?? null;
    if (materialBaseQty != null && materialBaseQty > 1) return materialBaseQty;

    const firstPackagingRow = activeSummaryTableRows.find(row =>
      !row.isLeadTimeSummary &&
      row.totalUnits != null &&
      row.totalUnits > 1 &&
      isPackagingCostRow(row.label)
    );
    const firstPackagingIndex = activeSummaryTableRows
      .filter(row => !row.isLeadTimeSummary && isPackagingCostRow(row.label))
      .findIndex(row => row.label === firstPackagingRow?.label);
    const firstLevel = firstPackagingIndex >= 0 ? packagingLevels[firstPackagingIndex] : packagingLevels[0];
    const deliveredQty = firstLevel
      ? (firstLevel.cpoRequiredQty ?? firstLevel.units ?? firstPackagingRow?.totalUnits ?? null)
      : firstPackagingRow?.totalUnits ?? null;
    const intakeQty = firstLevel && deliveredQty != null
      ? Math.ceil(deliveredQty * (1 + firstLevel.overageRate / 100))
      : deliveredQty;
    return intakeQty && intakeQty > 0 ? intakeQty : ppuUnits;
  })();

  useEffect(() => {
    if (activeMoqId && activeMoqId !== activeSummaryMoq) setActiveSummaryMoq(activeMoqId);
  }, [activeMoqId, activeSummaryMoq]);

  const totalCustomerPrice = activeSummaryRows.reduce((s, r) => s + r.customerPrice, 0);
  const totalOurCosts      = activeSummaryRows.reduce((s, r) => s + r.ourCosts, 0);

  // Adjusted customer PPU for the active MOQ  -- Price Adjustment (whatIfPpus) takes priority,
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

  // Adjusted revenue  -- MOQ adj PPU takes priority, then no-MOQ whatIfPpus[0], then unadjusted
  const adjustedRevenue = (() => {
    if (activeMoqAdjPPU > 0 && activeMoqResult) return activeMoqAdjPPU * activeMoqResult.ppuDenominator;
    // No-MOQ mode: keep the quote/PDF denominator aligned with Total Project Costs.
    const wiStr0 = whatIfPpus[0];
    if (wiStr0 !== undefined && wiStr0 !== "" && overviewPpuDenominator > 0) {
      const wiPpu = parseFloat(wiStr0);
      if (!isNaN(wiPpu) && wiPpu > 0) return wiPpu * overviewPpuDenominator;
    }
    return totalCustomerPrice;
  })();
  const hasPdfPriceAdjustment = (() => {
    if (activeMoqAdjPPU > 0 && activeMoqResult) return true;
    const wiStr0 = whatIfPpus[0];
    if (wiStr0 === undefined || wiStr0 === "" || overviewPpuDenominator <= 0) return false;
    const wiPpu = parseFloat(wiStr0);
    return !isNaN(wiPpu) && wiPpu > 0;
  })();

  // Compute additional fee costs for the active MOQ
  const additionalFeeCosts = (includeAdditionalFees ? (additionalFees ?? []) : []).map(fee => ({
    ...fee,
    cost: fee.mode === "$" ? fee.amount : adjustedRevenue * fee.amount,
  }));

  // -- Interstitial calc --------------------------------------------------------
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
  const colItems = activeSummaryTableRows.filter(str =>
    !str.isLeadTimeSummary &&
    isPackagingCostRow(str.label) &&
    includeSummaryRow(str.label)
  );
  // Delivered qtys: use totalUnits from summaryTableRows (columns drive this via scaledColumns)
  const deliveredQtys = colItems.map(col => col.totalUnits ?? 0);
  const primaryLevel = packagingLevels[0];
  const primaryProductName = (primaryLevel
    ? (primaryLevel.packagingType === "custom_mode" ? primaryLevel.customTypeName : primaryLevel.packagingType)
    : "") || customer.productName || "";

  const quoteCostProcesses = includeProcesses
    ? coPackingProcesses.filter(proc => (processIncluded[proc.id] ?? "total") !== "exclude")
    : [];
  const quoteUnitWeightG = toGrams(parseFloat(formData.unitWeight) || 0, formData.unitWeightUnit || "g");
  const quoteProcessCostSummary = calculateProjectProcessCosts(quoteCostProcesses, quoteUnitWeightG);
  const quoteProjectCostSummary = buildProjectCostRows({
    formData,
    summaryRows: activeSummaryRows,
    summaryTableRows: activeSummaryTableRows,
    packagingLevels,
    processes: quoteCostProcesses,
    processRows: quoteProcessCostSummary.rows,
    processCostTotals: quoteProcessCostSummary.totals,
    additionalFees: includeAdditionalFees ? additionalFees : [],
    notRequired,
  });
  const quoteProjectCostRows = applyAdjustedRevenueToProjectCostRows(
    quoteProjectCostSummary,
    hasPdfPriceAdjustment ? adjustedRevenue : undefined,
  );

  const overviewRows = (() => {
    const packagingLabels = activeSummaryTableRows
      .filter(row => !row.isLeadTimeSummary && isPackagingCostRow(row.label))
      .map(row => row.label);
    const levelIdxFor = (row: ProjectCostRow) => packagingLabels.indexOf(row.label);
    const levelNameFor = (levelIdx: number, row: ProjectCostRow) => {
      const lvl = packagingLevels[levelIdx];
      return lvl ? (lvl.customLevelName?.trim() || lvl.packagingLevel || lvl.packagingType || row.label) : row.label;
    };
    const descFor = (row: ProjectCostRow, levelIdx: number | null) => {
      if (row.label === "Setup / QA Fee") return "Project Setup, Line Dial-In & Quality Assurance";
      if (row.label === "Pallets & Fees") return "Palletization & Outbound Shipping";
      if (levelIdx === 0) return `Product Filling, Handling, & Intake (receiving, inspection, staging)  -- ${levelNameFor(levelIdx, row)}`;
      if (levelIdx === 1) return `Secondary Packout  -- ${levelNameFor(levelIdx, row)}`;
      return levelIdx != null ? levelNameFor(levelIdx, row) : row.label;
    };
    const isInternalFoldedRow = (row: ProjectCostRow) =>
      row.label === "Material - Total" ||
      row.label === "Project Mgmt Fee" ||
      row.id.startsWith("additional-fee-");
    const foldedIntoSetup = quoteProjectCostRows.filter(row => row.label === "Project Mgmt Fee");
    const foldedIntoLevel1 = quoteProjectCostRows.filter(row =>
      isInternalFoldedRow(row) && row.label !== "Project Mgmt Fee"
    );
    const rows: OverviewRow[] = [];
    let rowIdx = 0;

    quoteProjectCostRows.forEach(row => {
      if (isInternalFoldedRow(row)) return;
      const levelIdx = levelIdxFor(row);
      const isPackagingRow = levelIdx >= 0;
      const setupExtras = row.label === "Setup / QA Fee" ? foldedIntoSetup : [];
      const level1Extras = isPackagingRow && levelIdx === 0 ? foldedIntoLevel1 : [];
      const extras = [...setupExtras, ...level1Extras];
      rows.push({
        rowIdx: rowIdx++,
        desc: descFor(row, isPackagingRow ? levelIdx : null),
        qty: row.deliverableQty ?? row.intakeQty,
        total: row.sellingPrice + extras.reduce((sum, extra) => sum + extra.sellingPrice, 0),
        ourCost: row.ourCost + extras.reduce((sum, extra) => sum + extra.ourCost, 0),
        summaryLabel: row.label,
        levelIdx: isPackagingRow ? levelIdx : null,
      });
    });

    return rows;
  })();

  const overviewLineItems = overviewRows.map(row => ({
    desc: row.desc,
    qty: row.qty,
    total: row.total,
  }));

  const crmProductCodeForDescription = (description: string) => {
    const desc = description.toLowerCase();
    if (desc.includes("project setup") || desc.includes("quality assurance")) return "SETUP";
    if (desc.includes("palletization") || desc.includes("outbound")) return "OUTBOUND-PALLET";
    if (desc.startsWith("product filling") || desc.includes("intake")) return "COPACK-PRIMARY";
    if (desc.startsWith("secondary packout")) return "COPACK-SECONDARY";
    if (desc.includes("inner") || desc.includes("case pack")) return "COPACK-INNERS";
    if (desc.includes("shipper")) return "COPACK-SHIPPERS";
    return "PROCESS";
  };

  const crmLineItems = overviewLineItems.map(item => {
    const qty = item.qty && item.qty > 0 ? item.qty : 1;
    return {
      description: item.desc,
      productCode: crmProductCodeForDescription(item.desc),
      quantity: qty,
      unitPrice: qty > 0 ? item.total / qty : item.total,
      total: item.total,
    };
  });

  const adjPPUforPdf = hasPdfPriceAdjustment && overviewPpuDenominator > 0 ? adjustedRevenue / overviewPpuDenominator : undefined;
  const pdfFileBaseName = saveState.savedQuoteName && !saveState.hasUnsavedChanges
    ? saveState.savedQuoteName
    : buildQuoteBaseName({
      formData,
      customer,
      ppuDenominator: overviewPpuDenominator,
      productNameFallback: primaryProductName,
    });

  const leadTimeScheduleRows = (() => {
    type LeadTimeRow = { label: string; days: number; weeks: number; kind?: "original" | "buffer" | "total" };
    const rows: LeadTimeRow[] = [];

    const processRows = includeProcesses
      ? coPackingProcesses
          .filter((proc) => (processIncluded[proc.id] ?? "total") !== "exclude")
          .map((proc, index) => {
            const totalWeightG = qtyWithOverage(proc.units, proc.overageRate);
            const unitWeightG = toGrams(parseFloat(formData.unitWeight) || 0, formData.unitWeightUnit || "g");
            const unitsRequired = unitWeightG > 0 ? totalWeightG / unitWeightG : totalWeightG;
            const laborQty = isUnitProcessSpeed(proc.processSpeedUnit) ? unitsRequired : totalWeightG;
            let hours = calculateProcessHours(proc, laborQty);
            if (proc.minLaborHrs > 0 && hours < proc.minLaborHrs) hours = proc.minLaborHrs;
            const hoursPerDay = Math.max(proc.hrsPerShift || 7, 1);
            const workingDays = Math.max(proc.workingDays || 5, 1);
            const days = hours / hoursPerDay;
            const weeks = days / workingDays;
            return {
              label: proc.name || `Process ${index + 1}`,
              days,
              weeks,
            };
          })
          .filter((row) => row.weeks > 0)
      : [];

    const processWeeks = processRows.reduce((sum, row) => sum + row.weeks, 0);
    if (processWeeks > 0) {
      rows.push({ label: "Processes", days: processWeeks * 5, weeks: processWeeks });
    }

    const packoutWeeks = Math.max(
      0,
      ...activeSummaryTableRows
        .filter((row) => !row.isLeadTimeSummary && isPackagingCostRow(row.label) && row.leadTimeWeeks != null)
        .map((row) => row.leadTimeWeeks ?? 0)
    );
    if (packoutWeeks > 0) {
      rows.push({ label: "Packout", days: packoutWeeks * 5, weeks: packoutWeeks });
    }

    const originalWeeks = processWeeks + packoutWeeks;
    if (originalWeeks > 0) {
      rows.push({ label: "Original Lead Time", days: originalWeeks * 5, weeks: originalWeeks, kind: "original" });
    }

    const bufferDays = parseFloat(formData.leadTimeBufferDays) || 0;
    const bufferWeeks = bufferDays / 5;
    if (bufferDays > 0) {
      rows.push({ label: "Buffer", days: bufferDays, weeks: bufferWeeks, kind: "buffer" });
    }

    const totalWeeks = originalWeeks + bufferWeeks;
    if (totalWeeks > 0) {
      rows.push({ label: "Final Lead Time", days: totalWeeks * 5, weeks: totalWeeks, kind: "total" });
    }

    return rows;
  })();
  const finalLeadTimeRow = leadTimeScheduleRows.find((row) => row.kind === "total");
  const originalLeadTime = leadTimeScheduleRows.find((row) => row.kind === "original") ?? { days: 0, weeks: 0 };

  const quoteArgs = {
    brandId: selectedBrand, moqResults: allMoqResults, moqMargins: resolvedMoqMargins,
    whatIfPpus, deliveredQtys, primaryProductName,
    summaryRows: activeSummaryRows, summaryTableRows: activeSummaryTableRows, formData, customer,
    overviewLineItems,
    adjustedRevenue: hasPdfPriceAdjustment ? adjustedRevenue : undefined,
    adjustedPPU: adjPPUforPdf,
    ppuDenominator: overviewPpuDenominator,
    leadTimeDaysOverride: finalLeadTimeRow?.days,
    leadTimeWeeksOverride: finalLeadTimeRow?.weeks,
    quoteIdOverride: saveState.crmQuoteNumber || undefined,
    pdfFileBaseName,
  };

  // -- CRM push: derive totals/lead-time for the active MOQ (standard mode) --
  const crmTotalFeeCost  = additionalFeeCosts.reduce((s, f) => s + f.cost, 0);
  const crmGrandOurCost  = totalOurCosts + crmTotalFeeCost;
  const crmGrandCustomer = adjustedRevenue;
  const crmMarginPercent = calcMargin(crmGrandCustomer, crmGrandOurCost);
  const crmLeadTimeWeeks = finalLeadTimeRow?.weeks ?? activeSummaryTableRows.find(r => r.label === "Estimated Total Lead Time")?.leadTimeWeeks ?? 0;
  const quoteApprovalBy = currentUser?.name || quoteApproval.decidedBy || customer.salesRep || customer.name || "Current user";
  const quoteApprovalByEmail = currentUser?.email || quoteApproval.decidedByEmail || "";
  const updateQuoteApproval = (status: "Draft" | "Approved" | "Rejected") => {
    setQuoteApproval(status === "Draft"
      ? { status, decidedAt: "", decidedBy: "", decidedByEmail: "", decidedByCrmUserId: "" }
      : { status, decidedAt: new Date().toISOString(), decidedBy: quoteApprovalBy, decidedByEmail: quoteApprovalByEmail, decidedByCrmUserId: "" });
  };
  const approvalMeta = quoteApproval.status === "Draft" || !quoteApproval.decidedAt
    ? ""
    : `${new Date(quoteApproval.decidedAt).toLocaleDateString()} by ${quoteApproval.decidedBy || quoteApprovalBy}`;

  const currentUserName = currentUser?.name || currentUser?.email || "";
  const buildLocalQuoteData = (meta: Record<string, unknown> = {}) => JSON.stringify({
    moqRows, columns, formData, customer, selectedBrand, crmAccountId, crmContactId,
    packagingLevels, projectType, coPackingState, coPackingProcesses, additionalFees,
    quoteApproval, moqMargins, moqPpuInputs, moqLastEdited, whatIfPpus, costPpuOverrides,
    createdBy: currentUserName,
    modifiedBy: currentUserName,
    savedBy: currentUserName,
    ...meta,
  });
  const fetchExistingQuoteNames = async () => {
    const res = await fetch(QUOTES_API);
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const data: { quote_name: string }[] = await res.json();
    return Array.isArray(data) ? data.map(q => q.quote_name) : [];
  };
  const ensureCurrentSavedVersion = async () => {
    const baseName = buildQuoteBaseName({
      formData,
      customer,
      ppuDenominator: overviewPpuDenominator,
      productNameFallback: primaryProductName,
    });
    const familyKey = quoteFamilyKey(baseName, crmAccountId);
    if (saveState.savedQuoteId && saveState.savedQuoteName && !saveState.hasUnsavedChanges) {
      return {
        id: saveState.savedQuoteId,
        name: saveState.savedQuoteName,
        version: parseQuoteVersion(saveState.savedQuoteName, baseName) || 1,
        baseName,
        familyKey,
      };
    }
    const version = nextQuoteRevisionVersion(
      baseName,
      await fetchExistingQuoteNames(),
      saveState.savedQuoteId && saveState.hasUnsavedChanges ? saveState.savedQuoteName : null,
    );
    const name = buildVersionedQuoteName(baseName, version);
    const res = await fetch(QUOTES_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quote_name: name,
        quote_data: buildLocalQuoteData({
          quoteVersion: version,
          quoteBaseName: baseName,
          quoteFamilyKey: familyKey,
          crmDealId: crmAccountId,
          sentToCrm: false,
        }),
      }),
    });
    if (res.status === 409) throw new Error("A quote with this generated name already exists");
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const saved: { id: string } = await res.json();
    markSaved(saved.id, name);
    return { id: saved.id, name, version, baseName, familyKey };
  };

  const handlePushToCrm = async () => {
    setCrmStatus("sending");
    setCrmError("");
    try {
      const revisionSource = (() => {
        try {
          return JSON.parse(localStorage.getItem(REVISION_SOURCE_STORAGE_KEY) || "null") as {
            crmQuoteId?: string;
            crmQuoteNumber?: string;
            sourceSavedQuoteId?: string;
            sourceSavedQuoteName?: string;
            sourceQuoteVersion?: string | number;
          } | null;
        } catch {
          return null;
        }
      })();
      const localQuote = await ensureCurrentSavedVersion();
      const res = await fetch(CRM_PUSH_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customer.customer,
          contactName:  customer.name,
          phone:        customer.phone,
          email:        customer.email,
          crmAccountId, crmContactId,
          crmDealId: crmAccountId,
          quoteId: localQuote.id,
          quoteName: localQuote.name,
          quoteVersion: localQuote.version,
          quoteFamilyKey: localQuote.familyKey,
          productName: customer.productName || primaryProductName,
          brand: selectedBrand,
          projectType,
          lineItems: crmLineItems,
          ppuDenominator: overviewPpuDenominator,
          pdfDownloadUrlFieldApiName: "PDF_Download_URL",
          approvalStatus: quoteApproval.status,
          approvalDate: quoteApproval.decidedAt,
          approvalBy: quoteApproval.decidedBy,
          approvalByEmail: quoteApproval.decidedByEmail,
          approvalByCrmUserId: quoteApproval.decidedByCrmUserId,
          totalRevenue: crmGrandCustomer,
          adjustedRevenue: hasPdfPriceAdjustment ? adjustedRevenue : undefined,
          ourCost: crmGrandOurCost,
          marginPercent: crmMarginPercent,
          leadTimeWeeks: crmLeadTimeWeeks,
          revisionOfCrmQuoteId: revisionSource?.crmQuoteId || "",
          revisionOfCrmQuoteNumber: revisionSource?.crmQuoteNumber || "",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to push to CRM");
      if (json.quoteEventType === "First Quote" && json.dealStageUpdate && !json.dealStageUpdate.success) {
        const detail = json.dealStageUpdate.message
          || json.dealStageUpdate.error
          || json.dealStageUpdate.reason
          || json.dealStageUpdate.details?.data?.[0]?.message
          || "";
        throw new Error(`CRM Quote created, but Deal stage did not update to Quote Created${detail ? `: ${detail}` : ""}`);
      }
      if (json.approvalStatusUpdate && !json.approvalStatusUpdate.success) {
        const failedAttempt = Array.isArray(json.approvalStatusUpdate.attempts)
          ? json.approvalStatusUpdate.attempts.find((attempt: { success?: boolean }) => !attempt.success)
          : null;
        const detail = json.approvalStatusUpdate.message
          || json.approvalStatusUpdate.error
          || (failedAttempt ? `${failedAttempt.label}: ${failedAttempt.message || "CRM rejected the field value"}` : "")
          || json.approvalStatusUpdate.details?.data?.[0]?.message
          || "";
        throw new Error(`CRM Quote created, but approval fields did not update${detail ? `: ${detail}` : ""}`);
      }

      const crmQuoteNumber = String(json.quoteNumber || json.quoteId || "CRM-QUOTE");
      const [crmPdfPreview] = await buildQuotePreviews({
        ...quoteArgs,
        quoteIdOverride: crmQuoteNumber,
        moqResults: activeMoqResult ? [activeMoqResult] : quoteArgs.moqResults,
      });
      const crmPdfBlob = crmPdfPreview?.doc.output("blob");
      if (crmPdfBlob) {
        const pdfUploadRes = await fetch(CRM_PDF_UPLOAD_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quoteId: json.quoteId,
            quoteNumber: crmQuoteNumber,
            productName: customer.productName || primaryProductName,
            customerName: customer.customer,
            pdfDownloadUrlFieldApiName: "PDF_Download_URL",
            quotePdf: {
              filename: crmPdfPreview.filename,
              contentType: "application/pdf",
              base64: await blobToBase64(crmPdfBlob),
              fieldApiName: "Quote_PDF",
            },
          }),
        });
        const pdfJson = await pdfUploadRes.json();
        if (!pdfUploadRes.ok || !pdfJson.success) {
          const detail = pdfJson.quotePdfAttachment?.message
            || pdfJson.quotePdfUpload?.message
            || pdfJson.error
            || "";
          throw new Error(`CRM Quote created, but PDF upload failed${detail ? `: ${detail}` : ""}`);
        }
      }

      const quoteData = buildLocalQuoteData({
        crmQuoteId: json.quoteId,
        crmQuoteNumber,
        quoteVersion: localQuote.version,
        quoteBaseName: localQuote.baseName,
        quoteFamilyKey: localQuote.familyKey,
        crmDealId: crmAccountId,
        sentToCrm: true,
        revisionOfCrmQuoteId: revisionSource?.crmQuoteId || "",
        revisionOfCrmQuoteNumber: revisionSource?.crmQuoteNumber || "",
        revisionSourceSavedQuoteId: revisionSource?.sourceSavedQuoteId || "",
        revisionSourceSavedQuoteName: revisionSource?.sourceSavedQuoteName || "",
      });
      const saveRes = await fetch(`${QUOTES_API}/${localQuote.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_name: localQuote.name, quote_data: quoteData }),
      });
      if (saveRes.ok) {
        markSaved(localQuote.id, localQuote.name, { crmQuoteId: json.quoteId, crmQuoteNumber });
        try {
          const draft = JSON.parse(localStorage.getItem("jdi_draft_v1") || "{}");
          localStorage.setItem("jdi_draft_v1", JSON.stringify({
            ...draft,
            crmQuoteId: json.quoteId,
            crmQuoteNumber,
            saveState: {
              ...(draft.saveState || {}),
              savedQuoteId: localQuote.id,
              savedQuoteName: localQuote.name,
              crmQuoteId: json.quoteId,
              crmQuoteNumber,
              lastSavedAt: new Date().toISOString(),
            },
          }));
        } catch {
          // Draft persistence is best-effort; the saved quote still contains CRM metadata.
        }
      }
      localStorage.removeItem(REVISION_SOURCE_STORAGE_KEY);
      setCrmStatus("success");
      setTimeout(() => setCrmStatus("idle"), 3000);
    } catch (err) {
      setCrmStatus("error");
      setCrmError(err instanceof Error ? err.message : "Failed to push to CRM");
    }
  };

  const handlePreview = async () => {
    setPdfMode("standard");
    setGenerating(true);
    try {
      setPreviews(await buildQuotePreviews(quoteArgs));
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
    if (pdfMode === "custom") {
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

  const th  = "py-2 px-3 text-left text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider border-b-2 border-gray-900";
  const thr = "py-2 px-3 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider border-b-2 border-gray-900";
  const td  = "py-2 px-3 text-xs text-zinc-800";
  const tdr = "py-2 px-3 text-xs text-right text-zinc-800";

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

        {/* -- Page header -- */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-1 h-5 rounded-full bg-[#e8473f] shrink-0" />
              <div>
                <h1 className="text-sm font-semibold text-zinc-950 tracking-tight leading-none">Quote Overview</h1>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span className="text-[0.65rem] text-zinc-600">Review pricing and export the quote</span>
                  <span className={`text-[0.6rem] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    quoteApproval.status === "Approved"
                      ? "bg-green-50 border-green-200 text-green-700"
                      : quoteApproval.status === "Rejected"
                        ? "bg-red-50 border-red-200 text-red-700"
                        : "bg-gray-50 border-gray-200 text-zinc-600"
                  }`}>
                    {quoteApproval.status}
                  </span>
                  {approvalMeta && <span className="text-[0.65rem] text-zinc-500">{approvalMeta}</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={quoteApproval.status}
                onChange={(e) => updateQuoteApproval(e.target.value as "Draft" | "Approved" | "Rejected")}
                className="h-7 rounded-lg border border-gray-200 bg-white px-2 text-xs font-medium text-zinc-700 focus:outline-none focus:ring-1 focus:ring-[#e8473f]"
                title="Quote status"
              >
                <option value="Draft">Draft</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
          </div>
          {crmStatus === "error" && (
            <div className="mt-3 flex items-start justify-between gap-3 bg-red-50 border border-red-200 text-red-700 text-xs font-medium px-4 py-2 rounded-lg shadow-sm">
              <span>{crmError || "Failed to push to CRM"}</span>
              <button type="button" onClick={() => setCrmStatus("idle")} className="text-red-400 hover:text-red-700 text-sm leading-none">x</button>
            </div>
          )}

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
              {generating ? "Generating..." : projectType === "copacking" ? "Preview & Export" : allMoqResults.length > 0 ? `Preview & Export (${allMoqResults.length})` : "Preview & Export"}
            </button>
            <SaveQuoteButton
              quotePageState={{ customer, selectedBrand, moqMargins, moqPpuInputs, moqLastEdited, whatIfPpus, costPpuOverrides, additionalFees, quoteApproval }}
              disabled={projectType === "standard" && hasMoqErrors}
              disabledReason={hasMoqErrors ? "Fix MOQ configuration errors before saving" : undefined}
            />
            {projectType === "standard" && (
              <button
                type="button"
                onClick={() => {
                  if (allMoqResults.length === 0) {
                    // No MOQ rows  -- export directly with a synthetic base-quote row
                    const totalCustomer = activeSummaryRows.reduce((s, r) => s + r.customerPrice, 0);
                    const totalOur      = activeSummaryRows.reduce((s, r) => s + r.ourCosts, 0);
                    const denom         = parseFloat(formData.ppuDenominator) || 1;
                    const baseRow = {
                      moqRow: { id: 0, moq: "Base", individualUnits: String(denom), unitsPerInner: "0", innersPerMaster: "0" },
                      casePack: " --", totalCustomerPrice: totalCustomer, totalOurCost: totalOur,
                      ppuDenominator: denom, ppu: totalCustomer / denom, ppuCost: totalOur / denom,
                      marginDollars: totalCustomer - totalOur,
                      marginPct: totalCustomer > 0 ? ((totalCustomer - totalOur) / totalCustomer) * 100 : 0,
                    };
                    const syntheticMap = new Map([[-1, activeSummaryRows]]);
                    setXlsxGenerating(true);
                    generateQuoteXLSX({ formData, columns, allMoqResults: [baseRow], perMoqSummaryRows: syntheticMap, customer, selectedBrand, moqMargins: {}, selectedMoq: baseRow, primaryProductName, primaryDelivQty: deliveredQtys[0] ?? 0 })
                      .finally(() => setXlsxGenerating(false));
                  } else {
                    setXlsxModalOpen(true);
                  }
                }}
                disabled={xlsxGenerating || hasMoqErrors}
                title={hasMoqErrors ? "Fix MOQ configuration errors before exporting" : undefined}
                className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 text-zinc-700 text-xs font-medium px-3 h-7 rounded-lg transition-colors"
              >
                <img src={excelLogo} alt="Excel" className="w-3 h-3 object-contain" />
                {xlsxGenerating ? "..." : ".xlsx"}
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
                className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 text-zinc-700 text-xs font-medium px-3 h-7 rounded-lg transition-colors"
              >
                <img src={excelLogo} alt="Excel" className="w-3 h-3 object-contain" />
                {cpXlsxGenerating ? "Generating..." : ".xlsx"}
              </button>
            )}
            <button type="button" className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-zinc-700 text-xs font-medium px-3 h-7 rounded-lg transition-colors">
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
                  : "border-gray-200 bg-white hover:bg-gray-50 text-zinc-700"
              }`}
            >
              {crmStatus === "success" ? (
                <>
                  <Check size={13} />
                  Sent to CRM
                </>
              ) : (
                <>
                  <img src={crmLogo} alt="CRM" className="w-3 h-3 object-contain" />
                  {crmStatus === "sending" ? "Sending..." : "CRM"}
                </>
              )}
            </button>
          </div>
        </div>

        {/* -- Overview Table -- */}
        {activeSummaryRows.length > 0 && (() => {
          const fmtPPU2 = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const fmtQty0 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });

          // summaryTableRows lookup for qty/units
          const strByLabel = (label: string) => activeSummaryTableRows.find(s => !s.isLeadTimeSummary && s.label === label);

          // Packaging level rows (everything not Setup/Materials/Testing/Pallets)
          const levelRows = activeSummaryRows.filter(r =>
            r.label !== "Setup / QA Fee" && r.label !== "Materials" && r.label !== "Pallets & Fees"
            && !r.label.startsWith("Testing")
          );

          // Detail sections and manual charges
          const detailForLabel = (label: string) => detailSections.find(s => s.title === label);
          const manualChargesForLevelIdx = (lvlIdx: number) => {
            const lvl = packagingLevels[lvlIdx];
            if (!lvl?.manualCharges?.length) return [];
            const str = strByLabel(levelRows[lvlIdx]?.label ?? "");
            const baseUnits = str?.totalUnits ?? 0;
            const unitsWithOvg = Math.ceil(baseUnits * (1 + (lvl.overageRate ?? 0) / 100));
            return lvl.manualCharges.map(c => ({
              label: c.name || "Manual Charge",
              amount: c.basis === "per_unit" ? c.amount * unitsWithOvg : c.amount,
            }));
          };

          const rows = overviewRows;
          const grandTotal = rows.reduce((s, r) => s + r.total, 0);
          const includedProcesses = quoteCostProcesses;
          const procCosts = quoteProcessCostSummary.rows.map(row => ({
            ourCost: row.laborOur,
            custCost: row.laborCust,
            hrsRequired: row.laborOur > 0 ? row.laborOur / ((quoteCostProcesses[quoteProcessCostSummary.rows.indexOf(row)]?.laborRate || 1) * (quoteCostProcesses[quoteProcessCostSummary.rows.indexOf(row)]?.numStaff || 1)) : 0,
          }));
          const hasProcesses = includedProcesses.length > 0;

          return (
            <div className="border border-gray-100 rounded-sm overflow-x-auto mb-4">
              <div className="bg-gray-50 border-b border-gray-100 px-3 py-2">
                <span className="text-xs font-semibold text-black uppercase tracking-wide">Overview</span>
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className={th} style={{ width: 28 }} />
                    <th className={th}>Description</th>
                    <th className={thr}>Delivered Qty</th>
                    <th className={thr}>PPU</th>
                    <th className={thr}>Total</th>
                    <th className={thr}>Project Cost</th>
                    <th className={thr}>Margin $</th>
                    <th className={thr}>Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const ppu = row.qty && row.qty > 0 ? row.total / row.qty : row.total;
                    const marginDollars = row.total - row.ourCost;
                    const marginPct = row.total > 0 ? (marginDollars / row.total) * 100 : 0;
                    const isExpanded = !!overviewExpanded[row.rowIdx];
                    const detail = row.levelIdx !== null ? detailForLabel(row.summaryLabel) : null;
                    const charges = row.levelIdx !== null ? manualChargesForLevelIdx(row.levelIdx) : [];
                    const isLevel1 = row.levelIdx === 0;
                    const hasDetail = !!(detail || charges.length > 0 || (isLevel1 && hasProcesses));

                    return (
                      <>
                        <tr key={row.rowIdx} className="border-b border-gray-100 hover:bg-gray-50/50">
                          <td className="px-2 py-2 text-center">
                            {hasDetail && (
                              <button type="button"
                                onClick={() => setOverviewExpanded(e => ({ ...e, [row.rowIdx]: !e[row.rowIdx] }))}
                                className="text-zinc-600 hover:text-zinc-800 transition-colors text-[0.65rem]">
                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>
                            )}
                          </td>
                          <td className={td + " font-medium"}>{row.desc}</td>
                          <td className={tdr}>{row.qty != null ? fmtQty0(row.qty) : " --"}</td>
                          <td className={tdr}>{ppu > 0 ? fmtPPU2(ppu) : " --"}</td>
                          <td className={tdr}>{fmt(row.total)}</td>
                          <td className={tdr}>{fmt(row.ourCost)}</td>
                          <td className={`${tdr} ${marginDollars >= 0 ? "text-green-700" : "text-red-500"}`}>{fmt(marginDollars)}</td>
                          <td className={`${tdr} ${marginPct >= 0 ? "text-green-700" : "text-red-500"}`}>{fmtPct(marginPct)}</td>
                        </tr>

                        {/* -- Breakdown dropdown -- */}
                        {isExpanded && hasDetail && (
                          <tr key={`${row.rowIdx}-detail`} className="border-b border-gray-100">
                            <td />
                            <td colSpan={7} className="px-4 py-2 bg-gray-50/60">
                              <div className="space-y-1">

                                {/* Detail section rows (packaging cost breakdown) */}
                                {detail?.rows.filter(dr => dr.isCurrency && (dr.projectDetails ?? 0) > 0).map((dr, di) => (
                                  <div key={di} className="flex items-center justify-between text-[0.68rem] text-zinc-700">
                                    <span className="text-zinc-600">{dr.label}</span>
                                    <div className="flex gap-6 tabular-nums">
                                      {dr.projectCosts != null && dr.projectCosts > 0 && (
                                        <span className="text-zinc-600">Our: {fmt(dr.projectCosts)}</span>
                                      )}
                                      {dr.projectDetails != null && <span className="font-semibold text-zinc-900">{fmt(dr.projectDetails)}</span>}
                                    </div>
                                  </div>
                                ))}

                                {/* Processes (Level 1 only) */}
                                {isLevel1 && hasProcesses && (
                                  <>
                                    <div className="border-t border-gray-200 my-1.5" />
                                    <div className="text-[0.58rem] font-bold text-zinc-600 uppercase tracking-widest mb-1.5">Processes</div>
                                    {/* Header */}
                                    <div className="grid text-[0.58rem] font-semibold text-zinc-600 uppercase tracking-wider mb-1 pr-1" style={{ gridTemplateColumns: "1fr 80px 80px 80px auto" }}>
                                      <span>Name</span>
                                      <span className="text-right">Hrs</span>
                                      <span className="text-right">Project Cost</span>
                                      <span className="text-right">Customer</span>
                                      <span className="text-center">Include As</span>
                                    </div>
                                    {includedProcesses.map((proc, pi) => {
                                      const pc = procCosts[pi];
                                      const mode = processIncluded[proc.id] ?? `total`;
                                      const procOpts = [
                                        { val: "total",   label: "Total",   title: "Fold into Level 1 total" },
                                        { val: "line",    label: "Line",    title: "Show as separate line item" },
                                        { val: "exclude", label: "Exclude", title: "Do not include in quote" },
                                      ];
                                      return (
                                        <div key={proc.id} className="grid items-center gap-1 py-1 border-b border-gray-100 last:border-0 pr-1" style={{ gridTemplateColumns: "1fr 80px 80px 80px auto" }}>
                                          <span className={`text-[0.7rem] font-medium truncate ${mode === "exclude" ? "text-zinc-600 line-through" : "text-zinc-800"}`}>
                                            {proc.name || `Process ${pi + 1}`}
                                          </span>
                                          <span className="text-[0.68rem] text-right tabular-nums text-zinc-600">{pc.hrsRequired > 0 ? pc.hrsRequired.toFixed(1) : "--"}</span>
                                          <span className="text-[0.68rem] text-right tabular-nums text-zinc-700">{pc.ourCost > 0 ? fmt(pc.ourCost) : "--"}</span>
                                          <span className="text-[0.68rem] text-right tabular-nums font-semibold text-zinc-900">{pc.custCost > 0 ? fmt(pc.custCost) : "--"}</span>
                                          <div className="flex items-center gap-0 border border-gray-200 rounded overflow-hidden">
                                            {procOpts.map(opt => (
                                              <button key={opt.val} type="button" title={opt.title}
                                                onClick={() => setProcessIncluded(prev => ({ ...prev, [proc.id]: opt.val } as Record<string, "total" | "line" | "exclude">))}
                                                className={`px-1.5 py-0.5 text-[0.58rem] font-semibold transition-colors border-r border-gray-100 last:border-r-0 ${
                                                  mode === opt.val
                                                    ? opt.val === "exclude" ? "bg-gray-500 text-white" : "bg-[#e8473f] text-white"
                                                    : "text-zinc-600 hover:text-zinc-800 bg-white"
                                                }`}>
                                                {opt.label}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </>
                                )}

                                {/* Manual charges */}
                                {charges.length > 0 && (
                                  <>
                                    <div className="border-t border-gray-200 my-1.5" />
                                    <div className="text-[0.58rem] font-bold text-zinc-600 uppercase tracking-widest mb-1">Manual Charges</div>
                                    {charges.map((c, ci) => (
                                      <div key={ci} className="flex items-center justify-between text-[0.68rem] text-zinc-700">
                                        <span className="text-zinc-600">{c.label}</span>
                                        <span className="font-semibold text-zinc-900 tabular-nums">{fmt(c.amount)}</span>
                                      </div>
                                    ))}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                  <tr className="border-t-2 border-gray-900 bg-sky-50 font-bold">
                    <td />
                    <td className={`${td} font-bold italic`}>TOTAL</td>
                    <td /><td />
                    <td className={`${tdr} font-bold`}>{fmt(grandTotal)}</td>
                    <td className={`${tdr} font-bold`}>{fmt(rows.reduce((s, r) => s + r.ourCost, 0))}</td>
                    <td className={`${tdr} font-bold text-green-700`}>{fmt(grandTotal - rows.reduce((s, r) => s + r.ourCost, 0))}</td>
                    <td className={`${tdr} font-bold text-green-700`}>{fmtPct(grandTotal > 0 ? ((grandTotal - rows.reduce((s, r) => s + r.ourCost, 0)) / grandTotal) * 100 : 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })()}

        {activeSummaryRows.length > 0 && (
          <div className="w-full max-w-3xl border border-gray-100 rounded-sm overflow-hidden mb-4">
            <div className="bg-gray-50 border-b border-gray-100 px-3 py-2 flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold text-black uppercase tracking-wide shrink-0">Timeline & Delivery</span>
              <div className="ml-auto flex items-center gap-0 h-8 border border-gray-200 overflow-hidden bg-white">
                <span className="text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider whitespace-nowrap px-2 bg-gray-50 h-full flex items-center border-r border-gray-200">
                  Start Date
                </span>
                <div className="w-36">
                  <DatePicker
                    value={formData.startDate}
                    onChange={(v) => setFormField("startDate", v)}
                    placeholder="Pick date"
                  />
                </div>
              </div>
            </div>
            <table className="w-full border-collapse table-fixed">
              <thead>
                <tr className="bg-gray-50">
                  <th className="py-2 px-3 text-left text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider border-b-2 border-gray-900">Section</th>
                  <th className="py-2 px-3 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider border-b-2 border-gray-900 w-32">Days</th>
                  <th className="py-2 px-3 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider border-b-2 border-gray-900 w-32">Weeks</th>
                </tr>
              </thead>
              <tbody>
                {leadTimeScheduleRows.length === 0 ? (
                  <tr className="border-b border-gray-100">
                    <td colSpan={3} className="py-3 px-3 text-xs text-zinc-600 italic">
                      No process or packout lead time has been calculated yet.
                    </td>
                  </tr>
                ) : leadTimeScheduleRows.map((row) => (
                  <tr
                    key={row.label}
                    className={`border-b border-gray-100 last:border-0 ${
                      row.kind === "total" ? "bg-sky-50 font-bold border-t-2 border-gray-900" : row.kind === "original" ? "bg-gray-50 font-semibold border-t border-gray-200" : row.kind === "buffer" ? "bg-amber-50/40" : "hover:bg-gray-50/50"
                    }`}
                  >
                    <td className={`${td} ${row.kind === "total" ? "font-bold italic" : row.kind === "original" ? "font-semibold italic" : "font-medium"}`}>{row.label}</td>
                    <td className={`${tdr} ${row.kind === "total" || row.kind === "original" ? "font-bold" : ""}`}>{fmtDays(row.days)}</td>
                    <td className={`${tdr} ${row.kind === "total" || row.kind === "original" ? "font-bold" : "font-semibold"}`}>{fmtWeeks(row.weeks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="bg-gray-50 border-t border-gray-100 px-3 py-3 flex items-center gap-3 flex-wrap">
              <span className="text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider whitespace-nowrap">
                Lead Time Buffer
              </span>
              <div className="flex items-center h-9 border border-gray-200 overflow-hidden bg-white">
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
                  className="w-28 h-full px-3 text-sm text-right bg-white border-r border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#e8473f] font-semibold"
                  placeholder="0"
                  step={bufferUnit === "weeks" ? "0.5" : "1"}
                />
                {(["days", "weeks"] as const).map((u) => (
                  <button
                    type="button"
                    key={u}
                    onClick={() => setBufferUnit(u)}
                    className={`h-9 px-3 text-[0.65rem] font-semibold transition-colors ${
                      bufferUnit === u ? "bg-[#e8473f] text-white" : "text-zinc-600 hover:text-zinc-800 bg-white"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
              <div className="ml-auto grid grid-cols-2 gap-2">
                <div className="min-w-44 border border-gray-200 bg-white px-3 py-2">
                  <div className="text-[0.58rem] font-semibold uppercase tracking-wider text-zinc-500">Original Lead Time</div>
                  <div className="mt-1 text-xs font-bold text-zinc-900">
                    {fmtDays(originalLeadTime.days)} days
                    <span className="mx-1 text-zinc-300">/</span>
                    {fmtWeeks(originalLeadTime.weeks)} weeks
                  </div>
                </div>
                <div className="min-w-44 border border-sky-200 bg-sky-50 px-3 py-2">
                  <div className="text-[0.58rem] font-semibold uppercase tracking-wider text-sky-700">Final Lead Time</div>
                  <div className="mt-1 text-xs font-bold text-zinc-950">
                    {fmtDays(finalLeadTimeRow?.days ?? originalLeadTime.days)} days
                    <span className="mx-1 text-sky-300">/</span>
                    {fmtWeeks(finalLeadTimeRow?.weeks ?? originalLeadTime.weeks)} weeks
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* -- Tiers + Scenario -- */}
        {(<>

          {/* -- Addition 5  -- Pricing Tiers comparison table -- */}
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
                      <th key={tr.tier.id} className={thr}>{tr.tier.label}<br /><span className="font-normal text-zinc-600">{tr.tier.units.toLocaleString()} units</span></th>
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
                        return <td key={tr.tier.id} className={tdr}>{r ? fmt(r.customerPrice) : " --"}</td>;
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
                            {i === 0 ? " --" : (
                              <span className={tr.ppu < pilotPPU ? "text-green-600 font-semibold" : "text-zinc-600"}>
                                {tr.ppu < pilotPPU ? `-${fmt(pilotPPU - tr.ppu)}/unit` : " --"}
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

        </>)}

        {/* Lead Time + Custom Quantity Pricing removed */}
        {(false as boolean) && (
          <>
            {/* MOQ switcher row */}
            {allMoqResults.length > 0 && (
              <div className="flex items-center gap-2 px-4 mb-3 flex-wrap">
                <span className="text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider shrink-0">MOQ:</span>
                {allMoqResults.map((r) => (
                  <button
                    type="button"
                    key={r.moqRow.id}
                    onClick={() => setActiveSummaryMoq(r.moqRow.id)}
                    className={`h-5 px-2 text-[0.6rem] font-semibold rounded-full transition-colors whitespace-nowrap ${
                      r.moqRow.id === activeSummaryMoq
                        ? "bg-[#e8473f] text-white"
                        : "bg-gray-100 text-zinc-600 hover:bg-gray-200"
                    }`}
                  >
                    {r.moqRow.moq || " --"} MOQ  -  {r.casePack}pk
                  </button>
                ))}
                {activeMoqResult && (
                  <span className="ml-auto text-[0.6rem] text-zinc-600 whitespace-nowrap">
                    Cost PPU: <span className="font-semibold text-zinc-700">{fmt(activeMoqResult.ppuCost)}</span>
                  </span>
                )}
              </div>
            )}

            {/* -- Lead Time -- */}
            {summaryTableRows.some(r => r.leadTimeWeeks != null) && (
              <div className="border border-gray-100 rounded-sm overflow-hidden mb-4">
                <div className="bg-gray-50 border-b border-gray-100 px-3 py-2">
                  <span className="text-xs font-semibold text-black uppercase tracking-wide">Lead Time</span>
                </div>
                <div className="p-4">
                  <table className="w-full border-collapse mb-3">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-1.5 px-2 text-left text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Component</th>
                        <th className="py-1.5 px-2 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Prod. Days</th>
                        <th className="py-1.5 px-2 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Total Wks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryTableRows.filter(r => r.leadTimeWeeks != null && !r.isLeadTimeSummary).map((r) => (
                        <tr key={r.label} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="py-1.5 px-2 text-xs text-zinc-800">{r.label}</td>
                          <td className="py-1.5 px-2 text-right text-xs text-zinc-600">{(r.leadTimeWeeks! * 5).toFixed(1)}</td>
                          <td className="py-1.5 px-2 text-right text-xs font-semibold text-zinc-950">{r.leadTimeWeeks!.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="border border-gray-100 rounded-sm overflow-hidden">
                    {summaryTableRows.filter(r => r.isLeadTimeSummary).map((r) => {
                      const isTotal = r.label === "Estimated Total Lead Time";
                      return (
                        <div key={r.label} className={`flex items-center justify-between px-3 py-2 border-b border-gray-100 last:border-0 ${isTotal ? "bg-blue-50/60" : "bg-gray-50/40"}`}>
                          <span className={`text-xs ${isTotal ? "font-semibold text-zinc-950" : "text-zinc-600"}`}>{r.label}</span>
                          <span className={`text-xs ${isTotal ? "font-bold text-zinc-950" : "text-zinc-700"}`}>
                            {r.leadTimeWeeks != null ? `${r.leadTimeWeeks.toFixed(2)} wks` : " --"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* -- Custom Quantity Pricing -- */}
            <div className="border border-gray-100 rounded-sm overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-100 px-3 py-2 flex items-center gap-2">
                <span className="text-xs font-semibold text-black uppercase tracking-wide">Custom Quantity Pricing</span>
                <span className="text-[0.6rem] text-zinc-600"> -- calculate price for a quantity between MOQ breakpoints</span>
                <button
                  type="button"
                  onClick={handleCustomPreview}
                  disabled={customPreviewing || !interstitialResult || parsedQty <= 0}
                  className="ml-auto flex items-center gap-1.5 h-6 px-3 text-[0.65rem] font-semibold bg-[#e8473f] hover:bg-[#d43f37] disabled:opacity-40 text-white rounded-lg transition-colors whitespace-nowrap"
                >
                  <FileText size={11} />
                  {customPreviewing ? "Generating..." : "Preview Quote"}
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
                      <span className="text-xs text-zinc-600">%</span>
                    </div>
                  </div>
                  <div>
                    <p className={labelCls}>Adj. PPU</p>
                    <div className="flex items-center h-8 gap-1">
                      <span className="text-xs text-zinc-600">$</span>
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
                        <span className="text-[0.65rem] text-zinc-600 bg-gray-50 border border-gray-200 px-2 py-1 rounded">
                          Between <span className="font-semibold text-zinc-800">{lowerTier?.moqRow.moq ?? " --"}</span> and <span className="font-semibold text-zinc-800">{upperTier?.moqRow.moq ?? "no upper tier"}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {interstitialResult && parsedQty > 0 ? (
                  <>
                    <div className="grid grid-cols-5 gap-3 mb-4">
                      <div className="rounded p-3 border border-gray-100 bg-gray-50">
                        <p className="text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider mb-1">Cost PPU</p>
                        <p className="text-sm font-bold text-zinc-950">{fmt(interstitialResult.ppuCost)}</p>
                      </div>
                      <div className="rounded p-3 border border-[#e8473f]/30 bg-red-50">
                        <p className="text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider mb-1">
                          {hasCustomAdj ? "Adj. PPU" : "Customer PPU"}
                        </p>
                        <p className="text-sm font-bold text-[#e8473f]">{fmt(custPPU)}</p>
                        {hasCustomAdj && interstitialResult.ppuCustomer > 0 && (
                          <p className="text-[0.6rem] text-zinc-600 mt-0.5">was {fmt(interstitialResult.ppuCustomer)}</p>
                        )}
                      </div>
                      <div className="rounded p-3 border border-gray-100 bg-gray-50">
                        <p className="text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider mb-1">Margin</p>
                        <p className={`text-sm font-bold ${custMarginPct < 0 ? "text-red-500" : "text-zinc-950"}`}>{fmtPct(custMarginPct)}</p>
                        {hasCustomAdj && (
                          <p className="text-[0.6rem] text-zinc-600 mt-0.5">
                            was {fmtPct(interstitialResult.totalCustomer > 0 ? ((interstitialResult.totalCustomer - interstitialResult.totalOur) / interstitialResult.totalCustomer) * 100 : 0)}
                          </p>
                        )}
                      </div>
                      <div className="rounded p-3 border border-gray-100 bg-gray-50">
                        <p className="text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider mb-1">Î` PPU</p>
                        {hasCustomAdj ? (
                          <p className={`text-sm font-bold ${custPPU - interstitialResult.ppuCustomer > 0 ? "text-green-600" : custPPU - interstitialResult.ppuCustomer < 0 ? "text-red-500" : "text-zinc-600"}`}>
                            {custPPU - interstitialResult.ppuCustomer > 0 ? "+" : ""}{fmt(custPPU - interstitialResult.ppuCustomer)}
                          </p>
                        ) : <p className="text-sm font-bold text-zinc-500"> --</p>}
                      </div>
                      <div className="rounded p-3 border border-gray-100 bg-gray-50">
                        <p className="text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider mb-1">Total Revenue</p>
                        <p className="text-sm font-bold text-zinc-950">{fmt(custTotal)}</p>
                        {hasCustomAdj && (
                          <p className="text-[0.6rem] text-zinc-600 mt-0.5">was {fmt(interstitialResult.totalCustomer)}</p>
                        )}
                      </div>
                    </div>
                    {(lowerTier || upperTier) && !belowMin && (
                      <div className="mb-4">
                        <p className="text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider mb-2">Comparison vs MOQ Tiers</p>
                        <table className="w-full border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="py-1.5 px-2 text-left text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Tier</th>
                              <th className="py-1.5 px-2 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">MOQ</th>
                              <th className="py-1.5 px-2 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Cost PPU</th>
                              <th className="py-1.5 px-2 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">vs Custom</th>
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
                                  <td className="py-1.5 px-2 text-zinc-800">{row!.label}</td>
                                  <td className="py-1.5 px-2 text-right text-zinc-800">{isCustomRow ? parsedQty.toLocaleString() : parseInt(row!.tier!.moqRow.moq).toLocaleString()}</td>
                                  <td className="py-1.5 px-2 text-right text-zinc-800">{fmt(tierPpuCost)}</td>
                                  <td className="py-1.5 px-2 text-right">{isCustomRow ? <span className="text-zinc-600"> --</span> : <span className={diff > 0 ? "text-red-500" : "text-green-600"}>{diff > 0 ? "+" : ""}{fmt(diff)}</span>}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <details className="group">
                      <summary className="cursor-pointer text-[0.65rem] font-semibold text-zinc-600 hover:text-zinc-700 uppercase tracking-wider select-none list-none flex items-center gap-1">
                        <span className="group-open:rotate-90 transition-transform inline-block">{">"}</span>
                        Full cost breakdown ({parsedQty.toLocaleString()} units)
                      </summary>
                      <table className="w-full border-collapse mt-2">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="py-1.5 px-2 text-left text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Line Item</th>
                            <th className="py-1.5 px-2 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Project Cost</th>
                            <th className="py-1.5 px-2 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Cost PPU</th>
                            <th className="py-1.5 px-2 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Customer Price</th>
                            <th className="py-1.5 px-2 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Cust. PPU</th>
                            <th className="py-1.5 px-2 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Margin %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {interstitialResult.summaryRows.map((row) => (
                            <tr key={row.label} className="border-b border-gray-50 hover:bg-gray-50/50">
                              <td className="py-1.5 px-2 text-xs text-zinc-800">{row.label}</td>
                              <td className="py-1.5 px-2 text-right text-xs text-zinc-800">{fmt(row.ourCosts)}</td>
                              <td className="py-1.5 px-2 text-right text-xs text-zinc-600">{fmt(row.ourCosts / parsedQty)}</td>
                              <td className="py-1.5 px-2 text-right text-xs text-zinc-800">{fmt(row.customerPrice)}</td>
                              <td className="py-1.5 px-2 text-right text-xs text-zinc-600">{fmt(row.customerPrice / parsedQty)}</td>
                              <td className="py-1.5 px-2 text-right text-xs text-zinc-800">{fmtPct(calcMargin(row.customerPrice, row.ourCosts))}</td>
                            </tr>
                          ))}
                          <tr className="border-t-2 border-gray-900 bg-sky-50">
                            <td className="py-2 px-2 text-xs font-bold text-zinc-950 italic">TOTALS</td>
                            <td className="py-2 px-2 text-right text-xs font-bold text-zinc-950">{fmt(interstitialResult.totalOur)}</td>
                            <td className="py-2 px-2 text-right text-xs font-bold text-zinc-950">{fmt(interstitialResult.ppuCost)}</td>
                            <td className="py-2 px-2 text-right text-xs font-bold text-zinc-950">{fmt(interstitialResult.totalCustomer)}</td>
                            <td className="py-2 px-2 text-right text-xs font-bold text-zinc-950">{fmt(interstitialResult.ppuCustomer)}</td>
                            <td className="py-2 px-2 text-right text-xs font-bold text-zinc-950">{fmtPct(calcMargin(interstitialResult.totalCustomer, interstitialResult.totalOur))}</td>
                          </tr>
                        </tbody>
                      </table>
                    </details>
                  </>
                ) : parsedQty > 0 ? (
                  <p className="text-xs text-zinc-600 italic">No column data available to calculate.</p>
                ) : (
                  <p className="text-xs text-zinc-600 italic">Enter a quantity above to see pricing.</p>
                )}
              </div>
            </div>
          </>
        )}

      </div>

    </main>
  );
}
