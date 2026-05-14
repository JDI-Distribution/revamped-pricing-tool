import { useState, useEffect } from "react";
import { X } from "lucide-react";

export interface ConversionPrefill {
  value: string;
  unit:  string;
}

interface Props {
  open:     boolean;
  onClose:  () => void;
  prefill?: ConversionPrefill;  // pre-loads the Weight converter's left side when set
}

// ── Conversion factors (everything to a base unit) ───────────────────────────

const WEIGHT_TO_G: Record<string, number> = {
  mg:  0.001,
  g:   1,
  kg:  1000,
  oz:  28.3495,
  lb:  453.592,
};

const VOL_TO_ML: Record<string, number> = {
  ml:   1,
  L:    1000,
  "fl oz": 29.5735,
  cup:  236.588,
  tbsp: 14.7868,
  tsp:  4.92892,
  gal:  3785.41,
};

const WEIGHT_UNITS = ["g", "kg", "oz", "lb", "mg"];
const VOL_UNITS    = ["ml", "L", "fl oz", "cup", "tbsp", "tsp", "gal"];
const PRICE_UNITS  = ["g", "kg", "oz", "lb"];

function convert(value: number, from: string, to: string, table: Record<string, number>): number {
  if (!table[from] || !table[to] || !isFinite(value)) return 0;
  return (value * table[from]) / table[to];
}

// Format for display — never uses toLocaleString (commas break <input type="number">)
// Uses plain decimal strings safe for both display and input value prop.
function fmtResult(v: number): string {
  if (!isFinite(v)) return "";
  if (v === 0) return "0";
  if (Math.abs(v) >= 10000) return v.toFixed(2);
  if (Math.abs(v) >= 1)     return parseFloat(v.toFixed(6)).toString();
  return parseFloat(v.toPrecision(6)).toString();
}

// ── Shared UI pieces ─────────────────────────────────────────────────────────

const inputCls  = "h-9 px-3 text-sm bg-amber-50 border border-amber-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition w-full";
const resultCls = "h-9 px-3 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition w-full";
const selectCls = "h-9 px-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#e8473f] transition cursor-pointer";

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-1 h-4 rounded-full bg-[#e8473f] shrink-0" />
        <p className="text-xs font-bold text-gray-900 uppercase tracking-wide">{title}</p>
      </div>
      {sub && <p className="text-[0.65rem] text-gray-400 ml-3">{sub}</p>}
      <div className="border-b border-gray-100 mt-2" />
    </div>
  );
}

// ── Generic two-way converter row ────────────────────────────────────────────
// "left" side is the user's primary input; "right" shows the converted result
// but is also editable (changes back-calculate left).
// Both sides use type="text" so fmtResult strings render without browser mangling.

interface ConverterRowProps {
  leftVal:   string;
  leftUnit:  string;
  rightUnit: string;
  units:     string[];
  table:     Record<string, number>;
  onLeftVal:  (v: string) => void;
  onLeftUnit: (u: string) => void;
  onRightUnit:(u: string) => void;
  // Optional prefix symbol for both sides (e.g. "$")
  prefix?: string;
  // Optional text between the two sides (e.g. "per")
  between?: string;
}

function ConverterRow({ leftVal, leftUnit, rightUnit, units, table, onLeftVal, onLeftUnit, onRightUnit, prefix, between }: ConverterRowProps) {
  const leftNum  = parseFloat(leftVal) || 0;
  const rightNum = convert(leftNum, leftUnit, rightUnit, table);
  const rightStr = leftNum !== 0 ? fmtResult(rightNum) : "";

  const handleRightEdit = (v: string) => {
    const n = parseFloat(v);
    if (!isNaN(n)) {
      const back = convert(n, rightUnit, leftUnit, table);
      onLeftVal(isFinite(back) && back !== 0 ? fmtResult(back) : v === "" ? "" : "0");
    } else if (v === "" || v === "-") {
      onLeftVal("");
    }
  };

  const unitSelect = (val: string, onChange: (u: string) => void) => (
    <select value={val} onChange={(e) => onChange(e.target.value)} className={selectCls}>
      {units.map((u) => <option key={u} value={u}>{u}</option>)}
    </select>
  );

  return (
    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
      {/* Left side */}
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {prefix && <span className="text-sm text-gray-400 shrink-0">{prefix}</span>}
        <input
          type="text"
          inputMode="decimal"
          value={leftVal}
          onChange={(e) => onLeftVal(e.target.value)}
          placeholder="0"
          className={`${inputCls} min-w-0`}
        />
      </div>
      {between && <span className="text-xs text-gray-400 shrink-0">{between}</span>}
      {unitSelect(leftUnit, onLeftUnit)}

      <span className="text-gray-400 text-sm shrink-0">=</span>

      {/* Right side */}
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {prefix && <span className="text-sm text-gray-400 shrink-0">{prefix}</span>}
        <input
          type="text"
          inputMode="decimal"
          value={rightStr}
          onChange={(e) => handleRightEdit(e.target.value)}
          placeholder="0"
          className={`${resultCls} min-w-0`}
        />
      </div>
      {between && <span className="text-xs text-gray-400 shrink-0">{between}</span>}
      {unitSelect(rightUnit, onRightUnit)}
    </div>
  );
}

