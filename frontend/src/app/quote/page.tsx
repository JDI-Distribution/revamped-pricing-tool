"use client";

import { useState } from "react";
import Image from "next/image";
import { FileText } from "lucide-react";
import Navbar from "@/components/navbar/Navbar";
import { useProject } from "@/lib/ProjectContext";
import { BRANDS, BrandId, CustomerInfo, QuotePreview, buildQuotePreviews } from "@/lib/generateQuotePDF";
import PdfPreviewModal from "@/components/quote/PdfPreviewModal";
import excelLogo     from "@/assets/excel.png";
import workdriveLogo from "@/assets/zoho-workdrive.png";
import crmLogo       from "@/assets/zoho-crm.png";

const fmt        = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtPct     = (v: number) => `${v.toFixed(1)}%`;
const calcMargin = (price: number, cost: number) => price > 0 ? ((price - cost) / price) * 100 : 0;

const inputCls = "h-7 w-full px-2 text-xs text-gray-900 border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition placeholder:text-gray-300";
const labelCls = "text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider mb-0.5";

export default function QuotePage() {
  const { summaryRows, summaryTableRows, ppuUnits, allMoqResults, formData } = useProject();

  const [selectedBrand, setSelectedBrand] = useState<BrandId>("brewglitter");
  const [generating,    setGenerating]    = useState(false);
  const [previews,      setPreviews]      = useState<QuotePreview[] | null>(null);

  const [customer, setCustomer] = useState<CustomerInfo>({
    customer:        "Bartesian",
    customerId:      "13421-25",
    name:            "Will Heinzmann",
    phone:           "(616) 916-4057",
    email:           "will@bartesian.com",
    salesRep:        "Greg Portnoy",
    projectOverview: "",
  });

  const [moqMargins, setMoqMargins] = useState<Record<number, string>>({
    1: "28",
    2: "32",
    3: "38",
    4: "30",
  });

  const totalCustomerPrice = summaryRows.reduce((s, r) => s + r.customerPrice, 0);
  const totalOurCosts      = summaryRows.reduce((s, r) => s + r.ourCosts, 0);
  const ppuCost            = ppuUnits > 0 ? totalOurCosts / ppuUnits : 0;
  const ppuCustomer        = ppuUnits > 0 ? totalCustomerPrice / ppuUnits : 0;

  const setField = (field: keyof CustomerInfo, value: string) =>
    setCustomer((prev) => ({ ...prev, [field]: value }));

  const quoteArgs = {
    brandId: selectedBrand, moqResults: allMoqResults, moqMargins,
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

  const th  = "py-2 px-3 text-left text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider border-b-2 border-gray-900";
  const thr = "py-2 px-3 text-right text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider border-b-2 border-gray-900";
  const td  = "py-2 px-3 text-xs text-gray-700";
  const tdr = "py-2 px-3 text-xs text-right text-gray-700";

  return (
    <main className="min-h-screen flex flex-col bg-white">
      <Navbar />
      {previews && <PdfPreviewModal previews={previews} onClose={() => setPreviews(null)} />}

      <div className="flex-1 overflow-auto px-8 py-6 max-w-5xl mx-auto w-full">

        {/* ── Page header ── */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 w-1 h-5 rounded-full bg-[#e8473f] shrink-0" />
            <div>
              <h1 className="text-sm font-semibold text-gray-900 tracking-tight leading-none">Quote Overview</h1>
              <p className="text-[0.65rem] text-gray-400 mt-1">Review pricing and export the quote</p>
            </div>
          </div>

          {/* Export actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePreview}
              disabled={generating || allMoqResults.length === 0}
              className="flex items-center gap-2 bg-[#e8473f] hover:bg-[#d43f37] disabled:opacity-50 text-white text-xs font-semibold px-4 h-8 transition-colors"
            >
              <FileText size={13} />
              {generating ? "Generating…" : `Preview & Export (${allMoqResults.length})`}
            </button>
            <button className="flex items-center gap-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium px-3 h-8 transition-colors">
              <div className="w-3.5 h-3.5 relative shrink-0"><Image src={excelLogo} alt="Excel" fill className="object-contain" /></div>
              .xlsx
            </button>
            <button className="flex items-center gap-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium px-3 h-8 transition-colors">
              <div className="w-3.5 h-3.5 relative shrink-0"><Image src={workdriveLogo} alt="WorkDrive" fill className="object-contain" /></div>
              WorkDrive
            </button>
            <button className="flex items-center gap-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium px-3 h-8 transition-colors">
              <div className="w-3.5 h-3.5 relative shrink-0"><Image src={crmLogo} alt="CRM" fill className="object-contain" /></div>
              CRM
            </button>
          </div>
        </div>

        {/* ── Brand + Customer info ── */}
        <div className="grid grid-cols-2 gap-4 mb-4">

          {/* Brand picker */}
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

          {/* Customer fields */}
          <div className="border border-gray-100 rounded-sm p-4">
            <p className="text-xs font-semibold text-gray-900 mb-3">Customer Info</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {([
                ["customer",   "Company"],
                ["customerId", "Customer ID"],
                ["name",       "Contact Name"],
                ["phone",      "Phone"],
                ["email",      "Email"],
                ["salesRep",   "Sales Rep"],
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
          <div className="bg-gray-50 border-b border-gray-100 px-3 py-2">
            <span className="text-xs font-semibold text-black uppercase tracking-wide">Cost Summary</span>
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
              {summaryRows.length === 0 ? (
                <tr><td colSpan={5} className="py-4 text-center text-xs text-gray-400 italic">No data — go back and fill in project details</td></tr>
              ) : (
                <>
                  {summaryRows.map((row) => (
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
        <div className="border border-gray-100 rounded-sm overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-100 px-3 py-2 flex items-center gap-2">
            <span className="text-xs font-semibold text-black uppercase tracking-wide">MOQ Pricing Table</span>
            <span className="text-[0.6rem] text-gray-400">— set a target margin per MOQ to derive the customer PPU</span>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>MOQ</th>
                <th className={th}>Case Pack</th>
                <th className={thr}>Cost PPU</th>
                <th className="py-2 px-3 text-center text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider border-b-2 border-gray-900 whitespace-nowrap">Target Margin %%</th>
                <th className={thr}>Customer PPU</th>
                <th className={thr}>Total Revenue</th>
                <th className={thr}>Margin $$</th>
              </tr>
            </thead>
            <tbody>
              {allMoqResults.length === 0 || allMoqResults.every(r => r.totalCustomerPrice === 0) ? (
                <tr><td colSpan={7} className="py-4 text-center text-xs text-gray-400 italic">No data — go back and fill in project details</td></tr>
              ) : allMoqResults.map((r) => {
                const marginStr = moqMargins[r.moqRow.id] ?? "";
                const marginVal = parseFloat(marginStr);
                const hasMargin = marginStr !== "" && !isNaN(marginVal) && marginVal < 100;
                const custPPU   = hasMargin ? r.ppuCost / (1 - marginVal / 100) : r.ppu;
                const marginD   = hasMargin ? (custPPU - r.ppuCost) * r.ppuDenominator : r.marginDollars;

                return (
                  <tr key={r.moqRow.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className={td}>{r.moqRow.moq || "—"}</td>
                    <td className={td}>{r.casePack}</td>
                    <td className={tdr}>{r.ppuCost > 0 ? fmt(r.ppuCost) : "—"}</td>
                    <td className="py-1.5 px-3 text-center">
                      <div className="flex items-center justify-center">
                        <input
                          type="number"
                          value={marginStr}
                          onChange={(e) => setMoqMargins((prev) => ({ ...prev, [r.moqRow.id]: e.target.value }))}
                          placeholder={r.totalCustomerPrice > 0 ? fmtPct(r.marginPct).replace("%", "") : "0.0"}
                          className="w-20 h-6 px-2 text-xs text-right border border-gray-300 bg-yellow-200 focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-transparent font-medium"
                        />
                        <span className="ml-1 text-xs text-gray-400">%</span>
                      </div>
                    </td>
                    <td className={`${tdr} font-medium text-gray-900`}>{custPPU > 0 ? fmt(custPPU) : "—"}</td>
                    <td className={tdr}>{custPPU > 0 ? fmt(custPPU * r.ppuDenominator) : "—"}</td>
                    <td className={tdr}>{r.totalCustomerPrice > 0 ? fmt(marginD) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>
    </main>
  );
}
