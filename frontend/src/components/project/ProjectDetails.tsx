"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { MoqRow, ProjectFormData, SummaryTableRow } from "@/lib/types";

const emptyMoqRow = (): MoqRow => ({
  id: Date.now() + Math.random(),
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

const WEIGHT_UNITS = ["g", "oz", "lb", "kg", "fl oz"] as const;

/* ── SymInput lifted outside component so its identity is stable ── */
interface SymInputProps {
  field: keyof ProjectFormData;
  type: "text" | "number";
  sym: string;
  formData: ProjectFormData;
  setFormField: (field: keyof ProjectFormData, value: string) => void;
}
function SymInput({ field, type, sym, formData, setFormField }: SymInputProps) {
  const isPrefix = sym === "$";
  return (
    <div className="w-44 shrink-0 flex items-center">
      {sym && isPrefix  && <span className={prefixBadge}>{sym}</span>}
      <input
        type={type}
        value={formData[field] ?? ""}
        onChange={(e) => setFormField(field, e.target.value)}
        className={!sym ? inputKey : isPrefix ? inputWithPrefix : inputWithSuffix}
      />
      {sym && !isPrefix && <span className={suffixBadge}>{sym}</span>}
    </div>
  );
}

interface Props {
  expanded?: boolean;
  moqRows: MoqRow[];
  setMoqRows: React.Dispatch<React.SetStateAction<MoqRow[]>>;
  formData: ProjectFormData;
  setFormField: (field: keyof ProjectFormData, value: string) => void;
  summaryTableRows: SummaryTableRow[];
}

// Row definition: [label, field, inputType, unit symbol ("$" = prefix, others = suffix, "" = none)]
type RowDef = [string, keyof ProjectFormData, "text" | "number", string];

export default function ProjectDetails({
  expanded = false,
  moqRows,
  setMoqRows,
  formData,
  setFormField,
  summaryTableRows,
}: Props) {
  const [bufferUnit, setBufferUnit] = useState<"days" | "weeks">("days");
  const addMoqRow    = () => setMoqRows((prev) => [...prev, emptyMoqRow()]);
  const removeMoqRow = (id: number) => setMoqRows((prev) => prev.filter((r) => r.id !== id));
  const updateMoqRow = (id: number, field: keyof MoqRow, value: string) =>
    setMoqRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  /* ── Design tokens ─────────────────────────────────────────── */
  const card    = "border border-gray-200 rounded-xl p-5";
  const colHead = "text-[0.6rem] font-semibold text-black uppercase tracking-widest";
  const addRowBtn =
    "flex items-center gap-1 text-[0.6rem] font-semibold text-[#e8473f] hover:text-[#c73d36] uppercase tracking-wider transition-colors";

  /* ── Row definitions ──────────────────────────────────────── */
  const overviewRows: RowDef[] = [
    ["Setup + QA Fee",   "setupFeeCustomer", "number", "$"],
    ["PPU Denominator",  "ppuDenominator",   "number", ""],
  ];

  const rawMaterialRows: RowDef[] = [
    ["Overage Rate",        "materialOverage",  "number", "%"],
    ["Intake Fee / Pallet", "intakeFee",        "number", "$"],
    ["# of Pallets",        "numPallets",       "number", ""],
    ["# of Product SKUs",   "numSkus",          "number", ""],
    ["Testing Fee / SKU",   "testingFee",       "number", "$"],
    ["Raw Material SKUs",   "rawMaterialSkus",  "number", ""],
    ["Cost / Gram",         "costPerGram",      "number", "$"],
  ];

  const markupRows: RowDef[] = [
    ["Intake Fee / Pallet", "intakeFeeMarkup",   "number", "%"],
    ["Testing Fee",         "testingFeeMarkup",  "number", "%"],
    ["Cost / Gram",         "rawMaterialMarkup", "number", "%"],
  ];

  const leftOverRows: RowDef[] = [
    ["Left Over Inventory Cost",   "leftOverInventoryCost",   "number", "$"],
    ["Left Over Inventory Absorb", "leftOverInventoryAbsorb", "number", "%"],
  ];

  const palletRows: RowDef[] = [
    ["Outbound Fee / Pallet", "outboundFee",       "number", "$"],
    ["# of Finished Pallets", "numFinishedPallets", "number", ""],
    ["Outbound Fee Markup",   "outboundFeeMarkup",  "number", "%"],
  ];

  // Compact input for table cells (no outer rounding, smaller height)
  const cellInputBase =
    "h-8 w-full px-2 border border-amber-200 text-xs text-gray-900 placeholder:text-gray-300 bg-amber-50/50 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/30 focus:border-[#e8473f] transition rounded-md";

  return (
    <div className="px-6 py-5 transition-all duration-300">

      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex items-start gap-3 pb-4">
        <div className="mt-0.5 w-1 h-5 rounded-full bg-[#e8473f] shrink-0" />
        <div>
          <h2 className="text-sm font-semibold text-gray-900 tracking-tight leading-none">Project Details</h2>
          <p className="text-[0.65rem] text-gray-400 mt-1">Configure deal parameters and product specifications</p>
        </div>
      </div>

      {/* ── Cards — side-by-side when summary is collapsed, vertical when open ── */}
      <div className={`transition-all duration-300 ${expanded ? "grid grid-cols-3 gap-4 items-start" : "space-y-4 max-w-4xl"}`}>

      {/* ── Customer Project Overview ────────────────────────────── */}
      <div className={card}>
        <p className="text-xs font-semibold text-gray-900 mb-3">Customer Project Overview</p>
        <div className="divide-y divide-gray-100">

          {/* Unit Size / ea — weight input with interactive unit dropdown */}
          <div className="flex items-center gap-4 py-2">
            <span className="flex-1 text-xs text-gray-600">Unit Size / ea</span>
            <div className="w-44 shrink-0 flex items-center">
              <input
                type="number"
                value={formData.unitWeight ?? ""}
                onChange={(e) => setFormField("unitWeight", e.target.value)}
                className={inputWithSuffix}
              />
              <select
                value={formData.unitWeightUnit ?? "g"}
                onChange={(e) => setFormField("unitWeightUnit", e.target.value)}
                className="text-[0.6rem] font-medium text-gray-500 border border-l-0 border-amber-200 h-9 px-1.5 bg-amber-50/50 shrink-0 rounded-r-md focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition cursor-pointer"
              >
                {WEIGHT_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          {overviewRows.map(([label, field, type, sym]) => (
            <div key={field} className="flex items-center gap-4 py-2">
              <span className="flex-1 text-xs text-gray-600">{label}</span>
              <SymInput field={field} type={type} sym={sym} formData={formData} setFormField={setFormField} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Raw Material ────────────────────────────────────────── */}
      <div className={card}>
        <p className="text-xs font-semibold text-gray-900 mb-3">Raw Material</p>
        <div className="divide-y divide-gray-100">
          {rawMaterialRows.map(([label, field, type, sym]) => (
            <div key={field} className="flex items-center gap-4 py-2">
              <span className="flex-1 text-xs text-gray-600">{label}</span>
              <SymInput field={field} type={type} sym={sym} formData={formData} setFormField={setFormField} />
            </div>
          ))}
        </div>

        {/* Mark Up — Raw sub-section */}
        <div className="mt-3">
          <p className="text-[0.6rem] font-semibold text-gray-500 uppercase tracking-widest mb-2">Mark Up — Raw</p>
          <div className="divide-y divide-gray-100">
            {markupRows.map(([label, field, type, sym]) => (
              <div key={field} className="flex items-center gap-4 py-2">
                <span className="flex-1 text-xs text-gray-600">{label}</span>
                <SymInput field={field} type={type} sym={sym} formData={formData} setFormField={setFormField} />
              </div>
            ))}
          </div>
        </div>

        {/* Left Over Inventory sub-section */}
        <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
          {leftOverRows.map(([label, field, type, sym]) => (
            <div key={field} className="flex items-center gap-4 px-3 py-2 odd:bg-yellow-50 even:bg-yellow-50 border-b border-gray-100 last:border-0">
              <span className="flex-1 text-xs text-gray-600">{label}</span>
              <SymInput field={field} type={type} sym={sym} formData={formData} setFormField={setFormField} />
            </div>
          ))}
        </div>

        {/* Pallets & Fees sub-section */}
        <div className="mt-3">
          <p className="text-[0.6rem] font-semibold text-gray-500 uppercase tracking-widest mb-2">Pallets &amp; Fees</p>
          <div className="divide-y divide-gray-100">
            {palletRows.map(([label, field, type, sym]) => (
              <div key={field} className="flex items-center gap-4 py-2">
                <span className="flex-1 text-xs text-gray-600">{label}</span>
                <SymInput field={field} type={type} sym={sym} formData={formData} setFormField={setFormField} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── MOQ + Case Pack Configuration ───────────────────────── */}
      <div className={card}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-gray-900">MOQ + Case Pack Configuration</p>
          <button onClick={addMoqRow} className={addRowBtn}><Plus size={10} strokeWidth={2.5} />Add Row</button>
        </div>
        <div className="grid grid-cols-4 gap-3 pb-2 border-b border-gray-100 mb-2.5">
          {["MOQ", "# of Units", "Units / Inner", "Inners / Master"].map((col) => (
            <span key={col} className={colHead}>{col}</span>
          ))}
        </div>
        <div className="space-y-2">
          {moqRows.map((row) => (
            <div key={row.id} className="grid grid-cols-4 gap-3 items-center">
              <input type="number" value={row.moq}            onChange={(e) => updateMoqRow(row.id, "moq",            e.target.value)} placeholder="0" className={cellInputBase} />
              <input type="number" value={row.individualUnits} onChange={(e) => updateMoqRow(row.id, "individualUnits", e.target.value)} placeholder="0" className={cellInputBase} />
              <input type="number" value={row.unitsPerInner}  onChange={(e) => updateMoqRow(row.id, "unitsPerInner",  e.target.value)} placeholder="0" className={cellInputBase} />
              <div className="flex items-center gap-1.5">
                <input type="number" value={row.innersPerMaster} onChange={(e) => updateMoqRow(row.id, "innersPerMaster", e.target.value)} placeholder="0" className={`${cellInputBase} flex-1`} />
                {moqRows.length > 1 && (
                  <button onClick={() => removeMoqRow(row.id)} className="text-gray-300 hover:text-red-400 transition-colors shrink-0"><Trash2 size={12} /></button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Lead Time ────────────────────────────────────────────── */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-[0.6rem] font-semibold text-gray-500 uppercase tracking-widest mb-3">Lead Time</p>

          {/* Buffer input */}
          <div className="flex items-center gap-4 mb-3">
            <span className="flex-1 text-xs text-gray-600">Lead Time Buffer</span>
            <div className="flex items-center h-9 border border-amber-200 rounded-md overflow-hidden shrink-0">
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
                  className={`h-9 px-2 text-[0.6rem] font-semibold transition-colors border-r border-amber-200 last:border-r-0 ${
                    bufferUnit === u ? "bg-[#e8473f] text-white" : "bg-amber-50/50 text-gray-400 hover:text-gray-700"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* Per-column lead time breakdown — shows production days only, buffer in Summary */}
          {summaryTableRows.filter(r => r.leadTimeWeeks != null && !r.isLeadTimeSummary).length > 0 && (
            <div className="rounded-lg border border-gray-100 overflow-hidden">
              <div className="grid grid-cols-3 gap-0 bg-gray-50 border-b border-gray-100 px-3 py-1.5">
                {["Component", "Prod. Days", "Total Wks"].map((h) => (
                  <span key={h} className="text-[0.55rem] font-semibold text-gray-400 uppercase tracking-wider">{h}</span>
                ))}
              </div>
              {summaryTableRows.filter(r => r.leadTimeWeeks != null && !r.isLeadTimeSummary).map((r) => {
                const prodWeeks = r.leadTimeWeeks!;
                const prodDays  = prodWeeks * 5;
                return (
                  <div key={r.label} className="grid grid-cols-3 gap-0 px-3 py-1.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <span className="text-xs text-gray-700 truncate pr-1">{r.label}</span>
                    <span className="text-xs text-gray-500">{prodDays > 0 ? prodDays.toFixed(1) : "—"}</span>
                    <span className="text-xs font-semibold text-gray-900">{prodWeeks.toFixed(2)} wks</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      </div>{/* end cards grid/stack */}
    </div>
  );
}
