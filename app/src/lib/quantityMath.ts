export function ceilQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.ceil(value - 1e-9);
}

export function qtyWithOverage(baseQty: number, overagePct: number): number {
  if (!Number.isFinite(baseQty) || baseQty <= 0) return 0;
  const pct = Number.isFinite(overagePct) ? overagePct : 0;
  return ceilQty(baseQty * (1 + pct / 100));
}
