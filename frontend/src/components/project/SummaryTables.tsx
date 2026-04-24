"use client";

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
const WEIGHT_UNITS     = ["g", "kg", "lb", "oz", "t"] as const;
const LEAD_TIME_UNITS  = ["wks", "days", "hrs", "mins"] as const;
const THROUGHPUT_UNITS = ["/ hr", "/ min", "/ shift", "/ day"] as const;
type WeightUnit     = typeof WEIGHT_UNITS[number];
type LeadTimeUnit   = typeof LEAD_TIME_UNITS[number];
type ThroughputUnit = typeof THROUGHPUT_UNITS[number];

const WEIGHT_TO_G: Record<WeightUnit, number> = { g: 1, kg: 1000, lb: 453.592, oz: 28.3495, t: 1_000_000 };
const fmtWeight = (g: number, unit: WeightUnit) => {
  const val = g / WEIGHT_TO_G[unit];
  return `${val >= 1000 ? val.toLocaleString("en-US", { maximumFractionDigits: 1 }) : val.toFixed(val < 0.1 ? 4 : 2)} ${unit}`;
};

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
  const cls = `py-2 px-2 text-right text-xs ${bold ? "font-bold text-gray-900" : "text-gray-700"}`;
  if (val === null || val === 0)
    return <td className={`${cls} text-gray-300`}>—</td>;
  return <td className={cls}>{formatter(val)}</td>;
}

