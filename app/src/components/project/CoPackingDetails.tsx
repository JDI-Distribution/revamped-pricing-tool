import { CoPackingState, CoPackingPackagingSummaryRow, CoPackingColumn, PricingTier, TestingRow, BlendIngredient } from "@/lib/types";
import { useProject } from "@/lib/ProjectContext";
import CurrencyInput, { CurrencyInputType } from "@/components/ui/CurrencyInput";
import { uid } from "@/lib/uid";

// â"€â"€ Style constants â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const inputCls =
  "h-9 w-full px-3 border border-amber-200 text-xs text-zinc-950 placeholder:text-zinc-500 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-md";
const prefixBadge =
  "text-[0.6rem] font-medium text-zinc-600 border border-r-0 border-amber-200 h-9 flex items-center px-2.5 bg-amber-50/50 shrink-0 rounded-l-md select-none";
const suffixBadge =
  "text-[0.6rem] font-medium text-zinc-600 border border-l-0 border-amber-200 h-9 flex items-center px-2.5 bg-amber-50/50 shrink-0 rounded-r-md select-none";
const inputWithPrefix =
  "h-9 w-full px-3 border border-amber-200 text-xs text-zinc-950 placeholder:text-zinc-500 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-r-md flex-1";
const inputWithSuffix =
  "h-9 w-full px-3 border border-amber-200 text-xs text-zinc-950 placeholder:text-zinc-500 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-l-md flex-1";
const card        = "border border-gray-200 rounded-xl p-5";
const labelCls    = "text-[0.65rem] text-zinc-600 mb-1 block";
const sectionHead = "text-[0.55rem] font-semibold text-zinc-600 uppercase tracking-widest mb-2";
const RAW_MATERIAL_COST_UNITS = ["g", "kg", "lb", "oz"] as const;
const RAW_MATERIAL_COST_GRAMS_PER: Record<string, number> = { g: 1, kg: 1000, lb: 453.592, oz: 28.3495 };

// â"€â"€ Shared components â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
interface FieldProps {
  label:       string;
  field:       keyof CoPackingState;
  value:       number;
  onChange:    (field: keyof CoPackingState, v: number) => void;
  prefix?:     string;
  suffix?:     string;
  placeholder?: string;
  isPct?:      boolean;
  ciType?:     CurrencyInputType;
}

