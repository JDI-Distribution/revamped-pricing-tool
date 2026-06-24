

import { useState, useEffect } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { BlendIngredient, MoqRow, ProjectFormData, TestingRow } from "@/lib/types";
import { useProject } from "@/lib/ProjectContext";
import CurrencyInput, { CurrencyInputType } from "@/components/ui/CurrencyInput";
import { uid } from "@/lib/uid";
import PalletToolPopover from "@/components/project/PalletToolPopover";
import FillRateOverridePopover from "@/components/project/FillRateOverridePopover";
import ConversionCalculator, { ConversionPrefill } from "@/components/ConversionCalculator";
import { defaultPackagingLevel } from "@/components/project/PackagingLevels";
import { RequiredToggle, useSectionRequired } from "@/lib/SectionRequiredContext";

// Grams per display unit — for converting when the unit dropdown changes
const GRAMS_PER: Record<string, number> = { g: 1, kg: 1000, oz: 28.3495, lbs: 453.592, "fl oz": 29.5735, mL: 1, L: 1000, lb: 453.592, mg: 0.001 };

const emptyMoqRow = (): MoqRow => ({
  id: uid(),
  moq: "",
  individualUnits: "",
  unitsPerInner: "",
  innersPerMaster: "",
});

/* ── Design tokens (module-level so they never change reference) ── */
const inputBase =
  "h-9 w-full px-3 border border-amber-200 text-xs text-gray-900 placeholder:text-gray-300 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition";
const inputKey        = `${inputBase} rounded-md`;
const inputWithPrefix = `${inputBase} rounded-r-md flex-1`;
const inputWithSuffix = `${inputBase} rounded-l-md flex-1`;
const prefixBadge =
  "text-[0.6rem] font-medium text-gray-400 border border-r-0 border-amber-200 h-9 flex items-center px-2.5 bg-amber-50/50 shrink-0 rounded-l-md select-none";
const suffixBadge =
  "text-[0.6rem] font-medium text-gray-400 border border-l-0 border-amber-200 h-9 flex items-center px-2.5 bg-amber-50/50 shrink-0 rounded-r-md select-none";


