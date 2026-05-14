import { useState, useMemo } from "react";
import { X } from "lucide-react";
import { MoqRow, Column, ProjectFormData } from "@/lib/types";

const GRAMS_PER_UNIT: Record<string, number> = { g: 1, oz: 28.3495, lb: 453.592, kg: 1000, "fl oz": 29.5735 };
const n = (s: string | undefined) => parseFloat(s || "0") || 0;
const lbs = (g: number) => g / 453.592;
const fmt = (lb: number) => lb.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

interface Props {
  row:      MoqRow;
  formData: ProjectFormData;
  columns:  Column[];
  onUse:    (pallets: number) => void;
  onClose:  () => void;
}

export default function PalletToolPopover({ row, formData, columns, onUse, onClose }: Props) {
  const moqQty        = n(row.individualUnits) || n(row.moq);
  const unitsPerInner = n(row.unitsPerInner);
  const inners        = unitsPerInner > 0 ? Math.ceil(moqQty / unitsPerInner) : 0;
  const ipm           = n(row.innersPerMaster);
  const shippers      = ipm > 0 ? Math.ceil(inners / ipm) : 0;

  const unitWeightG = n(formData.unitWeight) * (GRAMS_PER_UNIT[formData.unitWeightUnit ?? "g"] ?? 1);
  const materialOverage = n(formData.materialOverage);
  const rawUnits    = Math.ceil(moqQty * (1 + materialOverage / 100));
  const rawGrams    = rawUnits * unitWeightG;

  // Per-column packaging weight breakdown
  const colWeights = useMemo(() => {
    return columns.map((col) => {
      const pwg  = n(col.rows?.["Packaging Weight (g)"]);
      if (pwg <= 0) return { label: col.type || col.level, lbs: 0 };
      const over = n(col.rows?.["Overage Rate"]);
      let baseUnits = 0;
      if (col.level === "Individual Units" || col.level === "Final Kit Units") baseUnits = moqQty;
      else if (col.level === "Inner / Case") baseUnits = inners;
      else if (col.level === "Shipper / Outer") baseUnits = shippers;
      const uReq = baseUnits * (1 + over / 100);
      return { label: col.type || col.level, lbs: lbs(uReq * pwg) };
    }).filter(c => c.lbs > 0);
  }, [columns, moqQty, inners, shippers]);

  const packagingLbs = colWeights.reduce((s, c) => s + c.lbs, 0);
  const rawLbs       = lbs(rawGrams);
  const totalLbs     = rawLbs + packagingLbs;

  const [maxWeight, setMaxWeight] = useState(String(n(formData.maxPalletWeightLbs) || 1000));
  // Default buffer to 0: pallet count is calculated, buffer is additive and user-controlled
  const [buffer,    setBuffer]    = useState(String(n(formData.palletBuffer)));

  const maxW  = n(maxWeight) || 1000;
  const buf   = n(buffer);
  const calc  = Math.ceil(totalLbs / maxW);
  const total = calc + buf;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl border border-gray-200 w-80 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-semibold text-gray-800">🧮 Pallet Calculator</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          {/* Context */}
          <p className="text-[0.6rem] text-gray-400 uppercase tracking-wider font-semibold">
            {moqQty.toLocaleString()} units · {unitsPerInner}pk
          </p>

          {/* Weight Breakdown */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
            <p className="text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider mb-2">Weight Breakdown</p>
            <div className="flex justify-between text-xs text-gray-600">
              <span>Raw Materials</span>
              <span className="font-medium">{fmt(rawLbs)} lbs</span>
            </div>
            {colWeights.map((c, i) => (
              <div key={i} className="flex justify-between text-xs text-gray-600">
                <span>{c.label}</span>
                <span className="font-medium">{fmt(c.lbs)} lbs</span>
              </div>
            ))}
            {colWeights.length === 0 && (
              <p className="text-[0.6rem] text-gray-400 italic">No packaging weights entered</p>
            )}
            <div className="border-t border-gray-200 pt-1.5 flex justify-between text-xs font-semibold text-gray-800">
              <span>Total</span>
              <span>{fmt(totalLbs)} lbs</span>
            </div>
          </div>

          {/* Inputs */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs text-gray-600">Max Weight / Pallet</span>
              <div className="flex items-center border border-amber-200 rounded-md overflow-hidden">
                <input
                  type="number"
                  value={maxWeight}
                  onChange={(e) => setMaxWeight(e.target.value)}
                  className="w-16 h-7 px-2 text-xs text-right bg-amber-50/50 focus:outline-none"
                />
                <span className="px-2 text-[0.6rem] text-gray-400 bg-amber-50/50 h-7 flex items-center border-l border-amber-200">lbs</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs text-gray-600">Buffer Pallets</span>
              <input
                type="number"
                value={buffer}
                onChange={(e) => setBuffer(e.target.value)}
                className="w-20 h-7 px-2 text-xs text-right border border-amber-200 rounded-md bg-amber-50/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Result */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>ceil({fmt(totalLbs)} ÷ {fmt(maxW)})</span>
              <span>{calc} pallets</span>
            </div>
            <div className="flex justify-between text-xs text-gray-600 mb-2">
              <span>+ Buffer</span>
              <span>{buf} pallets</span>
            </div>
            <div className="border-t border-amber-200 pt-2 flex justify-between text-sm font-bold text-gray-900">
              <span>Recommended</span>
              <span>{total} pallets</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={() => onUse(total)}
            className="flex-1 h-8 text-xs font-semibold text-white bg-[#e8473f] hover:bg-[#c73d36] rounded-lg transition-colors"
          >
            Use {total} Pallets
          </button>
          <button
            onClick={onClose}
            className="h-8 px-3 text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
