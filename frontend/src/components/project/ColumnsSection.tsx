"use client";

import { useRef, useMemo } from "react";
import { Plus, Minus, Link2 } from "lucide-react";
import { Column } from "@/lib/types";

// ── Derivation logic ─────────────────────────────────────────────────────────
// A derived column (sourceId set) auto-computes units and fill rate from its
// source column scaled by (derivedPack / sourcePack).
// All other rows copy verbatim from the source.
function derivedRows(
  source: Column,
  srcPack: number,
  dstPack: number,
): Record<string, string> {
  const scale = dstPack / srcPack; // e.g. 48/24 = 2  →  half as many cases, double fill rate
  const srcRows = source.rows ?? {};
  return {
    ...srcRows,
    // fill rate scales inversely with pack size (fewer cases → faster per-case line)
    "Unit Fill Rate / min": srcRows["Unit Fill Rate / min"]
      ? String(parseFloat(srcRows["Unit Fill Rate / min"]) * scale)
      : "",
    // all other fields copy directly
  };
}

function getDerivedUnits(source: Column, srcPack: number, dstPack: number): string {
  const n = parseFloat(source.units || "0");
  if (!n) return "";
  return String(Math.ceil(n * (srcPack / dstPack))); // more units per pack → fewer packs needed
}

const displayRows = [
  "Overage Rate",
  "Wage Rate",
  "Unit Fill Rate / min",
  "Packaging Cost / unit",
  "Label Print Cost / unit",
  "Label Apply Rate / min",
  "Packaging Weight (g)",
  "No. of Staff / Stations",
  "Hrs / Shift",
  "Working Days",
  "Tab Cost / unit",
];

const tabLockedRows = ["Tab Cost / unit"];

// rowDisplayLabel is used for static rows only.
// "Packaging Cost / unit" is rendered dynamically based on col.type — see below.
const rowDisplayLabel: Record<string, string> = {
  "Overage Rate":              "Overage Rate",
  "Wage Rate":                 "Wage Rate",
  "Unit Fill Rate / min":      "Unit Fill Rate / Min",
  "Packaging Cost / unit":     "Packaging Cost / Unit",
  "Label Print Cost / unit":   "Label Print Cost / Unit",
  "Label Apply Rate / min":    "Label Apply Rate / Min",
  "Packaging Weight (g)":      "Packaging Weight",
  "No. of Staff / Stations":   "No. of Staff / Stations",
  "Hrs / Shift":               "Hrs / Shift",
  "Working Days":              "Working Days",
  "Tab Cost / unit":           "Tab Cost / Unit",
};

const rowSymbol: Record<string, { symbol: string; position: "prefix" | "suffix" }> = {
  "Overage Rate":             { symbol: "%", position: "suffix" },
  "Wage Rate":                { symbol: "$", position: "prefix" },
  "Unit Fill Rate / min":     { symbol: "",  position: "suffix" },
  "Packaging Cost / unit":    { symbol: "$", position: "prefix" },
  "Label Print Cost / unit":  { symbol: "$", position: "prefix" },
  "Label Apply Rate / min":   { symbol: "",  position: "suffix" },
  "Packaging Weight (g)":     { symbol: "g", position: "suffix" },
  "No. of Staff / Stations":  { symbol: "",  position: "suffix" },
  "Hrs / Shift":              { symbol: "",  position: "suffix" },
  "Working Days":             { symbol: "",  position: "suffix" },
  "Tab Cost / unit":          { symbol: "$", position: "prefix" },
};

// ── Level options ───────────────────────────────────────────────────────────
const levelOptions = [
  "Individual Units",
  "Final Kit Units",
  "Inner / Case",
  "Shipper / Outer",
  "Pallet",
];

// ── Autofill defaults per level (update values once Excel is confirmed) ─────
type LevelDefaults = {
  efficiency: string;
  labor: string;
  unitCost: string;
  rows: Record<string, string>;
};

