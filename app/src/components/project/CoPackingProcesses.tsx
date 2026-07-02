import { useState, useCallback, useEffect, useRef } from "react";
import React from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { CoPackingProcess, RecipeIngredient } from "@/lib/types";
import { uid as _uid } from "@/lib/uid";
import { RequiredToggle, useSectionRequired } from "@/lib/SectionRequiredContext";
import { useProject } from "@/lib/ProjectContext";
const uid = () => String(_uid());

// ── Collapse context + Col helper ────────────────────────────────────────────
const CollapsedContext = React.createContext<Record<string, boolean>>({});

function Col({ proc, children }: { proc: CoPackingProcess; children: React.ReactNode }) {
  const collapsedCols = React.useContext(CollapsedContext);
  return collapsedCols[proc.id]
    ? <td className="border-l border-amber-200 bg-amber-50/40" style={{ width: 36, minWidth: 36 }} />
    : <td className="px-2 py-1 border-l border-amber-200 bg-[#fef9ee]">{children}</td>;
}

// ── Style tokens ─────────────────────────────────────────────────────────────
const cellInp =
  "h-7 w-full px-2 border border-amber-300 text-[0.7rem] text-gray-900 bg-amber-100/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/40 focus:border-[#e8473f] transition rounded";
const cellInpSuffix =
  "h-7 flex-1 min-w-0 px-2 border border-amber-300 border-r-0 text-[0.7rem] text-gray-900 bg-amber-100/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/40 focus:border-[#e8473f] transition rounded-l";
const cellInpPrefix =
  "h-7 flex-1 min-w-0 px-2 border border-amber-300 border-l-0 text-[0.7rem] text-gray-900 bg-amber-100/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/40 focus:border-[#e8473f] transition rounded-r";
const suffixUnit =
  "h-7 flex items-center px-1.5 border border-amber-300 border-l-0 text-[0.58rem] text-gray-500 bg-amber-100/60 rounded-r select-none shrink-0";
const prefixUnit =
  "h-7 flex items-center px-1.5 border border-amber-300 border-r-0 text-[0.58rem] text-gray-500 bg-amber-100/60 rounded-l select-none shrink-0";
const labelCell =
  "px-3 py-1 text-[0.68rem] font-semibold text-gray-700 bg-[#ede8dc] sticky left-0 z-10";

// ── Unit conversion to grams ──────────────────────────────────────────────────
const TO_GRAMS: Record<string, number> = {
  g: 1, kg: 1000, oz: 28.3495, lbs: 453.592, L: 1000, mL: 1, units: 1, batches: 1,
};
void ((grams: number, toUnit: string) => grams / (TO_GRAMS[toUnit] ?? 1)); // convertFromGrams — kept for future use

// ── Speed UOM options ─────────────────────────────────────────────────────────
const SPEED_UNITS_THROUGHPUT = ["units / min", "units / hr", "kg / hr", "lbs / hr", "g / min", "batches / hr"];
const SPEED_UNITS_CYCLE      = ["min / unit", "min / batch", "hrs / batch"];
const BATCH_SIZE_UNITS       = ["g", "kg", "oz", "lbs", "L", "mL", "units", "batches"];
// const INGREDIENT_UNITS    = ["g", "kg", "oz", "lbs", "L", "mL"]; // unused after recipe UI simplification

// ── Labor hour calculation (mirrors coPackingCalculations.ts) ─────────────────
function calculateProcessHours(proc: CoPackingProcess, totalQty: number): number {
  const { processSpeedValue: speed, processSpeedUnit: unit, batchSizeValue: batchSize, efficiencyBuffer } = proc;
  if (speed === 0 || totalQty <= 0) return 0;
  const buffer = 1 - efficiencyBuffer / 100;
  if (buffer <= 0) return 0;
  switch (unit) {
    case "units / min":  return (totalQty / (speed * buffer)) / 60;
    case "units / hr":   return totalQty / (speed * buffer);
    case "kg / hr":
    case "lbs / hr":     return totalQty / (speed * buffer);
    case "g / min":      return (totalQty / (speed * buffer)) / 60;
    case "batches / hr": { const b = batchSize > 0 ? Math.ceil(totalQty / batchSize) : 1; return b / (speed * buffer); }
    case "min / unit":   return (totalQty * (speed / buffer)) / 60;
    case "min / batch":  { const b = batchSize > 0 ? Math.ceil(totalQty / batchSize) : 1; return (b * (speed / buffer)) / 60; }
    case "hrs / batch":  { const b = batchSize > 0 ? Math.ceil(totalQty / batchSize) : 1; return b * (speed / buffer); }
    default: return 0;
  }
}


// ── Recipe Popover ────────────────────────────────────────────────────────────
const ING_COLORS_POP = ["bg-blue-400","bg-emerald-400","bg-violet-400","bg-orange-400","bg-pink-400","bg-teal-400","bg-yellow-400","bg-red-400"];