// ── Weight Converter ─────────────────────────────────────────────────────────

function WeightConverter({ prefill }: { prefill?: ConversionPrefill }) {
  const [leftVal,   setLeftVal]   = useState(prefill?.value ?? "1");
  const [leftUnit,  setLeftUnit]  = useState(prefill?.unit  ?? "lb");
  const [rightUnit, setRightUnit] = useState("g");
  return <ConverterRow leftVal={leftVal} leftUnit={leftUnit} rightUnit={rightUnit} units={WEIGHT_UNITS} table={WEIGHT_TO_G} onLeftVal={setLeftVal} onLeftUnit={setLeftUnit} onRightUnit={setRightUnit} />;
}

// ── Volume Converter ─────────────────────────────────────────────────────────

function VolumeConverter() {
  const [leftVal,   setLeftVal]   = useState("1");
  const [leftUnit,  setLeftUnit]  = useState("fl oz");
  const [rightUnit, setRightUnit] = useState("ml");
  return <ConverterRow leftVal={leftVal} leftUnit={leftUnit} rightUnit={rightUnit} units={VOL_UNITS} table={VOL_TO_ML} onLeftVal={setLeftVal} onLeftUnit={setLeftUnit} onRightUnit={setRightUnit} />;
}

// ── Price Converter ──────────────────────────────────────────────────────────
// Price conversion is the inverse of unit conversion:
//   $/fromUnit → $/toUnit = price × (fromUnit_in_g / toUnit_in_g) is WRONG
//   $/fromUnit → $/toUnit = price / (toUnit_in_g / fromUnit_in_g)
//               = price × (fromUnit_in_g / toUnit_in_g)  ← wait that IS the same
// Wait: $7.33/lb → $/g: there are 453.592 g per lb, so $7.33/lb ÷ 453.592 = $0.01616/g
// i.e. result = price × (WEIGHT_TO_G[toUnit] / WEIGHT_TO_G[fromUnit])
//             = price × (1/453.592)
// But WEIGHT_TO_G["lb"]=453.592, WEIGHT_TO_G["g"]=1
// So: price × WEIGHT_TO_G[toUnit] / WEIGHT_TO_G[fromUnit]
//   = 7.33 × 1 / 453.592 = 0.01616 ✓
// The existing convert() does: value × table[from] / table[to]
//   = 7.33 × 453.592 / 1 = 3325 ✗  (that's mass conversion, not price)
// We need the reciprocal table: use convert with to/from swapped.

const PRICE_TO_G: Record<string, number> = WEIGHT_TO_G; // same table, different interpretation

function convertPrice(price: number, from: string, to: string): number {
  // $/from → $/to = price × (to_grams_per_unit / from_grams_per_unit) is wrong direction
  // $/from → $/to = price / (from_grams / to_grams) = price × to_grams / from_grams
  // Wait: $7.33/lb, want $/g. 1 lb = 453.592 g → $7.33 covers 453.592 g → $7.33/453.592 per g
  // = price × PRICE_TO_G[to] / PRICE_TO_G[from]  but PRICE_TO_G[to]="g"=1, PRICE_TO_G[from]="lb"=453.592
  // = 7.33 × 1 / 453.592 = 0.01616 ✓
  if (!PRICE_TO_G[from] || !PRICE_TO_G[to]) return 0;
  return price * PRICE_TO_G[to] / PRICE_TO_G[from];
}