const levelDefaults: Record<string, LevelDefaults> = {
  "Individual Units": { efficiency: "", labor: "", unitCost: "", rows: {} },
  "Final Kit Units":  { efficiency: "", labor: "", unitCost: "", rows: {} },
  "Inner / Case":     { efficiency: "", labor: "", unitCost: "", rows: {} },
  "Shipper / Outer":  { efficiency: "", labor: "", unitCost: "", rows: {} },
  "Pallet":           { efficiency: "", labor: "", unitCost: "", rows: {} },
};

export const emptyColumn = (): Column => ({
  id: Date.now() + Math.random(),
  efficiency: "",
  labor: "",
  unitCost: "",
  level: "",
  type: "",
  units: "",
  tabs: false,
  rows: Object.fromEntries(displayRows.map((r) => [r, ""])),
});

interface Props {
  expanded?: boolean;
  columns: Column[];
  setColumns: React.Dispatch<React.SetStateAction<Column[]>>;
}

export default function ColumnsSection({
  expanded = false,
  columns,
  setColumns,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const addColumn = () => setColumns((prev) => [...prev, emptyColumn()]);

  const removeColumn = () =>
    setColumns((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));

  const updateColumn = (id: number, field: keyof Column, value: string | boolean) =>
    setColumns((prev) =>
      prev.map((col) => (col.id === id ? { ...col, [field]: value } : col))
    );

  const updateColumnRow = (id: number, rowName: string, value: string) =>
    setColumns((prev) =>
      prev.map((col) =>
        col.id === id ? { ...col, rows: { ...col.rows, [rowName]: value } } : col
      )
    );

  // ── Effective columns: derived columns get auto-computed values ───────────
  const effectiveCols = useMemo(() => {
    const byId = new Map(columns.map((c) => [c.id, c]));
    return columns.map((col) => {
      if (!col.sourceId) return col;
      const src     = byId.get(col.sourceId);
      if (!src) return col;
      const srcPack = parseFloat(src.unitsPerInner  || col.rows?.["Source Pack"] || "24") || 24;
      const dstPack = parseFloat(col.unitsPerInner  || "48") || 48;
      return {
        ...col,
        units: getDerivedUnits(src, srcPack, dstPack),
        rows:  { ...col.rows, ...derivedRows(src, srcPack, dstPack) },
      };
    });
  }, [columns]);

  // Selecting a level autofills all defaults for that level
  const handleLevelChange = (id: number, level: string) => {
    const defaults = levelDefaults[level];
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== id) return col;
        if (!defaults) return { ...col, level };
        return {
          ...col,
          level,
          efficiency: defaults.efficiency,
          labor:      defaults.labor,
          unitCost:   defaults.unitCost,
          rows:       { ...col.rows, ...defaults.rows },
        };
      })
    );
  };

  const baseInput =
    "h-7 px-2 rounded-none border border-gray-200 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-transparent transition bg-amber-50 w-full";
  const plainInput =
    "h-7 px-2 rounded-none border border-gray-200 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-transparent transition bg-white w-full";
  const lockedInput =
    "h-7 px-2 rounded-none border border-gray-100 text-xs text-gray-300 placeholder:text-gray-200 bg-gray-50 w-full cursor-not-allowed";
  const pctBadge =
    "text-[0.6rem] font-medium text-gray-400 border border-l-0 border-gray-200 h-7 flex items-center px-2 bg-white shrink-0 select-none";

  const COL_WIDTH   = 220;
  const LABEL_WIDTH = 200;

  return (
    <div className={`px-6 py-4 transition-all duration-300 ${expanded ? "max-w-none" : "max-w-6xl"}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-900 shrink-0">
            Packaging and Packouts
          </h2>
          <div className="flex items-center gap-1 flex-wrap">
            {columns.map((col) => (
              <span
                key={col.id}
                className="h-5 px-2 text-[0.6rem] font-semibold rounded-full bg-gray-100 text-gray-600 flex items-center whitespace-nowrap"
              >
                {col.type || `Col ${columns.indexOf(col) + 1}`}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={removeColumn}
            disabled={columns.length <= 1}
            className="w-6 h-6 flex items-center justify-center border border-gray-200 text-gray-500 hover:border-[#e8473f] hover:text-[#e8473f] hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Minus size={11} />
          </button>
          <button
            onClick={addColumn}
            className="w-6 h-6 flex items-center justify-center border border-gray-200 text-gray-500 hover:border-[#e8473f] hover:text-[#e8473f] hover:bg-red-50 transition-colors"
          >
            <Plus size={11} />
          </button>
        </div>
      </div>

      {/* Main Scrollable Content — table layout so sticky td works */}
      <div ref={scrollRef} className="overflow-x-auto">
        <table className="border-collapse" style={{ minWidth: LABEL_WIDTH + columns.length * COL_WIDTH }}>
          <colgroup>
            <col style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }} />
            {columns.map((col) => <col key={col.id} style={{ width: COL_WIDTH, minWidth: COL_WIDTH }} />)}
          </colgroup>
          <tbody>

            {/* ── Markup headers row ── */}
            <tr>
              <td className="sticky left-0 z-10 bg-white" />
              {columns.map((col, index) => {
                const isDerived = !!col.sourceId;
                const srcCol    = isDerived ? columns.find(c => c.id === col.sourceId) : null;
                const srcPack   = parseFloat(srcCol?.unitsPerInner || "24") || 24;
                const dstPack   = parseFloat(col.unitsPerInner || "48") || 48;
                const ratio     = dstPack / srcPack;
                return (
                  <td key={col.id} className={`px-2 pt-1 pb-2 align-top ${isDerived ? "bg-blue-50/40" : ""}`}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <p className="text-[0.6rem] font-medium text-gray-400">Level {index + 1}</p>
                      {isDerived && (
                        <span className="flex items-center gap-0.5 text-[0.55rem] font-semibold text-blue-500 bg-blue-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                          <Link2 size={8} />
                          Auto from {srcCol?.type || `col ${col.sourceId}`} × {ratio}
                        </span>
                      )}
                    </div>

                    {/* Helper derivation panel for derived columns */}
                    {isDerived && srcCol && (
                      <div className="mb-2 p-2 bg-blue-50 border border-blue-100 rounded text-[0.6rem] text-blue-700 space-y-0.5">
                        <p className="font-semibold text-blue-600 mb-1">Derivation logic</p>
                        <p>Pack ratio: {srcPack}pk → {dstPack}pk = ×{ratio}</p>
                        <p>Units: {srcCol.units || "?"} ÷ {ratio} = <strong>{effectiveCols.find(e => e.id === col.id)?.units || "?"}</strong></p>
                        <p>Fill rate: {srcCol.rows?.["Unit Fill Rate / min"] || "?"}×{ratio} = <strong>{effectiveCols.find(e => e.id === col.id)?.rows?.["Unit Fill Rate / min"] || "?"}</strong>/min</p>
                        <p className="text-blue-400 italic">All other values copied from source</p>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <div>
                        <p className="text-[0.55rem] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                          Eff. Buffer <span className="normal-case text-gray-300 font-normal">(% slower)</span>
                        </p>
                        <div className="flex items-center">
                          <input type="number" value={col.efficiency} onChange={(e) => updateColumn(col.id, "efficiency", e.target.value)} className={plainInput} />
                          <span className={pctBadge}>%</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[0.55rem] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Labor Markup</p>
                        <div className="flex items-center">
                          <input type="number" value={col.labor} onChange={(e) => updateColumn(col.id, "labor", e.target.value)} className={plainInput} />
                          <span className={pctBadge}>%</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[0.55rem] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Unit Cost Markup</p>
                        <div className="flex items-center">
                          <input type="number" value={col.unitCost} onChange={(e) => updateColumn(col.id, "unitCost", e.target.value)} className={plainInput} />
                          <span className={pctBadge}>%</span>
                        </div>
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>

            {/* ── Level ── */}
            <tr>
              <td className="sticky left-0 z-10 bg-white py-1 pr-2 text-xs font-medium text-gray-500">Level</td>
              {columns.map((col) => (
                <td key={col.id} className={`px-2 py-1 ${col.sourceId ? "bg-blue-50/40" : ""}`}>
                  <select value={col.level} onChange={(e) => handleLevelChange(col.id, e.target.value)} className={baseInput}>
                    <option value="">— select level —</option>
                    {levelOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </td>
              ))}
            </tr>

            {/* ── Type ── */}
            <tr>
              <td className="sticky left-0 z-10 bg-white py-1 pr-2 text-xs font-medium text-gray-500">Type</td>
              {columns.map((col) => (
                <td key={col.id} className={`px-2 py-1 ${col.sourceId ? "bg-blue-50/40" : ""}`}>
                  <input type="text" value={col.type} onChange={(e) => updateColumn(col.id, "type", e.target.value)} placeholder="e.g. Bag" className={baseInput} />
                </td>
              ))}
            </tr>

            {/* ── Units ── */}
            <tr>
              <td className="sticky left-0 z-10 bg-white py-1 pr-2 text-xs font-medium text-gray-500">Units</td>
              {columns.map((col) => (
                <td key={col.id} className={`px-2 py-1 ${col.sourceId ? "bg-blue-50/40" : ""}`}>
                  <input type="number" value={col.units} onChange={(e) => updateColumn(col.id, "units", e.target.value)} className={baseInput} />
                </td>
              ))}
            </tr>

            {/* ── Tabs ── */}
            <tr>
              <td className="sticky left-0 z-10 bg-white py-1 pr-2 text-xs font-medium text-gray-500">Tabs</td>
              {columns.map((col) => (
                <td key={col.id} className={`px-2 py-2 ${col.sourceId ? "bg-blue-50/40" : ""}`}>
                  <button
                    type="button"
                    onClick={() => updateColumn(col.id, "tabs", !col.tabs)}
                    className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none ${col.tabs ? "bg-[#e8473f]" : "bg-gray-200"}`}
                  >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${col.tabs ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                </td>
              ))}
            </tr>

            {/* ── Divider ── */}
            <tr><td colSpan={columns.length + 1} className="border-t border-gray-100" /></tr>

            {/* ── Display Rows ── */}
            {displayRows.map((row) => {
              const isTabLocked     = tabLockedRows.includes(row);
              const isPackagingCost = row === "Packaging Cost / unit";
              return (
                <tr key={row} className="border-b border-gray-50">
                  <td className="sticky left-0 z-10 bg-white py-1.5 pr-3 align-middle">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-600">
                        {isPackagingCost ? "Packaging Cost / unit" : (rowDisplayLabel[row] ?? row)}
                      </span>
                      {isTabLocked && (
                        <svg className="w-2.5 h-2.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      )}
                    </div>
                  </td>
                  {columns.map((col) => {
                    const locked      = isTabLocked && !col.tabs;
                    const sym         = rowSymbol[row];
                    const badge       = "text-[0.6rem] font-medium text-gray-400 border border-gray-200 h-7 flex items-center px-2 bg-amber-50 shrink-0 select-none";
                    const lockedBadge = "text-[0.6rem] font-medium text-gray-200 border border-gray-100 h-7 flex items-center px-2 bg-gray-50 shrink-0 select-none";
                    return (
                      <td key={col.id} className={`px-2 py-1.5 align-top ${col.sourceId ? "bg-blue-50/40" : ""}`}>
                        {isPackagingCost && (
                          <p className="text-[0.6rem] text-gray-400 mb-0.5 truncate">
                            {col.type ? `${col.type} - Cost/unit` : "Packaging Cost / unit"}
                          </p>
                        )}
                        <div className="flex items-center">
                          {sym?.position === "prefix" && sym.symbol && (
                            <span className={`${locked ? lockedBadge : badge} border-r-0`}>{sym.symbol}</span>
                          )}
                          <input
                            type="number"
                            value={locked ? "" : (col.rows?.[row] ?? "")}
                            onChange={(e) => !locked && updateColumnRow(col.id, row, e.target.value)}
                            placeholder="0"
                            disabled={locked}
                            className={locked ? lockedInput : baseInput}
                          />
                          {sym?.position === "suffix" && sym.symbol && (
                            <span className={`${locked ? lockedBadge : badge} border-l-0`}>{sym.symbol}</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}

          </tbody>
        </table>
      </div>
    </div>
  );
}