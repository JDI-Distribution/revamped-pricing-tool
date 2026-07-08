import { useState } from "react";
import { X } from "lucide-react";
import { MoqRow, Column } from "@/lib/types";

interface Props {
  row:     MoqRow;
  columns: Column[];
  onSave:  (overrides: Record<number, string>) => void;
  onClose: () => void;
}

export default function FillRateOverridePopover({ row, columns, onSave, onClose }: Props) {
  const moqQty = parseFloat(row.individualUnits) || parseFloat(row.moq) || 0;

  // Only show columns that have a fill rate configured
  const fillCols = columns.filter(
    (c) => c.rows?.["Unit Fill Rate / min"] !== undefined && c.rows["Unit Fill Rate / min"] !== ""
  );

  const [overrides, setOverrides] = useState<Record<number, string>>(
    row.fillRateOverrides ?? {}
  );

  const set = (id: number, val: string) =>
    setOverrides((prev) => ({ ...prev, [id]: val }));

  const handleSave = () => onSave(overrides);

  const hasAny = Object.values(overrides).some(v => v !== "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl border border-gray-200 w-72 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
          <div>
            <p className="text-xs font-semibold text-zinc-900">⚙ Fill Rate Overrides</p>
            <p className="text-[0.6rem] text-zinc-600 mt-0.5">{moqQty.toLocaleString()} units row</p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-600 hover:text-zinc-700 transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          <p className="text-[0.6rem] text-zinc-600 leading-relaxed">
            Override fill rate for this MOQ row only. Leave blank to use the global value.
          </p>

          {fillCols.length === 0 && (
            <p className="text-xs text-zinc-600 italic py-2">No packaging levels with fill rates found.</p>
          )}

          {fillCols.map((col) => {
            const globalRate = col.rows?.["Unit Fill Rate / min"] ?? "";
            const override   = overrides[col.id] ?? "";
            const isActive   = override !== "";
            return (
              <div key={col.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-800 truncate flex-1">{col.type || col.level}</span>
                  {isActive && (
                    <button
type="button"                       onClick={() => set(col.id, "")}
                      className="text-[0.55rem] text-zinc-600 hover:text-red-400 transition-colors ml-2 shrink-0"
                    >
                      reset
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center border border-gray-200 rounded-md overflow-hidden flex-1">
                    <span className="text-[0.6rem] text-zinc-600 px-2 bg-gray-50 h-7 flex items-center border-r border-gray-200 shrink-0">
                      global
                    </span>
                    <span className="text-xs text-zinc-600 px-2 h-7 flex items-center bg-white">
                      {globalRate}/min
                    </span>
                  </div>
                  <div className={`flex items-center border rounded-md overflow-hidden flex-1 ${isActive ? "border-[#e8473f]" : "border-amber-200"}`}>
                    <input
                      type="number"
                      value={override}
                      onChange={(e) => set(col.id, e.target.value)}
                      placeholder="override"
                      className={`w-full h-7 px-2 text-xs text-right focus:outline-none ${isActive ? "bg-red-50 font-medium text-[#e8473f]" : "bg-amber-50/50 text-zinc-800"}`}
                    />
                    <span className="text-[0.6rem] text-zinc-600 px-1.5 bg-amber-50/50 h-7 flex items-center border-l border-amber-200 shrink-0">/min</span>
                  </div>
                </div>
              </div>
            );
          })}

          {hasAny && (
            <p className="text-[0.6rem] text-[#e8473f] font-medium">
              ⚙ {Object.values(overrides).filter(v => v !== "").length} override(s) active for this row
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
          <button
type="button"             onClick={handleSave}
            className="flex-1 h-8 text-xs font-semibold text-white bg-[#e8473f] hover:bg-[#c73d36] rounded-lg transition-colors"
          >
            Save
          </button>
          <button
type="button"             onClick={onClose}
            className="h-8 px-3 text-xs font-semibold text-zinc-600 hover:text-zinc-800 border border-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
