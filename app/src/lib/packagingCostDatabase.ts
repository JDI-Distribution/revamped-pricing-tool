export interface PackagingCostItem {
  id: string;
  category: string;
  itemName: string;
  description: string;
  moq: string;
  landedCostEa: number;
  intakePackoutConfig: string;
}

export interface PackagingCostAuditEntry {
  id: string;
  action: string;
  itemName: string;
  at: string;
  user?: string;
  details?: string;
}

export const PACKAGING_COST_STORAGE_KEY = "jdi_packaging_cost_database_v1";
export const PACKAGING_COST_AUDIT_KEY = "jdi_packaging_cost_audit_v1";
const PACKAGING_COST_API = "https://jdi-pricing-tool-914416811.development.catalystserverless.com/server/quotes-api/packaging-costs";

export const seedPackagingCostItems: PackagingCostItem[] = [
  { id: "pkg-4g-jar", category: "Packaging", itemName: "4g Jar", description: "", moq: "", landedCostEa: 0.13, intakePackoutConfig: "" },
  { id: "pkg-5g-jar", category: "Packaging", itemName: "5g Jar", description: "", moq: "", landedCostEa: 0.13, intakePackoutConfig: "" },
  { id: "pkg-4g-powder-pump-spray-bottle", category: "Packaging", itemName: "4g Powder Pump + Spray Bottle", description: "", moq: "", landedCostEa: 0.55, intakePackoutConfig: "" },
  { id: "pkg-10g-powder-pump-spray-bottle", category: "Packaging", itemName: "10g Powder Pump + Spray Bottle", description: "", moq: "", landedCostEa: 0.68, intakePackoutConfig: "" },
  { id: "pkg-25g-powder-pump-spray-bottle", category: "Packaging", itemName: "25g Powder Pump + Spray Bottle", description: "", moq: "", landedCostEa: 0.85, intakePackoutConfig: "" },
  { id: "pkg-white-flip-caps", category: "Packaging", itemName: "White Flip Caps", description: "", moq: "", landedCostEa: 0.05, intakePackoutConfig: "" },
  { id: "pkg-black-flip-caps", category: "Packaging", itemName: "Black Flip Caps", description: "", moq: "", landedCostEa: 0.05, intakePackoutConfig: "" },
  { id: "pkg-50g-jars-caps", category: "Packaging", itemName: "50g Jars + Caps", description: "", moq: "", landedCostEa: 0.41, intakePackoutConfig: "" },
  { id: "pkg-1kg-jugs", category: "Packaging", itemName: "1kg Jugs", description: "", moq: "", landedCostEa: 4.59, intakePackoutConfig: "" },
  { id: "pkg-1lb-jugs", category: "Packaging", itemName: "1lb Jugs", description: "", moq: "", landedCostEa: 2.9, intakePackoutConfig: "" },
  { id: "pkg-25g-jars-caps", category: "Packaging", itemName: "25g Jars + Caps", description: "", moq: "", landedCostEa: 0.6, intakePackoutConfig: "" },
  { id: "pkg-4oz-tins", category: "Packaging", itemName: "4oz Tins", description: "", moq: "", landedCostEa: 0.55, intakePackoutConfig: "" },
  { id: "pkg-45g-shaker-bottle-caps", category: "Packaging", itemName: "45g Shaker Bottle + Caps", description: "", moq: "", landedCostEa: 0.43, intakePackoutConfig: "" },
  { id: "pkg-white-flat-caps", category: "Packaging", itemName: "White Flat Caps", description: "", moq: "", landedCostEa: 0.43, intakePackoutConfig: "" },
  { id: "pkg-black-flat-caps", category: "Packaging", itemName: "Black Flat Caps", description: "", moq: "", landedCostEa: 0.43, intakePackoutConfig: "" },
  { id: "pkg-25g-pump-shrink-bands", category: "Packaging", itemName: "25g Pump Shrink Bands", description: "", moq: "", landedCostEa: 0.04, intakePackoutConfig: "" },
  { id: "pkg-hang-tabs", category: "Packaging", itemName: "Hang Tabs", description: "", moq: "", landedCostEa: 0.01, intakePackoutConfig: "" },
  { id: "pkg-rimming-sugar-sachet-film", category: "Packaging", itemName: "Rimming Sugar Sachet Film", description: "", moq: "", landedCostEa: 0.01, intakePackoutConfig: "" },
  { id: "pkg-center-fold-pillow-packing-film", category: "Packaging", itemName: "Center Fold Pillow Packing Film", description: "Used for Michaels", moq: "", landedCostEa: 124.16, intakePackoutConfig: "" },
  { id: "pkg-13-pillow-packing-film", category: "Packaging", itemName: "13\" Pillow Packing Film", description: "Used for FBA/Walmart/Michaels)", moq: "", landedCostEa: 49.13, intakePackoutConfig: "" },
  { id: "lbl-4-x-6", category: "Labels", itemName: "4\" x 6\"", description: "", moq: "", landedCostEa: 0.01, intakePackoutConfig: "" },
  { id: "lbl-3-x-3", category: "Labels", itemName: "3\" x 3\"", description: "", moq: "", landedCostEa: 0.81, intakePackoutConfig: "" },
  { id: "lbl-private-label-4g-jar", category: "Labels", itemName: "Private Label 4g Jar", description: "", moq: "", landedCostEa: 0.02, intakePackoutConfig: "" },
  { id: "lbl-4g-jar", category: "Labels", itemName: "4g Jar", description: "", moq: "", landedCostEa: 0.02, intakePackoutConfig: "" },
  { id: "lbl-25g-jar", category: "Labels", itemName: "25g Jar", description: "", moq: "", landedCostEa: 0.05, intakePackoutConfig: "" },
  { id: "lbl-25g-pump", category: "Labels", itemName: "25g Pump", description: "", moq: "", landedCostEa: 0.05, intakePackoutConfig: "" },
  { id: "lbl-45g-jar", category: "Labels", itemName: "45g Jar", description: "", moq: "", landedCostEa: 0.05, intakePackoutConfig: "" },
  { id: "lbl-45g-pump", category: "Labels", itemName: "45g Pump", description: "", moq: "", landedCostEa: 0.05, intakePackoutConfig: "" },
  { id: "lbl-1lb-bag", category: "Labels", itemName: "1lb Bag", description: "", moq: "", landedCostEa: 0.1, intakePackoutConfig: "" },
  { id: "lbl-10g-pump", category: "Labels", itemName: "10g Pump", description: "", moq: "", landedCostEa: 0.03, intakePackoutConfig: "" },
  { id: "lbl-4g-pump", category: "Labels", itemName: "4g Pump", description: "", moq: "", landedCostEa: 0.03, intakePackoutConfig: "" },
  { id: "lbl-printed-wing-tin-labels", category: "Labels", itemName: "Printed Wing Tin Labels", description: "", moq: "", landedCostEa: 0.11, intakePackoutConfig: "" },
  { id: "lbl-printed-black-tin-labels", category: "Labels", itemName: "Printed Black Tin Labels", description: "", moq: "", landedCostEa: 0.08, intakePackoutConfig: "" },
];

