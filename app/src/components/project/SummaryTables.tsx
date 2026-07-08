

import { useState, Fragment } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { SummaryRow, SummaryTableRow, DetailSection } from "@/lib/types";


interface ComboView {
  id: string;
  label: string;
  detailSections: DetailSection[];
  summaryTableRows: SummaryTableRow[];
  ppuUnits: number;
}

interface SummaryTablesProps {
  summaryRows?: SummaryRow[];
  summaryTableRows?: SummaryTableRow[];
  detailSections?: DetailSection[];
  ppuUnits?: number;
  comboViews?: ComboView[];
}

const fmt      = (val: number) => val.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtPct   = (val: number) => `${val.toFixed(1)}%`;
const calcMargin = (price: number, cost: number) => price > 0 ? ((price - cost) / price) * 100 : 0;

// ── UOM helpers ───────────────────────────────────────────────────────────────
const LEAD_TIME_UNITS  = ["wks", "days", "hrs", "mins"] as const;
const THROUGHPUT_UNITS = ["/ hr", "/ min", "/ shift", "/ day"] as const;
type LeadTimeUnit   = typeof LEAD_TIME_UNITS[number];
type ThroughputUnit = typeof THROUGHPUT_UNITS[number];

const LEAD_TO_WEEKS: Record<LeadTimeUnit, number> = { wks: 1, days: 5, hrs: 40, mins: 2400 };
const fmtLeadTime = (weeks: number, unit: LeadTimeUnit) => {
  const val = weeks * LEAD_TO_WEEKS[unit];
  return `${val.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${unit}`;
};

const fmtThroughput = (perHr: number, unit: ThroughputUnit) => {
  const val = unit === "/ min" ? perHr / 60 : unit === "/ shift" || unit === "/ day" ? perHr * 7.3 : perHr;
  return `${val.toLocaleString("en-US", { maximumFractionDigits: val < 1 ? 3 : 1 })}${unit}`;
};

// ── Null-safe data cell ───────────────────────────────────────────────────────
function DataCell({ val, formatter, bold }: { val: number | null; formatter: (v: number) => string; bold?: boolean }) {
  const cls = `py-2 px-2 text-right text-xs ${bold ? "font-bold text-zinc-950" : "text-zinc-800"}`;
  if (val === null || val === 0)
    return <td className={`${cls} text-zinc-500`}>—</td>;
  return <td className={cls}>{formatter(val)}</td>;
}

// ── UOM dropdown inside a <th> ────────────────────────────────────────────────
function UomSelect<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="text-[0.55rem] font-semibold text-zinc-600 bg-transparent border-none outline-none cursor-pointer hover:text-zinc-700 ml-1"
    >
      {options.map((u) => <option key={u} value={u}>{u}</option>)}
    </select>
  );
}