// ── UOM dropdown inside a <th> ────────────────────────────────────────────────
function UomSelect<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="text-[0.55rem] font-semibold text-gray-400 bg-transparent border-none outline-none cursor-pointer hover:text-gray-600 ml-1"
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
  const [weightUnit,      setWeightUnit]      = useState<WeightUnit>("kg");
  const [leadTimeUnit,    setLeadTimeUnit]    = useState<LeadTimeUnit>("wks");
  const [throughputUnit,  setThroughputUnit]  = useState<ThroughputUnit>("/ hr");

  // ── Totals ────────────────────────────────────────────────────
  const totalCustomerPrice = summaryRows.reduce((s, r) => s + r.customerPrice, 0);
  const totalOurCosts      = summaryRows.reduce((s, r) => s + r.ourCosts, 0);
  const totalMarginDollars = totalCustomerPrice - totalOurCosts;
  const totalMarginPct     = calcMargin(totalCustomerPrice, totalOurCosts);
  const ppuCustomer        = ppuUnits > 0 ? totalCustomerPrice / ppuUnits : 0;
  const ppuCost            = ppuUnits > 0 ? totalOurCosts / ppuUnits : 0;

  // ── Active combo ──────────────────────────────────────────────
  const activeCombo       = comboViews.find((cv) => cv.id === selectedCombo);
  const activeRows        = selectedCombo === "all" ? summaryTableRows : (activeCombo?.summaryTableRows ?? summaryTableRows);
  const activeSections    = selectedCombo === "all" ? detailSections   : (activeCombo?.detailSections   ?? detailSections);
  const activeLabel       = activeCombo?.label;

  const activeTotalCost   = activeRows.reduce((s, r) => s + (r.totalCost  ?? 0), 0);
  const activeTotalPrice  = activeRows.reduce((s, r) => s + (r.totalPrice ?? 0), 0);
  const activeTotalUnits  = activeRows.reduce((s, r) => s + (r.totalUnits ?? 0), 0);
  const activeTotalWt     = activeRows.reduce((s, r) => s + (r.totalWeight ?? 0), 0);

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
  const thBase   = "py-2 px-2 text-right text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap border-b-2 border-gray-900";

  return (
    <div className="p-4 flex flex-col gap-3">

      {/* ══ Unified Details table ══════════════════════════════════ */}
      <div className="border border-gray-100 rounded-sm overflow-hidden">

        {/* Header bar */}
        <div className="flex items-center bg-gray-50 border-b border-gray-100 px-3 py-2 gap-3">
          <span className="text-xs font-semibold text-black uppercase tracking-wide shrink-0">Details</span>
          {activeLabel && <span className="text-[0.6rem] text-gray-400 truncate">{activeLabel}</span>}
          {comboViews.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap ml-auto">
              <button onClick={() => setSelectedCombo("all")}
                className={`h-5 px-2 text-[0.6rem] font-semibold rounded-full transition-colors ${selectedCombo === "all" ? "bg-[#e8473f] text-white" : "text-gray-400 hover:text-gray-600"}`}>
                All
              </button>
              {comboViews.map((cv, i) => (
                <button key={cv.id} onClick={() => setSelectedCombo(cv.id)} title={cv.label}
                  className={`h-5 px-2 text-[0.6rem] font-semibold rounded-full transition-colors ${selectedCombo === cv.id ? "bg-[#e8473f] text-white" : "text-gray-400 hover:text-gray-600"}`}>
                  #{i + 1}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 940 }}>
            <thead>
              <tr>
                <th className="py-2 px-2 text-left text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider border-b-2 border-gray-900 w-32">Line Item</th>
                <th className={thBase}>
                  <div className="flex items-center justify-end">
                    <span>Throughput</span>
                    <UomSelect value={throughputUnit} options={THROUGHPUT_UNITS} onChange={setThroughputUnit} />
                  </div>
                </th>
                <th className={thBase}>
                  <div className="flex items-center justify-end">
                    <span>Lead Time</span>
                    <UomSelect value={leadTimeUnit} options={LEAD_TIME_UNITS} onChange={setLeadTimeUnit} />
                  </div>
                </th>
                <th className={thBase}>Price / Unit</th>
                <th className={thBase}>
                  <div className="flex items-center justify-end">
                    <span>Total Weight</span>
                    <UomSelect value={weightUnit} options={WEIGHT_UNITS} onChange={setWeightUnit} />
                  </div>
                </th>
                <th className={thBase}>Total Units</th>
                <th className={thBase}>Our Cost</th>
                <th className={thBase}>Customer Price</th>
                <th className={thBase}>Margin $$</th>
                <th className={thBase}>Margin %%</th>
              </tr>
            </thead>
            <tbody>
              {activeRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-4 text-center text-xs text-gray-400 italic">
                    No data yet — fill in project details and columns
                  </td>
                </tr>
              ) : activeRows.map((row) => {
                const section   = sectionByLabel.get(row.label);
                const hasDetail = !!section && row.label !== "Setup / QA Fee";
                const expanded  = expandedRows.has(row.label);
                const custPrice = row.totalPrice ?? 0;
                const ourCost   = row.totalCost  ?? 0;
                const marginD   = custPrice - ourCost;
                const marginPct = calcMargin(custPrice, ourCost);

                return (
                  <Fragment key={row.label}>
                    {/* ── Summary row ── */}
                    <tr
                      onClick={() => hasDetail && toggleRow(row.label)}
                      className={`border-b border-gray-100 ${hasDetail ? "cursor-pointer hover:bg-gray-50/70" : "hover:bg-gray-50/30"}`}
                    >
                      <td className="py-2 px-2 text-xs text-gray-700 font-medium">
                        <div className="flex items-center gap-1">
                          {hasDetail && (
                            expanded
                              ? <ChevronUp size={10} className="text-gray-400 shrink-0" />
                              : <ChevronDown size={10} className="text-gray-400 shrink-0" />
                          )}
                          {row.label}
                          {section?.overageReq != null && (
                            <span className="ml-1 text-[0.55rem] text-amber-600 bg-amber-50 px-1 py-0.5 rounded-full whitespace-nowrap">
                              +{section.overageReq}%
                            </span>
                          )}
                        </div>
                      </td>
                      <DataCell val={row.throughput}    formatter={(v) => fmtThroughput(v, throughputUnit)} />
                      <DataCell val={row.leadTimeWeeks} formatter={(v) => fmtLeadTime(v, leadTimeUnit)} />
                      <DataCell val={row.costPerUnit}   formatter={fmt} />
                      <DataCell val={row.totalWeight}   formatter={(v) => fmtWeight(v, weightUnit)} />
                      <DataCell val={row.totalUnits}    formatter={(v) => Math.round(v).toLocaleString("en-US")} />
                      <DataCell val={ourCost   || null} formatter={fmt} />
                      <DataCell val={custPrice || null} formatter={fmt} />
                      <DataCell val={marginD   || null} formatter={fmt} />
                      <DataCell val={custPrice > 0 ? marginPct : null} formatter={fmtPct} />
                    </tr>

                    {/* ── Expanded detail sub-rows ── */}
                    {hasDetail && expanded && section!.rows.map((dRow) => (
                      <tr key={dRow.label} className="border-b border-gray-50 bg-gray-50/40">
                        <td className="py-1 pl-6 pr-2 text-[0.7rem] text-gray-500">{dRow.label}</td>
                        {/* Throughput / Lead Time / Price/Unit / Weight / Units columns — empty for detail rows */}
                        <td className="py-1 px-2 text-right text-[0.7rem] text-gray-300">—</td>
                        <td className="py-1 px-2 text-right text-[0.7rem] text-gray-300">—</td>
                        <td className="py-1 px-2 text-right text-[0.7rem] text-gray-300">—</td>
                        <td className="py-1 px-2 text-right text-[0.7rem] text-gray-300">—</td>
                        <td className="py-1 px-2 text-right text-[0.7rem] text-gray-500">
                          {!dRow.isCurrency && dRow.projectDetails !== null
                            ? dRow.projectDetails.toLocaleString("en-US", { maximumFractionDigits: 2 })
                            : "—"}
                        </td>
                        <td className="py-1 px-2 text-right text-[0.7rem] text-gray-500">
                          {dRow.isCurrency && dRow.projectCosts !== null ? fmt(dRow.projectCosts) : "—"}
                        </td>
                        <td className="py-1 px-2 text-right text-[0.7rem] text-gray-500">
                          {dRow.isCurrency && dRow.projectDetails !== null ? fmt(dRow.projectDetails) : "—"}
                        </td>
                        <td className="py-1 px-2 text-right text-[0.7rem] text-gray-300">—</td>
                        <td className="py-1 px-2 text-right text-[0.7rem] text-gray-300">—</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}

              {/* ── TOTALS row ── */}
              {activeRows.length > 0 && (
                <>
                  <tr className="border-t-2 border-gray-900 bg-sky-50">
                    <td className="py-2 px-2 text-xs font-bold text-gray-900 italic">TOTALS</td>
                    <td className="py-2 px-2 text-right text-xs text-gray-300">—</td>
                    <td className="py-2 px-2 text-right text-xs text-gray-300">—</td>
                    <td className="py-2 px-2 text-right text-xs text-gray-300">—</td>
                    <td className="py-2 px-2 text-right text-xs font-bold text-gray-900">{activeTotalWt > 0 ? fmtWeight(activeTotalWt, weightUnit) : "—"}</td>
                    <td className="py-2 px-2 text-right text-xs font-bold text-gray-900">{activeTotalUnits > 0 ? Math.round(activeTotalUnits).toLocaleString("en-US") : "—"}</td>
                    <td className="py-2 px-2 text-right text-xs font-bold text-gray-900">{fmt(activeTotalCost)}</td>
                    <td className="py-2 px-2 text-right text-xs font-bold text-gray-900">{fmt(activeTotalPrice)}</td>
                    <td className="py-2 px-2 text-right text-xs font-bold text-gray-900">{fmt(totalMarginDollars)}</td>
                    <td className="py-2 px-2 text-right text-xs font-bold text-gray-900">{fmtPct(totalMarginPct)}</td>
                  </tr>
                  <tr className="bg-sky-50">
                    <td className="py-1.5 px-2 text-xs font-bold text-gray-900 italic">PPU</td>
                    <td className="py-1.5 px-2 text-right text-xs text-gray-300">—</td>
                    <td className="py-1.5 px-2 text-right text-xs text-gray-300">—</td>
                    <td className="py-1.5 px-2 text-right text-xs text-gray-300">—</td>
                    <td className="py-1.5 px-2 text-right text-xs text-gray-300">—</td>
                    <td className="py-1.5 px-2 text-right text-xs text-gray-300">—</td>
                    <td className="py-1.5 px-2 text-right text-xs font-bold text-gray-900">{ppuUnits > 0 ? fmt(ppuCost) : "—"}</td>
                    <td className="py-1.5 px-2 text-right text-xs font-bold text-gray-900">{ppuUnits > 0 ? fmt(ppuCustomer) : "—"}</td>
                    <td className="py-1.5 px-2 text-right text-xs text-gray-300">—</td>
                    <td className="py-1.5 px-2 text-right text-xs text-gray-300">—</td>
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
