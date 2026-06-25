import { useState } from "react";
import React from "react";
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { CoPackingProcess, RecipeIngredient } from "@/lib/types";
import { uid as _uid } from "@/lib/uid";
import { RequiredToggle, useSectionRequired } from "@/lib/SectionRequiredContext";
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
function convertFromGrams(grams: number, toUnit: string): number {
  return grams / (TO_GRAMS[toUnit] ?? 1);
}

// ── Speed UOM options ─────────────────────────────────────────────────────────
const SPEED_UNITS_THROUGHPUT = ["units / min", "units / hr", "kg / hr", "lbs / hr", "g / min", "batches / hr"];
const SPEED_UNITS_CYCLE      = ["min / unit", "min / batch", "hrs / batch"];
const BATCH_SIZE_UNITS       = ["g", "kg", "oz", "lbs", "L", "mL", "units", "batches"];
const INGREDIENT_UNITS       = ["g", "kg", "oz", "lbs", "L", "mL"];

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


export function defaultCoPackingProcess(): CoPackingProcess {
  return {
    id:                  uid(),
    name:                "",
    units:               0,
    perOuter:            0,
    isAutoUnits:         true,
    overageRate:         0,
    processSpeedValue:   0,
    processSpeedUnit:    "units / min",
    batchSizeValue:      0,
    batchSizeUnit:       "kg",
    laborRate:           27,
    laborMarkup:         30,
    efficiencyBuffer:    15,
    numStaff:            1,
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

  const update = (id: string, patch: Partial<CoPackingProcess>) =>
    setProcesses(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));

  const addProcess = () =>
    setProcesses(prev => [...prev, defaultCoPackingProcess()]);

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

  const fmtCurrency = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const [collapsedCols, setCollapsedCols] = useState<Record<string, boolean>>({});

  const toggleCol = (id: string) =>
    setCollapsedCols(prev => ({ ...prev, [id]: !prev[id] }));

  const numCols = processes.length;
  const visibleCols = processes.filter(p => !collapsedCols[p.id]).length;
  const collapsedCount = numCols - visibleCols;
  const tableMinWidth = 185 + visibleCols * 160 + collapsedCount * 36;

  return (
    <div id="section-processes" className="bg-white border border-gray-200 rounded-xl mx-4 md:mx-6 mb-4 overflow-hidden max-w-4xl">

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
            className="flex items-center gap-1 text-[0.65rem] font-semibold text-[#e8473f] hover:text-[#c73d36] transition-colors">
            <span className="w-4 h-4 flex items-center justify-center border border-[#e8473f] rounded text-xs leading-none">+</span>
            Add Process
          </button>
          <RequiredToggle sectionId="section-processes" />
        </div>
      </div>

      {sectionOpen && !notRequired["section-processes"] && (
        <div className="overflow-x-auto">
          <CollapsedContext.Provider value={collapsedCols}>
          <table className="border-collapse" style={{ minWidth: tableMinWidth }}>

            {/* ── Column headers ── */}
            <thead>
              <tr>
                <th className="w-[185px] min-w-[185px] px-3 py-2 text-left text-[0.55rem] font-semibold text-gray-500 uppercase tracking-widest border-b border-amber-200/70 bg-white sticky left-0 z-10">
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
                      style={{ minWidth: 160 }}>
                      <div className="flex items-center justify-between gap-1">
                        <div className="min-w-0">
                          <span className="truncate block">{proc.name || `Process ${idx + 1}`}</span>
                          {calcHrs > 0 && (
                            <span className="text-[0.55rem] text-gray-400 tabular-nums font-normal">~{calcHrs.toFixed(2)} hrs</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
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
                <th className="px-2 py-2 bg-gray-800 border-b border-l border-gray-700" style={{ width: 40, minWidth: 40 }}>
                  <button type="button" onClick={addProcess}
                    className="w-6 h-6 flex items-center justify-center border border-gray-600 text-gray-400 hover:border-white hover:text-white hover:bg-gray-700 transition-colors rounded text-sm font-semibold"
                    title="Add process">+</button>
                </th>
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
                <td className="border-l border-amber-200/70" />
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
                <td className="border-l border-amber-200/70" />
              </tr>

              {/* ── Batch Size ── */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}>Batch Size</td>
                {processes.map((proc) => (
                  <Col key={proc.id} proc={proc}>
                    <div className="flex items-center gap-1">
                      <input type="number" min={0} step={0.01}
                        value={proc.batchSizeValue || ""}
                        onChange={e => update(proc.id, { batchSizeValue: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                        className="h-7 flex-1 min-w-0 px-2 border border-amber-300 text-[0.7rem] text-gray-900 placeholder:text-gray-300 bg-amber-100/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/40 focus:border-[#e8473f] transition rounded-l" />
                      <select value={proc.batchSizeUnit}
                        onChange={e => update(proc.id, { batchSizeUnit: e.target.value })}
                        className="h-7 px-1 border border-l-0 border-amber-300 text-[0.7rem] text-gray-700 bg-amber-100/60 focus:outline-none rounded-r shrink-0">
                        {BATCH_SIZE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </Col>
                ))}
                <td className="border-l border-amber-200/70" />
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
                <td className="border-l border-amber-200/70" />
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
                        className="h-7 px-1 border border-l-0 border-amber-300 text-[0.7rem] text-gray-700 bg-amber-100/60 focus:outline-none rounded-r shrink-0">
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
                <td className="border-l border-amber-200/70" />
              </tr>

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
                <td className="border-l border-amber-200/70" />
              </tr>

              {/* ── Eff. Buffer % ── */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}>Eff. Buffer %</td>
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
                <td className="border-l border-amber-200/70" />
              </tr>

              {/* ── Labor Markup ── */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}>Labor Mkp %</td>
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
                <td className="border-l border-amber-200/70" />
              </tr>

              {/* ── No. of Staff ── */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}>No. of Staff</td>
                {processes.map((proc) => (
                  <Col key={proc.id} proc={proc}>
                    <CurrencyInput type="integer" value={proc.numStaff}
                      onChange={v => update(proc.id, { numStaff: v })}
                      placeholder="1"
                      className={cellInp} />
                  </Col>
                ))}
                <td className="border-l border-amber-200/70" />
              </tr>

              {/* ── Hrs / Shift ── */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}>Hrs / Shift</td>
                {processes.map((proc) => (
                  <Col key={proc.id} proc={proc}>
                    <CurrencyInput type="rate" value={proc.hrsPerShift}
                      onChange={v => update(proc.id, { hrsPerShift: v })}
                      placeholder="7"
                      className={cellInp} />
                  </Col>
                ))}
                <td className="border-l border-amber-200/70" />
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
                <td className="border-l border-amber-200/70" />
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
                <td className="border-l border-amber-200/70" />
              </tr>

              {/* ── Est. Summary ── */}
              <tr className="border-b border-amber-200 bg-amber-50/60">
                <td className="px-3 py-1 text-[0.63rem] font-semibold text-amber-700 bg-amber-100/70 sticky left-0 z-10">Est. Summary</td>
                {processes.map((proc, idx) => {
                  const { totalQty, calcHrs, laborOur, laborCust, batchCount, minApplied } = deriveStats(proc, idx);
                  return (
                    <Col key={proc.id} proc={proc}>
                      {calcHrs <= 0 && totalQty <= 0
                        ? <span className="text-[0.6rem] text-gray-300 italic">—</span>
                        : <div className="text-[0.6rem] text-gray-500 space-y-0.5 leading-snug">
                            {batchCount !== null && batchCount > 0 && (
                              <div>{batchCount} batch{batchCount !== 1 ? "es" : ""}</div>
                            )}
                            <div className={minApplied ? "text-amber-600 font-semibold" : ""}>
                              {calcHrs.toFixed(2)} hrs{minApplied ? " (min)" : ""}
                            </div>
                            <div>Our: <span className="font-semibold text-gray-700">{fmtCurrency(laborOur)}</span></div>
                            <div>Cust: <span className="font-semibold text-[#e8473f]">{fmtCurrency(laborCust)}</span></div>
                          </div>
                      }
                    </Col>
                  );
                })}
                <td className="border-l border-amber-200/70" />
              </tr>

              {/* ── Recipe Composition ── */}
              {processes.some(p => p.name.toLowerCase() === "blending") && (() => {
                const ING_COLORS = ["bg-blue-400","bg-emerald-400","bg-violet-400","bg-orange-400","bg-pink-400","bg-teal-400","bg-yellow-400","bg-red-400"];
                const maxIngs = Math.max(...processes.map(p =>
                  p.name.toLowerCase() === "blending" ? p.recipeIngredients.length : 0
                ));
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
                        const isBlending = proc.name.toLowerCase() === "blending";
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
                        {processes.map((proc, procIdx) => {
                          const isBlending = proc.name.toLowerCase() === "blending";
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
                          const { totalQty } = deriveStats(proc, procIdx);
                          const totalGrams = totalQty * (TO_GRAMS[proc.batchSizeUnit] ?? 1);
                          const ingGrams   = (ing.percentage / 100) * totalGrams;
                          const ingQty     = convertFromGrams(ingGrams, ing.unit);
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
                                  <div className="flex items-center">
                                    <input type="number" min={0} max={100} step={0.1}
                                      value={ing.percentage || ""}
                                      onChange={e => updateIngredient(proc.id, ing.id, { percentage: parseFloat(e.target.value) || 0 })}
                                      placeholder="%"
                                      className="h-6 w-12 px-1.5 text-[0.7rem] border border-amber-300 bg-amber-100/70 focus:outline-none rounded-l text-right tabular-nums" />
                                    <span className="h-6 px-1 text-[0.55rem] text-gray-500 border border-l-0 border-amber-300 bg-amber-100/60 flex items-center rounded-r select-none">%</span>
                                  </div>
                                  <select value={ing.unit}
                                    onChange={e => updateIngredient(proc.id, ing.id, { unit: e.target.value })}
                                    className="h-6 px-1 text-[0.7rem] border border-amber-300 bg-amber-100/60 focus:outline-none rounded shrink-0">
                                    {INGREDIENT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                  </select>
                                  {ing.percentage > 0 && totalGrams > 0 && (
                                    <span className="text-[0.55rem] text-amber-600 font-medium tabular-nums whitespace-nowrap">
                                      = {ingQty.toFixed(2)} {ing.unit}
                                    </span>
                                  )}
                                </div>
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
                        const isBlending = proc.name.toLowerCase() === "blending";
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
    </div>
  );
}
