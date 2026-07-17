import { Fragment, useState, useCallback, useEffect } from "react";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import { SectionRequiredProvider, RequiredToggle, useSectionRequired } from "@/lib/SectionRequiredContext";
import Navbar from "@/components/navbar/Navbar";
import ProjectInfoSection from "@/components/project/ProjectInfoSection";
import ProjectDetails from "@/components/project/ProjectDetails";
import PackagingLevels from "@/components/project/PackagingLevels";
import CoPackingProcesses from "@/components/project/CoPackingProcesses";
import SectionSidebar, { SidebarSection } from "@/components/SectionSidebar";
import CrmStartModal, { CrmParams as CrmStartParams } from "@/components/CrmStartModal";
import { useProject } from "@/lib/ProjectContext";
import { MoqRow, ProjectFormData, AdditionalFeeRow, PackagingLevel, CoPackingProcess, Column, SummaryRow, SummaryTableRow } from "@/lib/types";
import { MoqPricingRow } from "@/lib/ProjectContext";
import { uid } from "@/lib/uid";

const fmt    = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

type ProcessCostTotals = { our: number; selling: number };

function calculateProcessHours(proc: CoPackingProcess, totalQty: number): number {
  const { processSpeedValue: speed, processSpeedUnit: unit, batchSizeValue: batchSize, efficiencyBuffer } = proc;
  if (speed === 0 || totalQty <= 0) return 0;
  const buffer = 1 - efficiencyBuffer / 100;
  if (buffer <= 0) return 0;
  switch (unit) {
    case "units / min": return (totalQty / (speed * buffer)) / 60;
    case "units / hr": return totalQty / (speed * buffer);
    case "kg / hr":
    case "lbs / hr": return totalQty / (speed * buffer);
    case "g / min": return (totalQty / (speed * buffer)) / 60;
    case "batches / hr": {
      const batches = batchSize > 0 ? Math.ceil(totalQty / batchSize) : 1;
      return batches / (speed * buffer);
    }
    case "min / unit": return (totalQty * (speed / buffer)) / 60;
    case "min / batch": {
      const batches = batchSize > 0 ? Math.ceil(totalQty / batchSize) : 1;
      return (batches * (speed / buffer)) / 60;
    }
    case "hrs / batch": {
      const batches = batchSize > 0 ? Math.ceil(totalQty / batchSize) : 1;
      return batches * (speed / buffer);
    }
    default: return 0;
  }
}

function calculateProcessCosts(processes: CoPackingProcess[]) {
  const rows = processes.map(proc => {
    const totalUnits = Math.ceil(proc.units * (1 + proc.overageRate / 100));
    const hrsRequired = calculateProcessHours(proc, totalUnits);
    const operators = proc.numStaff > 0 ? proc.numStaff : 1;
    const laborOur = hrsRequired * proc.laborRate * operators;
    const laborCust = laborOur * (1 + proc.laborMarkup / 100) * (1 + ((proc as any).costMarkup ?? 0) / 100);
    const margin = laborCust > 0 ? ((laborCust - laborOur) / laborCust) * 100 : 0;
    return { totalUnits, laborOur, laborCust, margin };
  });

  const totals: ProcessCostTotals = rows.reduce(
    (sum, row) => ({ our: sum.our + row.laborOur, selling: sum.selling + row.laborCust }),
    { our: 0, selling: 0 },
  );

  return { rows, totals };
}

/** Plain text input that holds local string state while typing; commits parsed float on blur. */
function NumInput({ value, onChange, className, placeholder }: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value === 0 ? "" : String(value));
  useEffect(() => { setLocal(value === 0 ? "" : String(value)); }, [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={local}
      placeholder={placeholder}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { const n = parseFloat(local); onChange(isNaN(n) ? 0 : n); }}
      className={className}
    />
  );
}

// ── Shared input styles (mirrors ProjectDetails token set) ───────────────────
const palletInputBase = "h-9 w-full px-3 border border-amber-200 text-xs text-zinc-950 placeholder:text-zinc-500 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition";
const palletInputKey  = `${palletInputBase} rounded-md`;
const palletPrefix    = "text-[0.6rem] font-medium text-zinc-600 border border-r-0 border-amber-200 h-9 flex items-center px-2.5 bg-amber-50/50 shrink-0 rounded-l-md select-none";
const palletSuffix    = "text-[0.6rem] font-medium text-zinc-600 border border-l-0 border-amber-200 h-9 flex items-center px-2.5 bg-amber-50/50 shrink-0 rounded-r-md select-none";
const palletWithPfx   = `${palletInputBase} rounded-r-md flex-1`;
const palletWithSfx   = `${palletInputBase} rounded-l-md flex-1`;
const palletLabel     = "text-[0.65rem] text-zinc-600 mb-1 truncate";