// A custom ConverterRow variant for price that uses convertPrice instead of convert()
function PriceConverter() {
  const [leftVal,   setLeftVal]   = useState("7.33");
  const [leftUnit,  setLeftUnit]  = useState("lb");
  const [rightUnit, setRightUnit] = useState("g");

  const leftNum  = parseFloat(leftVal) || 0;
  const rightNum = convertPrice(leftNum, leftUnit, rightUnit);
  const rightStr = leftNum !== 0 ? fmtResult(rightNum) : "";

  const handleRightEdit = (v: string) => {
    const n = parseFloat(v);
    if (!isNaN(n)) {
      const back = convertPrice(n, rightUnit, leftUnit);
      setLeftVal(isFinite(back) && back !== 0 ? fmtResult(back) : "0");
    } else if (v === "") {
      setLeftVal("");
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <span className="text-sm text-gray-400 shrink-0">$</span>
        <input type="text" inputMode="decimal" value={leftVal} onChange={(e) => setLeftVal(e.target.value)} placeholder="0.00" className={`${inputCls} min-w-0`} />
      </div>
      <span className="text-xs text-gray-400 shrink-0">per</span>
      <select value={leftUnit} onChange={(e) => setLeftUnit(e.target.value)} className={selectCls}>
        {PRICE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
      <span className="text-gray-400 text-sm shrink-0">=</span>
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <span className="text-sm text-gray-400 shrink-0">$</span>
        <input type="text" inputMode="decimal" value={rightStr} onChange={(e) => handleRightEdit(e.target.value)} placeholder="0.00" className={`${resultCls} min-w-0`} />
      </div>
      <span className="text-xs text-gray-400 shrink-0">per</span>
      <select value={rightUnit} onChange={(e) => setRightUnit(e.target.value)} className={selectCls}>
        {PRICE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
    </div>
  );
}

// ── Quick Reference ──────────────────────────────────────────────────────────

const REFS = [
  { from: "1 lb",    to: "453.592 g",   factor: "× 453.592" },
  { from: "1 oz",    to: "28.3495 g",   factor: "× 28.3495" },
  { from: "1 kg",    to: "1,000 g",     factor: "× 1,000" },
  { from: "1 lb",    to: "16 oz",       factor: "× 16" },
  { from: "1 fl oz", to: "29.5735 ml",  factor: "× 29.5735" },
  { from: "1 cup",   to: "236.588 ml",  factor: "× 236.588" },
  { from: "1 gal",   to: "3,785.41 ml", factor: "× 3,785.41" },
];

// ── Main modal ───────────────────────────────────────────────────────────────

export default function ConversionCalculator({ open, onClose, prefill }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`relative w-full md:max-w-[600px] max-h-[90vh] bg-white rounded-lg shadow-2xl flex flex-col transition-all duration-200 ${open ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
      >
        {/* Sticky header */}
        <div className="shrink-0 px-5 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Unit Conversion Calculator</h2>
            <p className="text-[0.65rem] text-gray-400 mt-0.5">Convert between weight and volume units</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors mt-0.5">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Section 1 — Weight */}
          <div>
            <SectionHeader title="Weight" />
            <WeightConverter prefill={prefill} />
          </div>

          {/* Section 2 — Volume */}
          <div>
            <SectionHeader title="Volume" />
            <VolumeConverter />
          </div>

          {/* Section 3 — Price per unit */}
          <div>
            <SectionHeader
              title="Price per Unit"
              sub="Convert landed cost between weight units — e.g. $/lb → $/g for raw material inputs"
            />
            <PriceConverter />
          </div>

          {/* Section 4 — Quick reference */}
          <div>
            <SectionHeader title="Common Conversions" />
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="py-2 px-3 text-left text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider">From</th>
                    <th className="py-2 px-3 text-left text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider">To</th>
                    <th className="py-2 px-3 text-right text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider">Factor</th>
                  </tr>
                </thead>
                <tbody>
                  {REFS.map((row, i) => (
                    <tr key={i} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? "bg-gray-50/40" : ""}`}>
                      <td className="py-2 px-3 font-medium text-gray-700">{row.from}</td>
                      <td className="py-2 px-3 text-gray-700">{row.to}</td>
                      <td className="py-2 px-3 text-right text-gray-400 font-mono">{row.factor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
