import { useState, useMemo } from "react";
import { FileText } from "lucide-react";
import Navbar from "@/components/navbar/Navbar";
import DatePicker from "@/components/ui/DatePicker";
import { useProject } from "@/lib/ProjectContext";
import { BRANDS, BrandId, CustomerInfo, QuotePreview, buildQuotePreviews, buildCustomQtyPreview } from "@/lib/generateQuotePDF";
import PdfPreviewModal from "@/components/quote/PdfPreviewModal";
import SaveQuoteButton from "@/components/quote/SaveQuoteButton";
import excelLogo     from "@/assets/excel.png";
import { generateQuoteXLSX } from "@/lib/generateQuoteXLSX";
import XlsxMoqModal from "@/components/quote/XlsxMoqModal";
import workdriveLogo from "@/assets/zoho-workdrive.png";
import crmLogo       from "@/assets/zoho-crm.png";

const fmt        = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtPct     = (v: number) => `${v.toFixed(1)}%`;
const calcMargin = (price: number, cost: number) => price > 0 ? ((price - cost) / price) * 100 : 0;

const inputCls = "h-7 w-full px-2 text-xs text-gray-900 border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition placeholder:text-gray-300";
const labelCls = "text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider mb-0.5";

export default function QuotePage() {
  const { summaryRows, summaryTableRows, ppuUnits, allMoqResults, perMoqSummaryRows, computeForQty, formData, setFormField, moqRows, columns, hasMoqErrors } = useProject();

  const [selectedBrand,    setSelectedBrand]    = useState<BrandId>("brewglitter");
  const [generating,       setGenerating]       = useState(false);
  const [previews,         setPreviews]         = useState<QuotePreview[] | null>(null);
  const [activeSummaryMoq, setActiveSummaryMoq] = useState<number>(() => moqRows[0]?.id ?? 0);
  const [customPreviewing,  setCustomPreviewing]  = useState(false);
  const [xlsxModalOpen,    setXlsxModalOpen]    = useState(false);
  const [xlsxGenerating,   setXlsxGenerating]   = useState(false);
  const [bufferUnit,        setBufferUnit]        = useState<"days" | "weeks">("days");

  const [customer, setCustomer] = useState<CustomerInfo>({
    customer:        "Bartesian",
    customerId:      "13421-25",
    name:            "Will Heinzmann",
    phone:           "(616) 916-4057",
    email:           "will@bartesian.com",
    salesRep:        "Greg Portnoy",
    productName:     "4oz Sachets",
    projectOverview: "",
  });

  // ── Interstitial pricing ──────────────────────────────────────────────────
  const [customQty,        setCustomQty]        = useState("");
  const [customPack,       setCustomPack]        = useState("");
  const [customMargin,     setCustomMargin]      = useState("");
  const [customPpuInput,   setCustomPpuInput]    = useState("");
  const [customLastEdited, setCustomLastEdited]  = useState<"margin" | "ppu">("margin");

  const [moqMargins,   setMoqMargins]   = useState<Record<number, string>>({});
  const [moqPpuInputs, setMoqPpuInputs] = useState<Record<number, string>>({});
  const [moqLastEdited, setMoqLastEdited] = useState<Record<number, "margin" | "ppu">>({});

  const activeSummaryRows  = perMoqSummaryRows.get(activeSummaryMoq) ?? summaryRows;
  const activeMoqResult    = allMoqResults.find(r => r.moqRow.id === activeSummaryMoq);

  const totalCustomerPrice = activeSummaryRows.reduce((s, r) => s + r.customerPrice, 0);
  const totalOurCosts      = activeSummaryRows.reduce((s, r) => s + r.ourCosts, 0);
  const ppuCost            = ppuUnits > 0 ? totalOurCosts / ppuUnits : 0;
  const ppuCustomer        = ppuUnits > 0 ? totalCustomerPrice / ppuUnits : 0;

  // ── Interstitial calc ────────────────────────────────────────────────────────
  const parsedQty   = parseInt(customQty)   || 0;
  const parsedPack  = parseInt(customPack)  || (moqRows[0] ? parseInt(moqRows[0].unitsPerInner) || 24 : 24);
  const parsedMargin = parseFloat(customMargin);
  const hasMargin    = customMargin !== "" && !isNaN(parsedMargin) && parsedMargin < 100;

  const sortedMoqs = [...allMoqResults]
    .filter(r => parseInt(r.moqRow.unitsPerInner) === parsedPack || parsedPack === 0)
    .sort((a, b) => parseInt(a.moqRow.moq) - parseInt(b.moqRow.moq));

  const lowerTier = sortedMoqs.filter(r => parseInt(r.moqRow.moq) <= parsedQty).at(-1) ?? null;
  const upperTier = sortedMoqs.find(r => parseInt(r.moqRow.moq) >  parsedQty) ?? null;
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

  const setField = (field: keyof CustomerInfo, value: string) =>
    setCustomer((prev) => ({ ...prev, [field]: value }));

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

  const quoteArgs = {
    brandId: selectedBrand, moqResults: allMoqResults, moqMargins: resolvedMoqMargins,
    summaryRows, summaryTableRows, formData, customer,
  };

  const handlePreview = async () => {
    setGenerating(true);
    try {
      const result = await buildQuotePreviews(quoteArgs);
      setPreviews(result);
    } finally {
      setGenerating(false);
    }
  };

  const handleCustomPreview = async () => {
    if (!interstitialResult || parsedQty <= 0) return;
    setCustomPreviewing(true);
    try {
      const preview = await buildCustomQtyPreview({
        brandId:         selectedBrand,
        qty:             parsedQty,
        unitsPerInner:   parsedPack,
        ppuCost:         interstitialResult.ppuCost,
        custPPU,
        summaryRows:     interstitialResult.summaryRows,
        summaryTableRows: interstitialResult.summaryTableRows,
        formData:        { ...formData, ppuDenominator: String(parsedQty) },
        customer,
      });
      setPreviews([preview]);
    } finally {
      setCustomPreviewing(false);
    }
  };

  const th  = "py-2 px-3 text-left text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider border-b-2 border-gray-900";
  const thr = "py-2 px-3 text-right text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider border-b-2 border-gray-900";
  const td  = "py-2 px-3 text-xs text-gray-700";
  const tdr = "py-2 px-3 text-xs text-right text-gray-700";

  return (
    <main className="min-h-screen flex flex-col bg-white">
      <Navbar />
      {previews && <PdfPreviewModal previews={previews} onClose={() => setPreviews(null)} />}
      {xlsxModalOpen && (
        <XlsxMoqModal
          moqResults={allMoqResults}
          defaultMoqId={activeSummaryMoq}
          generating={xlsxGenerating}
          onClose={() => setXlsxModalOpen(false)}
          onConfirm={async (selectedMoq) => {
            setXlsxGenerating(true);
            try {
              await generateQuoteXLSX({ formData, columns, allMoqResults, perMoqSummaryRows, customer, selectedBrand, moqMargins: resolvedMoqMargins, selectedMoq });
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
            {hasMoqErrors && (
              <span className="text-[0.6rem] text-red-500 font-medium">
                Fix MOQ configuration errors to enable exports
              </span>
            )}
            <button
              onClick={handlePreview}
              disabled={generating || allMoqResults.length === 0 || hasMoqErrors}
              title={hasMoqErrors ? "Fix MOQ configuration errors before exporting" : undefined}
              className="flex items-center gap-2 bg-[#e8473f] hover:bg-[#d43f37] disabled:opacity-50 text-white text-xs font-semibold px-4 h-7 rounded-lg transition-colors"
            >
              <FileText size={12} />
              {generating ? "Generating…" : `Preview & Export (${allMoqResults.length})`}
            </button>
            <SaveQuoteButton
              quotePageState={{ customer, selectedBrand, moqMargins, moqPpuInputs, moqLastEdited }}
              disabled={hasMoqErrors}
              disabledReason={hasMoqErrors ? "Fix MOQ configuration errors before saving" : undefined}
            />
            <button
              onClick={() => setXlsxModalOpen(true)}
              disabled={xlsxGenerating || allMoqResults.length === 0 || hasMoqErrors}
              title={hasMoqErrors ? "Fix MOQ configuration errors before exporting" : undefined}
              className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 text-gray-600 text-xs font-medium px-3 h-7 rounded-lg transition-colors"
            >
              <img src={excelLogo} alt="Excel" className="w-3 h-3 object-contain" />
              .xlsx
            </button>
            <button className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-xs font-medium px-3 h-7 rounded-lg transition-colors">
              <img src={workdriveLogo} alt="WorkDrive" className="w-3 h-3 object-contain" />
              WorkDrive
            </button>
            <button className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-xs font-medium px-3 h-7 rounded-lg transition-colors">
              <img src={crmLogo} alt="CRM" className="w-3 h-3 object-contain" />
              CRM
            </button>
          </div>
        </div>

        {/* ── Brand + Customer info ── */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="border border-gray-100 rounded-sm p-4">
            <p className="text-xs font-semibold text-gray-900 mb-3">Brand / Company</p>
            <div className="flex flex-wrap gap-2">
              {BRANDS.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelectedBrand(b.id)}
                  className={`h-7 px-3 text-[0.7rem] font-semibold rounded-full border transition-all whitespace-nowrap ${
                    selectedBrand === b.id ? "text-white border-transparent shadow-sm" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                  }`}
                  style={selectedBrand === b.id ? { backgroundColor: b.accent, borderColor: b.accent } : {}}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border border-gray-100 rounded-sm p-4">
            <p className="text-xs font-semibold text-gray-900 mb-3">Customer Info</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {([
                ["customer",    "Company"],
                ["customerId",  "Customer ID"],
                ["name",        "Contact Name"],
                ["phone",       "Phone"],
                ["email",       "Email"],
                ["salesRep",    "Sales Rep"],
                ["productName", "Product Name"],
              ] as [keyof CustomerInfo, string][]).map(([field, label]) => (
                <div key={field}>
                  <p className={labelCls}>{label}</p>
                  <input
                    type="text"
                    value={customer[field]}
                    onChange={(e) => setField(field, e.target.value)}
                    className={inputCls}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2">
              <p className={labelCls}>Project Overview (leave blank to auto-generate)</p>
              <textarea
                value={customer.projectOverview}
                onChange={(e) => setField("projectOverview", e.target.value)}
                rows={2}
                className="w-full px-2 py-1.5 text-xs text-gray-900 border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition placeholder:text-gray-300 resize-none"
                placeholder="Auto-generated from project data if left blank…"
              />
            </div>
          </div>
        </div>

        {/* ── Cost Summary ── */}
        <div className="border border-gray-100 rounded-sm overflow-hidden mb-4">
          <div className="bg-gray-50 border-b border-gray-100 px-3 py-2 flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-black uppercase tracking-wide shrink-0">Cost Summary</span>
            <div className="flex items-center gap-1 flex-wrap">
              {allMoqResults.map((r) => (
                <button
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
            </div>
            {activeMoqResult && (
              <span className="ml-auto text-[0.6rem] text-gray-400 whitespace-nowrap">
                Cost PPU: <span className="font-semibold text-gray-600">{fmt(activeMoqResult.ppuCost)}</span>
              </span>
            )}
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Line Item</th>
                <th className={thr}>Our Cost</th>
                <th className={thr}>Customer Price</th>
                <th className={thr}>Margin $$</th>
                <th className={thr}>Margin %%</th>
              </tr>
            </thead>
            <tbody>
              {activeSummaryRows.length === 0 ? (
                <tr><td colSpan={5} className="py-4 text-center text-xs text-gray-400 italic">No data — go back and fill in project details</td></tr>
              ) : (
                <>
                  {activeSummaryRows.map((row) => (
                    <tr key={row.label} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className={td}>{row.label}</td>
                      <td className={tdr}>{fmt(row.ourCosts)}</td>
                      <td className={tdr}>{fmt(row.customerPrice)}</td>
                      <td className={tdr}>{fmt(row.customerPrice - row.ourCosts)}</td>
                      <td className={tdr}>{fmtPct(calcMargin(row.customerPrice, row.ourCosts))}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-900 bg-sky-50">
                    <td className="py-2 px-3 text-xs font-bold text-gray-900 italic">TOTALS</td>
                    <td className="py-2 px-3 text-right text-xs font-bold text-gray-900">{fmt(totalOurCosts)}</td>
                    <td className="py-2 px-3 text-right text-xs font-bold text-gray-900">{fmt(totalCustomerPrice)}</td>
                    <td className="py-2 px-3 text-right text-xs font-bold text-gray-900">{fmt(totalCustomerPrice - totalOurCosts)}</td>
                    <td className="py-2 px-3 text-right text-xs font-bold text-gray-900">{fmtPct(calcMargin(totalCustomerPrice, totalOurCosts))}</td>
                  </tr>
                  {ppuUnits > 0 && (
                    <tr className="bg-sky-50">
                      <td className="py-1.5 px-3 text-xs font-bold text-gray-900 italic">PPU</td>
                      <td className="py-1.5 px-3 text-right text-xs font-bold text-gray-900">{fmt(ppuCost)}</td>
                      <td className="py-1.5 px-3 text-right text-xs font-bold text-gray-900">{fmt(ppuCustomer)}</td>
                      <td className="py-1.5 px-3 text-right text-xs text-gray-300">—</td>
                      <td className="py-1.5 px-3 text-right text-xs text-gray-300">—</td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* ── MOQ Pricing Table ── */}
        <div className="border border-gray-100 rounded-sm overflow-x-auto mb-4">
          <div className="bg-gray-50 border-b border-gray-100 px-3 py-2 flex items-center gap-2">
            <span className="text-xs font-semibold text-black uppercase tracking-wide">MOQ Pricing Table</span>
            <span className="text-[0.6rem] text-gray-400">— enter adj. margin % or adj. PPU; the other derives automatically</span>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>MOQ</th>
                <th className={th}>Case Pack</th>
                <th className={thr}>Cost PPU</th>
                <th className="py-2 px-3 text-right text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider border-b-2 border-gray-900 whitespace-nowrap bg-gray-50/60">Orig. PPU</th>
                <th className="py-2 px-3 text-right text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider border-b-2 border-gray-900 whitespace-nowrap bg-gray-50/60">Orig. Margin</th>
                <th className="py-2 px-3 text-right text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider border-b-2 border-gray-900 whitespace-nowrap bg-gray-50/60">Orig. Revenue</th>
                <th className="py-2 px-3 text-center text-[0.6rem] font-semibold text-amber-600 uppercase tracking-wider border-b-2 border-gray-900 whitespace-nowrap">Adj. Margin %</th>
                <th className="py-2 px-3 text-center text-[0.6rem] font-semibold text-blue-600 uppercase tracking-wider border-b-2 border-gray-900 whitespace-nowrap">Adj. PPU</th>
                <th className={thr}>Δ PPU</th>
                <th className={thr}>Adj. Revenue</th>
                <th className={thr}>Margin $$</th>
              </tr>
            </thead>
            <tbody>
              {allMoqResults.length === 0 || allMoqResults.every(r => r.totalCustomerPrice === 0) ? (
                <tr><td colSpan={11} className="py-4 text-center text-xs text-gray-400 italic">No data — go back and fill in project details</td></tr>
              ) : allMoqResults.map((r) => {
                const lastEdited = moqLastEdited[r.moqRow.id] ?? "margin";
                const marginStr  = moqMargins[r.moqRow.id] ?? "";
                const marginVal  = parseFloat(marginStr);
                const hasMarginRow  = marginStr !== "" && !isNaN(marginVal) && marginVal < 100;
                const ppuStr     = moqPpuInputs[r.moqRow.id] ?? "";
                const ppuVal     = parseFloat(ppuStr);
                const hasPpu     = ppuStr !== "" && !isNaN(ppuVal) && ppuVal > 0;

                const adjPPU = lastEdited === "ppu" && hasPpu
                  ? ppuVal
                  : lastEdited === "margin" && hasMarginRow
                    ? r.ppuCost / (1 - marginVal / 100)
                    : r.ppu;
                const adjMarginPct = adjPPU > 0 && r.ppuCost > 0
                  ? ((adjPPU - r.ppuCost) / adjPPU) * 100
                  : r.marginPct;

                const derivedMarginDisplay = lastEdited === "ppu" && hasPpu
                  ? adjMarginPct.toFixed(2)
                  : marginStr;
                const derivedPpuDisplay = lastEdited === "margin" && hasMarginRow
                  ? adjPPU.toFixed(4)
                  : ppuStr;

                const hasAdjustment = hasMarginRow || hasPpu;
                const deltaPPU      = adjPPU - r.ppu;
                const adjRevenue    = adjPPU * r.ppuDenominator;
                const marginD       = (adjPPU - r.ppuCost) * r.ppuDenominator;

                return (
                  <tr key={r.moqRow.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className={td}>{r.moqRow.moq || "—"}</td>
                    <td className={td}>{r.casePack}</td>
                    <td className={tdr}>{r.ppuCost > 0 ? fmt(r.ppuCost) : "—"}</td>

                    <td className="py-1.5 px-3 text-right text-xs text-gray-400 bg-gray-50/60">{r.ppu > 0 ? fmt(r.ppu) : "—"}</td>
                    <td className="py-1.5 px-3 text-right text-xs text-gray-400 bg-gray-50/60">{r.marginPct > 0 ? fmtPct(r.marginPct) : "—"}</td>
                    <td className="py-1.5 px-3 text-right text-xs text-gray-400 bg-gray-50/60">{r.totalCustomerPrice > 0 ? fmt(r.totalCustomerPrice) : "—"}</td>

                    <td className="py-1.5 px-2 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <input
                          type="number"
                          value={derivedMarginDisplay}
                          onChange={(e) => {
                            setMoqMargins((prev) => ({ ...prev, [r.moqRow.id]: e.target.value }));
                            setMoqLastEdited((prev) => ({ ...prev, [r.moqRow.id]: "margin" }));
                            setMoqPpuInputs((prev) => ({ ...prev, [r.moqRow.id]: "" }));
                          }}
                          placeholder={r.marginPct > 0 ? r.marginPct.toFixed(1) : "0.0"}
                          className="w-20 h-6 px-2 text-xs text-right border border-amber-300 bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium"
                        />
                        <span className="text-xs text-gray-400">%</span>
                      </div>
                    </td>

                    <td className="py-1.5 px-2 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <span className="text-xs text-gray-400">$</span>
                        <input
                          type="number"
                          value={derivedPpuDisplay}
                          onChange={(e) => {
                            setMoqPpuInputs((prev) => ({ ...prev, [r.moqRow.id]: e.target.value }));
                            setMoqLastEdited((prev) => ({ ...prev, [r.moqRow.id]: "ppu" }));
                            setMoqMargins((prev) => ({ ...prev, [r.moqRow.id]: "" }));
                          }}
                          placeholder={r.ppu > 0 ? r.ppu.toFixed(2) : "0.00"}
                          className="w-20 h-6 px-2 text-xs text-right border border-blue-300 bg-blue-50 focus:outline-none focus:ring-1 focus:ring-blue-400 font-medium"
                        />
                      </div>
                    </td>

                    <td className="py-1.5 px-3 text-right text-xs font-semibold">
                      {hasAdjustment && adjPPU > 0 ? (
                        <span className={deltaPPU > 0 ? "text-green-600" : deltaPPU < 0 ? "text-red-500" : "text-gray-400"}>
                          {deltaPPU > 0 ? "+" : ""}{fmt(deltaPPU)}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    <td className={tdr}>{adjPPU > 0 ? fmt(adjRevenue) : "—"}</td>
                    <td className={tdr}>{adjPPU > 0 && r.totalCustomerPrice > 0 ? fmt(marginD) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

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
                          const isCustom = !row!.tier;
                          return (
                            <tr key={row!.label} className={`border-b border-gray-50 ${isCustom ? "bg-red-50/50 font-semibold" : ""}`}>
                              <td className="py-1.5 px-2 text-gray-700">{row!.label}</td>
                              <td className="py-1.5 px-2 text-right text-gray-700">{isCustom ? parsedQty.toLocaleString() : parseInt(row!.tier!.moqRow.moq).toLocaleString()}</td>
                              <td className="py-1.5 px-2 text-right text-gray-700">{fmt(tierPpuCost)}</td>
                              <td className="py-1.5 px-2 text-right">{isCustom ? <span className="text-gray-400">—</span> : <span className={diff > 0 ? "text-red-500" : "text-green-600"}>{diff > 0 ? "+" : ""}{fmt(diff)}</span>}</td>
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

      </div>
    </main>
  );
}