export function loadPackagingCostItems(): PackagingCostItem[] {
  try {
    const saved = localStorage.getItem(PACKAGING_COST_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as PackagingCostItem[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* localStorage unavailable */ }
  return seedPackagingCostItems;
}

export function savePackagingCostItems(items: PackagingCostItem[]) {
  try { localStorage.setItem(PACKAGING_COST_STORAGE_KEY, JSON.stringify(items)); } catch { /* localStorage unavailable */ }
}

export function loadPackagingCostAudit(): PackagingCostAuditEntry[] {
  try {
    const saved = localStorage.getItem(PACKAGING_COST_AUDIT_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as PackagingCostAuditEntry[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* localStorage unavailable */ }
  return [];
}

export function savePackagingCostAudit(entries: PackagingCostAuditEntry[]) {
  try { localStorage.setItem(PACKAGING_COST_AUDIT_KEY, JSON.stringify(entries.slice(0, 100))); } catch { /* localStorage unavailable */ }
}

async function readApiJson<T>(res: Response): Promise<T> {
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || `Request failed with ${res.status}`);
  return payload as T;
}

export async function fetchPackagingCostItems(): Promise<PackagingCostItem[]> {
  const payload = await readApiJson<{ data: PackagingCostItem[] }>(await fetch(PACKAGING_COST_API));
  return Array.isArray(payload.data) ? payload.data : [];
}

export async function createPackagingCostItem(item: PackagingCostItem): Promise<PackagingCostItem> {
  const payload = await readApiJson<{ data: PackagingCostItem }>(await fetch(PACKAGING_COST_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  }));
  return payload.data;
}

export async function updatePackagingCostItem(item: PackagingCostItem): Promise<PackagingCostItem> {
  const payload = await readApiJson<{ data: PackagingCostItem }>(await fetch(`${PACKAGING_COST_API}/${encodeURIComponent(item.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  }));
  return payload.data;
}

export async function deletePackagingCostItem(item: PackagingCostItem): Promise<void> {
  await readApiJson(await fetch(`${PACKAGING_COST_API}/${encodeURIComponent(item.id)}?name=${encodeURIComponent(item.itemName)}`, {
    method: "DELETE",
  }));
}

export async function fetchPackagingCostAudit(): Promise<PackagingCostAuditEntry[]> {
  const payload = await readApiJson<{ data: PackagingCostAuditEntry[] }>(await fetch(`${PACKAGING_COST_API}/audit`));
  return Array.isArray(payload.data) ? payload.data : [];
}
