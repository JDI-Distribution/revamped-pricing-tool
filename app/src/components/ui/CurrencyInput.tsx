import { useState, useRef, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CurrencyInputType = "dollar" | "percent" | "integer" | "rate";

export interface CurrencyInputProps {
  value:      number;
  onChange:   (v: number) => void;
  type?:      CurrencyInputType;  // default: "dollar"
  // Visual
  className?: string;             // replaces the default input class
  // Behaviour
  min?:       number;
  max?:       number;
  step?:      number;
  disabled?:  boolean;
  placeholder?: string;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

const DOLLAR_MAX  = 9_999_999.9999;
const PERCENT_MAX = 9_999.9999;      // markup fields can exceed 100%
const INTEGER_MAX = 99_999_999;
const RATE_MAX    = 99_999.9999;     // units/min, batch rates

const DP = 4; // max decimal places for dollar and percent

// Trim trailing zeros from a fixed-decimal string, keeping at least `min` decimal places.
function trimTrailingZeros(s: string, min: number): string {
  const [int, dec] = s.split(".");
  if (!dec) return min > 0 ? `${int}.${"0".repeat(min)}` : int;
  // Trim from the right, but keep at least `min` digits
  let end = dec.length;
  while (end > min && dec[end - 1] === "0") end--;
  return end === 0 ? int : `${int}.${dec.slice(0, end)}`;
}

function formatDisplay(v: number, type: CurrencyInputType): string {
  if (!isFinite(v)) return "";
  switch (type) {
    case "dollar": {
      // Format with full 4dp, then trim trailing zeros (keep at least 2dp)
      const raw = v.toLocaleString("en-US", {
        style: "currency", currency: "USD",
        minimumFractionDigits: DP, maximumFractionDigits: DP,
      });
      // raw looks like "$1,234.4080" — trim the decimal part after the $symbol
      const match = raw.match(/^(\$[\d,]+)\.(\d+)$/);
      if (!match) return raw;
      const trimmed = trimTrailingZeros(`0.${match[2]}`, 2).slice(2); // just the decimal digits
      return `${match[1]}.${trimmed}`;
    }
    case "percent": {
      const raw = v.toFixed(DP); // "20.0000"
      return trimTrailingZeros(raw, 0) + "%";
    }
    case "integer":
      return Math.round(v).toLocaleString("en-US");
    case "rate": {
      // No symbol, 4dp, trim trailing zeros, keep at least 2dp
      const raw = v.toFixed(DP);
      return trimTrailingZeros(raw, 2);
    }
  }
}

function formatEdit(v: number, type: CurrencyInputType): string {
  if (!isFinite(v)) return "";
  if (v === 0) return "";
  switch (type) {
    case "dollar":   return v.toFixed(DP);
    case "percent":  return v.toFixed(DP);
    case "integer":  return String(Math.round(v));
    case "rate":     return v.toFixed(DP);
  }
}

function clamp(v: number, type: CurrencyInputType, min?: number, max?: number): number {
  const typeMax = type === "dollar" ? DOLLAR_MAX : type === "percent" ? PERCENT_MAX : type === "rate" ? RATE_MAX : INTEGER_MAX;
  const lo = min ?? 0;
  const hi = max ?? typeMax;
  return Math.max(lo, Math.min(hi, v));
}

function parse(raw: string, type: CurrencyInputType): number | null {
  // Strip any formatting that slipped in
  const stripped = raw.replace(/[,$%\s]/g, "");
  if (stripped === "" || stripped === "-") return null;
  const n = parseFloat(stripped);
  if (!isFinite(n)) return null;
  return type === "integer" ? Math.round(n) : n;  // rate/dollar/percent: keep full precision
}

// ── CurrencyInput ──────────────────────────────────────────────────────────────
//
// Shows a formatted value when blurred, a raw number when focused.
// Works as a drop-in replacement for <input type="number">.
//
// Usage:
//   <CurrencyInput type="dollar"  value={cost}   onChange={v => setCost(v)}   className="..." />
//   <CurrencyInput type="percent" value={markup}  onChange={v => setMarkup(v)} className="..." />
//   <CurrencyInput type="integer" value={qty}     onChange={v => setQty(v)}    className="..." />

export default function CurrencyInput({
  value,
  onChange,
  type = "dollar",
  className = "",
  min,
  max,
  step,
  disabled = false,
  placeholder,
}: CurrencyInputProps) {
  const [focused,  setFocused]  = useState(false);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFocus = useCallback(() => {
    setFocused(true);
    setEditText(formatEdit(value, type));
    // Select all on focus so user can immediately type over
    requestAnimationFrame(() => inputRef.current?.select());
  }, [value, type]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    const parsed = parse(editText, type);
    if (parsed !== null) {
      const clamped = clamp(parsed, type, min, max);
      onChange(clamped);
    }
    setEditText("");
  }, [editText, type, min, max, onChange]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setEditText(raw);
    // Live-emit while typing so parent state stays synced
    const parsed = parse(raw, type);
    if (parsed !== null) {
      const clamped = clamp(parsed, type, min, max);
      onChange(clamped);
    }
  }, [type, min, max, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      inputRef.current?.blur();
    }
  }, []);

  const displayValue = focused
    ? editText
    : (value === 0 ? "" : formatDisplay(value, type));

  const defaultStep = step ?? (type === "integer" ? 1 : 0.01);

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode={type === "integer" ? "numeric" : "decimal"}
      value={displayValue}
      placeholder={placeholder ?? (type === "dollar" ? "$0.0000" : type === "percent" ? "0.0000%" : type === "rate" ? "0.00" : "0")}
      disabled={disabled}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      data-currency-input={type}
      data-step={defaultStep}
      className={className}
    />
  );
}