function PalletizationSection({
  formData,
  setFormField,
  scaledColumns,
  moqQty,
}: {
  formData: ProjectFormData;
  setFormField: (field: keyof ProjectFormData, value: string) => void;
  scaledColumns: Column[];
  moqQty: number;
}) {
  const WEIGHT_TO_LBS: Record<string, number> = { lbs: 1, kg: 2.20462, g: 0.00220462, oz: 0.0625, t: 2204.62 };
  const n = (v: string | number | undefined) => parseFloat(String(v ?? "0")) || 0;
  const maxWtRaw = n(formData.maxPalletWeightLbs) || 2000;
  const maxWtUom = (formData as any).maxPalletWeightUom ?? "lbs";
  const maxWtLbs = maxWtRaw * (WEIGHT_TO_LBS[maxWtUom] ?? 1);

  // Raw material weight — same formula as calculations.ts
  const GRAMS_PER_UNIT: Record<string, number> = { g: 1, oz: 28.3495, lb: 453.592, kg: 1000, "fl oz": 29.5735 };
  const unitWeightG    = n(formData.unitWeight) * (GRAMS_PER_UNIT[formData.unitWeightUnit ?? "g"] ?? 1);
  const materialOverage = n(formData.materialOverage);
  const baseQty        = moqQty > 0 ? moqQty : n(scaledColumns[0]?.units);
  const rawWeightLbs   = (baseQty * (1 + materialOverage / 100) * unitWeightG) / 453.592;

  // Per-level packaging weight: col.units (already the correct effective qty from packagingLevelsToColumns)
  // × packagingWeightG — exactly matching computeColumnOutputs pkgWeight = baseUnits * packagingWeightG
  const levelWeightsG = scaledColumns.map(col => {
    const pwg   = n(col.rows?.["Packaging Weight (g)"]);
    const units = n(col.units);
    return units * pwg;
  });

  const levelWeightsLbs   = levelWeightsG.map(g => g / 453.592);
  const totalPkgWeightLbs = levelWeightsLbs.reduce((s, w) => s + w, 0);
  const totalWeightLbs    = rawWeightLbs + totalPkgWeightLbs;

  const buffer     = n(formData.palletBuffer);
  const autoPallets = totalWeightLbs > 0 ? Math.ceil(totalWeightLbs / maxWtLbs) + buffer : null;
  const calculatedPallets = totalWeightLbs > 0 && maxWtLbs > 0 ? Math.ceil(totalWeightLbs / maxWtLbs) : 0;
  const outboundFee = n(formData.outboundFee);
  const outboundMarkup = n(formData.outboundFeeMarkup);
  const palletOur = outboundFee * (autoPallets ?? 0);
  const palletSelling = outboundFee * (1 + outboundMarkup / 100) * (autoPallets ?? 0);
  const palletMargin = palletSelling > 0 ? ((palletSelling - palletOur) / palletSelling) * 100 : 0;
  const fmtN = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const fmtN2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtD = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });


  const otherFields: { label: string; field: keyof ProjectFormData; sym: string }[] = [
    { label: "Outbound Fee / Pallet", field: "outboundFee",         sym: "$"   },
    { label: "Outbound Fee Markup %", field: "outboundFeeMarkup",   sym: "%"   },
  ];

  const { notRequired: _palletNR } = useSectionRequired();
  const palletNR = !!_palletNR["section-palletization"];
  const [palletOpen, setPalletOpen] = useState(true);
  const [weightOpen, setWeightOpen] = useState(true);

  return (
    <div className="flex gap-5 items-start px-4 md:px-6 mb-4">
    <div id="section-palletization" className="bg-white border border-gray-200 rounded-xl overflow-hidden max-w-4xl flex-1 min-w-0"><div className="px-5 pt-4 pb-5">
      {/* Header — matches SectionHeader pattern */}
      <div className="flex items-center gap-3 mb-4">
        <button type="button" onClick={() => setPalletOpen(o => !o)} className="flex items-center gap-1.5 group min-w-0">
          <span className="text-sm font-bold text-zinc-950 group-hover:text-[#e8473f] transition-colors">Palletization</span>
          {palletOpen && !palletNR
            ? <ChevronUp size={13} className="text-zinc-500 group-hover:text-[#e8473f] transition-colors shrink-0" />
            : <ChevronDown size={13} className="text-zinc-500 group-hover:text-[#e8473f] transition-colors shrink-0" />}
        </button>
        <div className="ml-auto shrink-0"><RequiredToggle sectionId="section-palletization" /></div>
      </div>
      {palletOpen && !palletNR && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-5 gap-y-4 items-start">

        {/* Max Pallet Weight + UOM */}
        <div>
          <p className={palletLabel}>Max Pallet Weight</p>
          <div className="flex items-center w-full">
            <NumInput
              value={maxWtRaw}
              onChange={v => setFormField("maxPalletWeightLbs", String(v))}
              className={palletWithSfx}
            />
            <select
              value={maxWtUom}
              onChange={e => setFormField("maxPalletWeightUom" as keyof ProjectFormData, e.target.value)}
              className="text-[0.6rem] font-medium text-zinc-600 border border-l-0 border-amber-200 h-9 px-1 bg-amber-50/50 shrink-0 rounded-r-md focus:outline-none transition cursor-pointer"
            >
              {["lbs", "kg", "g", "oz", "t"].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {otherFields.map(({ label, field, sym }) => {
          const isPrefix = sym === "$";
          const numVal   = parseFloat(formData[field] as string || "0") || 0;
          return (
            <div key={field}>
              <p className={palletLabel}>{label}</p>
              <div className="flex items-center w-full">
                {sym && isPrefix  && <span className={palletPrefix}>{sym}</span>}
                {sym && !isPrefix && sym !== "%" ? (
                  <>
                    <NumInput value={numVal}
                      onChange={v => setFormField(field, String(v))}
                      className={palletWithSfx} />
                    <span className={palletSuffix}>{sym}</span>
                  </>
                ) : sym === "%" ? (
                  <>
                    <NumInput value={numVal}
                      onChange={v => setFormField(field, String(v))}
                      className={palletWithSfx} />
                    <span className={palletSuffix}>%</span>
                  </>
                ) : sym === "$" ? (
                  <NumInput value={numVal}
                    onChange={v => setFormField(field, String(v))}
                    className={palletWithPfx} />
                ) : (
                  <NumInput value={numVal}
                    onChange={v => setFormField(field, String(v))}
                    className={palletInputKey} />
                )}
              </div>
            </div>
          );
        })}
      </div>}

      {/* Weight breakdown output panel — toggleable, collapsed when section collapsed */}
      {palletOpen && !palletNR && (
        <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 overflow-hidden">
          <button type="button"
            onClick={() => setWeightOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-1.5 bg-gray-100 border-b border-gray-200 hover:bg-gray-200/60 transition-colors">
            <span className="text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Weight Breakdown</span>
            {weightOpen
              ? <ChevronUp size={11} className="text-zinc-600" />
              : <ChevronDown size={11} className="text-zinc-600" />}
          </button>
          {weightOpen && <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="px-3 py-1.5 text-left text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Weight Component</th>
                <th className="px-3 py-1.5 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">lbs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-3 py-1 text-zinc-700">Raw Material</td>
                <td className="px-3 py-1 text-right tabular-nums text-zinc-900">
                  {rawWeightLbs > 0 ? rawWeightLbs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                </td>
              </tr>
              {scaledColumns.map((col, i) => (
                <tr key={col.id}>
                  <td className="px-3 py-1 text-zinc-700">{col.level} Packaging</td>
                  <td className="px-3 py-1 text-right tabular-nums text-zinc-900">
                    {levelWeightsLbs[i] > 0 ? levelWeightsLbs[i].toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-gray-300 bg-gray-100">
                <td className="px-3 py-1.5 font-semibold text-zinc-800">Total Weight</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-zinc-950">
                  {totalWeightLbs > 0 ? totalWeightLbs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                </td>
              </tr>
              <tr className="bg-gray-50">
                <td className="px-3 py-1 text-zinc-600">Max Weight / Pallet</td>
                <td className="px-3 py-1 text-right tabular-nums text-zinc-700">
                  {maxWtLbs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </td>
              </tr>
              <tr className="bg-gray-100 border-t border-gray-300">
                <td className="px-3 py-1.5 font-semibold text-zinc-800">Pallets Required</td>
                <td className="px-3 py-1.5 text-right font-semibold text-zinc-950">
                  {autoPallets != null ? Math.ceil(totalWeightLbs / maxWtLbs) : "—"}
                </td>
              </tr>
              <tr className="bg-white">
                <td className="px-3 py-1 text-zinc-700">+ Buffer</td>
                <td className="px-3 py-1 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-[0.65rem] text-zinc-600 tabular-nums">{buffer > 0 ? `+${buffer}` : "+0"}</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={formData.palletBuffer || ""}
                      onChange={e => setFormField("palletBuffer", e.target.value)}
                      placeholder="0"
                      className="w-14 h-6 px-2 text-xs text-right border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#e8473f] tabular-nums"
                    />
                  </div>
                </td>
              </tr>
              <tr className="bg-blue-50 border-t-2 border-blue-300">
                <td className="px-3 py-2 font-bold text-blue-900">Total Pallets</td>
                <td className="px-3 py-2 text-right font-bold text-blue-700 tabular-nums text-sm">
                  {autoPallets != null ? autoPallets : "—"}
                </td>
              </tr>
            </tbody>
          </table>}
        </div>
      )}
    </div></div>
    {palletOpen && !palletNR && (
      <div className="w-56 shrink-0 sticky top-14 bg-[#EFF6FF] border border-blue-200 rounded-xl overflow-hidden shadow-sm shadow-blue-100">
        <div className="px-3 py-2.5 text-[0.55rem] font-semibold text-blue-700 uppercase tracking-widest border-b border-blue-200 bg-blue-100/60">
          Palletization Outputs
        </div>
        <div className="flex items-start justify-between gap-3 px-3 py-2.5 border-b border-blue-100">
          <span className="text-[0.68rem] text-zinc-600 leading-tight">Raw Material Weight</span>
          <span className="text-[0.72rem] font-semibold text-zinc-900 tabular-nums text-right">{rawWeightLbs > 0 ? `${fmtN2(rawWeightLbs)} lbs` : "—"}</span>
        </div>
        <div className="flex items-start justify-between gap-3 px-3 py-2.5 border-b border-blue-100">
          <span className="text-[0.68rem] text-zinc-600 leading-tight">Packaging Weight</span>
          <span className="text-[0.72rem] font-semibold text-zinc-900 tabular-nums text-right">{totalPkgWeightLbs > 0 ? `${fmtN2(totalPkgWeightLbs)} lbs` : "—"}</span>
        </div>
        <div className="flex items-start justify-between gap-3 px-3 py-2.5 border-b border-blue-100">
          <span className="text-[0.68rem] text-zinc-600 leading-tight">Total Weight</span>
          <span className="text-[0.72rem] font-semibold text-zinc-900 tabular-nums text-right">{totalWeightLbs > 0 ? `${fmtN2(totalWeightLbs)} lbs` : "—"}</span>
        </div>
        <div className="flex items-start justify-between gap-3 px-3 py-2.5 border-b border-blue-100">
          <span className="text-[0.68rem] text-zinc-600 leading-tight">Calculated Pallets</span>
          <span className="text-[0.72rem] font-semibold text-zinc-900 tabular-nums text-right">{calculatedPallets > 0 ? fmtN(calculatedPallets) : "—"}</span>
        </div>
        <div className="flex items-start justify-between gap-3 px-3 py-2.5 border-b border-blue-100">
          <span className="text-[0.68rem] text-zinc-600 leading-tight">Buffer Pallets</span>
          <span className="text-[0.72rem] font-semibold text-zinc-900 tabular-nums text-right">{buffer > 0 ? `+${fmtN(buffer)}` : "0"}</span>
        </div>
        <div className="flex items-start justify-between gap-3 px-3 py-2.5 border-b border-blue-100">
          <span className="text-[0.68rem] text-zinc-600 leading-tight">Total Pallets</span>
          <span className="text-[0.72rem] font-bold text-zinc-900 tabular-nums text-right">{autoPallets != null ? fmtN(autoPallets) : "—"}</span>
        </div>
        <div className="px-3 py-1.5 text-[0.52rem] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 border-b border-blue-200">Outbound Costs</div>
        <div className="grid grid-cols-2 gap-3 px-3 py-2.5 border-b border-blue-100">
          <div>
            <p className="text-[0.68rem] text-zinc-600 leading-tight mb-1">Our Cost</p>
            <p className="text-[0.72rem] font-semibold text-zinc-800 tabular-nums">{palletOur > 0 ? fmtD(palletOur) : "—"}</p>
          </div>
          <div className="text-right">
            <p className="text-[0.68rem] text-zinc-600 leading-tight mb-1">Selling Price</p>
            <p className="text-[0.72rem] font-bold text-[#e8473f] tabular-nums">{palletSelling > 0 ? fmtD(palletSelling) : "—"}</p>
          </div>
        </div>
        {palletSelling > 0 && (
          <div className="px-3 py-2.5">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[0.65rem] font-bold tabular-nums ${palletMargin >= 50 ? "bg-green-50 border-green-200 text-green-700" : palletMargin >= 30 ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-red-50 border-red-200 text-red-600"}`}>
              <span className="text-[0.5rem] font-semibold opacity-70">MARGIN</span>
              {palletMargin.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    )}
    </div>
  );
}

// ── LeftContent lifted out of Home so React never remounts it on re-render ──
interface LeftContentProps {
  expanded:     boolean;
  moqRows:      MoqRow[];
  setMoqRows:   React.Dispatch<React.SetStateAction<MoqRow[]>>;
  formData:     ProjectFormData;
  setFormField: (field: keyof ProjectFormData, value: string) => void;
  packagingLevels:    PackagingLevel[];
  setPackagingLevels: React.Dispatch<React.SetStateAction<PackagingLevel[]>>;
  scaledColumns: Column[];
  moqQty:    number;
  projectType: string;
  setProjectType: React.Dispatch<React.SetStateAction<"standard" | "copacking">>;
  coPackingProcesses: CoPackingProcess[];
  setCoPackingProcesses: React.Dispatch<React.SetStateAction<CoPackingProcess[]>>;
  summaryRows:      SummaryRow[];
  summaryTableRows: SummaryTableRow[];
  ppuUnits:         number;
  allMoqResults:    MoqPricingRow[];
  whatIfPpus:       Record<number, string>;
  setWhatIfPpus:    React.Dispatch<React.SetStateAction<Record<number, string>>>;
  costPpuOverrides: Record<number, string>;
  additionalFees:    AdditionalFeeRow[];
  setAdditionalFees: React.Dispatch<React.SetStateAction<AdditionalFeeRow[]>>;
  processLevels:     PackagingLevel[];
  setProcessLevels:  React.Dispatch<React.SetStateAction<PackagingLevel[]>>;
}

function LeftContent({ expanded: _expanded, moqRows: _moqRows, setMoqRows: _setMoqRows, formData, setFormField, packagingLevels, setPackagingLevels, scaledColumns, moqQty, projectType: _projectType, setProjectType: _setProjectType, coPackingProcesses: _coPackingProcesses, setCoPackingProcesses: _setCoPackingProcesses, summaryRows, summaryTableRows, ppuUnits, allMoqResults, whatIfPpus, setWhatIfPpus, costPpuOverrides, additionalFees, setAdditionalFees, processLevels: _processLevels, setProcessLevels: _setProcessLevels }: LeftContentProps) {
  const { notRequired } = useSectionRequired();
  const [pkgLineOpen, setPkgLineOpen] = useState(true);
  const processCostSummary = notRequired["section-processes"]
    ? { rows: [], totals: { our: 0, selling: 0 } }
    : calculateProcessCosts(_coPackingProcesses);
  return (
    <>
      <ProjectInfoSection />
      <ProjectDetails
        formData={formData}
        setFormField={setFormField}
      />
      {/* Processes section + side output panel */}
      {(() => {
        const fmtD = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
        const fmtPct = (v: number) => `${v.toFixed(1)}%`;
        const marginBg = (pct: number) => pct >= 50 ? "bg-green-50 border-green-200 text-green-700" : pct >= 30 ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-red-50 border-red-200 text-red-600";

        const procOutputs = processCostSummary.rows;
        const totalProcOur  = processCostSummary.totals.our;
        const totalProcCust = processCostSummary.totals.selling;
        const totalProcMargin = totalProcCust > 0 ? ((totalProcCust - totalProcOur) / totalProcCust) * 100 : 0;
        const hasAnyProc = procOutputs.some(p => p.laborCust > 0);

        return (
          <div className="flex gap-5 items-start px-4 md:px-6 mb-4">
            <CoPackingProcesses processes={_coPackingProcesses} setProcesses={_setCoPackingProcesses} />
            {!notRequired["section-processes"] && hasAnyProc && (
              <div className="w-56 shrink-0 sticky top-14 bg-[#EFF6FF] border border-blue-200 rounded-xl overflow-hidden shadow-sm shadow-blue-100">
                <div className="px-3 py-2.5 text-[0.55rem] font-semibold text-blue-700 uppercase tracking-widest border-b border-blue-200 bg-blue-100/60">
                  Process Costs
                </div>
                {_coPackingProcesses.map((proc, i) => {
                  const { laborOur, laborCust, margin } = procOutputs[i];
                  if (laborCust <= 0) return null;
                  return (
                    <div key={proc.id} className="border-b border-blue-100 last:border-0 px-3 py-2.5 space-y-1.5">
                      <div className="text-[0.6rem] font-bold text-zinc-800 uppercase tracking-wider truncate">{proc.name || `Process ${i + 1}`}</div>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[0.52rem] text-zinc-600 mb-0.5">Our Cost</div>
                          <div className="text-[0.72rem] font-semibold text-zinc-800 tabular-nums">{fmtD(laborOur)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[0.52rem] text-zinc-600 mb-0.5">Selling Price</div>
                          <div className="text-[0.72rem] font-bold text-[#e8473f] tabular-nums">{fmtD(laborCust)}</div>
                        </div>
                      </div>
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[0.65rem] font-bold tabular-nums ${marginBg(margin)}`}>
                        <span className="text-[0.5rem] font-semibold opacity-70">MARGIN</span>
                        {fmtPct(margin)}
                      </div>
                    </div>
                  );
                })}
                {_coPackingProcesses.length > 1 && totalProcCust > 0 && (
                  <div className="px-3 py-2.5 bg-blue-100/60 border-t-2 border-blue-300 space-y-1.5">
                    <div className="text-[0.55rem] font-bold text-blue-700 uppercase tracking-widest">Total</div>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[0.52rem] text-zinc-600 mb-0.5">Our Cost</div>
                        <div className="text-[0.75rem] font-bold text-zinc-900 tabular-nums">{fmtD(totalProcOur)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[0.52rem] text-zinc-600 mb-0.5">Selling Price</div>
                        <div className="text-[0.75rem] font-bold text-[#e8473f] tabular-nums">{fmtD(totalProcCust)}</div>
                      </div>
                    </div>
                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[0.65rem] font-bold tabular-nums ${marginBg(totalProcMargin)}`}>
                      <span className="text-[0.5rem] font-semibold opacity-70">MARGIN</span>
                      {fmtPct(totalProcMargin)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      <div className="flex gap-5 items-start px-4 md:px-6 mb-4">
        <PackagingLevels
          packagingLevels={packagingLevels}
          setPackagingLevels={setPackagingLevels}
          className="bg-white border border-gray-200 rounded-xl overflow-hidden max-w-4xl w-full"
          onOpenChange={setPkgLineOpen}
        />
        {pkgLineOpen && !notRequired["section-packaging-summary"] && summaryRows.length > 0 && (() => {
          const fmtD = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
          const fmtPct = (v: number) => `${v.toFixed(1)}%`;
          const marginBg = (pct: number) => pct >= 50 ? "bg-green-50 border-green-200 text-green-700" : pct >= 30 ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-red-50 border-red-200 text-red-600";
          const allCharges = packagingLevels[0]?.manualCharges ?? [];
          const pkgRows = summaryRows.filter(r => !["Setup / QA Fee", "Materials", "Pallets & Fees"].includes(r.label) && !r.label.startsWith("Testing –"));

          const manualChargeTotal = (lvl: (typeof packagingLevels)[0]): number => {
            const lvlCharges = allCharges.filter(c => !c.levelId || c.levelId === lvl.id);
            const baseUnits = lvl.cpoRequiredQty != null && lvl.cpoRequiredQty > 0 ? lvl.cpoRequiredQty : (lvl.units > 0 ? lvl.units : 0);
            const unitsWithOverage = Math.ceil(baseUnits * (1 + lvl.overageRate / 100));
            return lvlCharges.reduce((sum, c) => sum + (c.basis === "per_unit" ? c.amount * unitsWithOverage : c.amount), 0);
          };

          const totalOur = pkgRows.reduce((s, r, i) => s + r.ourCosts + (packagingLevels[i] ? manualChargeTotal(packagingLevels[i]) : 0), 0);
          const totalCx  = pkgRows.reduce((s, r, i) => s + r.customerPrice + (packagingLevels[i] ? manualChargeTotal(packagingLevels[i]) : 0), 0);
          const totalMargin = totalCx > 0 ? ((totalCx - totalOur) / totalCx) * 100 : 0;

          return (
            <div className="w-56 shrink-0 sticky top-14 bg-[#EFF6FF] border border-blue-200 rounded-xl overflow-hidden shadow-sm shadow-blue-100">
              <div className="px-3 py-2.5 text-[0.55rem] font-semibold text-blue-700 uppercase tracking-widest border-b border-blue-200 bg-blue-100/60">
                Packout Costs
              </div>
              {pkgRows.map((r, i) => {
                const lvl = packagingLevels[i];
                const chargeTotal = lvl ? manualChargeTotal(lvl) : 0;
                const our = r.ourCosts + chargeTotal;
                const cx  = r.customerPrice + chargeTotal;
                const margin = cx > 0 ? ((cx - our) / cx) * 100 : 0;
                return (
                  <div key={i} className="border-b border-blue-100 last:border-0 px-3 py-2.5 space-y-1.5">
                    <div className="text-[0.6rem] font-bold text-zinc-800 uppercase tracking-wider">{r.label}</div>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[0.52rem] text-zinc-600 mb-0.5">Our Cost</div>
                        <div className="text-[0.72rem] font-semibold text-zinc-800 tabular-nums">{our > 0 ? fmtD(our) : "—"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[0.52rem] text-zinc-600 mb-0.5">Customer</div>
                        <div className="text-[0.72rem] font-bold text-[#e8473f] tabular-nums">{cx > 0 ? fmtD(cx) : "—"}</div>
                      </div>
                    </div>
                    {cx > 0 && (
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[0.65rem] font-bold tabular-nums ${marginBg(margin)}`}>
                        <span className="text-[0.5rem] font-semibold opacity-70">MARGIN</span>
                        {fmtPct(margin)}
                      </div>
                    )}
                    {chargeTotal > 0 && (
                      <div className="text-[0.55rem] text-amber-600 italic">incl. {fmtD(chargeTotal)} charges</div>
                    )}
                  </div>
                );
              })}
              {pkgRows.length > 1 && totalCx > 0 && (
                <div className="px-3 py-2.5 bg-blue-100/60 border-t-2 border-blue-300 space-y-1.5">
                  <div className="text-[0.55rem] font-bold text-blue-700 uppercase tracking-widest">Total</div>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[0.52rem] text-zinc-600 mb-0.5">Our Cost</div>
                      <div className="text-[0.75rem] font-bold text-zinc-900 tabular-nums">{fmtD(totalOur)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[0.52rem] text-zinc-600 mb-0.5">Customer</div>
                      <div className="text-[0.75rem] font-bold text-[#e8473f] tabular-nums">{fmtD(totalCx)}</div>
                    </div>
                  </div>
                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[0.65rem] font-bold tabular-nums ${marginBg(totalMargin)}`}>
                    <span className="text-[0.5rem] font-semibold opacity-70">MARGIN</span>
                    {fmtPct(totalMargin)}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
      <PalletizationSection
        formData={formData}
        setFormField={setFormField}
        scaledColumns={scaledColumns}
        moqQty={moqQty}
      />
      {/* ── Additional Costs & Fees ── */}
      <div className="mx-4 md:mx-6 mb-4 max-w-4xl">
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-950 uppercase tracking-wide">Additional Costs & Fees</span>
              <span className="text-[0.55rem] font-semibold text-zinc-600 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded uppercase tracking-wider">Internal Only</span>
            </div>
            <button
              type="button"
              onClick={() => setAdditionalFees(prev => [...prev, { id: String(uid()), type: "", amount: 0, mode: "$" }])}
              className="text-[0.6rem] font-semibold text-[#e8473f] hover:text-[#c73d36] uppercase tracking-wider transition-colors"
            >
              + Add Row
            </button>
          </div>
          {additionalFees.length === 0 ? (
            <p className="py-3 text-center text-[0.65rem] text-zinc-600 italic">No additional fees — click Add Row</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {additionalFees.map((row) => (
                <div key={row.id} className="flex items-center gap-2 px-4 py-2">
                  <input
                    type="text"
                    value={row.type}
                    onChange={(e) => setAdditionalFees(prev => prev.map(r => r.id === row.id ? { ...r, type: e.target.value } : r))}
                    placeholder="Fee label…"
                    className="flex-1 h-7 px-2 text-xs text-zinc-950 border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition placeholder:text-zinc-500 rounded"
                  />
                  <div className="flex items-center border border-gray-200 rounded overflow-hidden h-7 shrink-0">
                    <button
                      type="button"
                      onClick={() => setAdditionalFees(prev => prev.map(r => r.id === row.id ? { ...r, mode: r.mode === "$" ? "%" : "$" } : r))}
                      className={`px-2 h-7 text-[0.65rem] font-semibold transition-colors border-r border-gray-200 ${row.mode === "$" ? "bg-[#e8473f] text-white" : "bg-gray-50 text-zinc-600 hover:text-zinc-900"}`}
                    >$</button>
                    <button
                      type="button"
                      onClick={() => setAdditionalFees(prev => prev.map(r => r.id === row.id ? { ...r, mode: r.mode === "%" ? "$" : "%" } : r))}
                      className={`px-2 h-7 text-[0.65rem] font-semibold transition-colors ${row.mode === "%" ? "bg-[#e8473f] text-white" : "bg-gray-50 text-zinc-600 hover:text-zinc-900"}`}
                    >%</button>
                  </div>
                  <div className="w-28 shrink-0">
                    <CurrencyInput
                      type={row.mode === "$" ? "dollar" : "percent"}
                      value={row.mode === "$" ? row.amount : row.amount * 100}
                      onChange={(v) => setAdditionalFees(prev => prev.map(r =>
                        r.id === row.id ? { ...r, amount: row.mode === "$" ? v : v / 100 } : r
                      ))}
                      className="h-7 w-full px-2 text-xs text-right border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#e8473f] rounded"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setAdditionalFees(prev => prev.filter(r => r.id !== row.id))}
                    className="shrink-0 text-zinc-500 hover:text-red-400 transition-colors text-sm leading-none"
                    title="Remove row"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div id="section-price-adjustment" className="mx-4 md:mx-6 mb-4 flex flex-col xl:flex-row gap-5 items-start scroll-mt-20">
        <PriceAdjustmentSection
          summaryRows={summaryRows}
          ppuUnits={ppuUnits}
          allMoqResults={allMoqResults}
          whatIfPpus={whatIfPpus}
          setWhatIfPpus={setWhatIfPpus}
          costPpuOverrides={costPpuOverrides}
          processCostTotals={processCostSummary.totals}
        />
        <PriceAdjustmentOutputPanel
          summaryRows={summaryRows}
          summaryTableRows={summaryTableRows}
          packagingLevels={packagingLevels}
          processes={_coPackingProcesses}
          processRows={processCostSummary.rows}
          processCostTotals={processCostSummary.totals}
        />
      </div>
    </>
  );
}

// ── Price Adjustment section (end of left column) ───────────────────────────
interface PriceAdjustmentSectionProps {
  summaryRows:   SummaryRow[];
  ppuUnits:      number;
  allMoqResults: MoqPricingRow[];
  whatIfPpus:    Record<number, string>;
  setWhatIfPpus: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  costPpuOverrides: Record<number, string>;
  processCostTotals: ProcessCostTotals;
}

function PriceAdjustmentSection({
  summaryRows, ppuUnits, allMoqResults,
  whatIfPpus, setWhatIfPpus, costPpuOverrides, processCostTotals,
}: PriceAdjustmentSectionProps) {
  const marginColor = (pct: number) =>
    pct >= 65 ? "text-green-700" : pct >= 50 ? "text-amber-600" : "text-red-600";

  const whatIfRows = allMoqResults.map((r) => {
    const processCostPPU = r.ppuDenominator > 0 ? processCostTotals.our / r.ppuDenominator : 0;
    const processSellingPPU = r.ppuDenominator > 0 ? processCostTotals.selling / r.ppuDenominator : 0;
    const basePPU = r.ppu + processSellingPPU;
    const inputStr = whatIfPpus[r.moqRow.id];
    const adjPPU   = inputStr !== undefined && inputStr !== "" ? parseFloat(inputStr) : basePPU;
    const isCustom = inputStr !== undefined && inputStr !== "" && !isNaN(adjPPU) && adjPPU !== basePPU;
    const costStr  = costPpuOverrides[r.moqRow.id];
    const costPPU  = costStr !== undefined && costStr !== "" ? parseFloat(costStr) : r.ppuCost + processCostPPU;
    const marginPct = adjPPU > 0 && costPPU > 0 ? ((adjPPU - costPPU) / adjPPU) * 100 : 0;
    const revenue   = adjPPU * r.ppuDenominator;
    const ourTotal  = r.totalOurCost + processCostTotals.our;
    return { r, adjPPU, costPPU, marginPct, revenue, ourTotal, isCustom };
  });

  const wiTotalRevenue = whatIfRows.reduce((s, w) => s + w.revenue,  0);
  const wiTotalOur     = whatIfRows.reduce((s, w) => s + w.ourTotal, 0);
  const wiAvgMargin    = wiTotalRevenue > 0 ? ((wiTotalRevenue - wiTotalOur) / wiTotalRevenue) * 100 : 0;
  const hasAdj         = Object.keys(whatIfPpus).length > 0;

  const baseCustomer = summaryRows.reduce((s, r) => s + r.customerPrice, 0) + processCostTotals.selling;
  const baseOur      = summaryRows.reduce((s, r) => s + r.ourCosts, 0) + processCostTotals.our;
  const computedCost = ppuUnits > 0 && baseOur > 0 ? baseOur / ppuUnits : 0;
  const adjPpuStr0   = whatIfPpus[0];
  const baselinePPU  = ppuUnits > 0 && baseCustomer > 0 ? baseCustomer / ppuUnits : 0;
  const adjPpuVal0   = adjPpuStr0 !== undefined && adjPpuStr0 !== "" ? parseFloat(adjPpuStr0) : baselinePPU;
  const adjRevenue0  = ppuUnits > 0 ? adjPpuVal0 * ppuUnits : baseCustomer;
  const effectiveCostTotal0 = computedCost > 0 && ppuUnits > 0 ? computedCost * ppuUnits : baseOur;
  const marginPct0   = adjRevenue0 > 0 ? ((adjRevenue0 - effectiveCostTotal0) / adjRevenue0) * 100 : 0;
  const isCustom0    = adjPpuStr0 !== undefined && adjPpuStr0 !== "";

  return (
    <div className="w-full max-w-4xl">
      <div className="rounded-xl border-2 border-amber-400 shadow-lg shadow-amber-100 overflow-hidden">
        {/* Header */}
        <div className="bg-amber-400 px-4 py-2.5 flex items-center gap-3">
          <SlidersHorizontal size={14} className="text-white shrink-0" />
          <span className="text-xs font-bold text-white uppercase tracking-wide">Price Adjustment</span>
          <span className="text-[0.6rem] text-amber-100">— adjust sale price to see impact on margin and revenue</span>
          {hasAdj && (
            <button
              type="button"
              onClick={() => setWhatIfPpus({})}
              className="ml-auto text-[0.6rem] font-semibold text-amber-900 hover:text-black border border-amber-300 bg-white/70 hover:bg-white px-2 h-5 rounded transition-colors"
            >
              Reset All
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto bg-white">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-amber-50/60">
                <th className="py-2 px-3 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider border-b-2 border-gray-900">Cost PPU</th>
                <th className="py-2 px-3 text-center text-[0.6rem] font-semibold text-amber-700 uppercase tracking-wider border-b-2 border-gray-900">Adjusted PPU</th>
                <th className="py-2 px-3 text-center text-[0.6rem] font-semibold text-amber-700 uppercase tracking-wider border-b-2 border-gray-900">Margin %</th>
                <th className="py-2 px-3 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider border-b-2 border-gray-900 bg-[#FEF2F2]">Total Revenue</th>
              </tr>
            </thead>
            <tbody>
              {whatIfRows.length === 0 ? (
                <tr className="border-b border-gray-100">
                  <td className="py-1.5 px-3 text-right text-xs text-zinc-600 font-medium tabular-nums">
                    {computedCost > 0 ? fmt(computedCost) : "—"}
                  </td>
                  <td className="py-1 px-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-xs text-zinc-600">$</span>
                      <CurrencyInput type="dollar"
                        value={adjPpuVal0}
                        onChange={(v) => setWhatIfPpus(prev => ({ ...prev, [0]: String(v) }))}
                        className="w-24 h-6 px-2 text-xs text-right border border-amber-300 bg-[#FFFDE7] focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium"
                      />
                      {isCustom0 && (
                        <button type="button"
                          onClick={() => setWhatIfPpus(prev => { const n = { ...prev }; delete n[0]; return n; })}
                          className="text-zinc-500 hover:text-zinc-700 text-sm leading-none" title="Reset">↺</button>
                      )}
                    </div>
                  </td>
                  <td className="py-1 px-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <CurrencyInput type="percent"
                        value={marginPct0}
                        onChange={(m) => {
                          const clampedM = Math.min(m / 100, 0.9999);
                          const newAdj = clampedM < 1 && computedCost > 0 ? computedCost / (1 - clampedM) : adjPpuVal0;
                          setWhatIfPpus(prev => ({ ...prev, [0]: String(newAdj) }));
                        }}
                        className={`w-20 h-6 px-2 text-xs text-right border border-amber-300 bg-[#FFFDE7] focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium ${marginColor(marginPct0)}`}
                      />
                      <span className="text-xs text-zinc-600">%</span>
                    </div>
                  </td>
                  <td className="py-1.5 px-3 text-right text-xs font-semibold text-zinc-900 bg-[#FEF2F2]">
                    {adjRevenue0 > 0 ? fmt(adjRevenue0) : "—"}
                  </td>
                </tr>
              ) : (
                whatIfRows.map(({ r, adjPPU, costPPU, marginPct, revenue, isCustom }) => {
                  const onAdjPpuChange = (v: number) => setWhatIfPpus(prev => ({ ...prev, [r.moqRow.id]: String(v) }));
                  const onMarginChange = (m: number) => {
                    const clampedM = Math.min(m / 100, 0.9999);
                    const newAdj = clampedM < 1 && costPPU > 0 ? costPPU / (1 - clampedM) : adjPPU;
                    setWhatIfPpus(prev => ({ ...prev, [r.moqRow.id]: String(newAdj) }));
                  };
                  return (
                    <tr key={r.moqRow.id} className="border-b border-gray-100 hover:bg-amber-50/20">
                      <td className="py-1.5 px-3 text-right text-xs text-zinc-600 font-medium tabular-nums">
                        {costPPU > 0 ? fmt(costPPU) : "—"}
                      </td>
                      <td className="py-1 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-xs text-zinc-600">$</span>
                          <NumInput
                            value={whatIfPpus[r.moqRow.id] !== undefined ? parseFloat(whatIfPpus[r.moqRow.id]) : adjPPU}
                            onChange={onAdjPpuChange}
                            className="w-24 h-6 px-2 text-xs text-right border border-amber-300 bg-[#FFFDE7] focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium"
                          />
                          {isCustom && (
                            <button type="button"
                              onClick={() => setWhatIfPpus(prev => { const n = { ...prev }; delete n[r.moqRow.id]; return n; })}
                              className="text-zinc-500 hover:text-zinc-700 text-sm leading-none" title="Reset to original">↺</button>
                          )}
                        </div>
                      </td>
                      <td className="py-1 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <NumInput
                            value={marginPct}
                            onChange={onMarginChange}
                            className={`w-20 h-6 px-2 text-xs text-right border border-amber-300 bg-[#FFFDE7] focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium ${marginColor(marginPct)}`}
                          />
                          <span className="text-xs text-zinc-600">%</span>
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-right text-xs font-semibold text-zinc-900 bg-[#FEF2F2]">
                        {fmt(revenue)}
                      </td>
                    </tr>
                  );
                })
              )}
              {whatIfRows.length > 0 && (
                <tr className="border-t-2 border-gray-900 bg-amber-50">
                  <td className="py-2 px-3 text-xs font-bold text-zinc-950 italic">TOTALS</td>
                  <td className="py-2 px-3 text-right text-xs text-zinc-600">—</td>
                  <td className={`py-2 px-3 text-right text-xs font-bold bg-[#FEF2F2] ${marginColor(wiAvgMargin)}`}>
                    {fmtPct(wiAvgMargin)}
                  </td>
                  <td className="py-2 px-3 text-right text-xs font-bold text-zinc-950 bg-[#FEF2F2]">
                    {fmt(wiTotalRevenue)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Home ─────────────────────────────────────────────────────────────────────
type PriceOutputProcessRow = ReturnType<typeof calculateProcessCosts>["rows"][number];

interface PriceAdjustmentOutputPanelProps {
  summaryRows: SummaryRow[];
  summaryTableRows: SummaryTableRow[];
  packagingLevels: PackagingLevel[];
  processes: CoPackingProcess[];
  processRows: PriceOutputProcessRow[];
  processCostTotals: ProcessCostTotals;
}

function PriceAdjustmentOutputPanel({
  summaryRows,
  summaryTableRows,
  packagingLevels,
  processes,
  processRows,
  processCostTotals,
}: PriceAdjustmentOutputPanelProps) {
  const [processesOpen, setProcessesOpen] = useState(false);
  const fmtMoney = (v: number) => v > 0 ? fmt(v) : "$0.00";
  const fmtQty = (v: number | null) => v == null || !isFinite(v)
    ? "-"
    : v.toLocaleString("en-US", { maximumFractionDigits: v >= 100 ? 0 : 2 });
  const fmtPpu = (v: number) => v > 0 ? fmt(v) : "$0.00";
  const summaryTableFor = (label: string) =>
    summaryTableRows.find(row => row.label === label && !row.isLeadTimeSummary);
  const packagingLabels = summaryTableRows
    .filter(row =>
      !row.isLeadTimeSummary &&
      !["Setup / QA Fee", "Materials", "Pallets & Fees"].includes(row.label) &&
      !row.label.startsWith("Testing"),
    )
    .map(row => row.label);
  const firstPackagingLabel = packagingLabels[0] ?? "";
  const getPackagingLevel = (label: string) => {
    const index = packagingLabels.indexOf(label);
    return index >= 0 ? packagingLevels[index] : undefined;
  };

  const rows = summaryRows.map(row => {
    const tableRow = summaryTableFor(row.label);
    const level = getPackagingLevel(row.label);
    const isSetup = row.label === "Setup / QA Fee";
    const isMaterial = row.label === "Materials";
    const isFirstPackaging = row.label === firstPackagingLabel;
    const deliverableQty = level
      ? (level.cpoRequiredQty ?? level.units ?? tableRow?.totalUnits ?? null)
      : tableRow?.totalUnits ?? (isSetup ? 1 : null);
    const intakeQty = level && deliverableQty != null
      ? Math.ceil(deliverableQty * (1 + level.overageRate / 100))
      : isMaterial
        ? tableRow?.totalWeight ?? tableRow?.totalUnits ?? null
        : isSetup
          ? 1
          : tableRow?.totalUnits ?? null;
    const sellingPrice = row.customerPrice + (isFirstPackaging ? processCostTotals.selling : 0);
    const ourCost = row.ourCosts + (isFirstPackaging ? processCostTotals.our : 0);
    const ppuDenom = deliverableQty && deliverableQty > 0 ? deliverableQty : null;
    const sellingPpu = ppuDenom ? sellingPrice / ppuDenom : (tableRow?.costPerUnit ?? sellingPrice);
    const ourPpu = ppuDenom ? ourCost / ppuDenom : ourCost;
    const marginDollars = sellingPrice - ourCost;
    const marginPct = sellingPrice > 0 ? (marginDollars / sellingPrice) * 100 : 0;

    return { label: row.label, intakeQty, deliverableQty, sellingPrice, sellingPpu, ourCost, ourPpu, marginPct, marginDollars, isFirstPackaging };
  });

  const processDetailRows = processes.map((proc, index) => {
    const detail = processRows[index];
    const deliverableQty = proc.units || null;
    const intakeQty = detail?.totalUnits ?? (proc.units ? Math.ceil(proc.units * (1 + proc.overageRate / 100)) : null);
    const sellingPrice = detail?.laborCust ?? 0;
    const ourCost = detail?.laborOur ?? 0;
    const ppuDenom = deliverableQty && deliverableQty > 0 ? deliverableQty : null;
    const marginDollars = sellingPrice - ourCost;
    return {
      id: proc.id,
      label: proc.name || `Process ${index + 1}`,
      intakeQty,
      deliverableQty,
      sellingPrice,
      sellingPpu: ppuDenom ? sellingPrice / ppuDenom : 0,
      ourCost,
      ourPpu: ppuDenom ? ourCost / ppuDenom : 0,
      marginPct: sellingPrice > 0 ? (marginDollars / sellingPrice) * 100 : 0,
      marginDollars,
    };
  }).filter(row => row.sellingPrice > 0 || row.ourCost > 0);

  const totals = rows.reduce(
    (sum, row) => ({ sellingPrice: sum.sellingPrice + row.sellingPrice, ourCost: sum.ourCost + row.ourCost }),
    { sellingPrice: 0, ourCost: 0 },
  );
  const totalMarginDollars = totals.sellingPrice - totals.ourCost;
  const totalMarginPct = totals.sellingPrice > 0 ? (totalMarginDollars / totals.sellingPrice) * 100 : 0;
  const totalPpuDenom = rows.find(row => row.deliverableQty && row.deliverableQty > 1)?.deliverableQty ?? 1;

  return (
    <div className="w-full xl:w-[720px] shrink-0 rounded-xl border border-blue-200 bg-[#EFF6FF] shadow-sm shadow-blue-100 overflow-hidden">
      <div className="px-3 py-2.5 text-[0.55rem] font-semibold text-blue-700 uppercase tracking-widest border-b border-blue-200 bg-blue-100/60">
        Total Project Costs
      </div>
      <div className="overflow-x-auto bg-white">
        <table className="w-full min-w-[700px] border-collapse text-[0.64rem]">
          <thead>
            <tr className="bg-blue-50 text-blue-800 uppercase tracking-wider">
              {["Line Item", "Intake Qty", "Deliverable Qty", "Selling Price", "Selling PPU", "Our Cost", "Our PPU", "Margin %", "Margin $$"].map((label, index) => (
                <th key={label} className={`px-2 py-2 border-b border-blue-200 font-bold ${index === 0 ? "text-left" : "text-right"}`}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <Fragment key={row.label}>
                <tr className="border-b border-blue-100 hover:bg-blue-50/40">
                  <td className="px-2 py-1.5 text-zinc-800 font-semibold">
                    <div className="flex items-center gap-1">
                      {row.isFirstPackaging && processDetailRows.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setProcessesOpen(open => !open)}
                          className="h-5 w-5 inline-flex items-center justify-center rounded border border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
                          title={processesOpen ? "Hide process details" : "Show process details"}
                        >
                          {processesOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                      )}
                      <span>{row.label}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700">{fmtQty(row.intakeQty)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700">{fmtQty(row.deliverableQty)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-[#e8473f]">{fmtMoney(row.sellingPrice)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-zinc-800">{fmtPpu(row.sellingPpu)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-zinc-900">{fmtMoney(row.ourCost)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-zinc-800">{fmtPpu(row.ourPpu)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums bg-green-50 text-green-700 font-semibold">{fmtPct(row.marginPct)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums bg-green-50 text-green-800 font-semibold">{fmtMoney(row.marginDollars)}</td>
                </tr>
                {row.isFirstPackaging && processesOpen && processDetailRows.map(detail => (
                  <tr key={detail.id} className="border-b border-blue-50 bg-blue-50/35">
                    <td className="px-2 py-1.5 pl-8 text-zinc-600 font-medium">{detail.label}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-zinc-600">{fmtQty(detail.intakeQty)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-zinc-600">{fmtQty(detail.deliverableQty)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-[#e8473f]">{fmtMoney(detail.sellingPrice)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700">{fmtPpu(detail.sellingPpu)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-zinc-800">{fmtMoney(detail.ourCost)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700">{fmtPpu(detail.ourPpu)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums bg-green-50 text-green-700">{fmtPct(detail.marginPct)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums bg-green-50 text-green-800">{fmtMoney(detail.marginDollars)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr className="border-t-2 border-blue-300 bg-blue-100/70 font-bold">
              <td className="px-2 py-2 text-blue-900 uppercase">Totals</td>
              <td className="px-2 py-2 text-right text-blue-900">-</td>
              <td className="px-2 py-2 text-right text-blue-900">-</td>
              <td className="px-2 py-2 text-right tabular-nums text-[#e8473f]">{fmtMoney(totals.sellingPrice)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-blue-900">{fmtPpu(totals.sellingPrice / totalPpuDenom)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-zinc-950">{fmtMoney(totals.ourCost)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-blue-900">{fmtPpu(totals.ourCost / totalPpuDenom)}</td>
              <td className="px-2 py-2 text-right tabular-nums bg-green-100 text-green-800">{fmtPct(totalMarginPct)}</td>
              <td className="px-2 py-2 text-right tabular-nums bg-green-100 text-green-900">{fmtMoney(totalMarginDollars)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Home() {
  const {
    projectType, setProjectType,
    moqRows, setMoqRows,
    packagingLevels, setPackagingLevels,
    processLevels, setProcessLevels,
    scaledColumns,
    formData, setFormField,
    summaryRows, summaryTableRows, ppuUnits,
    allMoqResults,
    whatIfPpus, setWhatIfPpus,
    costPpuOverrides,
    additionalFees, setAdditionalFees,
    coPackingProcesses, setCoPackingProcesses,
    activeMoqId,
  } = useProject();

  // ── CRM start modal ──────────────────────────────────────────────────────
  const [crmParams, setCrmParams] = useState<CrmStartParams | null>(null);
  const [crmLoading, setCrmLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") !== "crm") return;

    const company     = params.get("company");
    const contactName = params.get("contactName");
    const email       = params.get("email");
    const salesRep    = params.get("salesRep");
    const crmDealId   = params.get("crmDealId");

    const initialParams: CrmStartParams = { company, contactName, email, phone: null, salesRep, crmDealId, crmContactId: null, customerId: null };

    if (crmDealId) {
      setCrmLoading(true);
      fetch(`/server/quotes-api/crm/deal-contact?dealId=${crmDealId}`)
        .then(r => r.json())
        .then((result) => {
          const data = result?.data;
          setCrmParams({
            ...initialParams,
            ...(data?.phone ? { phone: data.phone } : {}),
            ...(data?.email ? { email: data.email } : {}),
            crmContactId: data?.contactId || null,
            ...(data?.accountNumber ? { customerId: data.accountNumber } : {}),
          });
        })
        .catch(err => {
          console.error("Contact fetch error:", err);
          setCrmParams(initialParams);
        })
        .finally(() => setCrmLoading(false));
    } else {
      setCrmParams(initialParams);
    }
  }, []);

  const handleCrmModalComplete = useCallback(() => {
    setCrmParams(null);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const activeRow   = moqRows.find(r => r.id === activeMoqId) ?? moqRows[0];
  const moqQty      = activeRow ? (parseFloat(activeRow.individualUnits) || parseFloat(activeRow.moq) || 0) : 0;

  const sections: SidebarSection[] = [
    { id: "section-project-info",       label: "Project Info",       visible: true },
    { id: "section-manufacturing-moq",  label: "Mfg MOQ",            visible: true },
    { id: "section-raw-materials",      label: "Raw Materials",      visible: true },
    { id: "section-inventory-handling", label: "Inventory Handling", visible: true },
    { id: "section-testing",            label: "Testing",            visible: true },
    { id: "section-processes",          label: "Processes",          visible: true },
    { id: "section-packaging-summary",  label: "Packout Config",     visible: true },
    { id: "section-palletization",      label: "Palletization",      visible: true },
    { id: "section-price-adjustment",   label: "Price Adjustment",   visible: true },
  ];

  return (
    <main className="min-h-screen flex flex-col">
      {crmParams && !crmLoading && (
        <CrmStartModal crmParams={crmParams} onComplete={handleCrmModalComplete} />
      )}
      <Navbar />
      <SectionSidebar sections={sections} />

      <div className="flex flex-1 lg:pl-42">
        <div className="flex-1 min-w-0">
          <div className="pb-6">
          <SectionRequiredProvider>
          <LeftContent
            expanded={false}
            moqRows={moqRows}
            setMoqRows={setMoqRows}
            formData={formData}
            setFormField={setFormField}
            packagingLevels={packagingLevels}
            setPackagingLevels={setPackagingLevels}
            scaledColumns={scaledColumns}
            moqQty={moqQty}
            projectType={projectType}
            setProjectType={setProjectType}
            coPackingProcesses={coPackingProcesses}
            setCoPackingProcesses={setCoPackingProcesses}
            summaryRows={summaryRows}
            summaryTableRows={summaryTableRows}
            ppuUnits={ppuUnits}
            allMoqResults={allMoqResults}
            whatIfPpus={whatIfPpus}
            setWhatIfPpus={setWhatIfPpus}
            costPpuOverrides={costPpuOverrides}
            additionalFees={additionalFees}
            setAdditionalFees={setAdditionalFees}
            processLevels={processLevels}
            setProcessLevels={setProcessLevels}
          />
          </SectionRequiredProvider>
          </div>
        </div>
      </div>

    </main>
  );
}
