import { useEffect, useRef } from "react";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import { Column } from "@/lib/types";
import { useProject } from "@/lib/ProjectContext";
import { PRESET_NAMES, emptyColumn } from "@/components/project/ColumnsSection";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PackagingSummaryRow {
  id:          number;
  level:       string;
  type:        string;
  costPerUnit: string;
  // Per-MOQ manual unit overrides. Key = moqRow.id (as string for JSON compat).
  // When present for a given MOQ, this overrides the auto-derived unit count
  // for that packaging level in ALL downstream calculations.
  manualUnits?: Record<string, string>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const LEVEL_OPTIONS = [
  "Individual Units",
  "Final Kit Units",
  "Inner / Case",
  "Shipper / Outer",
  "Pallet",
];

const n = (s: string | undefined) => parseFloat(s || "0") || 0;

function newSummaryRow(): PackagingSummaryRow {
  return { id: Date.now() + Math.random(), level: "", type: "", costPerUnit: "" };
}

function buildGeneratedColumn(row: PackagingSummaryRow, existingCol?: Column): Column {
  const base = existingCol ?? emptyColumn();
  return {
    ...base,
    level:        row.level,
    type:         row.type,
    summaryId:    row.id,
    summaryDirty: false,
    rows: { ...base.rows, "Packaging Cost / unit": row.costPerUnit },
  };
}

// Derive the auto-calculated unit count for a level from MOQ scalars
function autoUnits(
  level: string,
  moqQty: number, upi: number, ipm: number,
  autoPallets: number,
): number {
  switch (level) {
    case "Individual Units":
    case "Final Kit Units": return moqQty;
    case "Inner / Case":    return upi > 0 ? Math.ceil(moqQty / upi) : 0;
    case "Shipper / Outer": {
      const inners = upi > 0 ? Math.ceil(moqQty / upi) : 0;
      return ipm > 0 ? Math.ceil(inners / ipm) : 0;
    }
    case "Pallet": return autoPallets;
    default: return 0;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  summaryRows:    PackagingSummaryRow[];
  setSummaryRows: React.Dispatch<React.SetStateAction<PackagingSummaryRow[]>>;
}

export default function PackagingSummarySection({ summaryRows, setSummaryRows }: Props) {
  const {
    moqRows, activeMoqId, formData,
    columns, setColumns,
    perMoqSummaryRows,
  } = useProject();

  // ── Derive unit counts for the active MOQ ────────────────────────────────
  const activeRow = moqRows.find(r => r.id === activeMoqId) ?? moqRows[0];
  const moqQty    = n(activeRow?.individualUnits) || n(activeRow?.moq) || 0;
  const upi       = n(activeRow?.unitsPerInner);
  const ipm       = n(activeRow?.innersPerMaster);

  const moqSRows    = perMoqSummaryRows.get(activeRow?.id ?? 0) ?? [];
  const palletSRow  = moqSRows.find(r => r.label === "Pallets & Fees");
  const outFee      = n(formData.outboundFee);
  const autoPallets = palletSRow && outFee > 0 ? Math.round(palletSRow.ourCosts / outFee) : 0;

  // Get the displayed/effective unit count for a summary row + active MOQ
  const effectiveUnits = (row: PackagingSummaryRow): string => {
    const manual = row.manualUnits?.[String(activeRow?.id)];
    if (manual !== undefined && manual !== "") return manual;
    const derived = autoUnits(row.level, moqQty, upi, ipm, autoPallets);
    return derived > 0 ? String(derived) : "";
  };

  const isManual = (row: PackagingSummaryRow): boolean => {
    const val = row.manualUnits?.[String(activeRow?.id)];
    return val !== undefined && val !== "";
  };

  // ── One-way sync: summary rows → columns (level, type, cost, units) ──────
  const initialised = useRef(false);

  useEffect(() => {
    if (!initialised.current) return;
    setColumns(prev => {
      const summaryIds = new Set(summaryRows.map(r => r.id));
      const filtered   = prev.filter(col => !col.summaryId || summaryIds.has(col.summaryId));
      const byId       = new Map(filtered.filter(c => c.summaryId).map(c => [c.summaryId!, c]));
      const nonSummary = filtered.filter(c => !c.summaryId);
      const result: Column[] = [];

      for (const sRow of summaryRows) {
        const existing = byId.get(sRow.id);
        if (existing) {
          if (!existing.summaryDirty) {
            result.push({
              ...existing,
              level: sRow.level,
              type:  sRow.type,
              rows:  { ...existing.rows, "Packaging Cost / unit": sRow.costPerUnit },
            });
          } else {
            result.push(existing);
          }
        } else {
          result.push(buildGeneratedColumn(sRow));
        }
      }
      return [...result, ...nonSummary];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryRows]);

  // ── Init from existing columns on mount ──────────────────────────────────
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    const withSummaryId = columns.filter(c => c.summaryId);
    if (withSummaryId.length > 0) {
      setSummaryRows(withSummaryId.map(col => ({
        id:          col.summaryId!,
        level:       col.level,
        type:        col.type,
        costPerUnit: col.rows?.["Packaging Cost / unit"] ?? "",
      })));
      return;
    }
    const bootstrap = columns.filter(c => !c.sourceId).map(col => ({
      id:          Date.now() + Math.random(),
      level:       col.level,
      type:        col.type,
      costPerUnit: col.rows?.["Packaging Cost / unit"] ?? "",
    }));
    if (bootstrap.length > 0) {
      setSummaryRows(bootstrap);
      setColumns(prev => {
        const nonDerived = prev.filter(c => !c.sourceId);
        const derived    = prev.filter(c => !!c.sourceId);
        return [
          ...nonDerived.map((col, i) => ({
            ...col,
            summaryId:    bootstrap[i]?.id,
            summaryDirty: false,
          })),
          ...derived,
        ];
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Row mutation helpers ─────────────────────────────────────────────────
  const addRow    = () => setSummaryRows(prev => [...prev, newSummaryRow()]);
  const removeRow = (id: number) => setSummaryRows(prev => prev.filter(r => r.id !== id));

  const updateRow = (id: number, field: keyof Omit<PackagingSummaryRow, "manualUnits">, value: string) =>
    setSummaryRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  // Set or clear manual units for the active MOQ on a summary row
  const setManualUnits = (rowId: number, value: string) => {
    const moqKey = String(activeRow?.id);
    setSummaryRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      if (value === "") {
        // Clearing: remove the key for this MOQ
        const next = { ...(r.manualUnits ?? {}) };
        delete next[moqKey];
        return { ...r, manualUnits: Object.keys(next).length > 0 ? next : undefined };
      }
      return { ...r, manualUnits: { ...(r.manualUnits ?? {}), [moqKey]: value } };
    }));
  };

  const resetColumn = (summaryId: number) => {
    const sRow = summaryRows.find(r => r.id === summaryId);
    if (!sRow) return;
    setColumns(prev => prev.map(col => {
      if (col.summaryId !== summaryId) return col;
      return {
        ...col,
        level:        sRow.level,
        type:         sRow.type,
        summaryDirty: false,
        rows:         { ...col.rows, "Packaging Cost / unit": sRow.costPerUnit },
      };
    }));
  };

  // ── Overage warning threshold ────────────────────────────────────────────
  const overagePct = n(formData.materialOverage);

  const hasUnitsWarning = (row: PackagingSummaryRow): boolean => {
    if (!isManual(row)) return false;
    const manual  = n(effectiveUnits(row));
    const derived = autoUnits(row.level, moqQty, upi, ipm, autoPallets);
    if (derived <= 0) return false;
    const maxExpected = derived * (1 + overagePct / 100);
    return manual > maxExpected;
  };

  // ── Styling ──────────────────────────────────────────────────────────────
  const selectCls  = "h-8 w-full px-2 border border-amber-200 text-xs text-gray-900 bg-amber-50/50 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/30 focus:border-[#e8473f] transition rounded-md";
  const inputYellow = "h-8 w-full px-2 border border-amber-300 text-xs text-gray-900 bg-[#FFFDE7] focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400 transition rounded-md";
  const thCls      = "text-[0.6rem] font-semibold text-gray-400 uppercase tracking-widest pb-2";

  return (
    <div className="border border-gray-200 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-semibold text-gray-900">Packaging Summary</p>
          <p className="text-[0.6rem] text-gray-400 mt-0.5">Configure packaging types — details auto-populate below</p>
        </div>
        <button type="button" onClick={addRow}
          className="flex items-center gap-1 text-[0.6rem] font-semibold text-[#e8473f] hover:text-[#c73d36] uppercase tracking-wider transition-colors">
          <Plus size={10} strokeWidth={2.5} />Add Row
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full border-collapse" style={{ minWidth: 600 }}>
          <thead>
            <tr>
              <th className={`${thCls} text-left`} style={{ width: 160 }}>Packaging Level</th>
              <th className={`${thCls} text-left`} style={{ width: 160 }}>Packaging Type</th>
              <th className={`${thCls} text-left`} style={{ width: 130 }}># of Units</th>
              <th className={`${thCls} text-left`} style={{ width: 110 }}>Cost / Unit</th>
              <th style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {summaryRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-xs text-gray-300 italic">
                  No packaging levels — click Add Row
                </td>
              </tr>
            ) : summaryRows.map((row) => {
              const linkedCol  = columns.find(c => c.summaryId === row.id);
              const isDirty    = linkedCol?.summaryDirty ?? false;
              const manual     = isManual(row);
              const units      = effectiveUnits(row);
              const warn       = hasUnitsWarning(row);

              return (
                <tr key={row.id} className="group">
                  {/* Level */}
                  <td className="pr-2 pb-2">
                    <select value={row.level} onChange={(e) => updateRow(row.id, "level", e.target.value)} className={selectCls}>
                      <option value="">— select level —</option>
                      {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </td>

                  {/* Type */}
                  <td className="pr-2 pb-2">
                    <select value={PRESET_NAMES.includes(row.type) ? row.type : ""} onChange={(e) => updateRow(row.id, "type", e.target.value)} className={selectCls}>
                      <option value="">— select type —</option>
                      {PRESET_NAMES.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </td>

                  {/* # of Units — editable, yellow, with ↺ reset when manual */}
                  <td className="pr-2 pb-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={units}
                          onChange={(e) => setManualUnits(row.id, e.target.value)}
                          placeholder={row.level ? "auto" : "—"}
                          className={`${inputYellow} flex-1 min-w-0 ${manual ? "font-semibold" : "text-gray-500"}`}
                        />
                        {manual && (
                          <button
                            type="button"
                            onClick={() => setManualUnits(row.id, "")}
                            title="Reset to auto-derived value"
                            className="shrink-0 text-gray-400 hover:text-[#e8473f] transition-colors text-[0.7rem] leading-none"
                          >↺</button>
                        )}
                      </div>
                      {warn && (
                        <p className="text-[0.55rem] text-amber-600 leading-tight">
                          ⚠ Exceeds MOQ + overage
                        </p>
                      )}
                    </div>
                  </td>

                  {/* Cost / Unit */}
                  <td className="pr-2 pb-2">
                    <div className="flex items-center gap-0.5">
                      <span className="text-xs text-gray-400 shrink-0">$</span>
                      <input
                        type="number"
                        step="0.001"
                        value={row.costPerUnit}
                        onChange={(e) => updateRow(row.id, "costPerUnit", e.target.value)}
                        placeholder="0.000"
                        className={inputYellow}
                      />
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="pb-2">
                    <div className="flex items-center gap-1">
                      {isDirty && (
                        <button type="button" onClick={() => resetColumn(row.id)}
                          title="Reset to summary values"
                          className="text-amber-400 hover:text-amber-600 transition-colors">
                          <RotateCcw size={11} />
                        </button>
                      )}
                      {summaryRows.length > 1 && (
                        <button type="button" onClick={() => removeRow(row.id)}
                          className="text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {columns.some(c => c.summaryDirty) && (
        <p className="mt-2 text-[0.6rem] text-amber-600 flex items-center gap-1">
          <RotateCcw size={9} />
          Some packaging levels have been manually edited — click ↺ to resync from summary
        </p>
      )}
    </div>
  );
}
