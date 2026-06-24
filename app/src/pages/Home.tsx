import { useState, useCallback, useEffect } from "react";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { SlidersHorizontal } from "lucide-react";
import { SectionRequiredProvider, RequiredToggle, useSectionRequired } from "@/lib/SectionRequiredContext";
import Navbar from "@/components/navbar/Navbar";
import ProjectInfoSection from "@/components/project/ProjectInfoSection";
import ProjectDetails, { MoqSection } from "@/components/project/ProjectDetails";
import PackagingLevels from "@/components/project/PackagingLevels";
import CoPackingProcesses from "@/components/project/CoPackingProcesses";
import SectionSidebar, { SidebarSection } from "@/components/SectionSidebar";
import CrmStartModal, { CrmParams as CrmStartParams } from "@/components/CrmStartModal";
import { useProject } from "@/lib/ProjectContext";
import { MoqRow, ProjectFormData, AdditionalFeeRow, PackagingLevel, CoPackingProcess, Column } from "@/lib/types";
import { SummaryRow } from "@/lib/types";
import { MoqPricingRow } from "@/lib/ProjectContext";
import { uid } from "@/lib/uid";

const fmt    = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

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
const palletInputBase = "h-9 w-full px-3 border border-amber-200 text-xs text-gray-900 placeholder:text-gray-300 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition";
const palletInputKey  = `${palletInputBase} rounded-md`;
const palletPrefix    = "text-[0.6rem] font-medium text-gray-400 border border-r-0 border-amber-200 h-9 flex items-center px-2.5 bg-amber-50/50 shrink-0 rounded-l-md select-none";
const palletSuffix    = "text-[0.6rem] font-medium text-gray-400 border border-l-0 border-amber-200 h-9 flex items-center px-2.5 bg-amber-50/50 shrink-0 rounded-r-md select-none";
const palletWithPfx   = `${palletInputBase} rounded-r-md flex-1`;
const palletWithSfx   = `${palletInputBase} rounded-l-md flex-1`;
const palletLabel     = "text-[0.65rem] text-gray-500 mb-1 truncate";

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
  const n = (v: string | number | undefined) => parseFloat(String(v ?? "0")) || 0;
  const maxWtLbs = n(formData.maxPalletWeightLbs) || 2000;

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

  const isManual     = !!(formData.manualPallets && formData.manualPallets !== "");
  const displayPallets = isManual ? (parseFloat(formData.manualPallets!) || 0) : (autoPallets ?? 0);

  const palletAutoInp = "h-9 w-full px-3 border border-gray-200 text-xs text-gray-400 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-md";

  const otherFields: { label: string; field: keyof ProjectFormData; sym: string }[] = [
    { label: "Pallet Buffer",         field: "palletBuffer",        sym: ""    },
    { label: "Max Pallet Wt (lbs)",   field: "maxPalletWeightLbs",  sym: "lbs" },
    { label: "Outbound Fee / Pallet", field: "outboundFee",         sym: "$"   },
    { label: "Outbound Fee Markup %", field: "outboundFeeMarkup",   sym: "%"   },
  ];

  const { notRequired: _palletNR, toggle: _palletToggle } = useSectionRequired();
  const palletNR = !!_palletNR["section-palletization"];

  return (
    <div id="section-palletization" className="bg-white border border-gray-200 rounded-xl mx-4 md:mx-6 mb-4 overflow-hidden max-w-4xl"><div className="px-5 pt-4 pb-5">
      <div className="flex items-center gap-2 mb-4">
        <p className="text-xs font-semibold text-gray-900">Palletization</p>
        <RequiredToggle sectionId="section-palletization" />
      </div>
      {!palletNR && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-5 gap-y-4 items-start">

        {/* # of Pallets — auto with manual override */}
        <div>
          <p className={palletLabel}>
            {isManual ? "# of Pallets (manual)" : "# of Pallets (auto)"}
          </p>
          <div className="flex items-center gap-1">
            <NumInput
              value={displayPallets}
              onChange={v => setFormField("manualPallets", String(v))}
              placeholder={autoPallets != null && autoPallets > 0 ? String(autoPallets) : "auto"}
              className={isManual ? palletInputKey : palletAutoInp}
            />
            {isManual && (
              <button type="button"
                onClick={() => setFormField("manualPallets", "")}
                title="Reset to auto"
                className="shrink-0 text-gray-400 hover:text-[#e8473f] transition-colors text-base leading-none">↺</button>
            )}
          </div>
          {autoPallets != null && autoPallets > 0 && isManual && (
            <p className="text-[0.55rem] text-gray-400 mt-0.5">auto: {autoPallets}</p>
          )}
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

      {/* Weight breakdown output panel */}
      {!palletNR && (
        <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 overflow-hidden">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="px-3 py-1.5 text-left text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider">Weight Component</th>
                <th className="px-3 py-1.5 text-right text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider">lbs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-3 py-1 text-gray-600">Raw Material</td>
                <td className="px-3 py-1 text-right tabular-nums text-gray-800">
                  {rawWeightLbs > 0 ? rawWeightLbs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                </td>
              </tr>
              {scaledColumns.map((col, i) => (
                <tr key={col.id}>
                  <td className="px-3 py-1 text-gray-600">{col.level} Packaging</td>
                  <td className="px-3 py-1 text-right tabular-nums text-gray-800">
                    {levelWeightsLbs[i] > 0 ? levelWeightsLbs[i].toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-gray-300 bg-gray-100">
                <td className="px-3 py-1.5 font-semibold text-gray-700">Total Weight</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-gray-900">
                  {totalWeightLbs > 0 ? totalWeightLbs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                </td>
              </tr>
              <tr className="bg-gray-50">
                <td className="px-3 py-1 text-gray-500">Max Weight / Pallet</td>
                <td className="px-3 py-1 text-right tabular-nums text-gray-600">
                  {maxWtLbs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </td>
              </tr>
              <tr className="bg-amber-50 border-t border-amber-200">
                <td className="px-3 py-1.5 font-bold text-gray-800">Pallets Required</td>
                <td className="px-3 py-1.5 text-right font-bold text-[#e8473f]">
                  {autoPallets != null ? autoPallets : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div></div>
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
  coPackingProcesses: CoPackingProcess[];
  setCoPackingProcesses: React.Dispatch<React.SetStateAction<CoPackingProcess[]>>;
  summaryRows:      SummaryRow[];
  ppuUnits:         number;
  allMoqResults:    MoqPricingRow[];
  whatIfPpus:       Record<number, string>;
  setWhatIfPpus:    React.Dispatch<React.SetStateAction<Record<number, string>>>;
  costPpuOverrides: Record<number, string>;
  additionalFees:    AdditionalFeeRow[];
  setAdditionalFees: React.Dispatch<React.SetStateAction<AdditionalFeeRow[]>>;
}

function LeftContent({ expanded: _expanded, moqRows, setMoqRows, formData, setFormField, packagingLevels, setPackagingLevels, scaledColumns, moqQty, projectType: _projectType, coPackingProcesses, setCoPackingProcesses, summaryRows, ppuUnits, allMoqResults, whatIfPpus, setWhatIfPpus, costPpuOverrides, additionalFees, setAdditionalFees }: LeftContentProps) {
  return (
    <>
      <ProjectInfoSection />
      <ProjectDetails
        formData={formData}
        setFormField={setFormField}
      />
      <CoPackingProcesses processes={coPackingProcesses} setProcesses={setCoPackingProcesses} />
      <PackagingLevels packagingLevels={packagingLevels} setPackagingLevels={setPackagingLevels} />
      <PalletizationSection
        formData={formData}
        setFormField={setFormField}
        scaledColumns={scaledColumns}
        moqQty={moqQty}
      />
      <MoqSection
        moqRows={moqRows}
        setMoqRows={setMoqRows}
        formData={formData}
      />
      {/* ── Additional Costs & Fees ── */}
      <div className="mx-4 md:mx-6 mb-4 max-w-4xl">
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-900 uppercase tracking-wide">Additional Costs & Fees</span>
              <span className="text-[0.55rem] font-semibold text-gray-400 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded uppercase tracking-wider">Internal Only</span>
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
            <p className="py-3 text-center text-[0.65rem] text-gray-400 italic">No additional fees — click Add Row</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {additionalFees.map((row) => (
                <div key={row.id} className="flex items-center gap-2 px-4 py-2">
                  <input
                    type="text"
                    value={row.type}
                    onChange={(e) => setAdditionalFees(prev => prev.map(r => r.id === row.id ? { ...r, type: e.target.value } : r))}
                    placeholder="Fee label…"
                    className="flex-1 h-7 px-2 text-xs text-gray-900 border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition placeholder:text-gray-300 rounded"
                  />
                  <div className="flex items-center border border-gray-200 rounded overflow-hidden h-7 shrink-0">
                    <button
                      type="button"
                      onClick={() => setAdditionalFees(prev => prev.map(r => r.id === row.id ? { ...r, mode: r.mode === "$" ? "%" : "$" } : r))}
                      className={`px-2 h-7 text-[0.65rem] font-semibold transition-colors border-r border-gray-200 ${row.mode === "$" ? "bg-[#e8473f] text-white" : "bg-gray-50 text-gray-500 hover:text-gray-800"}`}
                    >$</button>
                    <button
                      type="button"
                      onClick={() => setAdditionalFees(prev => prev.map(r => r.id === row.id ? { ...r, mode: r.mode === "%" ? "$" : "%" } : r))}
                      className={`px-2 h-7 text-[0.65rem] font-semibold transition-colors ${row.mode === "%" ? "bg-[#e8473f] text-white" : "bg-gray-50 text-gray-500 hover:text-gray-800"}`}
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
                    className="shrink-0 text-gray-300 hover:text-red-400 transition-colors text-sm leading-none"
                    title="Remove row"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <PriceAdjustmentSection
        summaryRows={summaryRows}
        ppuUnits={ppuUnits}
        allMoqResults={allMoqResults}
        whatIfPpus={whatIfPpus}
        setWhatIfPpus={setWhatIfPpus}
        costPpuOverrides={costPpuOverrides}
      />
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
}

function PriceAdjustmentSection({
  summaryRows, ppuUnits, allMoqResults,
  whatIfPpus, setWhatIfPpus, costPpuOverrides,
}: PriceAdjustmentSectionProps) {
  const marginColor = (pct: number) =>
    pct >= 65 ? "text-green-700" : pct >= 50 ? "text-amber-600" : "text-red-600";

  const whatIfRows = allMoqResults.map((r) => {
    const inputStr = whatIfPpus[r.moqRow.id];
    const adjPPU   = inputStr !== undefined && inputStr !== "" ? parseFloat(inputStr) : r.ppu;
    const isCustom = inputStr !== undefined && inputStr !== "" && !isNaN(adjPPU) && adjPPU !== r.ppu;
    const costStr  = costPpuOverrides[r.moqRow.id];
    const costPPU  = costStr !== undefined && costStr !== "" ? parseFloat(costStr) : r.ppuCost;
    const marginPct = adjPPU > 0 && costPPU > 0 ? ((adjPPU - costPPU) / adjPPU) * 100 : r.marginPct;
    const revenue   = adjPPU * r.ppuDenominator;
    const ourTotal  = r.totalOurCost;
    return { r, adjPPU, costPPU, marginPct, revenue, ourTotal, isCustom };
  });

  const wiTotalRevenue = whatIfRows.reduce((s, w) => s + w.revenue,  0);
  const wiTotalOur     = whatIfRows.reduce((s, w) => s + w.ourTotal, 0);
  const wiAvgMargin    = wiTotalRevenue > 0 ? ((wiTotalRevenue - wiTotalOur) / wiTotalRevenue) * 100 : 0;
  const hasAdj         = Object.keys(whatIfPpus).length > 0;

  const baseCustomer = summaryRows.reduce((s, r) => s + r.customerPrice, 0);
  const baseOur      = summaryRows.reduce((s, r) => s + r.ourCosts, 0);
  const computedCost = ppuUnits > 0 && baseOur > 0 ? baseOur / ppuUnits : 0;
  const adjPpuStr0   = whatIfPpus[0];
  const baselinePPU  = ppuUnits > 0 && baseCustomer > 0 ? baseCustomer / ppuUnits : 0;
  const adjPpuVal0   = adjPpuStr0 !== undefined && adjPpuStr0 !== "" ? parseFloat(adjPpuStr0) : baselinePPU;
  const adjRevenue0  = ppuUnits > 0 ? adjPpuVal0 * ppuUnits : baseCustomer;
  const effectiveCostTotal0 = computedCost > 0 && ppuUnits > 0 ? computedCost * ppuUnits : baseOur;
  const marginPct0   = adjRevenue0 > 0 ? ((adjRevenue0 - effectiveCostTotal0) / adjRevenue0) * 100 : 0;
  const isCustom0    = adjPpuStr0 !== undefined && adjPpuStr0 !== "";

  return (
    <div className="mx-4 md:mx-6 mb-4 max-w-4xl">
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
                <th className="py-2 px-3 text-right text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider border-b-2 border-gray-900">Cost PPU</th>
                <th className="py-2 px-3 text-center text-[0.6rem] font-semibold text-amber-700 uppercase tracking-wider border-b-2 border-gray-900">Adjusted PPU</th>
                <th className="py-2 px-3 text-center text-[0.6rem] font-semibold text-amber-700 uppercase tracking-wider border-b-2 border-gray-900">Margin %</th>
                <th className="py-2 px-3 text-right text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider border-b-2 border-gray-900 bg-[#FEF2F2]">Total Revenue</th>
              </tr>
            </thead>
            <tbody>
              {whatIfRows.length === 0 ? (
                <tr className="border-b border-gray-100">
                  <td className="py-1.5 px-3 text-right text-xs text-gray-500 font-medium tabular-nums">
                    {computedCost > 0 ? fmt(computedCost) : "—"}
                  </td>
                  <td className="py-1 px-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-xs text-gray-400">$</span>
                      <CurrencyInput type="dollar"
                        value={adjPpuVal0}
                        onChange={(v) => setWhatIfPpus(prev => ({ ...prev, [0]: String(v) }))}
                        className="w-24 h-6 px-2 text-xs text-right border border-amber-300 bg-[#FFFDE7] focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium"
                      />
                      {isCustom0 && (
                        <button type="button"
                          onClick={() => setWhatIfPpus(prev => { const n = { ...prev }; delete n[0]; return n; })}
                          className="text-gray-300 hover:text-gray-600 text-sm leading-none" title="Reset">↺</button>
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
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                  </td>
                  <td className="py-1.5 px-3 text-right text-xs font-semibold text-gray-800 bg-[#FEF2F2]">
                    {adjRevenue0 > 0 ? fmt(adjRevenue0) : "—"}
                  </td>
                </tr>
              ) : (
                whatIfRows.map(({ r, costPPU, marginPct, revenue, isCustom }) => {
                  const onAdjPpuChange = (v: number) => setWhatIfPpus(prev => ({ ...prev, [r.moqRow.id]: String(v) }));
                  const onMarginChange = (m: number) => {
                    const clampedM = Math.min(m / 100, 0.9999);
                    const newAdj = clampedM < 1 && costPPU > 0 ? costPPU / (1 - clampedM) : r.ppu;
                    setWhatIfPpus(prev => ({ ...prev, [r.moqRow.id]: String(newAdj) }));
                  };
                  return (
                    <tr key={r.moqRow.id} className="border-b border-gray-100 hover:bg-amber-50/20">
                      <td className="py-1.5 px-3 text-right text-xs text-gray-500 font-medium tabular-nums">
                        {costPPU > 0 ? fmt(costPPU) : "—"}
                      </td>
                      <td className="py-1 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-xs text-gray-400">$</span>
                          <NumInput
                            value={whatIfPpus[r.moqRow.id] !== undefined ? parseFloat(whatIfPpus[r.moqRow.id]) : r.ppu}
                            onChange={onAdjPpuChange}
                            className="w-24 h-6 px-2 text-xs text-right border border-amber-300 bg-[#FFFDE7] focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium"
                          />
                          {isCustom && (
                            <button type="button"
                              onClick={() => setWhatIfPpus(prev => { const n = { ...prev }; delete n[r.moqRow.id]; return n; })}
                              className="text-gray-300 hover:text-gray-600 text-sm leading-none" title="Reset to original">↺</button>
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
                          <span className="text-xs text-gray-400">%</span>
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-right text-xs font-semibold text-gray-800 bg-[#FEF2F2]">
                        {fmt(revenue)}
                      </td>
                    </tr>
                  );
                })
              )}
              {whatIfRows.length > 0 && (
                <tr className="border-t-2 border-gray-900 bg-amber-50">
                  <td className="py-2 px-3 text-xs font-bold text-gray-900 italic">TOTALS</td>
                  <td className="py-2 px-3 text-right text-xs text-gray-400">—</td>
                  <td className={`py-2 px-3 text-right text-xs font-bold bg-[#FEF2F2] ${marginColor(wiAvgMargin)}`}>
                    {fmtPct(wiAvgMargin)}
                  </td>
                  <td className="py-2 px-3 text-right text-xs font-bold text-gray-900 bg-[#FEF2F2]">
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
export default function Home() {
  const {
    projectType,
    moqRows, setMoqRows,
    packagingLevels, setPackagingLevels,
    scaledColumns,
    formData, setFormField,
    summaryRows, ppuUnits,
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
    { id: "section-raw-materials",      label: "Raw Materials",      visible: true },
    { id: "section-testing",            label: "Testing",            visible: true },
    { id: "section-blending",           label: "Blending",           visible: true },
    { id: "section-processes",          label: "Processes",          visible: true },
    { id: "section-packaging-summary",  label: "Pkg Configuration",  visible: true },
    { id: "section-palletization",      label: "Palletization",      visible: true },
    { id: "section-moq",                label: "MOQ",                visible: true },
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
            coPackingProcesses={coPackingProcesses}
            setCoPackingProcesses={setCoPackingProcesses}
            summaryRows={summaryRows}
            ppuUnits={ppuUnits}
            allMoqResults={allMoqResults}
            whatIfPpus={whatIfPpus}
            setWhatIfPpus={setWhatIfPpus}
            costPpuOverrides={costPpuOverrides}
            additionalFees={additionalFees}
            setAdditionalFees={setAdditionalFees}
          />
          </SectionRequiredProvider>
          </div>
        </div>
      </div>

    </main>
  );
}