export default function SummaryTables({
  summaryRows = [],
  summaryTableRows = [],
  detailSections = [],
  ppuUnits = 0,
  comboViews = [],
}: SummaryTablesProps) {
  const [selectedCombo,   setSelectedCombo]   = useState<string>("all");
  const [expandedRows,    setExpandedRows]    = useState<Set<string>>(new Set());

  // UOM
  const [leadTimeUnit,    setLeadTimeUnit]    = useState<LeadTimeUnit>("wks");
  const [throughputUnit,  setThroughputUnit]  = useState<ThroughputUnit>("/ hr");

  // ── Totals ────────────────────────────────────────────────────
  const totalCustomerPrice = summaryRows.reduce((s, r) => s + r.customerPrice, 0);
  const totalOurCosts      = summaryRows.reduce((s, r) => s + r.ourCosts, 0);
  const totalMarginDollars = totalCustomerPrice - totalOurCosts;
  const totalMarginPct     = calcMargin(totalCustomerPrice, totalOurCosts);
  const totalMarkupPct     = totalOurCosts > 0 ? (totalMarginDollars / totalOurCosts) * 100 : 0;
  const ppuCustomer        = ppuUnits > 0 ? totalCustomerPrice / ppuUnits : 0;
  const ppuCost            = ppuUnits > 0 ? totalOurCosts / ppuUnits : 0;

  // ── Active combo ──────────────────────────────────────────────
  const activeCombo       = comboViews.find((cv) => cv.id === selectedCombo);
  const activeRows        = selectedCombo === "all" ? summaryTableRows : (activeCombo?.summaryTableRows ?? summaryTableRows);
  const activeSections    = selectedCombo === "all" ? detailSections   : (activeCombo?.detailSections   ?? detailSections);
  const activeLabel       = activeCombo?.label;

  const activeTotalCost   = activeRows.reduce((s, r) => s + (r.totalCost  ?? 0), 0);
  const activeTotalPrice  = activeRows.reduce((s, r) => s + (r.totalPrice ?? 0), 0);

  // ── Build a label→section lookup for the pivot ───────────────
  // summaryTableRows and detailSections share the same labels
  const sectionByLabel = new Map(activeSections.map((s) => [s.title, s]));

  const toggleRow = (label: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });

  // ── Style tokens ──────────────────────────────────────────────
  const thBase   = "py-2 px-2 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider whitespace-nowrap border-b-2 border-gray-900";

  return (
    <div className="p-4 flex flex-col gap-3">

      {/* ══ Unified Details table ══════════════════════════════════ */}
      <div className="border border-gray-100 rounded-sm overflow-hidden">

        {/* Header bar */}
        <div className="flex items-center bg-gray-50 border-b border-gray-100 px-3 py-2 gap-3">
          <span className="text-xs font-semibold text-black uppercase tracking-wide shrink-0">Details</span>
          {activeLabel && <span className="text-[0.6rem] text-zinc-600 truncate">{activeLabel}</span>}
          {comboViews.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap ml-auto">
              <button type="button" onClick={() => setSelectedCombo("all")}
                className={`h-5 px-2 text-[0.6rem] font-semibold rounded-full transition-colors ${selectedCombo === "all" ? "bg-[#e8473f] text-white" : "text-zinc-600 hover:text-zinc-700"}`}>
                All
              </button>
              {comboViews.map((cv, i) => (
                <button type="button" key={cv.id} onClick={() => setSelectedCombo(cv.id)} title={cv.label}
                  className={`h-5 px-2 text-[0.6rem] font-semibold rounded-full transition-colors ${selectedCombo === cv.id ? "bg-[#e8473f] text-white" : "text-zinc-600 hover:text-zinc-700"}`}>
                  #{i + 1}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                {/* 1 */}
                <th className="py-2 px-2 text-left text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider border-b-2 border-gray-900 w-32">Description</th>
                {/* 2 */}
                <th className={thBase}>Delivered Qty</th>
                {/* 3 */}
                <th className={thBase}>Cost PPU</th>
                {/* 4 */}
                <th className={thBase}>Markup %</th>
                {/* 5 */}
                <th className={thBase}>Customer PPU</th>
                {/* 6 */}
                <th className={thBase}>Total</th>
                {/* 7 */}
                <th className={thBase}>Our Cost</th>
                {/* 8 */}
                <th className={thBase}>Margin $$</th>
                {/* 9 */}
                <th className={thBase}>Margin %</th>
                {/* 10 */}
                <th className={thBase}>
                  <div className="flex items-center justify-end">
                    <span>Throughput</span>
                    <UomSelect value={throughputUnit} options={THROUGHPUT_UNITS} onChange={setThroughputUnit} />
                  </div>
                </th>
                {/* 11 */}
                <th className={thBase}>
                  <div className="flex items-center justify-end">
                    <span>Lead Time</span>
                    <UomSelect value={leadTimeUnit} options={LEAD_TIME_UNITS} onChange={setLeadTimeUnit} />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {activeRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-4 text-center text-xs text-zinc-600 italic">
                    No data yet — fill in project details and columns
                  </td>
                </tr>
              ) : activeRows.map((row) => {
                if (row.isLeadTimeSummary) {
                  const isTotalRow = row.label === "Estimated Total Lead Time";
                  return (
                    <tr key={row.label} className={`border-b border-gray-100 ${isTotalRow ? "bg-blue-50/60" : "bg-gray-50/30"}`}>
                      <td className={`py-2 px-2 text-xs ${isTotalRow ? "font-semibold text-zinc-950" : "text-zinc-600 pl-5"}`}>{row.label}</td>
                      <td className="py-2 px-2 text-right text-xs text-zinc-500">—</td>
                      <td className="py-2 px-2 text-right text-xs text-zinc-500">—</td>
                      <td className="py-2 px-2 text-right text-xs text-zinc-500">—</td>
                      <td className="py-2 px-2 text-right text-xs text-zinc-500">—</td>
                      <td className="py-2 px-2 text-right text-xs text-zinc-500">—</td>
                      <td className="py-2 px-2 text-right text-xs text-zinc-500">—</td>
                      <td className="py-2 px-2 text-right text-xs text-zinc-500">—</td>
                      <td className="py-2 px-2 text-right text-xs text-zinc-500">—</td>
                      <td className="py-2 px-2 text-right text-xs text-zinc-500">—</td>
                      <td className={`py-2 px-2 text-right text-xs ${isTotalRow ? "font-semibold text-zinc-950" : "text-zinc-700"}`}>
                        {row.leadTimeWeeks !== null ? fmtLeadTime(row.leadTimeWeeks, leadTimeUnit) : "—"}
                      </td>
                    </tr>
                  );
                }

                const section   = sectionByLabel.get(row.label);
                const hasDetail = !!section && row.label !== "Setup / QA Fee";
                const expanded  = expandedRows.has(row.label);
                const custPrice = row.totalPrice ?? 0;
                const ourCost   = row.totalCost  ?? 0;
                const marginD   = custPrice - ourCost;
                const marginPct = calcMargin(custPrice, ourCost);
                const markup    = ourCost > 0 ? ((custPrice - ourCost) / ourCost) * 100 : null;
                const costPPU   = ppuUnits > 0 && ourCost > 0 ? ourCost / ppuUnits : null;

                return (
                  <Fragment key={row.label}>
                    {/* ── Summary row ── */}
                    <tr
                      onClick={() => hasDetail && toggleRow(row.label)}
                      className={`border-b border-gray-100 ${hasDetail ? "cursor-pointer hover:bg-gray-50/70" : "hover:bg-gray-50/30"}`}
                    >
                      {/* 1 Description */}
                      <td className="py-2 px-2 text-xs text-zinc-800 font-medium">
                        <div className="flex items-center gap-1">
                          {hasDetail && (
                            expanded
                              ? <ChevronUp size={10} className="text-zinc-600 shrink-0" />
                              : <ChevronDown size={10} className="text-zinc-600 shrink-0" />
                          )}
                          {row.label}
                          {section?.overageReq != null && (
                            <span className="ml-1 text-[0.55rem] text-amber-600 bg-amber-50 px-1 py-0.5 rounded-full whitespace-nowrap">
                              +{section.overageReq}%
                            </span>
                          )}
                        </div>
                      </td>
                      {/* 2 Delivered Qty */}
                      <DataCell val={row.totalUnits}    formatter={(v) => Math.round(v).toLocaleString("en-US")} />
                      {/* 3 Cost PPU */}
                      <DataCell val={costPPU}           formatter={fmt} />
                      {/* 4 Markup % */}
                      <DataCell val={markup}            formatter={fmtPct} />
                      {/* 5 Customer PPU */}
                      <DataCell val={row.costPerUnit}   formatter={fmt} />
                      {/* 6 Total (Customer Price) */}
                      <DataCell val={custPrice || null} formatter={fmt} />
                      {/* 7 Our Cost */}
                      <DataCell val={ourCost   || null} formatter={fmt} />
                      {/* 8 Margin $$ */}
                      <DataCell val={marginD   || null} formatter={fmt} />
                      {/* 9 Margin % */}
                      <DataCell val={custPrice > 0 ? marginPct : null} formatter={fmtPct} />
                      {/* 10 Throughput */}
                      <DataCell val={row.throughput}    formatter={(v) => fmtThroughput(v, throughputUnit)} />
                      {/* 11 Lead Time */}
                      <DataCell val={row.leadTimeWeeks} formatter={(v) => fmtLeadTime(v, leadTimeUnit)} />
                    </tr>

                    {/* ── Expanded detail sub-rows ── */}
                    {hasDetail && expanded && section!.rows.map((dRow) => (
                      <tr key={dRow.label} className="border-b border-gray-50 bg-gray-50/40">
                        <td className="py-1 pl-6 pr-2 text-[0.7rem] text-zinc-600">{dRow.label}</td>
                        {/* Qty / Cost PPU / Markup — empty */}
                        <td className="py-1 px-2 text-right text-[0.7rem] text-zinc-500">—</td>
                        <td className="py-1 px-2 text-right text-[0.7rem] text-zinc-500">—</td>
                        <td className="py-1 px-2 text-right text-[0.7rem] text-zinc-500">—</td>
                        {/* Customer PPU — show non-currency project detail (e.g. units/min) */}
                        <td className="py-1 px-2 text-right text-[0.7rem] text-zinc-600">
                          {!dRow.isCurrency && dRow.projectDetails !== null
                            ? dRow.projectDetails.toLocaleString("en-US", { maximumFractionDigits: 2 })
                            : "—"}
                        </td>
                        {/* Total — customer-facing currency value */}
                        <td className="py-1 px-2 text-right text-[0.7rem] text-zinc-600">
                          {dRow.isCurrency && dRow.projectDetails !== null ? fmt(dRow.projectDetails) : "—"}
                        </td>
                        {/* Our Cost */}
                        <td className="py-1 px-2 text-right text-[0.7rem] text-zinc-600">
                          {dRow.isCurrency && dRow.projectCosts !== null ? fmt(dRow.projectCosts) : "—"}
                        </td>
                        {/* Margin $$ / Margin % / Throughput / Lead Time — empty */}
                        <td className="py-1 px-2 text-right text-[0.7rem] text-zinc-500">—</td>
                        <td className="py-1 px-2 text-right text-[0.7rem] text-zinc-500">—</td>
                        <td className="py-1 px-2 text-right text-[0.7rem] text-zinc-500">—</td>
                        <td className="py-1 px-2 text-right text-[0.7rem] text-zinc-500">—</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}

              {/* ── TOTALS row ── */}
              {activeRows.length > 0 && (
                <>
                  <tr className="border-t-2 border-gray-900 bg-sky-50">
                    <td className="py-2 px-2 text-xs font-bold text-zinc-950 italic">TOTALS</td>
                    <td className="py-2 px-2 text-right text-xs text-zinc-500">—</td>
                    <td className="py-2 px-2 text-right text-xs font-bold text-zinc-950">{ppuUnits > 0 ? fmt(ppuCost) : "—"}</td>
                    <td className="py-2 px-2 text-right text-xs font-bold text-zinc-950">{fmtPct(totalMarkupPct)}</td>
                    <td className="py-2 px-2 text-right text-xs font-bold text-zinc-950">{ppuUnits > 0 ? fmt(ppuCustomer) : "—"}</td>
                    <td className="py-2 px-2 text-right text-xs font-bold text-zinc-950">{fmt(activeTotalPrice)}</td>
                    <td className="py-2 px-2 text-right text-xs font-bold text-zinc-950">{fmt(activeTotalCost)}</td>
                    <td className="py-2 px-2 text-right text-xs font-bold text-zinc-950">{fmt(totalMarginDollars)}</td>
                    <td className="py-2 px-2 text-right text-xs font-bold text-zinc-950">{fmtPct(totalMarginPct)}</td>
                    <td className="py-2 px-2 text-right text-xs text-zinc-500">—</td>
                    <td className="py-2 px-2 text-right text-xs text-zinc-500">—</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>


    </div>
  );
}