function RecipePopover({ proc, onClose, anchorRef, addIngredient, removeIngredient, updateIngredient }: {
  proc: CoPackingProcess;
  onClose: () => void;
  anchorRef: { current: HTMLButtonElement | null };
  addIngredient: (procId: string) => void;
  removeIngredient: (procId: string, ingId: string) => void;
  updateIngredient: (procId: string, ingId: string, patch: Partial<RecipeIngredient>) => void;
}) {
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Position below the anchor button
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + window.scrollY + 6, left: rect.left + window.scrollX });
    }
  }, [anchorRef]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, anchorRef]);

  const batchGrams = Math.ceil(proc.units * (1 + proc.overageRate / 100)) * (TO_GRAMS[proc.batchSizeUnit] ?? 1);
  const sum = proc.recipeIngredients.reduce((a, i) => a + (i.percentage || 0), 0);
  const isOk   = Math.abs(sum - 100) < 0.01;
  const isOver = sum > 100.01;

  return createPortal(
    <div ref={popRef}
      style={{ position: "absolute", top: pos.top, left: pos.left, zIndex: 9999, width: 340 }}
      className="bg-white border border-gray-200 rounded-xl shadow-xl shadow-gray-200/80 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border-b border-amber-200">
        <div>
          <span className="text-[0.65rem] font-bold text-amber-800 uppercase tracking-wider">Recipe Composition</span>
          <span className="text-[0.58rem] text-amber-500 ml-2">— {proc.name}</span>
        </div>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
      </div>

      {/* Batch size info */}
      <div className="px-3 py-2 bg-amber-50/40 border-b border-amber-100 text-[0.6rem] text-amber-700">
        Total batch: <span className="font-bold">{batchGrams > 0 ? batchGrams.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—"} g</span>
        {batchGrams > 0 && <span className="ml-2 text-amber-500">({(batchGrams/1000).toFixed(3)} kg · {(batchGrams/453.592).toFixed(3)} lbs)</span>}
      </div>

      {/* Total % bar */}
      {proc.recipeIngredients.length > 0 && (
        <div className="px-3 pt-2 pb-1">
          <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
            {(() => {
              let offset = 0;
              return proc.recipeIngredients.map((ing, i) => {
                const w = Math.min(ing.percentage ?? 0, 100 - offset);
                const seg = <div key={ing.id} className={`absolute h-full ${ING_COLORS_POP[i % ING_COLORS_POP.length]}`} style={{ left: `${offset}%`, width: `${w}%` }} />;
                offset += w;
                return seg;
              });
            })()}
          </div>
          <div className={`text-[0.58rem] font-semibold tabular-nums ${isOk ? "text-green-600" : isOver ? "text-red-500" : "text-amber-600"}`}>
            {sum.toFixed(1)}% {isOk ? "✓ Complete" : isOver ? `— ${(sum-100).toFixed(1)}% over` : `— ${(100-sum).toFixed(1)}% remaining`}
          </div>
        </div>
      )}

      {/* Ingredient rows */}
      <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
        {proc.recipeIngredients.map((ing, idx) => {
          const ingGrams = (ing.percentage / 100) * batchGrams;
          return (
            <div key={ing.id} className="px-3 py-2 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full shrink-0 ${ING_COLORS_POP[idx % ING_COLORS_POP.length]}`} />
                <input type="text" value={ing.name}
                  onChange={e => updateIngredient(proc.id, ing.id, { name: e.target.value })}
                  placeholder="Ingredient name…"
                  className="h-6 flex-1 min-w-0 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-400 placeholder:text-gray-300" />
                <div className="flex items-center shrink-0">
                  <input type="number" min={0} max={100} step={0.1}
                    value={ing.percentage || ""}
                    onChange={e => updateIngredient(proc.id, ing.id, { percentage: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="h-6 w-14 px-1.5 text-xs border border-gray-200 rounded-l text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-amber-400" />
                  <span className="h-6 px-1.5 text-[0.6rem] text-gray-500 border border-l-0 border-gray-200 bg-gray-50 flex items-center rounded-r select-none">%</span>
                </div>
                <button type="button" onClick={() => removeIngredient(proc.id, ing.id)}
                  className="text-gray-300 hover:text-red-400 text-base leading-none shrink-0">×</button>
              </div>
              {ing.percentage > 0 && batchGrams > 0 && (
                <div className="ml-4 flex gap-3 text-[0.58rem] text-amber-700 tabular-nums">
                  <span><span className="text-gray-400">g </span>{ingGrams.toFixed(1)}</span>
                  <span><span className="text-gray-400">kg </span>{(ingGrams/1000).toFixed(3)}</span>
                  <span><span className="text-gray-400">lbs </span>{(ingGrams/453.592).toFixed(3)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add ingredient */}
      <div className="px-3 py-2 border-t border-gray-100">
        <button type="button" onClick={() => addIngredient(proc.id)}
          className="text-[0.65rem] font-semibold text-[#e8473f] hover:text-[#c73d36] transition-colors">
          + Add Ingredient
        </button>
      </div>
    </div>,
    document.body
  );
}

export function defaultCoPackingProcess(): CoPackingProcess {
  return {
    id:                  uid(),
    name:                "",
    units:               0,
    perOuter:            0,
    isAutoUnits:         true,
    overageRate:         10,
    processSpeedValue:   0,
    processSpeedUnit:    "units / min",
    batchSizeValue:      0,
    batchSizeUnit:       "units",
    laborRate:           27,
    laborMarkup:         30,
    costMarkup:          0,
    efficiencyBuffer:    20,
    numStaff:            1,
    numMachines:         1,
    hrsPerShift:         7,
    workingDays:         5,
    minLaborHrs:         0,
    recipeIngredients:   [],
    includedInPdf:       true,
    showOperationsInPdf: false,
    pdfLabel:            "",
  };
}

function defaultIngredient(): RecipeIngredient {
  return { id: uid(), name: "", percentage: 0, unit: "kg" };
}

interface Props {
  processes:    CoPackingProcess[];
  setProcesses: React.Dispatch<React.SetStateAction<CoPackingProcess[]>>;
}

export default function CoPackingProcesses({ processes, setProcesses }: Props) {
  const [sectionOpen, setSectionOpen] = useState(true);
  const { notRequired } = useSectionRequired();
  const { packagingLevels } = useProject();

  // First packaging level's required qty (units field of first level)
  const firstLvlQty = packagingLevels[0]?.units ?? 0;

  // Refs to track last auto-computed values per process id, so we don't clobber user edits
  const lastAutoUnits = useRef<Record<string, number>>({});

  useEffect(() => {
    if (firstLvlQty <= 0) return;
    setProcesses(prev => prev.map(proc => {
      const prevAutoUnits = lastAutoUnits.current[proc.id];
      const unitsUntouched = proc.units === 0 || proc.units === prevAutoUnits || lastAutoUnits.current[proc.id] === undefined;
      lastAutoUnits.current[proc.id] = firstLvlQty;
      if (unitsUntouched && proc.units !== firstLvlQty) return { ...proc, units: firstLvlQty };
      return proc;
    }));
  }, [firstLvlQty]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (id: string, patch: Partial<CoPackingProcess>) =>
    setProcesses(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));

  const addProcess = () => {
    const proc = defaultCoPackingProcess();
    if (firstLvlQty > 0) proc.units = firstLvlQty;
    setProcesses(prev => [...prev, proc]);
  };

  const removeProcess = (id: string) => {
    if (processes.length <= 1) return;
    setProcesses(prev => prev.filter(p => p.id !== id));
  };

  const getEffectiveUnits = (index: number): number => {
    const proc = processes[index];
    if (!proc) return 0;
    return proc.units;
  };

  const deriveStats = (proc: CoPackingProcess, _index: number) => {
    const deliveredUnits = getEffectiveUnits(_index);
    const totalQty = deliveredUnits * (1 + proc.overageRate / 100);
    let calcHrs = calculateProcessHours(proc, totalQty);
    const minApplied = proc.minLaborHrs > 0 && calcHrs < proc.minLaborHrs;
    if (minApplied) calcHrs = proc.minLaborHrs;
    const laborOur  = calcHrs * proc.laborRate;
    const laborCust = laborOur * (1 + proc.laborMarkup / 100);
    const batchCount = proc.batchSizeValue > 0 ? Math.ceil(totalQty / proc.batchSizeValue) : null;
    return { deliveredUnits, totalQty, calcHrs, laborOur, laborCust, batchCount, minApplied };
  };

  const addIngredient = (procId: string) =>
    setProcesses(prev => prev.map(p =>
      p.id === procId ? { ...p, recipeIngredients: [...p.recipeIngredients, defaultIngredient()] } : p
    ));
  const removeIngredient = (procId: string, ingId: string) =>
    setProcesses(prev => prev.map(p =>
      p.id === procId ? { ...p, recipeIngredients: p.recipeIngredients.filter(i => i.id !== ingId) } : p
    ));
  const updateIngredient = (procId: string, ingId: string, patch: Partial<RecipeIngredient>) =>
    setProcesses(prev => prev.map(p =>
      p.id === procId ? { ...p, recipeIngredients: p.recipeIngredients.map(i => i.id === ingId ? { ...i, ...patch } : i) } : p
    ));

  const handleNameChange = (id: string, name: string) => {
    const proc = processes.find(p => p.id === id);
    if (!proc) return;
    const wasBlending = proc.name.toLowerCase() === "blending";
    const isBlending  = name.toLowerCase() === "blending";
    const patch: Partial<CoPackingProcess> = { name };
    if (isBlending && !wasBlending && proc.recipeIngredients.length === 0) {
      patch.recipeIngredients = [defaultIngredient(), defaultIngredient()];
    }
    update(id, patch);
  };


  const [collapsedCols,    setCollapsedCols]    = useState<Record<string, boolean>>({});
  const [laborDetailsOpen, setLaborDetailsOpen] = useState(false);
  const [outputsOpen,      setOutputsOpen]      = useState<Record<string, boolean>>({});
  const [recipeOpen,       setRecipeOpen]       = useState<Record<string, boolean>>({});
  const recipeBtnRefs = useRef<Record<string, { current: HTMLButtonElement | null }>>({});
  const getRecipeBtnRef = (id: string) => {
    if (!recipeBtnRefs.current[id]) recipeBtnRefs.current[id] = { current: null };
    return recipeBtnRefs.current[id];
  };
  const toggleLaborDetails = useCallback(() => setLaborDetailsOpen(o => !o), []);

  const toggleCol = (id: string) =>
    setCollapsedCols(prev => ({ ...prev, [id]: !prev[id] }));

  const numCols = processes.length;
  const visibleCols = processes.filter(p => !collapsedCols[p.id]).length;
  const collapsedCount = numCols - visibleCols;
  const tableMinWidth = 140 + visibleCols * 168 + collapsedCount * 36;

  return (
    <div id="section-processes" className="bg-white border border-gray-200 rounded-xl overflow-hidden max-w-4xl flex-1 min-w-0">

      {/* ── Section header ── */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-3">
        <button type="button" onClick={() => setSectionOpen(o => !o)}
          className="flex items-center gap-1.5 group">
          <span className="text-sm font-bold text-gray-900 group-hover:text-[#e8473f] transition-colors">Processes</span>
          {sectionOpen && !notRequired["section-processes"]
            ? <ChevronUp size={13} className="text-gray-300 group-hover:text-[#e8473f] transition-colors shrink-0" />
            : <ChevronDown size={13} className="text-gray-300 group-hover:text-[#e8473f] transition-colors shrink-0" />}
        </button>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button type="button" onClick={addProcess}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[0.68rem] font-semibold text-[#e8473f] border border-[#e8473f]/40 rounded-md hover:bg-red-50 hover:border-[#e8473f]/70 transition-colors">
            <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>
            Add Process
          </button>
          <RequiredToggle sectionId="section-processes" />
        </div>
      </div>

      {sectionOpen && !notRequired["section-processes"] && (
        <div className="overflow-x-auto">
          <CollapsedContext.Provider value={collapsedCols}>
          <table className="border-collapse" style={{ minWidth: tableMinWidth, width: tableMinWidth, tableLayout: "fixed" }}>

            {/* ── Column headers ── */}
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-[0.55rem] font-semibold text-gray-500 uppercase tracking-widest border-b border-amber-200/70 bg-white sticky left-0 z-10" style={{ width: 140, minWidth: 140 }}>
                  Rate Field
                </th>
                {processes.map((proc, idx) => {
                  const { calcHrs } = deriveStats(proc, idx);
                  const isCollapsed = collapsedCols[proc.id];
                  if (isCollapsed) {
                    return (
                      <th key={proc.id}
                        className="relative bg-gray-800 border-b border-l border-gray-700 cursor-pointer select-none"
                        style={{ width: 36, minWidth: 36 }}
                        onClick={() => toggleCol(proc.id)}
                        title={`Expand ${proc.name || `Process ${idx + 1}`}`}>
                        <div className="flex items-center justify-center h-full py-2">
                          <ChevronRight size={12} className="text-gray-400" />
                        </div>
                        <span
                          className="absolute text-[0.5rem] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap"
                          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", bottom: 8, left: "50%", translate: "-50% 0" }}>
                          {proc.name || `P${idx + 1}`}
                        </span>
                      </th>
                    );
                  }
                  return (
                    <th key={proc.id}
                      className="px-2 py-2 text-left text-[0.65rem] font-bold text-white bg-gray-800 border-b border-l border-gray-700"
                      style={{ width: 168, minWidth: 168 }}>
                      <div className="flex items-center justify-between gap-1">
                        <div className="min-w-0">
                          <span className="truncate block">{proc.name || `Process ${idx + 1}`}</span>
                          {proc.processSpeedValue > 0 && (() => {
                            const isFilling = proc.name.toLowerCase().includes("filling");
                            const totalUnits = Math.ceil(proc.units * (1 + proc.overageRate / 100));
                            const buffer = proc.efficiencyBuffer > 0 ? 1 - proc.efficiencyBuffer / 100 : 1;
                            const upm = proc.processSpeedUnit === "units / min" ? proc.processSpeedValue
                                      : proc.processSpeedUnit === "units / hr"  ? proc.processSpeedValue / 60 : 0;
                            const effectiveUph = upm * 60 * buffer;
                            const hrs = effectiveUph > 0 ? totalUnits / effectiveUph : calcHrs;
                            if (!isFilling || hrs <= 0 || hrs >= 100000) return null;
                            return <span className="text-[0.55rem] text-gray-400 tabular-nums font-normal">~{hrs.toFixed(1)} hrs · {(upm * 60).toFixed(0)} u/hr</span>;
                          })()}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {proc.name.toLowerCase().includes("blending") && (
                            <button type="button"
                              ref={el => { getRecipeBtnRef(proc.id).current = el; }}
                              onClick={() => setRecipeOpen(o => ({ ...o, [proc.id]: !o[proc.id] }))}
                              title="Recipe Composition"
                              className={`text-[0.5rem] font-bold px-1.5 py-0.5 rounded border transition-colors ${recipeOpen[proc.id] ? "bg-amber-400 border-amber-300 text-white" : "border-amber-400 text-amber-300 hover:bg-amber-400 hover:text-white"}`}>
                              RECIPE
                            </button>
                          )}
                          <button type="button" onClick={() => toggleCol(proc.id)}
                            title="Collapse column"
                            className="text-gray-400 hover:text-white transition-colors">
                            <ChevronLeft size={11} />
                          </button>
                          {processes.length > 1 && (
                            <button type="button" onClick={() => removeProcess(proc.id)}
                              title={`Remove Process ${idx + 1}`}
                              className="text-gray-400 hover:text-red-400 transition-colors">
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>

              {/* ── Name ── */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}>Name</td>
                {processes.map((proc) => (
                  <Col key={proc.id} proc={proc}>
                    <input type="text" value={proc.name}
                      onChange={e => handleNameChange(proc.id, e.target.value)}
                      placeholder="e.g. Blending, Filling, Sealing"
                      className={cellInp} />
                  </Col>
                ))}
              </tr>

              {/* ── Units ── */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}>Units</td>
                {processes.map((proc) => (
                  <Col key={proc.id} proc={proc}>
                    <CurrencyInput type="integer"
                      value={proc.units}
                      onChange={v => update(proc.id, { units: v })}
                      placeholder="0"
                      className={cellInp} />
                  </Col>
                ))}
              </tr>

              {/* ── Overage Rate ── */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}>Overage Rate</td>
                {processes.map((proc) => (
                  <Col key={proc.id} proc={proc}>
                    <div className="flex items-center">
                      <CurrencyInput type="percent" value={proc.overageRate}
                        onChange={v => update(proc.id, { overageRate: v })}
                        className={cellInpSuffix} />
                      <span className={suffixUnit}>%</span>
                    </div>
                  </Col>
                ))}
              </tr>

              {/* ── Batch Size (auto-computed: units × (1 + overage%), editable unit) ── */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}>Batch Size</td>
                {processes.map((proc) => {
                  const computed = proc.units > 0 ? Math.ceil(proc.units * (1 + proc.overageRate / 100)) : 0;
                  return (
                    <Col key={proc.id} proc={proc}>
                      <div className="flex items-center gap-1">
                        <div className="h-7 flex-1 min-w-0 px-2 border border-amber-300 text-[0.7rem] text-gray-700 bg-amber-50/60 flex items-center tabular-nums rounded-l select-none">
                          {computed > 0 ? computed.toLocaleString("en-US") : <span className="text-gray-300">auto</span>}
                        </div>
                        <select value={proc.batchSizeUnit}
                          onChange={e => update(proc.id, { batchSizeUnit: e.target.value })}
                          className="h-7 px-1 border border-l-0 border-amber-300 text-[0.6rem] text-gray-700 bg-amber-100/60 focus:outline-none rounded-r shrink-0 w-14">
                          {BATCH_SIZE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    </Col>
                  );
                })}
              </tr>

              {/* ── Process Speed ── */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}>Process Speed</td>
                {processes.map((proc) => (
                  <Col key={proc.id} proc={proc}>
                    <div className="flex items-center gap-1">
                      <input type="number" min={0} step={0.01}
                        value={proc.processSpeedValue || ""}
                        onChange={e => update(proc.id, { processSpeedValue: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                        className="h-7 flex-1 min-w-0 px-2 border border-amber-300 text-[0.7rem] text-gray-900 placeholder:text-gray-300 bg-amber-100/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/40 focus:border-[#e8473f] transition rounded-l" />
                      <select value={proc.processSpeedUnit}
                        onChange={e => update(proc.id, { processSpeedUnit: e.target.value })}
                        className="h-7 px-1 border border-l-0 border-amber-300 text-[0.6rem] text-gray-700 bg-amber-100/60 focus:outline-none rounded-r shrink-0 w-24">
                        <optgroup label="Throughput">
                          {SPEED_UNITS_THROUGHPUT.map(u => <option key={u} value={u}>{u}</option>)}
                        </optgroup>
                        <optgroup label="Cycle Time">
                          {SPEED_UNITS_CYCLE.map(u => <option key={u} value={u}>{u}</option>)}
                        </optgroup>
                      </select>
                    </div>
                  </Col>
                ))}
              </tr>

              {/* ── # of Operators ── */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}># of Operators</td>
                {processes.map((proc) => (
                  <Col key={proc.id} proc={proc}>
                    <CurrencyInput type="integer" value={proc.numStaff}
                      onChange={v => update(proc.id, { numStaff: v })}
                      placeholder="1"
                      className={cellInp} />
                  </Col>
                ))}
              </tr>

              {/* ── # of Machines ── */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}># of Machines</td>
                {processes.map((proc) => (
                  <Col key={proc.id} proc={proc}>
                    <CurrencyInput type="integer" value={proc.numMachines ?? 1}
                      onChange={v => update(proc.id, { numMachines: v })}
                      placeholder="1"
                      className={cellInp} />
                  </Col>
                ))}
              </tr>

              {/* ── Cost Markup ── */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}>Cost Markup</td>
                {processes.map((proc) => (
                  <Col key={proc.id} proc={proc}>
                    <div className="flex items-center">
                      <CurrencyInput type="percent" value={proc.costMarkup ?? 0}
                        onChange={v => update(proc.id, { costMarkup: v })}
                        className={cellInpSuffix} />
                      <span className={suffixUnit}>%</span>
                    </div>
                  </Col>
                ))}
              </tr>

              {/* ── Labor Details toggle header ── */}
              <tr className="border-b border-amber-300/60 cursor-pointer select-none bg-amber-50/80 hover:bg-amber-100/60 transition-colors"
                onClick={toggleLaborDetails}>
                <td colSpan={processes.length + 2} className="px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    {laborDetailsOpen
                      ? <ChevronUp size={11} className="text-amber-600 shrink-0" />
                      : <ChevronDown size={11} className="text-amber-600 shrink-0" />}
                    <span className="text-[0.62rem] font-bold text-amber-700 uppercase tracking-widest">Labor Details</span>
                  </div>
                </td>
              </tr>

              {/* ── Labor Details rows (collapsible) ── */}
              {laborDetailsOpen && (<>

                {/* ── Labor Rate ── */}
                <tr className="border-b border-amber-200/70">
                  <td className={labelCell}>Labor Rate ($/hr)</td>
                  {processes.map((proc) => (
                    <Col key={proc.id} proc={proc}>
                      <div className="flex items-center">
                        <span className={prefixUnit}>$</span>
                        <CurrencyInput type="dollar" value={proc.laborRate}
                          onChange={v => update(proc.id, { laborRate: v })}
                          className={cellInpPrefix} />
                      </div>
                    </Col>
                  ))}
                  </tr>

                {/* ── Efficiency Buffer ── */}
                <tr className="border-b border-amber-200/70">
                  <td className={labelCell}>Efficiency Buffer</td>
                  {processes.map((proc) => (
                    <Col key={proc.id} proc={proc}>
                      <div className="flex items-center">
                        <CurrencyInput type="percent" value={proc.efficiencyBuffer}
                          onChange={v => update(proc.id, { efficiencyBuffer: v })}
                          className={cellInpSuffix} />
                        <span className={suffixUnit}>%</span>
                      </div>
                    </Col>
                  ))}
                  </tr>

                {/* ── Labor Markup ── */}
                <tr className="border-b border-amber-200/70">
                  <td className={labelCell}>Labor Markup</td>
                  {processes.map((proc) => (
                    <Col key={proc.id} proc={proc}>
                      <div className="flex items-center">
                        <CurrencyInput type="percent" value={proc.laborMarkup}
                          onChange={v => update(proc.id, { laborMarkup: v })}
                          className={cellInpSuffix} />
                        <span className={suffixUnit}>%</span>
                      </div>
                    </Col>
                  ))}
                </tr>

                {/* ── Hrs / Shift ── */}
                <tr className="border-b border-amber-200/70">
                  <td className={labelCell}>Hours / Shift</td>
                  {processes.map((proc) => (
                    <Col key={proc.id} proc={proc}>
                      <CurrencyInput type="rate" value={proc.hrsPerShift}
                        onChange={v => update(proc.id, { hrsPerShift: v })}
                        placeholder="7"
                        className={cellInp} />
                    </Col>
                  ))}
                  </tr>

                {/* ── Working Days ── */}
                <tr className="border-b border-amber-200/70">
                  <td className={labelCell}>Working Days</td>
                  {processes.map((proc) => (
                    <Col key={proc.id} proc={proc}>
                      <CurrencyInput type="integer" value={proc.workingDays}
                        onChange={v => update(proc.id, { workingDays: v })}
                        placeholder="5"
                        className={cellInp} />
                    </Col>
                  ))}
                  </tr>

                {/* ── Min Labor Hrs ── */}
                <tr className="border-b border-amber-200/70">
                  <td className={labelCell}>Min Labor Hrs</td>
                  {processes.map((proc) => (
                    <Col key={proc.id} proc={proc}>
                      <div className="flex items-center">
                        <input type="number" min={0} step={0.5}
                          value={proc.minLaborHrs || ""}
                          onChange={e => update(proc.id, { minLaborHrs: parseFloat(e.target.value) || 0 })}
                          placeholder="0"
                          className={cellInpSuffix} />
                        <span className={suffixUnit}>hrs</span>
                      </div>
                    </Col>
                  ))}
                  </tr>

              </>)}

              {/* ── Outputs toggle row ── */}
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td className="px-3 py-1 sticky left-0 z-10 bg-gray-50">
                  <span className="text-[0.55rem] font-semibold uppercase tracking-widest text-gray-400">Outputs</span>
                </td>
                {processes.map(proc =>
                  collapsedCols[proc.id]
                    ? <td key={proc.id} className="w-9 border-l border-amber-200 bg-amber-50/40" />
                    : (
                      <td key={proc.id} className="px-2 py-1 border-l border-amber-200 bg-amber-50/40">
                        <button type="button"
                          onClick={() => setOutputsOpen(o => ({ ...o, [proc.id]: !o[proc.id] }))}
                          className="flex items-center gap-1 text-[0.6rem] font-semibold text-gray-400 hover:text-[#e8473f] transition-colors uppercase tracking-wider">
                          {outputsOpen[proc.id] ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                          {outputsOpen[proc.id] ? "Hide" : "Show"}
                        </button>
                      </td>
                    )
                )}
              </tr>

              {/* ── Outputs rows ── */}
              {processes.some(p => outputsOpen[p.id] && !collapsedCols[p.id]) && (() => {
                const fmtN0 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
                const fmtN2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const fmtN4 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
                const fmtD  = (v: number) => "$" + fmtN2(v);

                type OutRow =
                  | { kind: "metric"; label: string; val: (i: number) => string }
                  | { kind: "cost";   label: string; our: (i: number) => number; cx: (i: number) => number; bold?: boolean };

                // Compute per-process outputs
                const procOutputs = processes.map(proc => {
                  const isBlending = proc.name.toLowerCase().includes("blending");
                  const isFilling  = proc.name.toLowerCase().includes("filling");
                  const totalUnits = Math.ceil(proc.units * (1 + proc.overageRate / 100));
                  const speed      = proc.processSpeedValue;
                  const speedUnit  = proc.processSpeedUnit;
                  const buffer     = proc.efficiencyBuffer > 0 ? 1 - proc.efficiencyBuffer / 100 : 1;
                  let unitsPerHr = 0;
                  if (speed > 0) {
                    switch (speedUnit) {
                      case "units / min": unitsPerHr = speed * 60; break;
                      case "units / hr":  unitsPerHr = speed; break;
                      default:            unitsPerHr = 0;
                    }
                  }
                  const unitsPerMin   = unitsPerHr / 60;
                  const effectiveRate = unitsPerHr * buffer;
                  const hrsRequired   = effectiveRate > 0 ? totalUnits / effectiveRate : calculateProcessHours(proc, totalUnits);
                  const operators     = proc.numStaff > 0 ? proc.numStaff : 1;
                  const laborOur      = hrsRequired * proc.laborRate * operators;
                  const laborCust     = laborOur * (1 + proc.laborMarkup / 100) * (1 + (proc.costMarkup ?? 0) / 100);
                  return { isBlending, isFilling, totalUnits, unitsPerHr, unitsPerMin, hrsRequired, laborOur, laborCust };
                });

                // Per-process type: blending = time/cost only; filling = units+time+cost; general = hrs+cost
                const blendingRows: OutRow[] = [
                  { kind: "metric", label: "Batch Size",       val: i => procOutputs[i].totalUnits > 0  ? fmtN0(procOutputs[i].totalUnits)  : "—" },
                  { kind: "metric", label: "Hrs Required",     val: i => procOutputs[i].hrsRequired > 0 ? fmtN2(procOutputs[i].hrsRequired) : "—" },
                  { kind: "cost",   label: "Total Labor Cost", our: i => procOutputs[i].laborOur, cx: i => procOutputs[i].laborCust, bold: true },
                ];

                const fillingRows: OutRow[] = [
                  { kind: "metric", label: "Total Units",      val: i => procOutputs[i].totalUnits > 0  ? fmtN0(procOutputs[i].totalUnits)  : "—" },
                  { kind: "metric", label: "Units / Hour",     val: i => procOutputs[i].unitsPerHr > 0  ? fmtN0(procOutputs[i].unitsPerHr)  : "—" },
                  { kind: "metric", label: "Units / Minute",   val: i => procOutputs[i].unitsPerMin > 0 ? fmtN4(procOutputs[i].unitsPerMin) : "—" },
                  { kind: "metric", label: "Hrs Required",     val: i => procOutputs[i].hrsRequired > 0 ? fmtN2(procOutputs[i].hrsRequired) : "—" },
                  { kind: "cost",   label: "Total Labor Cost", our: i => procOutputs[i].laborOur, cx: i => procOutputs[i].laborCust, bold: true },
                ];

                const generalRows: OutRow[] = [
                  { kind: "metric", label: "Units (w/ Overage)", val: i => procOutputs[i].totalUnits > 0  ? fmtN0(procOutputs[i].totalUnits)  : "—" },
                  { kind: "metric", label: "Hrs Required",       val: i => procOutputs[i].hrsRequired > 0 ? fmtN2(procOutputs[i].hrsRequired) : "—" },
                  { kind: "cost",   label: "Labor Cost",         our: i => procOutputs[i].laborOur, cx: i => procOutputs[i].laborCust, bold: true },
                ];

                // Pick row set based on first open process type
                const firstOpen = processes.find(p => outputsOpen[p.id]);
                const outRows: OutRow[] = firstOpen?.name.toLowerCase().includes("blending") ? blendingRows
                  : firstOpen?.name.toLowerCase().includes("filling") ? fillingRows
                  : generalRows;

                const subHeader = (
                  <tr key="subheader" className="border-b border-amber-200/70 bg-amber-50/40">
                    <td className="px-3 py-1 sticky left-0 z-10 bg-amber-50/40" />
                    {processes.map(proc =>
                      collapsedCols[proc.id]
                        ? <td key={proc.id} className="w-9 border-l border-amber-200 bg-amber-50/40" />
                        : (
                          <td key={proc.id} className="px-2 py-0.5 border-l border-amber-200 bg-amber-50/40">
                            {outputsOpen[proc.id] && (
                              <div className="flex justify-between">
                                <span className="text-[0.52rem] font-bold text-gray-400 uppercase tracking-wider">Our Cost</span>
                                <span className="text-[0.52rem] font-bold text-[#e8473f] uppercase tracking-wider">Customer</span>
                              </div>
                            )}
                          </td>
                        )
                    )}
                  </tr>
                );

                const dataRows = outRows.map(row => {
                  const isCost = row.kind === "cost";
                  const bold   = isCost && (row as { bold?: boolean }).bold;
                  return (
                    <tr key={row.label} className={`border-b ${isCost ? "border-amber-100" : "border-gray-100"} ${bold ? "bg-amber-50/60" : isCost ? "bg-amber-50/20" : "bg-gray-50/60"}`}>
                      <td className={`px-3 py-1 text-[0.63rem] sticky left-0 z-10 ${bold ? "font-bold text-amber-800 bg-amber-50/60" : isCost ? "text-gray-600 bg-amber-50/30" : "text-gray-500 bg-gray-50/80"}`}>
                        {row.label}
                      </td>
                      {processes.map((proc, i) => {
                        if (collapsedCols[proc.id]) return <td key={proc.id} className="w-9 border-l border-amber-200 bg-amber-50/40" />;
                        if (!outputsOpen[proc.id]) return <td key={proc.id} className="px-2 py-1 border-l border-amber-200 text-right"><span className="text-[0.65rem] text-gray-300">—</span></td>;
                        return (
                          <td key={proc.id} className={`px-2 py-1 border-l ${isCost ? "border-amber-200" : "border-gray-200"}`}>
                            {isCost ? (
                              <div className="flex justify-between gap-1">
                                <span className={`text-[0.7rem] tabular-nums ${bold ? "font-bold text-gray-700" : "font-semibold text-gray-600"}`}>
                                  {(row as { our: (i: number) => number }).our(i) > 0 ? fmtD((row as { our: (i: number) => number }).our(i)) : "—"}
                                </span>
                                <span className={`text-[0.7rem] tabular-nums ${bold ? "font-bold text-[#e8473f]" : "font-semibold text-[#e8473f]/80"}`}>
                                  {(row as { cx: (i: number) => number }).cx(i) > 0 ? fmtD((row as { cx: (i: number) => number }).cx(i)) : "—"}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[0.7rem] tabular-nums text-gray-700 font-medium">
                                {(row as { val: (i: number) => string }).val(i)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                });

                return <>{subHeader}{dataRows}</>;
              })()}

              {/* Recipe is now a floating popover — rendered below the table */}
              {false && (() => {
                const ING_COLORS = ["bg-blue-400"];
                const maxIngs = 0;
                return (
                  <>
                    {/* Section divider header */}
                    <tr>
                      <td colSpan={processes.length + 2} className="p-0">
                        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-t-2 border-amber-200">
                          <div className="w-1 h-4 rounded-full bg-amber-400 shrink-0" />
                          <span className="text-[0.6rem] font-bold text-amber-700 uppercase tracking-widest">Recipe Composition</span>
                          <span className="text-[0.55rem] text-amber-500 ml-1">— visible on Blending processes</span>
                        </div>
                      </td>
                    </tr>

                    {/* Composition bar + Add Ingredient per blending column */}
                    <tr className="border-b border-amber-100">
                      <td className="px-3 py-2 bg-amber-50/60 sticky left-0 z-10">
                        <span className="text-[0.6rem] text-amber-600 font-semibold">Composition</span>
                      </td>
                      {processes.map((proc, idx) => {
                        const isBlending = proc.name.toLowerCase().includes("blending") && recipeOpen[proc.id];
                        const { totalQty } = deriveStats(proc, idx);
                        const sum = proc.recipeIngredients.reduce((a, i) => a + (i.percentage || 0), 0);
                        const isOk   = Math.abs(sum - 100) < 0.01;
                        const isOver = sum > 100.01;
                        return (
                          <Col key={proc.id} proc={proc}>
                            {isBlending ? (
                              <div className="space-y-1.5 py-0.5">
                                {/* Stacked composition bar */}
                                {proc.recipeIngredients.length > 0 && (
                                  <div>
                                    <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                                      {(() => {
                                        let offset = 0;
                                        return proc.recipeIngredients.map((ing, i) => {
                                          const w = Math.min(ing.percentage ?? 0, 100 - offset);
                                          const seg = (
                                            <div key={ing.id}
                                              title={`${ing.name || `Ingredient ${i+1}`}: ${(ing.percentage ?? 0).toFixed(1)}%`}
                                              className={`absolute h-full ${ING_COLORS[i % ING_COLORS.length]} transition-all`}
                                              style={{ left: `${offset}%`, width: `${w}%` }} />
                                          );
                                          offset += w;
                                          return seg;
                                        });
                                      })()}
                                      {isOver && <div className="absolute inset-0 bg-red-400 opacity-20 rounded-full" />}
                                    </div>
                                    <div className="flex items-center justify-between mt-0.5">
                                      <span className={`text-[0.55rem] font-semibold tabular-nums ${isOk ? "text-green-600" : isOver ? "text-red-500" : "text-amber-500"}`}>
                                        {sum.toFixed(1)}% {isOk ? "✓" : isOver ? `(+${(sum-100).toFixed(1)}%)` : `(${(100-sum).toFixed(1)}% left)`}
                                      </span>
                                      <span className="text-[0.5rem] text-gray-400">target 100%</span>
                                    </div>
                                  </div>
                                )}
                                {proc.batchSizeValue > 0 && totalQty > 0 && (
                                  <p className="text-[0.55rem] text-amber-600">
                                    {totalQty.toFixed(2)} {proc.batchSizeUnit} total
                                    {proc.overageRate > 0 ? ` (+${proc.overageRate}% ovg)` : ""}
                                  </p>
                                )}
                                <button type="button" onClick={() => addIngredient(proc.id)}
                                  className="text-[0.6rem] font-semibold text-[#e8473f] hover:text-[#c73d36] transition-colors whitespace-nowrap">
                                  + Add Ingredient
                                </button>
                              </div>
                            ) : (
                              <span className="text-[0.6rem] text-gray-300 italic">—</span>
                            )}
                          </Col>
                        );
                      })}
                      <td className="border-l border-amber-100 bg-amber-50/40" />
                    </tr>

                    {/* One row per ingredient slot */}
                    {maxIngs > 0 && Array.from({ length: maxIngs }).map((_, ingIdx) => (
                      <tr key={`ing-${ingIdx}`} className="border-b border-amber-100">
                        <td className="px-3 py-1.5 bg-amber-50/60 sticky left-0 z-10">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${ING_COLORS[ingIdx % ING_COLORS.length]}`} />
                            <span className="text-[0.63rem] text-amber-700 font-medium">Ingredient {ingIdx + 1}</span>
                          </div>
                        </td>
                        {processes.map((proc) => {
                          const isBlending = proc.name.toLowerCase().includes("blending") && recipeOpen[proc.id];
                          if (!isBlending) return (
                            <Col key={proc.id} proc={proc}>
                              <span className="text-[0.6rem] text-gray-300 italic">—</span>
                            </Col>
                          );
                          const ing = proc.recipeIngredients[ingIdx];
                          if (!ing) return (
                            <Col key={proc.id} proc={proc}>
                              <span className="text-[0.6rem] text-gray-300 italic">—</span>
                            </Col>
                          );
                          // Use batch size (total material with overage) as total grams
                          const batchGrams = Math.ceil(proc.units * (1 + proc.overageRate / 100)) * (TO_GRAMS[proc.batchSizeUnit] ?? 1);
                          const ingGrams   = (ing.percentage / 100) * batchGrams;
                          const ingKg      = ingGrams / 1000;
                          const ingLbs     = ingGrams / 453.592;
                          return (
                            <Col key={proc.id} proc={proc}>
                              <div className="space-y-1 py-0.5">
                                <div className="flex items-center gap-1">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ING_COLORS[ingIdx % ING_COLORS.length]}`} />
                                  <input type="text" value={ing.name}
                                    onChange={e => updateIngredient(proc.id, ing.id, { name: e.target.value })}
                                    placeholder="Ingredient name…"
                                    className="h-6 flex-1 min-w-0 px-2 text-[0.7rem] border border-amber-300 bg-amber-100/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/40 rounded transition placeholder:text-gray-300" />
                                  <button type="button" onClick={() => removeIngredient(proc.id, ing.id)}
                                    className="text-gray-300 hover:text-red-400 transition-colors text-sm leading-none shrink-0" title="Remove">×</button>
                                </div>
                                <div className="flex gap-1 items-center">
                                  <input type="number" min={0} max={100} step={0.1}
                                    value={ing.percentage || ""}
                                    onChange={e => updateIngredient(proc.id, ing.id, { percentage: parseFloat(e.target.value) || 0 })}
                                    placeholder="%"
                                    className="h-6 w-12 px-1.5 text-[0.7rem] border border-amber-300 bg-amber-100/70 focus:outline-none rounded-l text-right tabular-nums" />
                                  <span className="h-6 px-1 text-[0.55rem] text-gray-500 border border-l-0 border-amber-300 bg-amber-100/60 flex items-center rounded-r select-none">%</span>
                                </div>
                                {ing.percentage > 0 && batchGrams > 0 && (
                                  <div className="text-[0.55rem] text-amber-700 tabular-nums space-y-0.5">
                                    <div>{ingGrams.toFixed(1)} g</div>
                                    <div>{ingKg.toFixed(3)} kg</div>
                                    <div>{ingLbs.toFixed(3)} lbs</div>
                                  </div>
                                )}
                              </div>
                            </Col>
                          );
                        })}
                        <td className="border-l border-amber-100 bg-amber-50/40" />
                      </tr>
                    ))}

                    {/* Total % summary row */}
                    <tr className="border-b-2 border-amber-200">
                      <td className="px-3 py-1.5 bg-amber-100/60 sticky left-0 z-10">
                        <span className="text-[0.6rem] font-bold text-amber-700 uppercase tracking-wider">Total %</span>
                      </td>
                      {processes.map((proc) => {
                        const isBlending = proc.name.toLowerCase().includes("blending") && recipeOpen[proc.id];
                        if (!isBlending) return (
                          <Col key={proc.id} proc={proc}>
                            <span className="text-[0.6rem] text-gray-300 italic">—</span>
                          </Col>
                        );
                        const sum    = proc.recipeIngredients.reduce((a, i) => a + (i.percentage || 0), 0);
                        const isOk   = Math.abs(sum - 100) < 0.01;
                        const isOver = sum > 100.01;
                        return (
                          <Col key={proc.id} proc={proc}>
                            <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[0.6rem] font-bold tabular-nums ${
                              isOk   ? "bg-green-100 text-green-700" :
                              isOver ? "bg-red-100 text-red-600"     :
                                       "bg-amber-100 text-amber-700"
                            }`}>
                              {sum.toFixed(1)}%
                              {isOk   ? " ✓" :
                               isOver ? ` — ${(sum-100).toFixed(1)}% over` :
                                        ` — ${(100-sum).toFixed(1)}% left`}
                            </div>
                          </Col>
                        );
                      })}
                      <td className="border-l border-amber-100 bg-amber-100/40" />
                    </tr>
                  </>
                );
              })()}

            </tbody>
          </table>

          </CollapsedContext.Provider>
        </div>
      )}

      {/* ── Recipe popovers — one per blending process ── */}
      {processes.filter(p => p.name.toLowerCase().includes("blending") && recipeOpen[p.id]).map(proc => (
        <RecipePopover key={proc.id} proc={proc}
          anchorRef={getRecipeBtnRef(proc.id)}
          onClose={() => setRecipeOpen(o => ({ ...o, [proc.id]: false }))}
          addIngredient={addIngredient}
          removeIngredient={removeIngredient}
          updateIngredient={updateIngredient}
        />
      ))}
    </div>
  );
}
