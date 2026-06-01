import { useEffect, useRef } from "react";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import { Column } from "@/lib/types";
import { useProject } from "@/lib/ProjectContext";
import { PRESET_NAMES, emptyColumn } from "@/components/project/ColumnsSection";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PackagingSummaryRow {
  id: number;          // stable key
  level: string;       // packaging level
  type: string;        // packaging type (preset name or custom)
  costPerUnit: string; // user-entered cost / unit
}

// ── Level options (same as ColumnsSection) ───────────────────────────────────

const LEVEL_OPTIONS = [
  "Individual Units",
  "Final Kit Units",
  "Inner / Case",
  "Shipper / Outer",
  "Pallet",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const n = (s: string | undefined) => parseFloat(s || "0") || 0;

function newSummaryRow(): PackagingSummaryRow {
  return { id: Date.now() + Math.random(), level: "", type: "", costPerUnit: "" };
}

// Build the default column that the summary generates — minimal, just sets
// level, type, and packaging cost. All other fields stay at defaults.
function buildGeneratedColumn(row: PackagingSummaryRow, existingCol?: Column): Column {
  const base = existingCol ?? emptyColumn();
  return {
    ...base,
    level:       row.level,
    type:        row.type,
    summaryId:   row.id,
    summaryDirty: false,
    rows: {
      ...base.rows,
      "Packaging Cost / unit": row.costPerUnit,
    },
  };
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  summaryRows:    PackagingSummaryRow[];
  setSummaryRows: React.Dispatch<React.SetStateAction<PackagingSummaryRow[]>>;
}

export default function PackagingSummarySection({ summaryRows, setSummaryRows }: Props) {
  const { moqRows, activeMoqId, formData, columns, setColumns, perMoqSummaryRows } = useProject();

  // ── Derive unit counts for the active MOQ ────────────────────────────────
  const activeRow    = moqRows.find(r => r.id === activeMoqId) ?? moqRows[0];
  const moqQty       = n(activeRow?.individualUnits) || n(activeRow?.moq) || 0;
  const upi          = n(activeRow?.unitsPerInner);
  const ipm          = n(activeRow?.innersPerMaster);
  const inners       = upi > 0 ? Math.ceil(moqQty / upi) : 0;
  const shippers     = ipm > 0 ? Math.ceil(inners / ipm) : 0;

  // Auto pallet count (same derivation as ProjectDetails)
  const moqSRows     = perMoqSummaryRows.get(activeRow?.id ?? 0) ?? [];
  const palletSRow   = moqSRows.find(r => r.label === "Pallets & Fees");
  const outFee       = n(formData.outboundFee);
  const autoPallets  = palletSRow && outFee > 0 ? Math.round(palletSRow.ourCosts / outFee) : 0;

  const unitCountForLevel = (level: string): string => {
    switch (level) {
      case "Individual Units":
      case "Final Kit Units":  return moqQty > 0 ? moqQty.toLocaleString() : "—";
      case "Inner / Case":     return inners > 0 ? inners.toLocaleString() : "—";
      case "Shipper / Outer":  return shippers > 0 ? shippers.toLocaleString() : "—";
      case "Pallet":           return autoPallets > 0 ? autoPallets.toLocaleString() : "—";
      default:                 return "—";
    }
  };

  // ── One-way sync: summary rows → columns ────────────────────────────────
  // We use a ref to suppress the initial sync (don't overwrite existing columns
  // on first mount — we do the reverse: initialise summary from columns instead).
  const initialised = useRef(false);

  useEffect(() => {
    if (!initialised.current) return;

    setColumns(prev => {
      const next = [...prev];
      const summaryIds = new Set(summaryRows.map(r => r.id));

      // Remove columns whose summary row was deleted
      const filtered = next.filter(col => !col.summaryId || summaryIds.has(col.summaryId));

      // Build a map of existing generated columns by summaryId
      const byId = new Map(filtered.filter(c => c.summaryId).map(c => [c.summaryId!, c]));

      const result: Column[] = [];
      const nonSummary = filtered.filter(c => !c.summaryId);

      for (const sRow of summaryRows) {
        const existing = byId.get(sRow.id);
        if (existing) {
          // Only update if not manually dirtied
          if (!existing.summaryDirty) {
            result.push({
              ...existing,
              level: sRow.level,
              type:  sRow.type,
              rows: { ...existing.rows, "Packaging Cost / unit": sRow.costPerUnit },
            });
          } else {
            result.push(existing);
          }
        } else {
          result.push(buildGeneratedColumn(sRow));
        }
      }

      // Non-summary columns go at the end (preserve any manually added columns)
      return [...result, ...nonSummary];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryRows]);

  // ── Initialise summary from existing column data on first mount ──────────
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    // If columns already have summaryId, restore rows from them
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

    // Otherwise, bootstrap from existing non-derived columns
    const bootstrap = columns.filter(c => !c.sourceId).map(col => ({
      id:          Date.now() + Math.random(),
      level:       col.level,
      type:        col.type,
      costPerUnit: col.rows?.["Packaging Cost / unit"] ?? "",
    }));
    if (bootstrap.length > 0) {
      setSummaryRows(bootstrap);
      // Stamp summaryIds onto the existing columns so they link up
      setColumns(prev => {
        const nonDerived = prev.filter(c => !c.sourceId);
        const derived    = prev.filter(c => !!c.sourceId);
        return [
          ...nonDerived.map((col, i) => ({
            ...col,
            summaryId: bootstrap[i]?.id,
            summaryDirty: false,
          })),
          ...derived,
        ];
      });
    }
  // Run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Row mutation helpers ─────────────────────────────────────────────────
  const addRow = () => setSummaryRows(prev => [...prev, newSummaryRow()]);

  const removeRow = (id: number) => setSummaryRows(prev => prev.filter(r => r.id !== id));

  const updateRow = (id: number, field: keyof PackagingSummaryRow, value: string) =>
    setSummaryRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  // Reset a manually-dirtied column back to its summary values
  const resetColumn = (summaryId: number) => {
    const sRow = summaryRows.find(r => r.id === summaryId);
    if (!sRow) return;
    setColumns(prev => prev.map(col => {
      if (col.summaryId !== summaryId) return col;
      return {
        ...col,
        level: sRow.level,
        type:  sRow.type,
        summaryDirty: false,
        rows: { ...col.rows, "Packaging Cost / unit": sRow.costPerUnit },
      };
    }));
  };

  // ── Styling ──────────────────────────────────────────────────────────────
  const selectCls =
    "h-8 w-full px-2 border border-amber-200 text-xs text-gray-900 bg-amber-50/50 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/30 focus:border-[#e8473f] transition rounded-md";
  const inputYellow =
    "h-8 w-full px-2 border border-amber-300 text-xs text-gray-900 bg-[#FFFDE7] focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400 transition rounded-md";
  const readOnly =
    "h-8 w-full px-2 border border-gray-100 text-xs text-gray-500 bg-gray-50 rounded-md cursor-default select-none";
  const thCls =
    "text-[0.6rem] font-semibold text-gray-400 uppercase tracking-widest pb-2";

  return (
    <div className="border border-gray-200 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-semibold text-gray-900">Packaging Summary</p>
          <p className="text-[0.6rem] text-gray-400 mt-0.5">Configure packaging types — details auto-populate below</p>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1 text-[0.6rem] font-semibold text-[#e8473f] hover:text-[#c73d36] uppercase tracking-wider transition-colors"
        >
          <Plus size={10} strokeWidth={2.5} />
          Add Row
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full border-collapse" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th className={`${thCls} text-left w-40`}>Packaging Level</th>
              <th className={`${thCls} text-left w-40`}>Packaging Type</th>
              <th className={`${thCls} text-right w-24`}># of Units</th>
              <th className={`${thCls} text-left w-28`}>Cost / Unit</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody className="space-y-1">
            {summaryRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-xs text-gray-300 italic">
                  No packaging levels — click Add Row
                </td>
              </tr>
            ) : summaryRows.map((row) => {
              const linkedCol = columns.find(c => c.summaryId === row.id);
              const isDirty   = linkedCol?.summaryDirty ?? false;

              return (
                <tr key={row.id} className="group">
                  <td className="pr-2 pb-2">
                    <select
                      value={row.level}
                      onChange={(e) => updateRow(row.id, "level", e.target.value)}
                      className={selectCls}
                    >
                      <option value="">— select level —</option>
                      {LEVEL_OPTIONS.map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </td>
                  <td className="pr-2 pb-2">
                    <select
                      value={PRESET_NAMES.includes(row.type) ? row.type : ""}
                      onChange={(e) => updateRow(row.id, "type", e.target.value)}
                      className={selectCls}
                    >
                      <option value="">— select type —</option>
                      {PRESET_NAMES.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="pr-2 pb-2">
                    <div className={`${readOnly} flex items-center justify-end font-medium`}>
                      {unitCountForLevel(row.level)}
                    </div>
                  </td>
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
                  <td className="pb-2">
                    <div className="flex items-center gap-1">
                      {isDirty && (
                        <button
                          type="button"
                          onClick={() => resetColumn(row.id)}
                          title="Reset to summary values"
                          className="text-amber-400 hover:text-amber-600 transition-colors"
                        >
                          <RotateCcw size={11} />
                        </button>
                      )}
                      {summaryRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          className="text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                        >
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

      {/* Dirty-column legend */}
      {columns.some(c => c.summaryDirty) && (
        <p className="mt-2 text-[0.6rem] text-amber-600 flex items-center gap-1">
          <RotateCcw size={9} />
          Some packaging levels have been manually edited — click ↺ to resync from summary
        </p>
      )}
    </div>
  );
}