function Field({ label: lbl, field, value, onChange, prefix, suffix, placeholder, isPct, ciType }: FieldProps) {
  const type: CurrencyInputType = ciType ?? (prefix === "$" ? "dollar" : (suffix === "%" || isPct) ? "percent" : "integer");
  const displayValue = isPct ? value * 100 : value;
  const handleChange = (v: number) => onChange(field, isPct ? v / 100 : v);
  return (
    <div className="min-w-0">
      <span className={labelCls}>{lbl}</span>
      <div className="flex items-center">
        {prefix && <span className={prefixBadge}>{prefix}</span>}
        <CurrencyInput type={type} value={displayValue} onChange={handleChange} placeholder={placeholder}
          className={prefix ? inputWithPrefix : suffix ? inputWithSuffix : inputCls} />
        {suffix && <span className={suffixBadge}>{suffix}</span>}
      </div>
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className={sectionHead}>{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Toggle({ enabled, onToggle, label }: { enabled: boolean; onToggle: () => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <span className="text-[0.65rem] text-zinc-600">{label}</span>
      <button type="button" role="switch" aria-checked={enabled} onClick={onToggle}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${enabled ? "bg-[#e8473f]" : "bg-gray-200"}`}>
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4.5" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}


// Plain hours input - no currency prefix, step 0.5, decimal values
function HrsInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={0}
        step={0.5}
        value={value || ""}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        placeholder="0"
        className="h-9 w-20 px-3 border border-amber-200 text-xs text-zinc-950 placeholder:text-zinc-500 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-md"
      />
      <span className="text-[0.65rem] text-zinc-600">hrs</span>
    </div>
  );
}

// â"€â"€ Labor hours helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function calcLaborHrs(deliveredUnits: number, overage: number, unitsPerMin: number, effBuffer: number): number {
  const req  = deliveredUnits * (1 + overage);
  const rate = unitsPerMin * (1 - effBuffer);
  return rate > 0 ? (req / rate) / 60 : 0;
}

function LaborHrsDisplay({ calcHrs, minHrs }: { calcHrs: number; minHrs: number }) {
  const billed = minHrs > 0 && calcHrs < minHrs ? minHrs : calcHrs;
  const minApplied = minHrs > 0 && calcHrs < minHrs;
  const mins = billed * 60;
  return (
    <p className="text-[0.65rem] text-zinc-600 mt-2">
      {minApplied ? (
        <>Est. Labor: <span className="line-through text-zinc-500">{calcHrs.toFixed(2)} hrs</span>{" "}
          {"->"} billed <span className="font-semibold text-amber-600">{billed.toFixed(2)} hrs</span>
          <span className="ml-1 text-amber-500">(minimum applied)</span>
          <span className="ml-1">({mins.toFixed(0)} min)</span>
        </>
      ) : (
        <>Est. Labor: <span className="font-semibold text-zinc-700">{calcHrs.toFixed(2)} hrs</span>
          <span className="ml-1">({mins.toFixed(0)} min)</span>
        </>
      )}
    </p>
  );
}

// â"€â"€ Co-Packing Packaging Summary + Columns helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const CP_LEVEL_OPTIONS = ["Individual Units", "Final Kit Units", "Inner / Case", "Shipper / Outer"];

function newCoPackingSummaryRow(): CoPackingPackagingSummaryRow {
  return { id: String(uid()), packagingLevel: "", packagingType: "", units: 0, isAutoUnits: false, costPerUnit: 0 };
}

function newCoPackingColumn(): CoPackingColumn {
  return {
    id: String(uid()),
    efficiencyBuffer: 0.20,
    laborMarkup:      0.35,
    unitCostMarkup:   1.25,
    level:            "",
    type:             "",
    labelEnabled:     false,
    labelPrintCost:   0,
    labelApplyRate:   0,
    tabsEnabled:      false,
    tabCostPerUnit:   0,
    overageRate:      0.15,
    wageRate:         26,
    fillRatePerMin:   12,
    packagingWeightG: 2,
    numStaff:         1,
    hrsPerShift:      7,
    workingDays:      5,
  };
}

// Auto-derive # of units for Inner/Case and Shipper/Outer levels from co-packing scalars
function autoCoPackingUnits(level: string, primaryUnits: number, unitsPerInner: number, innersPerMaster: number): number {
  switch (level) {
    case "Inner / Case": {
      return unitsPerInner > 0 ? Math.floor(primaryUnits / unitsPerInner) : 0;
    }
    case "Shipper / Outer": {
      const innersDelivered = unitsPerInner > 0 ? Math.floor(primaryUnits / unitsPerInner) : 0;
      return innersPerMaster > 0 ? Math.floor(innersDelivered / innersPerMaster) : 0;
    }
    default:
      return 0;
  }
}

const cpSelectCls   = "h-8 w-full px-2 border border-amber-200 text-xs text-zinc-950 bg-amber-50/50 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/30 focus:border-[#e8473f] transition rounded-md";
const cpInputYellow = "h-8 w-full px-2 border border-amber-300 text-xs text-zinc-950 bg-[#FFFDE7] focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400 transition rounded-md";
const cpThCls       = "text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-widest pb-2";

// â"€â"€ Main component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
export default function CoPackingDetails() {
  const { coPackingState: s, setCoPackingField } = useProject();
  const set = (field: keyof CoPackingState, v: number | string | boolean | PricingTier[]) =>
    setCoPackingField(field, v as CoPackingState[typeof field]);

  // â"€â"€ Setup fee three-way sync â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const handleSetupChange = (field: "setupFeeCustomer" | "setupFeeOurCost" | "setupFeeMargin", raw: string) => {
    const val = parseFloat(raw);
    if (isNaN(val)) return;
    let customer = s.setupFeeCustomer, ourCost = s.setupFeeOurCost, margin = s.setupFeeMargin;
    if (field === "setupFeeCustomer") {
      customer = val; ourCost = customer * (1 - margin);
    } else if (field === "setupFeeOurCost") {
      ourCost = val;
      customer = margin < 1 ? ourCost / (1 - margin) : s.setupFeeCustomer;
      if (customer > 0) margin = (customer - ourCost) / customer;
    } else {
      margin = Math.min(val / 100, 0.999); ourCost = customer * (1 - margin);
    }
    setCoPackingField("setupFeeCustomer", customer);
    setCoPackingField("setupFeeOurCost", ourCost);
    setCoPackingField("setupFeeMargin", margin);
  };

  // â"€â"€ Units (Delivered) <-> Packaging Summary first row - single source of truth â"€â"€
  const setUnitsDelivered = (v: number) => {
    setCoPackingField("unitsDelivered", v);
    const rows = s.coPackingPackagingSummaryRows ?? [];
    if (rows[0] && rows[0].packagingLevel === "Individual Units") {
      setCoPackingField("coPackingPackagingSummaryRows", rows.map((r, i) => i === 0 ? { ...r, units: v } : r));
    }
  };

  // â"€â"€ Co-Packing Packaging Summary - row mutation helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const cpSummaryRows = s.coPackingPackagingSummaryRows ?? [];
  const cpCols        = s.coPackingColumns ?? [];

  const setCpSummaryRows = (rows: CoPackingPackagingSummaryRow[]) =>
    setCoPackingField("coPackingPackagingSummaryRows", rows);
  const setCpColumns = (cols: CoPackingColumn[]) =>
    setCoPackingField("coPackingColumns", cols);

  const cpAddSummaryRow = () => {
    const row = newCoPackingSummaryRow();
    setCpSummaryRows([...cpSummaryRows, row]);
    setCpColumns([...cpCols, { ...newCoPackingColumn(), level: row.packagingLevel, type: row.packagingType }]);
  };

  const cpRemoveSummaryRow = (id: string) => {
    const idx = cpSummaryRows.findIndex(r => r.id === id);
    if (idx < 0) return;
    setCpSummaryRows(cpSummaryRows.filter(r => r.id !== id));
    setCpColumns(cpCols.filter((_, i) => i !== idx));
  };

  const cpDerivedUnits = (level: string): number =>
    autoCoPackingUnits(level, s.unitsDelivered, s.sachetsPerInner, s.innersPerMaster);

  const cpUpdateSummaryRow = (id: string, patch: Partial<CoPackingPackagingSummaryRow>) => {
    setCpSummaryRows(cpSummaryRows.map(r => {
      if (r.id !== id) return r;
      const next = { ...r, ...patch };
      if (patch.packagingLevel !== undefined) {
        const isAuto = patch.packagingLevel === "Inner / Case" || patch.packagingLevel === "Shipper / Outer";
        next.isAutoUnits = isAuto;
        next.units = isAuto ? cpDerivedUnits(patch.packagingLevel) : (patch.packagingLevel === "Individual Units" ? s.unitsDelivered : next.units);
      }
      return next;
    }));
  };

  const cpSyncSummaryRowUnits = (id: string) => {
    const row = cpSummaryRows.find(r => r.id === id);
    if (!row) return;
    const derived = row.packagingLevel === "Individual Units" ? s.unitsDelivered : cpDerivedUnits(row.packagingLevel);
    cpUpdateSummaryRow(id, { units: derived });
  };

  // â"€â"€ Co-Packing Columns - mutation helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const cpUpdateColumn = (idx: number, patch: Partial<CoPackingColumn>) =>
    setCpColumns(cpCols.map((c, i) => i === idx ? { ...c, ...patch } : c));

  const cpAddColumn = () => {
    const row = newCoPackingSummaryRow();
    setCpSummaryRows([...cpSummaryRows, row]);
    setCpColumns([...cpCols, newCoPackingColumn()]);
  };

  const cpRemoveColumn = (idx: number) => {
    if (cpCols.length <= 1) return;
    setCpColumns(cpCols.filter((_, i) => i !== idx));
    setCpSummaryRows(cpSummaryRows.filter((_, i) => i !== idx));
  };

  // â"€â"€ Derived quantities â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const UNIT_SIZE_OPTS = ["g", "kg", "oz", "fl oz", "lbs", "mg", "mL", "L"] as const;
  const unitSizeUnit    = s.unitSizeUnit || "g";
  const totalUnits      = s.unitsDelivered;
  const innersDelivered = s.sachetsPerInner > 0 ? Math.ceil(s.unitsDelivered / s.sachetsPerInner) : 0;
  const shippersDelivered = s.innersPerMaster > 0 && innersDelivered > 0 ? Math.ceil(innersDelivered / s.innersPerMaster) : 0;

  // Labor hours per section
  const blendingCalcHrs = s.blendingEnabled ? calcLaborHrs(s.blendingUnits, s.blendingOverage, s.blendingUnitsPerMin, s.blendingEfficiencyBuffer) : 0;
  const summaryRows = s.coPackingPackagingSummaryRows ?? [];
  const cpColumns   = s.coPackingColumns ?? [];
  const columnsCalcHrs = cpColumns.reduce((sum, col, i) => {
    const sRow = summaryRows[i];
    if (!sRow) return sum;
    const nominal = (col.labelEnabled && col.labelApplyRate > 0)
      ? (col.fillRatePerMin * col.labelApplyRate) / (col.fillRatePerMin + col.labelApplyRate)
      : col.fillRatePerMin;
    return sum + calcLaborHrs(sRow.units, col.overageRate, nominal, col.efficiencyBuffer);
  }, 0);
  const totalCalcHrs = blendingCalcHrs + columnsCalcHrs;

  // â"€â"€ Pricing tiers helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const tiers = s.pricingTiers ?? [];

  const addTier = () => {
    if (tiers.length >= 4) return;
    const newTier: PricingTier = { id: String(uid()), label: `Tier ${tiers.length + 1}`, units: 0, locked: false, inboundPalletsOverride: null };
    set("pricingTiers", [...tiers, newTier]);
  };

  const removeTier = (id: string) => {
    set("pricingTiers", tiers.filter(t => t.id !== id));
  };

  const updateTier = (id: string, patch: Partial<PricingTier>) => {
    set("pricingTiers", tiers.map(t => t.id === id ? { ...t, ...patch } : t));
  };

  const handleTiersToggle = () => {
    const next = !s.tiersEnabled;
    setCoPackingField("tiersEnabled", next);
    if (next && tiers.length === 0) {
      setCoPackingField("pricingTiers", [
        { id: String(uid()), label: "Pilot Run",  units: s.unitsDelivered, locked: true,  inboundPalletsOverride: null },
        { id: String(uid()), label: "Tier 2",     units: 0,                  locked: false, inboundPalletsOverride: null },
      ]);
    }
  };

  return (
    <div className="px-4 md:px-6 py-5 space-y-4">

      {/* â"€â"€ Header â"€â"€ */}
      <div className="flex items-start gap-3 pb-2">
        <div className="mt-0.5 w-1 h-5 rounded-full bg-[#e8473f] shrink-0" />
        <div>
          <h2 className="text-sm font-semibold text-zinc-950 tracking-tight leading-none">Co-Packing Details</h2>
          <p className="text-[0.65rem] text-zinc-600 mt-1">Labor & handling charges</p>
        </div>
      </div>

      {/* â"€â"€ Customer Project Overview â"€â"€ */}
      <div className={card}>
        <p className="text-xs font-semibold text-zinc-950 mb-4">Customer Project Overview</p>

        {/* Numeric inputs row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-5 gap-y-4 items-start mb-5">
          <div className="min-w-0">
            <span className={labelCls}>Units (Delivered)</span>
            <CurrencyInput type="integer" value={s.unitsDelivered} onChange={setUnitsDelivered} placeholder="75000" className={inputCls} />
          </div>
          {/* Unit Size */}
          <div className="min-w-0">
            <span className={labelCls}>Unit Size</span>
            <div className="flex items-center gap-1">
              <input type="number" value={s.sachetSizeG}
                onChange={e => set("sachetSizeG", parseFloat(e.target.value) || 0)}
                placeholder="5" className={`${inputCls} flex-1`} />
              <select value={unitSizeUnit} onChange={e => set("unitSizeUnit", e.target.value)}
                className="h-9 px-1.5 border border-amber-200 text-xs text-zinc-950 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-md shrink-0">
                {UNIT_SIZE_OPTS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <Field label="Units / Inner" field="sachetsPerInner" value={s.sachetsPerInner} onChange={set} placeholder="30" />
          <Field label="Inners / Master" field="innersPerMaster" value={s.innersPerMaster} onChange={set} placeholder="20" />
          {/* Setup fee - three-way linked */}
          <div className="min-w-0">
            <span className={labelCls}>Setup Fee (Customer)</span>
            <div className="flex items-center">
              <span className={prefixBadge}>$</span>
              <CurrencyInput type="dollar" value={s.setupFeeCustomer}
                onChange={v => handleSetupChange("setupFeeCustomer", String(v))} className={inputWithPrefix} />
            </div>
          </div>
          <div className="min-w-0">
            <span className={labelCls}>Setup Project Cost</span>
            <div className="flex items-center">
              <span className={prefixBadge}>$</span>
              <CurrencyInput type="dollar" value={s.setupFeeOurCost}
                onChange={v => handleSetupChange("setupFeeOurCost", String(v))} className={inputWithPrefix} />
            </div>
          </div>
        </div>

        {/* Radio group - Raw Materials */}
        <div className="border-t border-gray-100 pt-4 mb-4">
          <div className="max-w-md">
            <p className={sectionHead}>Raw Materials</p>
            <div className="space-y-2 mt-1">
              {([
                { val: "customer" as const, label: "Customer provides the raw materials." },
                { val: "jdi"      as const, label: "We source raw materials."             },
              ]).map(opt => (
                <label key={opt.val} className="flex items-center gap-2.5 cursor-pointer group">
                  <span className={`w-4 h-4 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
                    s.rawMaterialSource === opt.val
                      ? "border-amber-400 bg-amber-400"
                      : "border-gray-300 group-hover:border-amber-300"
                  }`}>
                    {s.rawMaterialSource === opt.val && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  <button type="button" onClick={() => setCoPackingField("rawMaterialSource", opt.val)}
                    className={`text-xs text-left transition-colors ${s.rawMaterialSource === opt.val ? "font-semibold text-zinc-950" : "text-zinc-600"}`}>
                    {opt.label}
                  </button>
                </label>
              ))}
            </div>
          </div>
        </div>

        {totalUnits > 0 && (
          <div className="flex gap-4 text-[0.65rem] text-zinc-600 flex-wrap">
            <span>Delivered: <span className="font-semibold text-zinc-700">{totalUnits.toLocaleString()}</span></span>
            {s.sachetSizeG > 0 && <span>Unit size: <span className="font-semibold text-zinc-700">{s.sachetSizeG} {unitSizeUnit}</span></span>}
            {innersDelivered > 0 && <span>Inners: <span className="font-semibold text-zinc-700">{innersDelivered.toLocaleString()}</span></span>}
            {shippersDelivered > 0 && <span>Shippers: <span className="font-semibold text-zinc-700">{shippersDelivered.toLocaleString()}</span></span>}
          </div>
        )}
      </div>

      {/* â"€â"€ Inbound / Raw Material â"€â"€ */}
      <div className={card}>
        <p className="text-xs font-semibold text-zinc-950 mb-4">Inbound / Raw Material</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-4 items-start">
          <SubSection title="Overage">
            <Field label="Overage Rate" field="inboundOverage" value={s.inboundOverage} onChange={set} suffix="%" isPct placeholder="15" />
          </SubSection>
          <SubSection title="Intake Handling">
            <Field label="Inventory Handling Fee / Pallet" field="intakeFeePerPallet" value={s.intakeFeePerPallet} onChange={set} prefix="$" placeholder="595" />
            <Field label="Max Pallet Weight" field="intakePalletWeightLbs" value={s.intakePalletWeightLbs ?? 1200} onChange={set} suffix="lbs" placeholder="1200" />
            {(() => {
              const rawGrams = s.unitsDelivered * s.sachetSizeG * (1 + s.inboundOverage);
              const rawLbs   = rawGrams / 453.592;
              const palletWt = s.intakePalletWeightLbs ?? 1200;
              const autoPallets = palletWt > 0 ? Math.ceil(rawLbs / palletWt) : 0;
              return (
                <div>
                  <span className={labelCls}># of Intake Pallets (auto)</span>
                  <div className="h-9 px-3 flex items-center text-xs text-zinc-800 font-semibold bg-orange-100/90 border border-orange-300 rounded-md tabular-nums">
                    {autoPallets > 0 ? autoPallets : "-"}
                    {autoPallets > 0 && <span className="ml-1.5 text-[0.6rem] text-zinc-600 font-normal">{rawLbs.toLocaleString("en-US", { maximumFractionDigits: 0 })} lbs total</span>}
                  </div>
                </div>
              );
            })()}
            <Field label="Markup" field="intakeMarkup" value={s.intakeMarkup} onChange={set} suffix="%" isPct placeholder="25" />
          </SubSection>
          {/* JDI-supplied raw materials (shown when rawMaterialSource === 'jdi') */}
          {s.rawMaterialSource === "jdi" && (
            <SubSection title="Raw Materials (JDI-Supplied)">
              {(() => {
                const rawCostUnit = s.rawMaterialCostUnit || "g";
                const factor = RAW_MATERIAL_COST_GRAMS_PER[rawCostUnit] || 1;
                const displayCost = (s.costPerGram ?? 0) * factor;
                return (
                  <div className="min-w-0">
                    <span className={labelCls}>Cost / {rawCostUnit}</span>
                    <div className="flex items-center">
                      <span className={prefixBadge}>$</span>
                      <CurrencyInput
                        type="dollar"
                        value={displayCost}
                        onChange={v => setCoPackingField("costPerGram", v / factor)}
                        placeholder="0.01"
                        className="h-9 w-full px-3 border border-x-0 border-amber-200 text-xs text-zinc-950 placeholder:text-zinc-500 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition flex-1"
                      />
                      <select
                        value={rawCostUnit}
                        onChange={e => setCoPackingField("rawMaterialCostUnit", e.target.value)}
                        className="h-9 w-16 border border-l-0 border-amber-200 bg-amber-50/50 text-[0.65rem] text-zinc-700 rounded-r-md focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f]"
                      >
                        {RAW_MATERIAL_COST_UNITS.map(unit => (
                          <option key={unit} value={unit}>/{unit}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })()}
              <Field label="Overage Rate" field="rawOverage" value={s.rawOverage ?? 0} onChange={set} suffix="%" isPct placeholder="0" />
              <Field label="Raw Material Markup" field="rawMaterialMarkup" value={s.rawMaterialMarkup ?? 3.0} onChange={set} suffix="%" isPct placeholder="300" />
              {s.sachetSizeG > 0 && (
                <p className="text-[0.6rem] text-zinc-600">
                  Total grams req: <span className="font-semibold text-zinc-700">
                    {(s.unitsDelivered * s.sachetSizeG * (1 + (s.rawOverage ?? 0))).toLocaleString("en-US", { maximumFractionDigits: 0 })} g
                  </span>
                </p>
              )}
            </SubSection>
          )}
        </div>
      </div>

      {/* â"€â"€ Testing â"€â"€ */}
      {(() => {
        const TEST_TYPES = [
          "Certificate of Analysis (COA)",
          "Safety Data Sheet (SDS)",
          "Spec Sheet / Product Specification",
          "Microbial Testing",
          "Heavy Metals Testing",
          "Allergen Testing",
          "Moisture / Water Activity Testing",
          "Custom",
        ];
        const rows: TestingRow[] = s.testingRows ?? [];
        const totalPerSku = rows.reduce((sum, r) => sum + (r.cost ?? 0), 0);
        const totalOur    = totalPerSku * s.numSkus;
        const totalCx     = totalOur * (1 + (s.testingMarkup ?? 0.20));

        const addRow = () => {
          const newRow: TestingRow = { id: String(uid()), testType: "", customTestName: "", cost: 0 };
          setCoPackingField("testingRows", [...rows, newRow]);
        };
        const removeRow = (id: string) => {
          setCoPackingField("testingRows", rows.filter(r => r.id !== id));
        };
        const updateRow = (id: string, patch: Partial<TestingRow>) => {
          setCoPackingField("testingRows", rows.map(r => r.id === id ? { ...r, ...patch } : r));
        };

        return (
          <div className={card}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-zinc-950">Testing</p>
              <Toggle
                enabled={s.testingEnabled}
                onToggle={() => setCoPackingField("testingEnabled", !s.testingEnabled)}
                label="Include testing costs"
              />
            </div>
            {s.testingEnabled ? (
              <div className="mt-4 flex gap-6 items-start">
                {/* Left: # of SKUs */}
                <div className="w-24 shrink-0">
                  <span className={labelCls}># of SKUs</span>
                  <CurrencyInput type="integer" value={s.numSkus} onChange={v => setCoPackingField("numSkus", v)} placeholder="1" className={inputCls} />
                </div>

                {/* Right: test rows table */}
                <div className="flex-1 min-w-0">
                  <table className="w-full border-collapse mb-2">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left text-[0.55rem] font-semibold text-zinc-600 uppercase tracking-widest pb-1.5 pr-3">Test Type</th>
                        <th className="text-right text-[0.55rem] font-semibold text-zinc-600 uppercase tracking-widest pb-1.5 w-28">Cost / test</th>
                        <th className="w-6" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => (
                        <tr key={row.id} className="border-b border-gray-50">
                          <td className="py-1.5 pr-3">
                            <div className="flex items-center gap-2">
                              <select
                                value={row.testType}
                                onChange={e => updateRow(row.id, { testType: e.target.value, customTestName: "" })}
                                className="flex-1 h-8 px-2 border border-amber-200 text-xs text-zinc-950 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-md"
                              >
                                <option value="" disabled>- select test type -</option>
                                {TEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                              {row.testType === "Custom" && (
                                <input
                                  type="text"
                                  value={row.customTestName}
                                  onChange={e => updateRow(row.id, { customTestName: e.target.value })}
                                  placeholder="Custom test name"
                                  className="w-36 h-8 px-2 border border-amber-200 text-xs text-zinc-950 placeholder:text-zinc-500 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-md"
                                />
                              )}
                            </div>
                          </td>
                          <td className="py-1.5">
                            <div className="flex items-center justify-end">
                              <span className={prefixBadge}>$</span>
                              <CurrencyInput type="dollar" value={row.cost}
                                onChange={v => updateRow(row.id, { cost: v })}
                                className={inputWithPrefix + " w-24"} />
                            </div>
                          </td>
                          <td className="py-1.5 pl-2">
                            <button type="button" onClick={() => removeRow(row.id)}
                              className="text-zinc-500 hover:text-red-400 text-base leading-none transition-colors" title="Remove">x</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button type="button" onClick={addRow}
                    className="text-[0.65rem] font-semibold text-[#e8473f] hover:text-[#d43f37] transition-colors mb-4">
                    + Add Test
                  </button>
                  <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                    <span className="text-[0.65rem] text-zinc-600">Markup on total testing cost:</span>
                    <div className="flex items-center w-28">
                      <CurrencyInput type="percent" value={(s.testingMarkup ?? 0.20) * 100}
                        onChange={v => setCoPackingField("testingMarkup", v / 100)} className={inputWithSuffix} />
                      <span className={suffixBadge}>%</span>
                    </div>
                    {totalOur > 0 && (
                      <span className="text-[0.6rem] text-zinc-600 ml-auto">
                        Project Cost: <span className="font-semibold text-zinc-700">${totalOur.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        {"  -  "}Customer: <span className="font-semibold text-zinc-700">${totalCx.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[0.65rem] text-zinc-600 mt-1">Toggle on to include testing and quality documentation costs.</p>
            )}
          </div>
        );
      })()}

      {/* Blending section removed */}
      {false && (() => {
        const BATCH_SIZE_UNITS = ["kg", "g", "lbs", "oz", "L", "mL"] as const;
        const recipe: BlendIngredient[] = s.blendingRecipe ?? [];
        const batches      = s.blendingUnits > 0 ? s.blendingUnits : 1;
        const batchSize    = s.blendingBatchSize ?? 0;
        const batchUnit    = s.blendingBatchSizeUnit || "kg";
        const overageMult  = 1 + (s.blendingOverage ?? 0);

        // % sum for composition indicator
        const pctSum = recipe.reduce((acc, ing) => acc + (ing.percentage ?? 0), 0);
        const pctDiff = Math.abs(pctSum - 100);
        const pctOk   = pctDiff < 0.01;
        const pctOver = pctSum > 100.01;

        // Per-ingredient derived amounts (only meaningful when batchSize > 0)
        const ingredientRows = recipe.map(ing => {
          const pct           = ing.percentage ?? 0;
          const amtPerBatch   = batchSize > 0 ? (pct / 100) * batchSize : 0;
          const totalBase     = amtPerBatch * batches;
          const totalRequired = totalBase * overageMult;
          const overageExtra  = totalRequired - totalBase;
          return { ...ing, pct, amtPerBatch, totalBase, totalRequired, overageExtra };
        });

        const totalRequired = batchSize > 0
          ? batchSize * batches * overageMult
          : 0;

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
          <div className={card}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-zinc-950">Blending</p>
              <Toggle enabled={s.blendingEnabled} onToggle={() => setCoPackingField("blendingEnabled", !s.blendingEnabled)} label="Include Blending Step" />
            </div>

            {s.blendingEnabled ? (
              <div className="mt-4 space-y-4">
                {/* Description - full width */}
                <div>
                  <span className={labelCls}>Line Item Description (optional)</span>
                  <input type="text" value={s.blendingDescription}
                    onChange={e => setCoPackingField("blendingDescription", e.target.value)}
                    placeholder="e.g. 3-Component Protein Blend" className={inputCls} />
                </div>

                {/* Two-column body: Labor (left) + Recipe (right) */}
                <div className="flex gap-6 items-start">

                  {/* â"€â"€ LEFT: Labor inputs stacked vertically â"€â"€ */}
                  <div className="w-44 shrink-0 space-y-3">
                    <div className="min-w-0">
                      <span className={labelCls}>Batches to Blend</span>
                      <CurrencyInput type="integer" value={s.blendingUnits}
                        onChange={v => set("blendingUnits", v)} placeholder="1" className={inputCls} />
                    </div>
                    <div className="min-w-0">
                      <span className={labelCls}>Overage Rate</span>
                      <div className="flex items-center">
                        <CurrencyInput type="percent" value={s.blendingOverage * 100}
                          onChange={v => set("blendingOverage", v / 100)} placeholder="0" className={inputWithSuffix} />
                        <span className={suffixBadge}>%</span>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <span className={labelCls}>Batches / min</span>
                      <CurrencyInput type="rate" value={s.blendingUnitsPerMin}
                        onChange={v => set("blendingUnitsPerMin", v)} placeholder="1" className={inputCls} />
                    </div>
                    <div className="min-w-0">
                      <span className={labelCls}>Efficiency Buffer</span>
                      <div className="flex items-center">
                        <CurrencyInput type="percent" value={s.blendingEfficiencyBuffer * 100}
                          onChange={v => set("blendingEfficiencyBuffer", v / 100)} placeholder="15" className={inputWithSuffix} />
                        <span className={suffixBadge}>%</span>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <span className={labelCls}>Wage Rate / hr</span>
                      <div className="flex items-center">
                        <span className={prefixBadge}>$</span>
                        <CurrencyInput type="dollar" value={s.blendingWageRate}
                          onChange={v => set("blendingWageRate", v)} placeholder="30" className={inputWithPrefix} />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <span className={labelCls}>Labor Markup</span>
                      <div className="flex items-center">
                        <CurrencyInput type="percent" value={s.blendingLaborMarkup * 100}
                          onChange={v => set("blendingLaborMarkup", v / 100)} placeholder="35" className={inputWithSuffix} />
                        <span className={suffixBadge}>%</span>
                      </div>
                    </div>
                    <LaborHrsDisplay calcHrs={blendingCalcHrs} minHrs={s.blendingMinLaborHrs ?? 0} />
                    <div className="min-w-0">
                      <span className={labelCls}>Minimum Labor Hours</span>
                      <HrsInput value={s.blendingMinLaborHrs ?? 0}
                        onChange={v => setCoPackingField("blendingMinLaborHrs", v)} />
                    </div>
                  </div>

                  {/* â"€â"€ RIGHT: Recipe Breakdown â"€â"€ */}
                  <div className="flex-1 min-w-0">

                    {/* Batch size input */}
                    <div className="flex items-end gap-3 mb-4">
                      <div className="min-w-0 flex-1">
                        <span className={labelCls}>Batch Size</span>
                        <div className="flex items-center gap-1">
                          <input type="number" min={0} step={0.01}
                            value={batchSize || ""}
                            onChange={e => setCoPackingField("blendingBatchSize", parseFloat(e.target.value) || 0)}
                            placeholder="e.g. 50"
                            className="h-9 flex-1 px-3 border border-amber-200 text-xs text-zinc-950 placeholder:text-zinc-500 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-l-md" />
                          <select value={batchUnit}
                            onChange={e => setCoPackingField("blendingBatchSizeUnit", e.target.value)}
                            className="h-9 px-2 border border-l-0 border-amber-200 text-xs text-zinc-800 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-r-md">
                            {BATCH_SIZE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                      </div>
                      {batchSize > 0 && (
                        <div className="text-[0.65rem] text-zinc-600 pb-2 whitespace-nowrap">
                          {batches} batch{batches !== 1 ? "es" : ""} = <span className="font-semibold text-zinc-800">{fmtAmt(batchSize * batches)} {batchUnit}</span>
                          {s.blendingOverage > 0 && (
                            <span className="ml-1 text-amber-600">{"->"} order <span className="font-semibold">{fmtAmt(totalRequired)} {batchUnit}</span></span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Section label */}
                    <p className={sectionHead}>Recipe Composition</p>

                    {/* Composition bar */}
                    {recipe.length > 0 && (
                      <div className="mb-3">
                        <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                          {/* Stacked color segments per ingredient */}
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
                          {/* Overflow indicator */}
                          {pctOver && (
                            <div className="absolute inset-0 bg-red-400 opacity-20" />
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className={`text-[0.6rem] font-semibold tabular-nums ${pctOk ? "text-green-600" : pctOver ? "text-red-500" : "text-amber-500"}`}>
                            {pctSum.toFixed(2)}% {pctOk ? "OK" : pctOver ? `(+${(pctSum - 100).toFixed(2)}% over)` : `(${(100 - pctSum).toFixed(2)}% remaining)`}
                          </span>
                          <span className="text-[0.6rem] text-zinc-600">Target: 100%</span>
                        </div>
                      </div>
                    )}

                    {/* Ingredient table */}
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="border-b-2 border-gray-200">
                          <th className="text-left text-[0.55rem] font-semibold text-zinc-600 uppercase tracking-widest pb-1.5 pr-3">Ingredient</th>
                          <th className="text-right text-[0.55rem] font-semibold text-zinc-600 uppercase tracking-widest pb-1.5 px-2 w-20">%</th>
                          {batchSize > 0 && <>
                            <th className="text-right text-[0.55rem] font-semibold text-zinc-600 uppercase tracking-widest pb-1.5 px-2 w-28">Per Batch</th>
                            <th className="text-right text-[0.55rem] font-semibold text-zinc-600 uppercase tracking-widest pb-1.5 pl-2 w-32">
                              {batches > 1 ? `Total (${batches} batches)` : "Total Required"}
                              {s.blendingOverage > 0 && <span className="text-amber-500 ml-1">+ovg</span>}
                            </th>
                          </>}
                          <th className="w-5" />
                        </tr>
                      </thead>
                      <tbody>
                        {ingredientRows.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-4 text-center text-[0.65rem] text-zinc-500 italic">
                              Add ingredients and enter their % composition
                            </td>
                          </tr>
                        )}
                        {ingredientRows.map((ing, idx) => {
                          const colors = ["bg-blue-400","bg-emerald-400","bg-violet-400","bg-orange-400","bg-pink-400","bg-teal-400","bg-yellow-400","bg-red-400"];
                          return (
                            <tr key={ing.id} className="border-b border-gray-50 group">
                              {/* Color dot + name */}
                              <td className="py-1.5 pr-3">
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${colors[idx % colors.length]}`} />
                                  <input type="text" value={ing.name}
                                    onChange={e => updateIngredient(ing.id, { name: e.target.value })}
                                    placeholder="e.g. Whey Protein Isolate"
                                    className="h-7 w-full px-2 border border-transparent hover:border-amber-200 focus:border-amber-200 text-xs text-zinc-950 placeholder:text-zinc-500 bg-transparent hover:bg-amber-50/30 focus:bg-amber-50/50 focus:outline-none transition rounded-md" />
                                </div>
                              </td>
                              {/* % input */}
                              <td className="py-1.5 px-2">
                                <div className="flex items-center justify-end">
                                  <input type="number" min={0} max={100} step={0.1}
                                    value={ing.pct || ""}
                                    onChange={e => updateIngredient(ing.id, { percentage: parseFloat(e.target.value) || 0 })}
                                    placeholder="0"
                                    className="h-7 w-14 px-2 text-right border border-amber-200 text-xs text-zinc-950 bg-amber-50/50 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/40 transition rounded-l-md" />
                                  <span className="h-7 flex items-center px-1.5 border border-l-0 border-amber-200 text-[0.6rem] text-zinc-600 bg-amber-50/50 rounded-r-md select-none">%</span>
                                </div>
                              </td>
                              {/* Per-batch amount (read-only, derived) */}
                              {batchSize > 0 && <>
                                <td className="py-1.5 px-2 text-right tabular-nums text-zinc-700">
                                  {ing.amtPerBatch > 0 ? `${fmtAmt(ing.amtPerBatch)} ${batchUnit}` : "-"}
                                </td>
                                {/* Total required with overage */}
                                <td className="py-1.5 pl-2 text-right">
                                  {ing.totalRequired > 0 ? (
                                    <>
                                      <span className={`font-semibold tabular-nums ${s.blendingOverage > 0 ? "text-amber-700" : "text-zinc-800"}`}>
                                        {fmtAmt(ing.totalRequired)} {batchUnit}
                                      </span>
                                      {s.blendingOverage > 0 && ing.totalBase > 0 && (
                                        <div className="text-[0.55rem] text-amber-500 mt-0.5">
                                          {fmtAmt(ing.totalBase)} + {fmtAmt(ing.overageExtra)} overage
                                        </div>
                                      )}
                                    </>
                                  ) : "-"}
                                </td>
                              </>}
                              {/* Delete */}
                              <td className="py-1.5 pl-1">
                                <button type="button" onClick={() => removeIngredient(ing.id)}
                                  className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 text-base leading-none transition-all" title="Remove">x</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>

                      {/* Footer totals */}
                      {ingredientRows.length > 0 && (
                        <tfoot>
                          <tr className="border-t-2 border-gray-200">
                            <td className="pt-2 text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Total</td>
                            <td className="pt-2 px-2 text-right">
                              <span className={`font-bold tabular-nums text-xs ${pctOk ? "text-green-600" : pctOver ? "text-red-500" : "text-amber-500"}`}>
                                {pctSum.toFixed(2)}%
                              </span>
                            </td>
                            {batchSize > 0 && <>
                              <td className="pt-2 px-2 text-right text-zinc-700 tabular-nums text-xs font-semibold">
                                {fmtAmt(batchSize)} {batchUnit}
                              </td>
                              <td className="pt-2 pl-2 text-right">
                                <span className={`font-bold tabular-nums text-xs ${s.blendingOverage > 0 ? "text-amber-700" : "text-zinc-900"}`}>
                                  {fmtAmt(totalRequired)} {batchUnit}
                                </span>
                              </td>
                            </>}
                            <td />
                          </tr>
                          {s.blendingOverage > 0 && batchSize > 0 && (
                            <tr>
                              <td colSpan={5} className="pt-1.5 text-[0.6rem] text-amber-600">
                                Warning: Order <span className="font-semibold">{fmtAmt(totalRequired)} {batchUnit}</span> of raw materials ({(s.blendingOverage * 100).toFixed(0)}% overage applied to {fmtAmt(batchSize * batches)} {batchUnit} base)
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
              </div>
            ) : (
              <p className="text-[0.65rem] text-zinc-600 mt-1">Toggle on to add a blending step before Primary Fill.</p>
            )}
          </div>
        );
      })()}

      {/* â"€â"€ Co-Packing Packaging Summary â"€â"€ */}
      <div className={card}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold text-zinc-950">Packaging Summary</p>
            <p className="text-[0.6rem] text-zinc-600 mt-0.5">Configure packaging levels - details auto-populate the columns below</p>
          </div>
          <button type="button" onClick={cpAddSummaryRow}
            className="flex items-center gap-1 text-[0.6rem] font-semibold text-[#e8473f] hover:text-[#c73d36] uppercase tracking-wider transition-colors">
            + Add Row
          </button>
        </div>
        <div className="-mx-1 px-1">
          <table className="w-full border-collapse table-fixed">
            <thead>
              <tr>
                <th className={`${cpThCls} text-left`} style={{ width: "28%" }}>Packaging Level</th>
                <th className={`${cpThCls} text-left`} style={{ width: "28%" }}>Packaging Type</th>
                <th className={`${cpThCls} text-left`} style={{ width: "22%" }}># of Units</th>
                <th className={`${cpThCls} text-left`} style={{ width: "18%" }}>Cost / Unit</th>
                <th style={{ width: "4%" }} />
              </tr>
            </thead>
            <tbody>
              {cpSummaryRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-xs text-zinc-500 italic">
                    No packaging levels - click Add Row
                  </td>
                </tr>
              ) : cpSummaryRows.map((row) => {
                const isFirst = row.id === cpSummaryRows[0]?.id;
                return (
                  <tr key={row.id} className="group">
                    {/* Level */}
                    <td className="pr-2 pb-2">
                      <select value={row.packagingLevel} onChange={(e) => cpUpdateSummaryRow(row.id, { packagingLevel: e.target.value })} className={cpSelectCls}>
                        <option value="">- select level -</option>
                        {CP_LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </td>
                    {/* Type */}
                    <td className="pr-2 pb-2">
                      <input type="text" value={row.packagingType}
                        onChange={(e) => cpUpdateSummaryRow(row.id, { packagingType: e.target.value })}
                        placeholder="e.g. Stick Packs, Bulk Bags, Inners..."
                        className={cpSelectCls} />
                    </td>
                    {/* # of Units */}
                    <td className="pr-2 pb-2">
                      <div className="flex items-center gap-1">
                        <CurrencyInput type="integer"
                          value={isFirst ? s.unitsDelivered : row.units}
                          onChange={(v) => isFirst ? setUnitsDelivered(v) : cpUpdateSummaryRow(row.id, { units: v, isAutoUnits: false })}
                          placeholder="0"
                          className={`${cpInputYellow} flex-1 min-w-0 ${row.isAutoUnits ? "text-zinc-600" : "font-semibold"}`}
                        />
                        {row.isAutoUnits && (
                          <button type="button" onClick={() => cpSyncSummaryRowUnits(row.id)}
                            title="Resync from derived value"
                            className="shrink-0 text-zinc-600 hover:text-[#e8473f] transition-colors text-[0.7rem] leading-none">Reset</button>
                        )}
                      </div>
                    </td>
                    {/* Cost / Unit */}
                    <td className="pr-2 pb-2">
                      <div className="flex items-center gap-0.5">
                        <span className="text-xs text-zinc-600 shrink-0">$</span>
                        <CurrencyInput type="dollar"
                          value={row.costPerUnit}
                          onChange={(v) => cpUpdateSummaryRow(row.id, { costPerUnit: v })}
                          placeholder="0.00"
                          className={cpInputYellow}
                        />
                      </div>
                    </td>
                    {/* Delete */}
                    <td className="pb-2">
                      {cpSummaryRows.length > 1 && (
                        <button type="button" onClick={() => cpRemoveSummaryRow(row.id)}
                          className="text-zinc-500 hover:text-red-400 transition-colors" title="Remove row">ðŸ-'</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* â"€â"€ Co-Packing Packaging & Packout (vertical column layout, mirrors standard mode) â"€â"€ */}
      <div className={card}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-zinc-950 shrink-0">Packaging & Packout</h2>
            <div className="flex items-center gap-1 flex-wrap">
              {cpCols.map((col, i) => (
                <span key={col.id}
                  className="h-5 px-2 text-[0.6rem] font-semibold rounded-full bg-gray-100 text-zinc-700 flex items-center whitespace-nowrap">
                  {col.type || `Level ${i + 1}`}
                </span>
              ))}
            </div>
          </div>
          <button type="button" onClick={cpAddColumn}
            className="w-6 h-6 flex items-center justify-center border border-gray-200 text-zinc-600 hover:border-[#e8473f] hover:text-[#e8473f] hover:bg-red-50 transition-colors">
            +
          </button>
        </div>

        {/* Scrollable column table */}
        <div className="overflow-x-auto">
          <table className="border-collapse" style={{ minWidth: 200 + cpCols.length * 220 }}>
            <colgroup>
              <col style={{ width: 200, minWidth: 200 }} />
              {cpCols.map((col) => <col key={col.id} style={{ width: 220, minWidth: 220 }} />)}
            </colgroup>
            <tbody>

              {/* â"€â"€ Column header row (Type name + delete) â"€â"€ */}
              <tr>
                <td className="sticky left-0 z-10 bg-white" />
                {cpCols.map((col, idx) => (
                  <td key={col.id} className="px-2 pt-2 pb-1 align-bottom">
                    <div className="flex items-center justify-between gap-1.5">
                      <p className="text-[0.6rem] font-medium text-zinc-600 truncate">{col.type || `Level ${idx + 1}`}</p>
                      {cpCols.length > 1 && (
                        <button type="button" onClick={() => cpRemoveColumn(idx)}
                          className="shrink-0 text-zinc-500 hover:text-red-400 transition-colors p-0.5"
                          title={`Remove Level ${idx + 1}`}>ðŸ-'</button>
                      )}
                    </div>
                  </td>
                ))}
              </tr>

              {/* â"€â"€ Units (read-only from Packaging Summary) â"€â"€ */}
              <tr className="border-b border-gray-50">
                <td className="sticky left-0 z-10 bg-white py-1 pr-2 text-xs font-medium text-zinc-600">Units</td>
                {cpCols.map((col, idx) => (
                  <td key={col.id} className="px-2 py-1">
                    <div className={`${cpInputYellow} font-semibold flex items-center justify-end text-zinc-800 cursor-default select-none bg-orange-100/90 border-orange-300`}>
                      {(cpSummaryRows[idx]?.units ?? 0).toLocaleString("en-US")}
                    </div>
                  </td>
                ))}
              </tr>

              {/* â"€â"€ Eff. Buffer % â"€â"€ */}
              <tr>
                <td className="sticky left-0 z-10 bg-white py-1 pr-2 text-xs font-medium text-zinc-600">Eff. Buffer %</td>
                {cpCols.map((col, idx) => (
                  <td key={col.id} className="px-2 py-1">
                    <div className="flex items-center">
                      <CurrencyInput type="percent" value={col.efficiencyBuffer * 100} onChange={(v) => cpUpdateColumn(idx, { efficiencyBuffer: v / 100 })} className={`${inputWithSuffix} min-w-0`} />
                      <span className={suffixBadge}>%</span>
                    </div>
                  </td>
                ))}
              </tr>

              {/* â"€â"€ Labor Mkp % â"€â"€ */}
              <tr>
                <td className="sticky left-0 z-10 bg-white py-1 pr-2 text-xs font-medium text-zinc-600">Labor Mkp %</td>
                {cpCols.map((col, idx) => (
                  <td key={col.id} className="px-2 py-1">
                    <div className="flex items-center">
                      <CurrencyInput type="percent" value={col.laborMarkup * 100} onChange={(v) => cpUpdateColumn(idx, { laborMarkup: v / 100 })} className={`${inputWithSuffix} min-w-0`} />
                      <span className={suffixBadge}>%</span>
                    </div>
                  </td>
                ))}
              </tr>

              {/* â"€â"€ Unit Mkp % â"€â"€ */}
              <tr>
                <td className="sticky left-0 z-10 bg-white py-1 pr-2 text-xs font-medium text-zinc-600">Unit Mkp %</td>
                {cpCols.map((col, idx) => (
                  <td key={col.id} className="px-2 py-1">
                    <div className="flex items-center">
                      <CurrencyInput type="percent" value={col.unitCostMarkup * 100} onChange={(v) => cpUpdateColumn(idx, { unitCostMarkup: v / 100 })} className={`${inputWithSuffix} min-w-0`} />
                      <span className={suffixBadge}>%</span>
                    </div>
                  </td>
                ))}
              </tr>

              {/* â"€â"€ Level â"€â"€ */}
              <tr>
                <td className="sticky left-0 z-10 bg-white py-1 pr-2 text-xs font-medium text-zinc-600">Level</td>
                {cpCols.map((col, idx) => (
                  <td key={col.id} className="px-2 py-1">
                    <select value={col.level} onChange={(e) => {
                      cpUpdateColumn(idx, { level: e.target.value });
                      cpUpdateSummaryRow(cpSummaryRows[idx]?.id ?? "", { packagingLevel: e.target.value });
                    }} className={cpSelectCls}>
                      <option value="">- select level -</option>
                      {CP_LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </td>
                ))}
              </tr>

              {/* â"€â"€ Type (plain text - drives the column header label) â"€â"€ */}
              <tr>
                <td className="sticky left-0 z-10 bg-white py-1 pr-2 text-xs font-medium text-zinc-600">Type</td>
                {cpCols.map((col, idx) => (
                  <td key={col.id} className="px-2 py-1">
                    <input type="text" value={col.type}
                      onChange={(e) => {
                        cpUpdateColumn(idx, { type: e.target.value });
                        cpUpdateSummaryRow(cpSummaryRows[idx]?.id ?? "", { packagingType: e.target.value });
                      }}
                      placeholder="e.g. Stick Packs, Bulk Bags, Inners..."
                      className={cpSelectCls} />
                  </td>
                ))}
              </tr>

              {/* â"€â"€ Overage Rate â"€â"€ */}
              <tr className="border-b border-gray-50">
                <td className="sticky left-0 z-10 bg-white py-1.5 pr-3 text-xs text-zinc-700">Overage Rate</td>
                {cpCols.map((col, idx) => (
                  <td key={col.id} className="px-2 py-1.5">
                    <div className="flex items-center">
                      <CurrencyInput type="percent" value={col.overageRate * 100} onChange={(v) => cpUpdateColumn(idx, { overageRate: v / 100 })} className={`${inputWithSuffix} min-w-0`} />
                      <span className={suffixBadge}>%</span>
                    </div>
                  </td>
                ))}
              </tr>

              {/* â"€â"€ Wage Rate â"€â"€ */}
              <tr className="border-b border-gray-50">
                <td className="sticky left-0 z-10 bg-white py-1.5 pr-3 text-xs text-zinc-700">Wage Rate</td>
                {cpCols.map((col, idx) => (
                  <td key={col.id} className="px-2 py-1.5">
                    <div className="flex items-center">
                      <span className={prefixBadge}>$</span>
                      <CurrencyInput type="dollar" value={col.wageRate} onChange={(v) => cpUpdateColumn(idx, { wageRate: v })} className={`${inputWithPrefix} min-w-0`} />
                    </div>
                  </td>
                ))}
              </tr>

              {/* â"€â"€ Unit Fill Rate / Min â"€â"€ */}
              <tr className="border-b border-gray-50">
                <td className="sticky left-0 z-10 bg-white py-1.5 pr-3 text-xs text-zinc-700">Unit Fill Rate / Min</td>
                {cpCols.map((col, idx) => (
                  <td key={col.id} className="px-2 py-1.5">
                    <CurrencyInput type="rate" value={col.fillRatePerMin} onChange={(v) => cpUpdateColumn(idx, { fillRatePerMin: v })} placeholder="12" className={inputCls} />
                  </td>
                ))}
              </tr>

              {/* â"€â"€ Packaging Weight (g) â"€â"€ */}
              <tr className="border-b border-gray-50">
                <td className="sticky left-0 z-10 bg-white py-1.5 pr-3 text-xs text-zinc-700">Packaging Weight</td>
                {cpCols.map((col, idx) => (
                  <td key={col.id} className="px-2 py-1.5">
                    <div className="flex items-center">
                      <CurrencyInput type="rate" value={col.packagingWeightG} onChange={(v) => cpUpdateColumn(idx, { packagingWeightG: v })} placeholder="2" className={`${inputWithSuffix} min-w-0`} />
                      <span className={suffixBadge}>g</span>
                    </div>
                  </td>
                ))}
              </tr>

              {/* â"€â"€ No. of Staff / Stations â"€â"€ */}
              <tr className="border-b border-gray-50">
                <td className="sticky left-0 z-10 bg-white py-1.5 pr-3 text-xs text-zinc-700">No. of Staff / Stations</td>
                {cpCols.map((col, idx) => (
                  <td key={col.id} className="px-2 py-1.5">
                    <CurrencyInput type="integer" value={col.numStaff} onChange={(v) => cpUpdateColumn(idx, { numStaff: v })} placeholder="1" className={inputCls} />
                  </td>
                ))}
              </tr>

              {/* â"€â"€ Hrs / Shift â"€â"€ */}
              <tr className="border-b border-gray-50">
                <td className="sticky left-0 z-10 bg-white py-1.5 pr-3 text-xs text-zinc-700">Hrs / Shift</td>
                {cpCols.map((col, idx) => (
                  <td key={col.id} className="px-2 py-1.5">
                    <CurrencyInput type="rate" value={col.hrsPerShift} onChange={(v) => cpUpdateColumn(idx, { hrsPerShift: v })} placeholder="7" className={inputCls} />
                  </td>
                ))}
              </tr>

              {/* â"€â"€ Working Days â"€â"€ */}
              <tr className="border-b border-gray-50">
                <td className="sticky left-0 z-10 bg-white py-1.5 pr-3 text-xs text-zinc-700">Working Days</td>
                {cpCols.map((col, idx) => (
                  <td key={col.id} className="px-2 py-1.5">
                    <CurrencyInput type="integer" value={col.workingDays} onChange={(v) => cpUpdateColumn(idx, { workingDays: v })} placeholder="5" className={inputCls} />
                  </td>
                ))}
              </tr>

              {/* â"€â"€ Label toggle + inline conditional rows â"€â"€ */}
              <tr>
                <td className="sticky left-0 z-10 bg-white py-2 pr-3 text-xs font-medium text-zinc-600">Label</td>
                {cpCols.map((col, idx) => (
                  <td key={col.id} className="px-2 py-2">
                    <Toggle enabled={col.labelEnabled} onToggle={() => cpUpdateColumn(idx, { labelEnabled: !col.labelEnabled })} label="" />
                  </td>
                ))}
              </tr>
              {cpCols.some(c => c.labelEnabled) && (
                <>
                  <tr className="border-b border-gray-50">
                    <td className="sticky left-0 z-10 bg-white py-1.5 pr-3 text-xs text-zinc-700">Label Print Cost / Unit</td>
                    {cpCols.map((col, idx) => (
                      <td key={col.id} className="px-2 py-1.5">
                        {col.labelEnabled ? (
                          <div className="flex items-center">
                            <span className={prefixBadge}>$</span>
                            <CurrencyInput type="dollar" value={col.labelPrintCost} onChange={(v) => cpUpdateColumn(idx, { labelPrintCost: v })} placeholder="0.00" className={`${inputWithPrefix} min-w-0`} />
                          </div>
                        ) : <span className="text-[0.6rem] text-zinc-500 italic">-</span>}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-50">
                    <td className="sticky left-0 z-10 bg-white py-1.5 pr-3 text-xs text-zinc-700">Label Apply Rate / Min</td>
                    {cpCols.map((col, idx) => (
                      <td key={col.id} className="px-2 py-1.5">
                        {col.labelEnabled ? (
                          <CurrencyInput type="rate" value={col.labelApplyRate} onChange={(v) => cpUpdateColumn(idx, { labelApplyRate: v })} placeholder="0" className={inputCls} />
                        ) : <span className="text-[0.6rem] text-zinc-500 italic">-</span>}
                      </td>
                    ))}
                  </tr>
                </>
              )}

              {/* â"€â"€ Tabs toggle + inline conditional row â"€â"€ */}
              <tr>
                <td className="sticky left-0 z-10 bg-white py-2 pr-3 text-xs font-medium text-zinc-600">Tabs</td>
                {cpCols.map((col, idx) => (
                  <td key={col.id} className="px-2 py-2">
                    <Toggle enabled={col.tabsEnabled} onToggle={() => cpUpdateColumn(idx, { tabsEnabled: !col.tabsEnabled })} label="" />
                  </td>
                ))}
              </tr>
              {cpCols.some(c => c.tabsEnabled) && (
                <tr className="border-b border-gray-50">
                  <td className="sticky left-0 z-10 bg-white py-1.5 pr-3 text-xs text-zinc-700">Tab Cost / Unit</td>
                  {cpCols.map((col, idx) => (
                    <td key={col.id} className="px-2 py-1.5">
                      {col.tabsEnabled ? (
                        <div className="flex items-center">
                          <span className={prefixBadge}>$</span>
                          <CurrencyInput type="dollar" value={col.tabCostPerUnit} onChange={(v) => cpUpdateColumn(idx, { tabCostPerUnit: v })} placeholder="0.00" className={`${inputWithPrefix} min-w-0`} />
                        </div>
                      ) : <span className="text-[0.6rem] text-zinc-500 italic">-</span>}
                    </td>
                  ))}
                </tr>
              )}

            </tbody>
          </table>
        </div>
      </div>

      {/* â"€â"€ Total labor summary â"€â"€ */}
      {totalCalcHrs > 0 && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-[0.65rem] text-zinc-600">Total Est. Labor:</span>
          <span className="text-[0.65rem] font-semibold text-zinc-800">{totalCalcHrs.toFixed(2)} hrs across all steps</span>
        </div>
      )}

      {/* â"€â"€ Pallets â"€â"€ */}
      <div className={card}>
        <p className="text-xs font-semibold text-zinc-950 mb-4">Packout 3 - Palletization & Outbound</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-4 items-start">
          <Field label="# of Outbound Pallets" field="outboundPallets"      value={s.outboundPallets}      onChange={set} placeholder="4" />
          <Field label="Outbound Fee / Pallet" field="outboundFeePerPallet" value={s.outboundFeePerPallet} onChange={set} prefix="$" placeholder="595" />
          <Field label="Outbound Fee Markup"   field="outboundMarkup"       value={s.outboundMarkup}       onChange={set} suffix="%" isPct placeholder="30" />
        </div>
      </div>

      {/* â"€â"€ Addition 3 - Overhead â"€â"€ */}
      <div className={card}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-zinc-950">Overhead & Indirect Costs</p>
          <Toggle enabled={s.overheadEnabled} onToggle={() => setCoPackingField("overheadEnabled", !s.overheadEnabled)} label="Include overhead" />
        </div>
        {s.overheadEnabled ? (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-4 items-start">
            <Field label="Overhead Rate (% of labor)" field="overheadRate"        value={s.overheadRate ?? 0.15}       onChange={set} suffix="%" isPct placeholder="15" />
            <Field label="Overhead Markup"            field="overheadMarkup"      value={s.overheadMarkup ?? 0.20}     onChange={set} suffix="%" isPct placeholder="20" />
            <Field label="Fixed Overhead Fee"         field="fixedOverheadFee"    value={s.fixedOverheadFee ?? 0}      onChange={set} prefix="$" placeholder="0" />
            <Field label="Fixed Overhead Markup"      field="fixedOverheadMarkup" value={s.fixedOverheadMarkup ?? 0.20} onChange={set} suffix="%" isPct placeholder="20" />
          </div>
        ) : (
          <p className="text-[0.65rem] text-zinc-600 mt-1">Enable to allocate indirect and overhead costs as a line item.</p>
        )}
      </div>

      {/* â"€â"€ Minimum Charges â"€â"€ */}
      <div className={card}>
        <p className="text-xs font-semibold text-zinc-950 mb-4">Minimum Charges</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4 max-w-md">
          <Field label="Minimum Job Charge (Customer)" field="minimumJobCharge" value={s.minimumJobCharge} onChange={set} prefix="$" placeholder="0" />
          {/* Addition 4 - global min labor */}
          <div className="min-w-0">
            <span className={labelCls}>Global Minimum Labor Hours</span>
            <HrsInput value={s.globalMinLaborHrs ?? 0} onChange={v => setCoPackingField("globalMinLaborHrs", v)} />
          </div>
        </div>
        <p className="text-[0.6rem] text-zinc-600 mt-2">Set to $0 / 0 hrs to disable minimums.</p>
      </div>

      {/* â"€â"€ Addition 5 - Scaled Pricing Tiers â"€â"€ */}
      <div className={card}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-zinc-950">Scaled Pricing Tiers</p>
          <Toggle enabled={s.tiersEnabled} onToggle={handleTiersToggle} label="Enable pricing tiers" />
        </div>
        {s.tiersEnabled ? (
          <div className="mt-4 space-y-3">
            <p className="text-[0.65rem] text-zinc-600">Define unit quantities per tier. All other inputs stay the same. Setup fee is fixed across tiers.</p>
            <div className="space-y-2">
              {tiers.map((tier) => (
                <div key={tier.id} className="flex items-center gap-3 p-2 border border-gray-100 rounded-lg">
                  <input type="text" value={tier.label}
                    onChange={e => updateTier(tier.id, { label: e.target.value })}
                    disabled={tier.locked}
                    className={`flex-1 h-7 px-2 border border-amber-200 text-xs rounded-md ${tier.locked ? "bg-gray-50 text-zinc-600" : "bg-amber-50/50 text-zinc-950"}`} />
                  <div className="flex items-center gap-1 w-32">
                    <span className="text-[0.6rem] text-zinc-600 shrink-0">Units:</span>
                    {tier.locked ? (
                      <span className="text-xs text-zinc-600 font-medium">{tier.units.toLocaleString()}</span>
                    ) : (
                      <input type="number" value={tier.units || ""}
                        onChange={e => updateTier(tier.id, { units: parseInt(e.target.value) || 0 })}
                        placeholder="0"
                        className="w-20 h-7 px-2 border border-amber-200 text-xs rounded-md bg-amber-50/50 text-zinc-950" />
                    )}
                  </div>
                  <div className="flex items-center gap-1 w-32">
                    <span className="text-[0.6rem] text-zinc-600 shrink-0">Pallets:</span>
                    <input type="number"
                      value={tier.inboundPalletsOverride !== null ? tier.inboundPalletsOverride : ""}
                      onChange={e => updateTier(tier.id, { inboundPalletsOverride: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="auto"
                      className="w-16 h-7 px-2 border border-amber-200 text-xs rounded-md bg-amber-50/50 text-zinc-950" />
                  </div>
                  {!tier.locked && (
                    <button type="button" onClick={() => removeTier(tier.id)}
                      className="text-zinc-500 hover:text-red-500 text-base leading-none transition-colors" title="Remove tier">x</button>
                  )}
                </div>
              ))}
            </div>
            {tiers.length < 4 && (
              <button type="button" onClick={addTier}
                className="text-[0.65rem] font-semibold text-[#e8473f] hover:text-[#d43f37] border border-[#e8473f]/30 hover:border-[#e8473f] px-3 h-6 rounded-md transition-colors">
                + Add Tier
              </button>
            )}
          </div>
        ) : (
          <p className="text-[0.65rem] text-zinc-600 mt-1">Enable to compare pricing across multiple volume scenarios.</p>
        )}
      </div>

      {/* â"€â"€ Pricing Assumptions â"€â"€ */}
      <div className={card}>
        <span className={labelCls}>Pricing Assumptions (appears on PDF - leave blank for default)</span>
        <textarea value={s.pricingAssumptions}
          onChange={e => setCoPackingField("pricingAssumptions", e.target.value)}
          placeholder="Customer supplies all materials (product, film, cartons). Pricing assumes production rates and handling consistent with prior testing..."
          rows={3}
          className="w-full px-3 py-2 border border-amber-200 text-xs text-zinc-950 placeholder:text-zinc-500 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-md resize-y" />
      </div>

    </div>
  );
}