function Toggle({ enabled, onToggle, label }: { enabled: boolean; onToggle: () => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <span className="text-[0.65rem] text-gray-500">{label}</span>
      <button type="button" role="switch" aria-checked={enabled} onClick={onToggle}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${enabled ? "bg-[#e8473f]" : "bg-gray-200"}`}>
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4.5" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}

function SectionHeader({ title, open, onToggle, action, sectionId }: { title: string; open: boolean; onToggle: () => void; action?: React.ReactNode; sectionId?: string }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={onToggle} className="flex items-center gap-1.5 group min-w-0">
        <span className="text-sm font-bold text-gray-900 group-hover:text-[#e8473f] transition-colors">{title}</span>
        {open
          ? <ChevronUp size={13} className="text-gray-300 group-hover:text-[#e8473f] transition-colors shrink-0" />
          : <ChevronDown size={13} className="text-gray-300 group-hover:text-[#e8473f] transition-colors shrink-0" />}
      </button>
      {action && <div className="shrink-0">{action}</div>}
      {sectionId && <div className="ml-auto shrink-0"><RequiredToggle sectionId={sectionId} /></div>}
    </div>
  );
}

/* ── SymInput lifted outside component so its identity is stable ── */
interface SymInputProps {
  field: Exclude<keyof ProjectFormData, "testingRows">;
  type: "text" | "number";
  sym: string;
  formData: ProjectFormData;
  setFormField: (field: keyof ProjectFormData, value: string) => void;
  fullWidth?: boolean;
}
function SymInput({ field, type, sym, formData, setFormField, fullWidth }: SymInputProps) {
  const isPrefix = sym === "$";
  const rawVal   = formData[field] ?? "";

  if (type === "number") {
    // Use CurrencyInput for all numeric fields
    const numVal: number = parseFloat(rawVal as string) || 0;
    const ciType: CurrencyInputType = sym === "$" ? "dollar" : sym === "%" ? "percent" : "integer";
    return (
      <div className={`flex items-center ${fullWidth ? "w-full" : "w-full sm:w-44 shrink-0"}`}>
        {sym && isPrefix && <span className={prefixBadge}>{sym}</span>}
        <CurrencyInput
          type={ciType}
          value={numVal}
          onChange={(v) => setFormField(field, String(v))}
          className={!sym ? inputKey : isPrefix ? inputWithPrefix : inputWithSuffix}
        />
        {sym && !isPrefix && <span className={suffixBadge}>{sym}</span>}
      </div>
    );
  }

  return (
    <div className={`flex items-center ${fullWidth ? "w-full" : "w-full sm:w-44 shrink-0"}`}>
      {sym && isPrefix  && <span className={prefixBadge}>{sym}</span>}
      <input
        type="text"
        value={rawVal}
        onChange={(e) => setFormField(field, e.target.value)}
        className={!sym ? inputKey : isPrefix ? inputWithPrefix : inputWithSuffix}
      />
      {sym && !isPrefix && <span className={suffixBadge}>{sym}</span>}
    </div>
  );
}

interface Props {
  formData: ProjectFormData;
  setFormField: (field: keyof ProjectFormData, value: string) => void;
}

export default function ProjectDetails({
  formData,
  setFormField,
}: Props) {
  const [bufferUnit, setBufferUnit] = useState<"days" | "weeks">("days");
  const [convOpen,        setConvOpen]        = useState(false);
  const [convPrefill,     setConvPrefill]     = useState<ConversionPrefill | undefined>();
  const [cpoOpen,         setCpoOpen]         = useState(true);
  const [rawMatOpen,      setRawMatOpen]      = useState(true);
  const [testingOpen,     setTestingOpen]     = useState(true);
  const [blendingOpen,    setBlendingOpen]    = useState(true);
  const { setTestingRows, coPackingState, setCoPackingField, packagingLevels, setPackagingLevels } = useProject();
  const { notRequired } = useSectionRequired();

  const UNIT_OPTS = ["g", "kg", "oz", "lbs", "fl oz", "mL", "L"] as const;

  // When the unit dropdown changes, auto-convert the current value to the new unit
  const handleUnitWeightUnitChange = (newUnit: string) => {
    const currentVal  = parseFloat(formData.unitWeight) || 0;
    const currentUnit = formData.unitWeightUnit ?? "g";
    if (currentVal > 0 && currentUnit !== newUnit) {
      const grams    = currentVal * (GRAMS_PER[currentUnit] ?? 1);
      const newVal   = grams / (GRAMS_PER[newUnit] ?? 1);
      // Round to 4 sig figs for display
      const rounded  = parseFloat(newVal.toPrecision(4));
      setFormField("unitWeight", String(rounded));
    }
    setFormField("unitWeightUnit", newUnit);
  };

  const openConverter = () => {
    setConvPrefill({ value: formData.unitWeight ?? "", unit: formData.unitWeightUnit ?? "g" });
    setConvOpen(true);
  };

  /* ── Design tokens ─────────────────────────────────────────── */
  const card       = "bg-white border border-gray-200 rounded-xl overflow-hidden flex-1 min-w-0 max-w-4xl";
  const sectionRow = "flex gap-5 items-start px-4 md:px-6 mb-4";
  const outPanel    = "w-56 shrink-0 sticky top-14 bg-[#FFF8F0] border border-amber-200 rounded-xl overflow-hidden shadow-sm shadow-amber-100";
  const outTitle    = "px-3 py-2.5 text-[0.55rem] font-semibold text-amber-700 uppercase tracking-widest border-b border-amber-200 bg-amber-100/60";
  const outRow      = "flex items-start justify-between gap-3 px-3 py-2.5 border-b border-amber-100 last:border-0";
  const outLbl      = "text-[0.68rem] text-gray-500 leading-tight";
  const outVal      = "text-[0.72rem] font-semibold text-gray-800 tabular-nums text-right shrink-0 ml-2";
  const outCostSep  = "px-3 py-1.5 text-[0.52rem] font-bold text-amber-600 uppercase tracking-widest bg-amber-50 border-b border-amber-200";
  const outOurVal   = "text-[0.72rem] font-semibold text-gray-700 tabular-nums text-right shrink-0 ml-2";
  const outCxVal    = "text-[0.72rem] font-bold text-[#e8473f] tabular-nums text-right shrink-0 ml-2";

  /* ── Packaging Level helpers ──────────────────────────────── */
  const addPackagingLevel = () => {
    setPackagingLevels(prev => [...prev, defaultPackagingLevel()]);
  };
  const removePackagingLevel = (id: string) => {
    setPackagingLevels(prev => prev.filter(l => l.id !== id));
  };
  const updatePackagingLevel = (id: string, patch: { units?: number; costPerUnit?: number; customLevelName?: string; unitsRefId?: string | undefined }) => {
    setPackagingLevels(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  };

  // Compute required qty for each level in order.
  // Level with no UOM ref: requiredQty = its own units (it is the base count).
  // Level with UOM ref: requiredQty = ceil(referencedLevel.requiredQty / thisLevel.units).
  const packagingRequiredQtys: number[] = (() => {
    const qtys: number[] = [];
    for (let i = 0; i < packagingLevels.length; i++) {
      const lvl = packagingLevels[i];
      if (!lvl.unitsRefId) {
        qtys.push(lvl.units);
      } else {
        const refIdx = packagingLevels.findIndex(l => l.id === lvl.unitsRefId);
        const refQty = refIdx >= 0 ? qtys[refIdx] ?? 0 : 0;
        qtys.push(lvl.units > 0 ? Math.ceil(refQty / lvl.units) : 0);
      }
    }
    return qtys;
  })();

  // Stable dep key: serialised CPO-relevant fields — triggers sync only when CPO data actually changes.
  const _cpoSyncKey = packagingLevels
    .map(l => `${l.id}:${l.customLevelName}:${l.units}:${l.unitsRefId ?? ""}`)
    .join("|");

  // ONE-WAY SYNC: CPO → Packaging Config
  // Whenever CPO level names or Required Qtys change, mirror into the shared PackagingLevel objects.
  // Only touches `packagingType` (name) and `cpoRequiredQty` — never fills rate, wage rate, etc.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Re-compute required qtys inside the effect to get fresh values
    const qtys: number[] = [];
    for (let i = 0; i < packagingLevels.length; i++) {
      const lvl = packagingLevels[i];
      if (!lvl.unitsRefId) {
        qtys.push(lvl.units);
      } else {
        const refIdx = packagingLevels.findIndex(l => l.id === lvl.unitsRefId);
        const refQty = refIdx >= 0 ? qtys[refIdx] ?? 0 : 0;
        qtys.push(lvl.units > 0 ? Math.ceil(refQty / lvl.units) : 0);
      }
    }
    setPackagingLevels(prev =>
      prev.map((lvl, i) => {
        const cpoName = lvl.customLevelName.trim() || `Level ${i + 1}`;
        const reqQty  = qtys[i] ?? 0;
        if (lvl.packagingType === cpoName && lvl.cpoRequiredQty === reqQty) return lvl;
        return { ...lvl, packagingType: cpoName, cpoRequiredQty: reqQty };
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_cpoSyncKey]);

  // ── Shared output panel helpers ───────────────────────────────────────────
  const unitWeightG = (parseFloat(formData.unitWeight) || 0) * (GRAMS_PER[formData.unitWeightUnit ?? "g"] ?? 1);
  const indivIdx    = 0;
  const baseQty     = indivIdx >= 0 ? (packagingRequiredQtys[indivIdx] ?? 0) : (packagingRequiredQtys[0] ?? 0);
  const fmtN  = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const fmtN3 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
  const fmtD  = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const fv    = (n: number, fmt: (n: number) => string) => n > 0 ? fmt(n) : "—";

  return (
    <>
    <div className="pt-4">

      {/* ── Customer Project Overview ────────────────────────────── */}
      <div className={sectionRow}>
      <div id="section-cpo" className={card}>
        <div className="px-5 pt-4 pb-1">
          <SectionHeader title="Customer Project Overview" open={cpoOpen} onToggle={() => setCpoOpen(o => !o)} sectionId="section-cpo" />
        </div>
      {cpoOpen && !notRequired["section-cpo"] && (
        <div className="px-5 pb-5">
          <div className="divide-y divide-gray-100">

            {/* ── shared row token: label col fixed 180px, input col fills rest ── */}

            {/* Unit Size / ea */}
            <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs text-gray-600 whitespace-nowrap">Unit Size / ea</span>
                <button type="button" onClick={openConverter} className="text-[0.6rem] font-semibold text-[#e8473f] hover:text-[#c73d36] transition-colors shrink-0">
                  Converter →
                </button>
              </div>
              <div className="flex items-center">
                <input
                  type="number"
                  value={formData.unitWeight ?? ""}
                  onChange={(e) => setFormField("unitWeight", e.target.value)}
                  className="w-32 h-9 px-3 border border-amber-200 text-xs text-gray-900 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-l-md"
                />
                <select
                  value={formData.unitWeightUnit ?? "g"}
                  onChange={(e) => handleUnitWeightUnitChange(e.target.value)}
                  className="text-[0.6rem] font-medium text-gray-500 border border-l-0 border-amber-200 h-9 px-1.5 bg-amber-50/50 shrink-0 rounded-r-md focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition cursor-pointer"
                >
                  {UNIT_OPTS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Packaging Structure table */}
            <div className="pt-3 pb-2">
              <p className="text-[0.6rem] font-semibold uppercase tracking-widest text-gray-400 mb-2">Packaging Structure</p>
              <p className="text-[0.65rem] text-gray-500 mb-3">
                Define every packaging level this project moves through, from individual unit up to shipper. This sets the shape of the whole quote — labor rates and markups for each level are configured later in <strong className="font-semibold text-gray-700">Packaging Line Setup</strong>.
              </p>
              {/* Legend */}
              <div className="flex items-center gap-4 mb-3">
                <span className="flex items-center gap-1.5 text-[0.6rem] text-gray-400">
                  <span className="w-3 h-3 rounded-sm border border-amber-300 bg-amber-50/80 inline-block" />
                  Type here
                </span>
                <span className="flex items-center gap-1.5 text-[0.6rem] text-gray-400">
                  <span className="w-3 h-3 rounded-sm border border-gray-200 bg-gray-50 inline-block" />
                  Calculated
                </span>
              </div>

              <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#EDEAE0]">
                      <th className="text-left text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider px-3 py-2.5 border-b-2 border-r border-gray-300 w-[22%]">Level</th>
                      <th className="text-left text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider px-3 py-2.5 border-b-2 border-r border-gray-300">Units</th>
                      <th className="text-left text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider px-3 py-2.5 border-b-2 border-r border-gray-300">UOM</th>
                      <th className="text-left text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider px-3 py-2.5 border-b-2 border-r border-gray-300">Required Qty</th>
                      <th className="text-left text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider px-3 py-2.5 border-b-2 border-r border-gray-300">Cost / Unit</th>
                      <th className="border-b-2 border-gray-300 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {packagingLevels.map((lvl, idx) => {
                      const priorNamed  = packagingLevels.slice(0, idx).filter(l => l.customLevelName.trim());
                      const requiredQty = packagingRequiredQtys[idx] ?? 0;
                      return (
                        <tr key={lvl.id} className="border-b border-gray-200 last:border-b-0">
                          {/* Level name */}
                          <td className="border-r border-gray-200 p-2">
                            <input
                              type="text"
                              value={lvl.customLevelName}
                              onChange={e => updatePackagingLevel(lvl.id, { customLevelName: e.target.value })}
                              placeholder={`e.g. ${["Individual Unit", "Final Kit", "Inner / Case", "Shipper / Outer"][idx] ?? "Custom"}`}
                              className="h-8 w-full px-2 border border-amber-300 text-[0.65rem] text-gray-800 bg-amber-50/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/30 focus:border-[#e8473f] transition rounded placeholder:text-gray-400 placeholder:italic"
                            />
                          </td>
                          {/* # of Units */}
                          <td className="border-r border-gray-200 p-2">
                            <CurrencyInput
                              type="integer"
                              value={lvl.units}
                              onChange={v => updatePackagingLevel(lvl.id, { units: v })}
                              className="h-8 w-full px-2 border border-amber-300 text-xs text-gray-900 bg-amber-50/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/30 focus:border-[#e8473f] transition rounded tabular-nums"
                            />
                          </td>
                          {/* UOM */}
                          <td className="border-r border-gray-200 p-2 w-32">
                            <select
                              value={lvl.unitsRefId ?? ""}
                              onChange={e => updatePackagingLevel(lvl.id, { unitsRefId: e.target.value || undefined })}
                              className="h-8 w-full px-1.5 border border-amber-300 text-xs text-gray-700 bg-amber-50/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/30 focus:border-[#e8473f] transition rounded cursor-pointer"
                            >
                              <option value="">units</option>
                              {priorNamed.map(pl => (
                                <option key={pl.id} value={pl.id}>{pl.customLevelName}</option>
                              ))}
                            </select>
                          </td>
                          {/* Required Qty — calculated */}
                          <td className="border-r border-gray-200 p-2">
                            <div className="h-8 flex items-center px-2 border border-gray-200 bg-gray-50 rounded text-xs font-semibold text-gray-600 tabular-nums">
                              {requiredQty > 0 ? requiredQty.toLocaleString() : <span className="text-gray-300 font-normal">—</span>}
                            </div>
                          </td>
                          {/* Cost / Unit */}
                          <td className="border-r border-gray-200 p-2">
                            <div className="flex items-center h-8 border border-amber-300 bg-amber-50/70 rounded overflow-hidden">
                              <span className="text-[0.6rem] text-gray-400 px-2 select-none border-r border-amber-300 h-full flex items-center bg-amber-50/50">$</span>
                              <CurrencyInput
                                type="dollar"
                                value={lvl.costPerUnit}
                                onChange={v => updatePackagingLevel(lvl.id, { costPerUnit: v })}
                                className="flex-1 h-full px-2 text-xs text-gray-900 bg-transparent focus:outline-none tabular-nums"
                              />
                            </div>
                          </td>
                          {/* Remove */}
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => removePackagingLevel(lvl.id)}
                              className="w-6 h-6 flex items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all text-sm font-bold leading-none mx-auto"
                              title="Remove packaging level"
                            >×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Add Packaging Level */}
                <div className="border-t-2 border-dashed border-[#e8473f]/40 bg-red-50/30">
                  <button
                    type="button"
                    onClick={addPackagingLevel}
                    className="w-full py-2.5 text-[0.7rem] font-semibold text-[#e8473f] hover:bg-red-50 transition-colors"
                  >
                    + Add Packaging Level
                  </button>
                </div>
              </div>
            </div>

            {/* Setup Fee */}
            <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
              <span className="text-xs text-gray-600">Setup + QA Fee</span>
              <div className="flex items-center w-40">
                <span className={prefixBadge}>$</span>
                <CurrencyInput type="dollar" value={parseFloat(formData.setupFeeCustomer) || 0}
                  onChange={v => setFormField("setupFeeCustomer", String(v))}
                  className={inputWithPrefix} />
              </div>
            </div>

            {/* PPU Denominator */}
            <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
              <span className="text-xs text-gray-600">PPU Denominator</span>
              <div className="w-40">
                <CurrencyInput type="integer" value={parseFloat(formData.ppuDenominator) || 0}
                  onChange={v => setFormField("ppuDenominator", String(v))}
                  className={inputKey} />
              </div>
            </div>

            {/* Lead Time Buffer */}
            <div id="section-lead-time" className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
              <span className="text-xs text-gray-600">Lead Time Buffer</span>
              <div className="flex items-center h-9 border border-amber-200 rounded-md overflow-hidden w-40">
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
                  placeholder="0"
                  step={bufferUnit === "weeks" ? "0.5" : "1"}
                  className="w-16 h-full px-2 text-xs text-right bg-amber-50/50 border-r border-amber-200 focus:outline-none focus:ring-1 focus:ring-[#e8473f] font-medium"
                />
                {(["days", "weeks"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setBufferUnit(u)}
                    className={`h-9 px-2 text-[0.6rem] font-semibold transition-colors border-r border-amber-200 last:border-r-0 shrink-0 ${
                      bufferUnit === u ? "bg-[#e8473f] text-white" : "bg-amber-50/50 text-gray-400 hover:text-gray-700"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

          </div>{/* end inputs divide-y */}
        </div>
      )}
      </div>{/* end CPO card */}

      {/* CPO outputs panel */}
      {!notRequired["section-cpo"] && <div className={outPanel}>
        <div className={outTitle}>Outputs</div>
        {packagingLevels.map((lvl, i) => {
          const qty  = packagingRequiredQtys[i] ?? 0;
          const name = lvl.customLevelName?.trim() || lvl.packagingLevel || `Level ${i + 1}`;
          return (
            <div key={lvl.id} className={outRow}>
              <span className={outLbl}>{name} — Units</span>
              <span className={outVal}>{fv(qty, fmtN)}</span>
            </div>
          );
        })}
        <div className={outRow}>
          <span className={outLbl}>Total Grams Req (g)</span>
          <span className={outVal}>{fv(baseQty * unitWeightG, fmtN)}</span>
        </div>
        <div className={outRow}>
          <span className={outLbl}>Lead Time — Days</span>
          <span className={outVal}>{fv(parseFloat(formData.leadTimeBufferDays) || 0, fmtN)}</span>
        </div>
        <div className={outRow}>
          <span className={outLbl}>Lead Time — Weeks</span>
          <span className={outVal}>{(parseFloat(formData.leadTimeBufferDays) || 0) > 0 ? ((parseFloat(formData.leadTimeBufferDays) || 0) / 7).toFixed(1) : "—"}</span>
        </div>
        <div className={outCostSep}>Setup + QA Costs</div>
        <div className={outRow}>
          <span className={outLbl}>Our Cost</span>
          <span className={outOurVal}>{fv(parseFloat(formData.setupFeeOur) || 0, fmtD)}</span>
        </div>
        <div className={outRow}>
          <span className={outLbl}>Customer Cost</span>
          <span className={outCxVal}>{fv(parseFloat(formData.setupFeeCustomer) || 0, fmtD)}</span>
        </div>
      </div>}
      </div>{/* end section-row CPO */}

      {/* ── Raw Material ── */}
      <div className={sectionRow}><div id="section-raw-materials" className={card}>
        <div className="px-5 pt-4 pb-5">
        <SectionHeader title="Raw Material" open={rawMatOpen} onToggle={() => setRawMatOpen(o => !o)} sectionId="section-raw-materials" />

        {rawMatOpen && !notRequired["section-raw-materials"] && (
          <div className="mt-4">
              {/* Group 1 */}
              <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5 mb-3 border-b border-gray-200">
                <span className="text-xs text-gray-600">Overage Rate</span>
                <SymInput field="materialOverage" type="number" sym="%" formData={formData} setFormField={setFormField} />
              </div>
              {/* Group 2 */}
              <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
                <span className="text-xs text-gray-600">Intake Fee / Pallet</span>
                <SymInput field="intakeFee" type="number" sym="$" formData={formData} setFormField={setFormField} />
              </div>
              <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5 mb-3 border-b border-gray-200">
                <span className="text-xs text-gray-600"># Intake Pallets</span>
                <SymInput field="numIntakePallets" type="number" sym="" formData={formData} setFormField={setFormField} />
              </div>

              {/* Group 3 */}
              <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
                <span className="text-xs text-gray-600">Cost / Gram</span>
                <SymInput field="costPerGram" type="number" sym="$" formData={formData} setFormField={setFormField} />
              </div>
              <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
                <span className="text-xs text-gray-600">Leftover Inv. Cost</span>
                <SymInput field="leftOverInventoryCost" type="number" sym="$" formData={formData} setFormField={setFormField} />
              </div>
              <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5 mb-3 border-b border-gray-200">
                <span className="text-xs text-gray-600">Leftover Absorb</span>
                <SymInput field="leftOverInventoryAbsorb" type="number" sym="%" formData={formData} setFormField={setFormField} />
              </div>

              {/* Group 4 */}
              <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
                <span className="text-xs text-gray-600">Raw Matl Markup</span>
                <SymInput field="rawMaterialMarkup" type="number" sym="%" formData={formData} setFormField={setFormField} />
              </div>
              <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
                <span className="text-xs text-gray-600">Intake Fee Markup</span>
                <SymInput field="intakeFeeMarkup" type="number" sym="%" formData={formData} setFormField={setFormField} />
              </div>
          </div>
        )}
        </div>{/* end inner padding */}
      </div>

      {/* Raw Material outputs panel */}
      {!notRequired["section-raw-materials"] && (() => {
        const overagePct        = parseFloat(formData.materialOverage as string) || 0;
        const reqGrams          = Math.ceil(baseQty * (1 + overagePct / 100)) * unitWeightG;
        const reqOz             = reqGrams / 28.3495;
        const reqLbs            = reqGrams / 453.592;
        const intakeFee         = parseFloat(formData.intakeFee as string) || 0;
        const cpg               = parseFloat(formData.costPerGram as string) || 0;
        const rawMatMarkup      = parseFloat(formData.rawMaterialMarkup as string) || 0;
        const intakeMarkup      = parseFloat(formData.intakeFeeMarkup as string) || 0;
        const rawMatOur         = reqGrams * cpg;
        const rawMatCustomer    = rawMatOur * (1 + rawMatMarkup / 100);
        const intakeOur         = intakeFee;
        const intakeCustomer    = intakeOur * (1 + intakeMarkup / 100);
        const totalOur          = rawMatOur + intakeOur;
        const totalCustomer     = rawMatCustomer + intakeCustomer;
        return (
          <div className={outPanel}>
            <div className={outTitle}>Raw Material Outputs</div>
            <div className={outRow}><span className={outLbl}>Materials — Req (g)</span><span className={outVal}>{fv(reqGrams, fmtN3)}</span></div>
            <div className={outRow}><span className={outLbl}>Materials — Req (oz)</span><span className={outVal}>{fv(reqOz, fmtN3)}</span></div>
            <div className={outRow}><span className={outLbl}>Materials — Req (lbs)</span><span className={outVal}>{fv(reqLbs, fmtN3)}</span></div>
            <div className={outRow}><span className={outLbl}>Cost per gram</span><span className={outVal}>{fv(cpg, fmtD)}</span></div>
            <div className={outRow}><span className={outLbl}>Intake fee / pallet</span><span className={outVal}>{fv(intakeFee, fmtD)}</span></div>
            <div className={outCostSep}>Material Costs</div>
            <div className={outRow}><span className={outLbl}>Our Total</span><span className={outOurVal}>{fv(totalOur, fmtD)}</span></div>
            <div className={outRow}><span className={outLbl}>Customer Total</span><span className={outCxVal}>{fv(totalCustomer, fmtD)}</span></div>
          </div>
        );
      })()}
      </div>{/* end section-row Raw Material */}

      {/* ── Testing ─────────────────────────────────────────────── */}
      {(() => {
        const TEST_TYPES = [
          "FSQ, Administration, and Testing Documents",
          "Certificate of Analysis (COA)",
          "Safety Data Sheet (SDS)",
          "Spec Sheet / Product Specification",
          "Microbial Testing",
          "Heavy Metals Testing",
          "Allergen Testing",
          "Moisture / Water Activity Testing",
          "Custom",
        ];
        const rows: TestingRow[] = formData.testingRows ?? [];
        const testingEnabled = formData.testingEnabled !== "false";
        const testingMarkup  = parseFloat(formData.testingMarkup || "0") || 0;
        const defaultSkus    = parseFloat(formData.numSkus || "1") || 1;
        const totalOur  = rows.reduce((sum, r) => sum + (r.cost ?? 0) * (r.numSkus ?? defaultSkus), 0);
        const totalCx   = totalOur * (1 + testingMarkup / 100);

        const addRow = () => {
          const newRow: TestingRow = { id: String(uid()), testType: "", customTestName: "", cost: 0, numSkus: defaultSkus };
          setTestingRows([...rows, newRow]);
        };
        const removeRow = (id: string) => {
          setTestingRows(rows.filter(r => r.id !== id));
        };
        const updateRow = (id: string, patch: Partial<TestingRow>) => {
          setTestingRows(rows.map(r => r.id === id ? { ...r, ...patch } : r));
        };

        return (
          <div className={sectionRow}>
          <div id="section-testing" className={card}>
            <div className="px-5 pt-4 pb-5">
            <SectionHeader
              title="Testing"
              open={testingOpen}
              onToggle={() => setTestingOpen(o => !o)}
              sectionId="section-testing"
              action={<Toggle
                enabled={testingEnabled}
                onToggle={() => setFormField("testingEnabled", testingEnabled ? "false" : "true")}
                label="Include testing costs"
              />}
            />
            {testingOpen && !notRequired["section-testing"] && (testingEnabled ? (
              <div className="mt-4">
                <table className="w-full border-collapse mb-2">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-[0.55rem] font-semibold text-gray-400 uppercase tracking-widest pb-1.5 pr-3">Test Type</th>
                      <th className="text-right text-[0.55rem] font-semibold text-gray-400 uppercase tracking-widest pb-1.5 w-20"># SKUs</th>
                      <th className="text-right text-[0.55rem] font-semibold text-gray-400 uppercase tracking-widest pb-1.5 w-28 pl-3">Cost / test</th>
                      <th className="w-6" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => {
                      const rowSkus = row.numSkus ?? defaultSkus;
                      return (
                        <tr key={row.id} className="border-b border-gray-50">
                          <td className="py-1.5 pr-3">
                            <div className="flex items-center gap-2">
                              <select
                                value={row.testType}
                                onChange={e => updateRow(row.id, { testType: e.target.value, customTestName: "" })}
                                className={`h-8 px-2 border border-amber-200 text-xs text-gray-900 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-md ${row.testType === "Custom" ? "w-28 shrink-0" : "flex-1"}`}
                              >
                                <option value="" disabled>— select test type —</option>
                                {TEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                              {row.testType === "Custom" && (
                                <input
                                  type="text"
                                  value={row.customTestName}
                                  onChange={e => updateRow(row.id, { customTestName: e.target.value })}
                                  placeholder="Custom test name"
                                  className="flex-1 min-w-0 h-8 px-2 border border-amber-200 text-xs text-gray-900 placeholder:text-gray-300 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-md"
                                />
                              )}
                            </div>
                          </td>
                          <td className="py-1.5 pl-3">
                            <CurrencyInput type="integer" value={rowSkus}
                              onChange={v => updateRow(row.id, { numSkus: v })}
                              className="h-8 w-full px-2 text-xs text-right border border-amber-200 bg-amber-50/50 rounded-md focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition" />
                          </td>
                          <td className="py-1.5 pl-3">
                            <div className="flex items-center justify-end">
                              <span className={prefixBadge}>$</span>
                              <CurrencyInput type="dollar" value={row.cost}
                                onChange={v => updateRow(row.id, { cost: v })}
                                className={inputWithPrefix + " w-24"} />
                            </div>
                          </td>
                          <td className="py-1.5 pl-2">
                            <button type="button" onClick={() => removeRow(row.id)}
                              className="text-gray-300 hover:text-red-400 text-base leading-none transition-colors" title="Remove">×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button type="button" onClick={addRow}
                  className="text-[0.65rem] font-semibold text-[#e8473f] hover:text-[#d43f37] transition-colors mb-4">
                  + Add Test
                </button>
                <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                  <span className="text-[0.65rem] text-gray-500">Markup on total testing cost:</span>
                  <div className="flex items-center w-28">
                    <CurrencyInput type="percent" value={testingMarkup}
                      onChange={v => setFormField("testingMarkup", String(v))} className={inputWithSuffix} />
                    <span className={suffixBadge}>%</span>
                  </div>
                  {totalOur > 0 && (
                    <span className="text-[0.6rem] text-gray-400 ml-auto">
                      Our cost: <span className="font-semibold text-gray-600">${totalOur.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      {" · "}Customer: <span className="font-semibold text-gray-600">${totalCx.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[0.65rem] text-gray-400 mt-1">Toggle on to include testing and quality documentation costs.</p>
            ))}
            </div>{/* end inner padding */}
          </div>

          {/* Testing outputs panel */}
          {!notRequired["section-testing"] && <div className={outPanel}>
            <div className={outTitle}>Testing Outputs</div>
            <div className={outRow}><span className={outLbl}>Markup</span><span className={outVal}>{testingMarkup > 0 ? `${testingMarkup}%` : "—"}</span></div>
            <div className={outCostSep}>Testing Costs</div>
            <div className={outRow}><span className={outLbl}>Our Total</span><span className={outOurVal}>{fv(totalOur, fmtD)}</span></div>
            <div className={outRow}><span className={outLbl}>Customer Total</span><span className={outCxVal}>{fv(totalCx, fmtD)}</span></div>
          </div>}
          </div>
        );
      })()}

      {/* ── Blending ────────────────────────────────────────────── */}
      {(() => {
        const cp              = coPackingState;
        const blendingEnabled = cp.blendingEnabled;
        const recipe: BlendIngredient[] = cp.blendingRecipe ?? [];
        const batches         = cp.blendingUnits > 0 ? cp.blendingUnits : 1;
        const batchSize       = cp.blendingBatchSize ?? 0;
        const batchUnit       = cp.blendingBatchSizeUnit || "kg";
        const overageMult     = 1 + (cp.blendingOverage ?? 0);
        const BATCH_SIZE_UNITS = ["kg", "g", "lbs", "oz", "L", "mL"] as const;

        const pctSum  = recipe.reduce((acc, ing) => acc + (ing.percentage ?? 0), 0);
        const pctDiff = Math.abs(pctSum - 100);
        const pctOk   = pctDiff < 0.01;
        const pctOver = pctSum > 100.01;

        const ingredientRows = recipe.map(ing => {
          const pct           = ing.percentage ?? 0;
          const amtPerBatch   = batchSize > 0 ? (pct / 100) * batchSize : 0;
          const totalBase     = amtPerBatch * batches;
          const totalRequired = totalBase * overageMult;
          const overageExtra  = totalRequired - totalBase;
          return { ...ing, pct, amtPerBatch, totalBase, totalRequired, overageExtra };
        });

        const totalRequired = batchSize > 0 ? batchSize * batches * overageMult : 0;

        const addIngredient = () => {
          const blank: BlendIngredient = { id: String(uid()), name: "", percentage: 0 };
          setCoPackingField("blendingRecipe", [...recipe, blank]);
        };
        const removeIngredient = (id: string) => {
          setCoPackingField("blendingRecipe", recipe.filter(i => i.id !== id));
        };
        const updateIngredient = (id: string, patch: Partial<BlendIngredient>) => {
          setCoPackingField("blendingRecipe", recipe.map(i => i.id === id ? { ...i, ...patch } : i));
        };

        const fmtAmt = (n: number) =>
          n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        return (
          <div className={sectionRow}>
          <div id="section-blending" className={card}>
            <div className="px-5 pt-4 pb-5">
            <SectionHeader
              title="Blending"
              open={blendingOpen}
              onToggle={() => setBlendingOpen(o => !o)}
              sectionId="section-blending"
              action={<Toggle
                enabled={blendingEnabled}
                onToggle={() => setCoPackingField("blendingEnabled", !blendingEnabled)}
                label="Include blending step"
              />}
            />
            {blendingOpen && !notRequired["section-blending"] && (blendingEnabled ? (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-3">
                  <div>
                    <p className="text-[0.65rem] text-gray-500 mb-1">Description / Label</p>
                    <input type="text" value={cp.blendingDescription}
                      onChange={e => setCoPackingField("blendingDescription", e.target.value)}
                      placeholder="e.g. 3-Component Protein Blend" className={inputKey} />
                  </div>
                  <div>
                    <p className="text-[0.65rem] text-gray-500 mb-1"># of Batches</p>
                    <CurrencyInput type="integer" value={cp.blendingUnits}
                      onChange={v => setCoPackingField("blendingUnits", v)} className={inputKey} />
                  </div>
                  <div>
                    <p className="text-[0.65rem] text-gray-500 mb-1">Overage Rate</p>
                    <div className="flex items-center w-full">
                      <CurrencyInput type="percent" value={cp.blendingOverage * 100}
                        onChange={v => setCoPackingField("blendingOverage", v / 100)} className={inputWithSuffix} />
                      <span className={suffixBadge}>%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[0.65rem] text-gray-500 mb-1">Batches / Min</p>
                    <CurrencyInput type="rate" value={cp.blendingUnitsPerMin}
                      onChange={v => setCoPackingField("blendingUnitsPerMin", v)} className={inputKey} />
                  </div>
                  <div>
                    <p className="text-[0.65rem] text-gray-500 mb-1">Efficiency Buffer</p>
                    <div className="flex items-center w-full">
                      <CurrencyInput type="percent" value={cp.blendingEfficiencyBuffer * 100}
                        onChange={v => setCoPackingField("blendingEfficiencyBuffer", v / 100)} className={inputWithSuffix} />
                      <span className={suffixBadge}>%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[0.65rem] text-gray-500 mb-1">Min Labor Hrs</p>
                    <CurrencyInput type="integer" value={cp.blendingMinLaborHrs ?? 0}
                      onChange={v => setCoPackingField("blendingMinLaborHrs", v)} className={inputKey} />
                  </div>
                  <div>
                    <p className="text-[0.65rem] text-gray-500 mb-1">Wage Rate ($/hr)</p>
                    <div className="flex items-center w-full">
                      <span className={prefixBadge}>$</span>
                      <CurrencyInput type="dollar" value={cp.blendingWageRate}
                        onChange={v => setCoPackingField("blendingWageRate", v)}
                        className={inputWithPrefix} />
                    </div>
                  </div>
                  <div>
                    <p className="text-[0.65rem] text-gray-500 mb-1">Labor Markup</p>
                    <div className="flex items-center w-full">
                      <CurrencyInput type="percent" value={cp.blendingLaborMarkup * 100}
                        onChange={v => setCoPackingField("blendingLaborMarkup", v / 100)}
                        className={inputWithSuffix} />
                      <span className={suffixBadge}>%</span>
                    </div>
                  </div>
                </div>

                {/* ── Batch Size ── */}
                <div className="flex items-end gap-3">
                  <div className="w-full sm:w-44">
                    <p className="text-[0.65rem] text-gray-500 mb-1">Batch Size</p>
                    <div className="flex items-center gap-1">
                      <input type="number" min={0} step={0.01}
                        value={batchSize || ""}
                        onChange={e => setCoPackingField("blendingBatchSize", parseFloat(e.target.value) || 0)}
                        placeholder="e.g. 50"
                        className="h-9 flex-1 px-3 border border-amber-200 text-xs text-gray-900 placeholder:text-gray-300 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-l-md" />
                      <select value={batchUnit}
                        onChange={e => setCoPackingField("blendingBatchSizeUnit", e.target.value)}
                        className="h-9 px-2 border border-l-0 border-amber-200 text-xs text-gray-700 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-r-md">
                        {BATCH_SIZE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                  {batchSize > 0 && (
                    <div className="text-[0.65rem] text-gray-400 pb-2 whitespace-nowrap">
                      {batches} batch{batches !== 1 ? "es" : ""} = <span className="font-semibold text-gray-700">{fmtAmt(batchSize * batches)} {batchUnit}</span>
                      {cp.blendingOverage > 0 && (
                        <span className="ml-1 text-amber-600">→ order <span className="font-semibold">{fmtAmt(totalRequired)} {batchUnit}</span></span>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Recipe Composition ── */}
                <div>
                  <p className="text-[0.65rem] font-semibold text-gray-500 uppercase tracking-wider mb-2">Recipe Composition</p>

                  {recipe.length > 0 && (
                    <div className="mb-3">
                      <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                        {(() => {
                          let offset = 0;
                          return ingredientRows.map((ing, idx) => {
                            const w = Math.min(ing.pct, 100 - offset);
                            const colors = ["bg-blue-400","bg-emerald-400","bg-violet-400","bg-orange-400","bg-pink-400","bg-teal-400","bg-yellow-400","bg-red-400"];
                            const seg = (
                              <div key={ing.id} title={`${ing.name || "Ingredient"}: ${ing.pct.toFixed(1)}%`}
                                className={`absolute h-full ${colors[idx % colors.length]} transition-all`}
                                style={{ left: `${offset}%`, width: `${w}%` }} />
                            );
                            offset += w;
                            return seg;
                          });
                        })()}
                        {pctOver && <div className="absolute inset-0 bg-red-400 opacity-20" />}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className={`text-[0.6rem] font-semibold tabular-nums ${pctOk ? "text-green-600" : pctOver ? "text-red-500" : "text-amber-500"}`}>
                          {pctSum.toFixed(2)}% {pctOk ? "✓" : pctOver ? `(+${(pctSum - 100).toFixed(2)}% over)` : `(${(100 - pctSum).toFixed(2)}% remaining)`}
                        </span>
                        <span className="text-[0.6rem] text-gray-400">Target: 100%</span>
                      </div>
                    </div>
                  )}

                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b-2 border-gray-200">
                        <th className="text-left text-[0.55rem] font-semibold text-gray-400 uppercase tracking-widest pb-1.5 pr-3">Ingredient</th>
                        <th className="text-right text-[0.55rem] font-semibold text-gray-400 uppercase tracking-widest pb-1.5 px-2 w-20">%</th>
                        {batchSize > 0 && <>
                          <th className="text-right text-[0.55rem] font-semibold text-gray-400 uppercase tracking-widest pb-1.5 px-2 w-28">Per Batch</th>
                          <th className="text-right text-[0.55rem] font-semibold text-gray-400 uppercase tracking-widest pb-1.5 pl-2 w-32">
                            {batches > 1 ? `Total (${batches} batches)` : "Total Required"}
                            {cp.blendingOverage > 0 && <span className="text-amber-500 ml-1">+ovg</span>}
                          </th>
                        </>}
                        <th className="w-5" />
                      </tr>
                    </thead>
                    <tbody>
                      {ingredientRows.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-[0.65rem] text-gray-300 italic">
                            Add ingredients and enter their % composition
                          </td>
                        </tr>
                      )}
                      {ingredientRows.map((ing, idx) => {
                        const colors = ["bg-blue-400","bg-emerald-400","bg-violet-400","bg-orange-400","bg-pink-400","bg-teal-400","bg-yellow-400","bg-red-400"];
                        return (
                          <tr key={ing.id} className="border-b border-gray-50 group">
                            <td className="py-1.5 pr-3">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${colors[idx % colors.length]}`} />
                                <input type="text" value={ing.name}
                                  onChange={e => updateIngredient(ing.id, { name: e.target.value })}
                                  placeholder="e.g. Whey Protein Isolate"
                                  className="h-7 w-full px-2 border border-transparent hover:border-amber-200 focus:border-amber-200 text-xs text-gray-900 placeholder:text-gray-300 bg-transparent hover:bg-amber-50/30 focus:bg-amber-50/50 focus:outline-none transition rounded-md" />
                              </div>
                            </td>
                            <td className="py-1.5 px-2">
                              <div className="flex items-center justify-end">
                                <input type="number" min={0} max={100} step={0.1}
                                  value={ing.pct || ""}
                                  onChange={e => updateIngredient(ing.id, { percentage: parseFloat(e.target.value) || 0 })}
                                  placeholder="0"
                                  className="h-7 w-14 px-2 text-right border border-amber-200 text-xs text-gray-900 bg-amber-50/50 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/40 transition rounded-l-md" />
                                <span className="h-7 flex items-center px-1.5 border border-l-0 border-amber-200 text-[0.6rem] text-gray-400 bg-amber-50/50 rounded-r-md select-none">%</span>
                              </div>
                            </td>
                            {batchSize > 0 && <>
                              <td className="py-1.5 px-2 text-right tabular-nums text-gray-600">
                                {ing.amtPerBatch > 0 ? `${fmtAmt(ing.amtPerBatch)} ${batchUnit}` : "—"}
                              </td>
                              <td className="py-1.5 pl-2 text-right">
                                {ing.totalRequired > 0 ? (
                                  <>
                                    <span className={`font-semibold tabular-nums ${cp.blendingOverage > 0 ? "text-amber-700" : "text-gray-700"}`}>
                                      {fmtAmt(ing.totalRequired)} {batchUnit}
                                    </span>
                                    {cp.blendingOverage > 0 && ing.totalBase > 0 && (
                                      <div className="text-[0.55rem] text-amber-500 mt-0.5">
                                        {fmtAmt(ing.totalBase)} + {fmtAmt(ing.overageExtra)} overage
                                      </div>
                                    )}
                                  </>
                                ) : "—"}
                              </td>
                            </>}
                            <td className="py-1.5 pl-1">
                              <button type="button" onClick={() => removeIngredient(ing.id)}
                                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 text-base leading-none transition-all" title="Remove">×</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>

                    {ingredientRows.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-gray-200">
                          <td className="pt-2 text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider">Total</td>
                          <td className="pt-2 px-2 text-right">
                            <span className={`font-bold tabular-nums text-xs ${pctOk ? "text-green-600" : pctOver ? "text-red-500" : "text-amber-500"}`}>
                              {pctSum.toFixed(2)}%
                            </span>
                          </td>
                          {batchSize > 0 && <>
                            <td className="pt-2 px-2 text-right text-gray-600 tabular-nums text-xs font-semibold">
                              {fmtAmt(batchSize)} {batchUnit}
                            </td>
                            <td className="pt-2 pl-2 text-right">
                              <span className={`font-bold tabular-nums text-xs ${cp.blendingOverage > 0 ? "text-amber-700" : "text-gray-800"}`}>
                                {fmtAmt(totalRequired)} {batchUnit}
                              </span>
                            </td>
                          </>}
                          <td />
                        </tr>
                        {cp.blendingOverage > 0 && batchSize > 0 && (
                          <tr>
                            <td colSpan={5} className="pt-1.5 text-[0.6rem] text-amber-600">
                              ⚠ Order <span className="font-semibold">{fmtAmt(totalRequired)} {batchUnit}</span> of raw materials ({(cp.blendingOverage * 100).toFixed(0)}% overage applied to {fmtAmt(batchSize * batches)} {batchUnit} base)
                            </td>
                          </tr>
                        )}
                      </tfoot>
                    )}
                  </table>

                  <button type="button" onClick={addIngredient}
                    className="mt-2 text-[0.65rem] font-semibold text-[#e8473f] hover:text-[#d43f37] transition-colors">
                    + Add Ingredient
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[0.65rem] text-gray-400 mt-1">Toggle on to include a blending / mixing step before filling.</p>
            ))}
            </div>{/* end inner padding */}
          </div>

          {/* Blending outputs panel */}
          {!notRequired["section-blending"] && (() => {
            const blendRate    = cp.blendingUnitsPerMin ?? 1;
            const blendEffBuf  = cp.blendingEfficiencyBuffer ?? 0.15;
            const blendMinHrs  = parseFloat(formData.blendingMinLaborHrs ?? "0") || 0;
            const blendUnits   = cp.blendingUnits > 0 ? cp.blendingUnits : 1;
            const blendOverage = cp.blendingOverage ?? 0;
            const req          = blendUnits * (1 + blendOverage);
            const effRate      = blendRate * (1 - blendEffBuf);
            const calcH        = effRate > 0 ? (req / effRate) / 60 : 0;
            const billedH      = Math.max(calcH, blendMinHrs);
            const blendOur     = billedH * cp.blendingWageRate;
            const blendCx      = blendOur * (1 + cp.blendingLaborMarkup);
            return (
              <div className={outPanel}>
                <div className={outTitle}>Blending Outputs</div>
                <div className={outRow}><span className={outLbl}># of Batches</span><span className={outVal}>{batches > 0 ? fmtN(batches) : "—"}</span></div>
                <div className={outRow}><span className={outLbl}>Batch Size</span><span className={outVal}>{batchSize > 0 ? `${batchSize} ${batchUnit}` : "—"}</span></div>
                <div className={outRow}><span className={outLbl}>Total Required</span><span className={outVal}>{totalRequired > 0 ? `${totalRequired.toFixed(2)} ${batchUnit}` : "—"}</span></div>
                <div className={outRow}><span className={outLbl}>Recipe %</span><span className={outVal} style={{ color: pctOk ? undefined : pctOver ? "#dc2626" : "#d97706" }}>{pctSum.toFixed(2)}%</span></div>
                <div className={outRow}><span className={outLbl}>Est. Labor Hrs</span><span className={outVal}>{billedH > 0 ? billedH.toFixed(2) : "—"}</span></div>
                <div className={outCostSep}>Blending Costs</div>
                <div className={outRow}><span className={outLbl}>Our Cost</span><span className={outOurVal}>{fv(blendOur, fmtD)}</span></div>
                <div className={outRow}><span className={outLbl}>Customer Cost</span><span className={outCxVal}>{fv(blendCx, fmtD)}</span></div>
              </div>
            );
          })()}
          </div>
        );
      })()}

    </div>

    {/* Conversion Calculator — opened from Unit Size field */}
    <ConversionCalculator
      open={convOpen}
      onClose={() => setConvOpen(false)}
      prefill={convPrefill}
    />
    </>
  );
}

// ── MoqSection — standalone, rendered last in Home after Palletization ────────
export function MoqSection({
  moqRows,
  setMoqRows,
  formData,
}: {
  moqRows: MoqRow[];
  setMoqRows: React.Dispatch<React.SetStateAction<MoqRow[]>>;
  formData: ProjectFormData;
}) {
  const [moqOpen,         setMoqOpen]         = useState(true);
  const [palletToolRowId, setPalletToolRowId] = useState<number | null>(null);
  const [fillRateRowId,   setFillRateRowId]   = useState<number | null>(null);
  const { moqErrors, effectiveColumns, allMoqResults, perMoqSummaryRows } = useProject();
  const { notRequired } = useSectionRequired();

  const card      = "pt-5 pb-6 border-t border-gray-100";
  const colHead   = "text-[0.6rem] font-semibold text-black uppercase tracking-widest";
  const addRowBtn = "flex items-center gap-1 text-[0.6rem] font-semibold text-[#e8473f] hover:text-[#c73d36] uppercase tracking-wider transition-colors";
  const cellInputBase = "h-8 w-full px-2 border border-amber-200 text-xs text-gray-900 placeholder:text-gray-300 bg-amber-50/50 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/30 focus:border-[#e8473f] transition rounded-md";

  const addMoqRow    = () => setMoqRows(prev => [...prev, emptyMoqRow()]);
  const removeMoqRow = (id: number) => setMoqRows(prev => prev.filter(r => r.id !== id));
  const updateMoqRow = (id: number, field: keyof MoqRow, value: string) =>
    setMoqRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  return (
    <div className="mx-4 md:mx-6 mb-4 max-w-4xl">
      <div id="section-moq" className={card}>
        <div className="px-5 pt-4 pb-5">
        <div className="mb-4">
          <SectionHeader
            title="MOQ + Case Pack Configuration"
            open={moqOpen}
            onToggle={() => setMoqOpen(o => !o)}
            sectionId="section-moq"
            action={moqOpen ? <button type="button" onClick={addMoqRow} className={addRowBtn}><Plus size={10} strokeWidth={2.5} />Add Row</button> : undefined}
          />
        </div>
        {moqOpen && !notRequired["section-moq"] && (
          <div className="overflow-x-auto -mx-1 px-1">
            <div className="min-w-120">
              <div className="grid grid-cols-5 gap-2 pb-2 border-b border-gray-100 mb-2.5">
                {["# of Units", "Units / Inner", "Inners / Master", "# of Pallets", "Cost/g"].map(col => (
                  <span key={col} className={colHead}>{col}</span>
                ))}
              </div>
              <div className="space-y-2">
                {moqRows.map(row => {
                  const qty        = parseFloat(row.individualUnits) || 0;
                  const innerPack  = parseFloat(row.unitsPerInner)   || 0;
                  const innerCount = innerPack > 0 ? Math.ceil(qty / innerPack) : 0;
                  const rowErr     = moqErrors.find(e => e.rowId === row.id);
                  const hasRateOverrides = row.fillRateOverrides &&
                    Object.values(row.fillRateOverrides).some(v => v !== "");

                  const moqResult  = allMoqResults.find(r => r.moqRow.id === row.id);
                  const moqSRows   = perMoqSummaryRows.get(row.id) ?? [];
                  const palletSRow = moqSRows.find(r => r.label === "Pallets & Fees");
                  const outFee     = parseFloat(formData.outboundFee) || 0;
                  const autoPallets = (palletSRow && outFee > 0) ? Math.round(palletSRow.ourCosts / outFee) : null;

                  const GRAMS_PER_DISP: Record<string, number> = { g: 1, oz: 28.3495, lb: 453.592, kg: 1000, mg: 0.001 };
                  const unitWeightG = (parseFloat(formData.unitWeight) || 0) * (GRAMS_PER_DISP[formData.unitWeightUnit ?? "g"] ?? 1);
                  const costPerGram = (moqResult && qty > 0 && unitWeightG > 0)
                    ? moqResult.totalOurCost / (qty * unitWeightG) : null;

                  return (
                    <div key={row.id} className="space-y-1">
                      <div className="grid grid-cols-5 gap-2 items-center">
                        <CurrencyInput type="integer"
                          value={parseFloat(row.individualUnits) || 0}
                          onChange={v => {
                            const s = String(v);
                            setMoqRows(prev => prev.map(r => r.id === row.id ? { ...r, individualUnits: s, moq: s } : r));
                          }}
                          placeholder="0" className={cellInputBase} />
                        <CurrencyInput type="integer"
                          value={parseFloat(row.unitsPerInner) || 0}
                          onChange={v => updateMoqRow(row.id, "unitsPerInner", String(v))}
                          placeholder="0"
                          className={`${cellInputBase} ${rowErr?.unitsPerInner ? "border-red-400 bg-red-50" : ""}`} />
                        <CurrencyInput type="integer"
                          value={parseFloat(row.innersPerMaster) || 0}
                          onChange={v => updateMoqRow(row.id, "innersPerMaster", String(v))}
                          placeholder="0"
                          className={`${cellInputBase} ${rowErr?.innersPerMaster ? "border-red-400 bg-red-50" : ""}`} />
                        <div className="flex items-center gap-1">
                          <input type="text" inputMode="numeric"
                            value={row.pallets ?? ""}
                            onChange={e => updateMoqRow(row.id, "pallets", e.target.value)}
                            placeholder={autoPallets !== null ? String(autoPallets) : "auto"}
                            className={`${cellInputBase} flex-1 min-w-0`} />
                          <button type="button" onClick={() => setPalletToolRowId(row.id)}
                            title="Pallet calculator"
                            className="shrink-0 text-gray-300 hover:text-amber-500 transition-colors p-0.5">
                            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
                              <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                              <text x="8" y="11" textAnchor="middle" fontSize="8" fontWeight="bold">🧮</text>
                            </svg>
                          </button>
                          <button type="button" onClick={() => setFillRateRowId(row.id)}
                            title={hasRateOverrides ? "Custom rates active" : "Fill rate overrides"}
                            className={`shrink-0 transition-colors p-0.5 ${hasRateOverrides ? "text-[#e8473f]" : "text-gray-300 hover:text-[#e8473f]"}`}>
                            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
                              <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                              <circle cx="8" cy="8" r="2" fill="currentColor"/>
                              <line x1="8" y1="1" x2="8" y2="4" stroke="currentColor" strokeWidth="1.5"/>
                              <line x1="8" y1="12" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5"/>
                              <line x1="1" y1="8" x2="4" y2="8" stroke="currentColor" strokeWidth="1.5"/>
                              <line x1="12" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5"/>
                            </svg>
                          </button>
                          <button type="button" onClick={() => removeMoqRow(row.id)}
                            className="shrink-0 text-gray-300 hover:text-red-400 transition-colors p-0.5"><Trash2 size={12} /></button>
                        </div>
                        <div className="flex items-center gap-0.5 min-w-0">
                          <input type="text" inputMode="decimal"
                            value={row.costPerGram ?? ""}
                            onChange={e => updateMoqRow(row.id, "costPerGram", e.target.value)}
                            placeholder={costPerGram !== null ? costPerGram.toFixed(4) : "0.0000"}
                            className={`${cellInputBase} flex-1 min-w-0 font-mono`} />
                          {row.costPerGram !== undefined && row.costPerGram !== "" && (
                            <button type="button"
                              onClick={() => updateMoqRow(row.id, "costPerGram", "")}
                              title="Reset to derived value"
                              className="shrink-0 text-[0.6rem] text-gray-300 hover:text-[#e8473f] transition-colors pl-0.5">↺</button>
                          )}
                        </div>
                      </div>
                      {rowErr?.unitsPerInner   && <p className="text-[0.6rem] text-red-500 font-medium">{rowErr.unitsPerInner}</p>}
                      {rowErr?.innersPerMaster && <p className="text-[0.6rem] text-red-500 font-medium">{rowErr.innersPerMaster}</p>}
                      <div className="flex items-center gap-2">
                        {!rowErr && innerPack > 0 && qty > 0 && <p className="text-[0.6rem] text-gray-400">→ {innerCount} inners</p>}
                        {hasRateOverrides && <p className="text-[0.6rem] text-[#e8473f] font-medium">⚙ custom rates</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {palletToolRowId !== null && (() => {
          const row = moqRows.find(r => r.id === palletToolRowId);
          return row ? (
            <PalletToolPopover row={row} formData={formData} columns={effectiveColumns}
              onUse={pallets => { updateMoqRow(row.id, "pallets", String(pallets)); setPalletToolRowId(null); }}
              onClose={() => setPalletToolRowId(null)} />
          ) : null;
        })()}

        {fillRateRowId !== null && (() => {
          const row = moqRows.find(r => r.id === fillRateRowId);
          return row ? (
            <FillRateOverridePopover row={row} columns={effectiveColumns}
              onSave={overrides => {
                setMoqRows(prev => prev.map(r => r.id === row.id ? { ...r, fillRateOverrides: overrides } : r));
                setFillRateRowId(null);
              }}
              onClose={() => setFillRateRowId(null)} />
          ) : null;
        })()}
        </div>{/* end inner padding */}
      </div>
    </div>
  );
}

