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
  { id: "pkg-4g-5g-jars", category: "Packaging", itemName: "4g/5g Jars", description: "", moq: "1639", landedCostEa: 0.13, intakePackoutConfig: "1639/box" },
  { id: "pkg-4g-powder-pump", category: "Packaging", itemName: "4g Powder Pump", description: "", moq: "50", landedCostEa: 0.55, intakePackoutConfig: "1080/box" },
  { id: "pkg-4g-powder-spray-bottle", category: "Packaging", itemName: "4g Powder Spray Bottle", description: "", moq: "50", landedCostEa: 0.55, intakePackoutConfig: "100/box" },
  { id: "pkg-10g-powder-pump", category: "Packaging", itemName: "10g Powder Pump", description: "", moq: "100", landedCostEa: 0.68, intakePackoutConfig: "480" },
  { id: "pkg-10g-powder-spray-bottle", category: "Packaging", itemName: "10g Powder Spray Bottle", description: "", moq: "100", landedCostEa: 0.68, intakePackoutConfig: "600" },
  { id: "pkg-25g-powder-pump", category: "Packaging", itemName: "25g Powder Pump", description: "", moq: "10000", landedCostEa: 0.85, intakePackoutConfig: "500" },
  { id: "pkg-25g-powder-spray-bottle", category: "Packaging", itemName: "25g Powder Spray Bottle", description: "", moq: "10000", landedCostEa: 0.85, intakePackoutConfig: "500" },
  { id: "pkg-white-flip-caps", category: "Packaging", itemName: "White Flip Caps", description: "", moq: "146000", landedCostEa: 0.046, intakePackoutConfig: "2000" },
  { id: "pkg-black-flip-caps", category: "Packaging", itemName: "Black Flip Caps", description: "", moq: "146000", landedCostEa: 0.046, intakePackoutConfig: "2000" },
  { id: "pkg-50g-jars", category: "Packaging", itemName: "50g Jars", description: "", moq: "10000", landedCostEa: 0.41, intakePackoutConfig: "480" },
  { id: "pkg-50g-caps", category: "Packaging", itemName: "50g Caps", description: "", moq: "10000", landedCostEa: 0.41, intakePackoutConfig: "1216" },
  { id: "pkg-kilogram-jugs", category: "Packaging", itemName: "Kilogram Jugs", description: "", moq: "1", landedCostEa: 4.59, intakePackoutConfig: "12/box" },
  { id: "pkg-1lb-jugs", category: "Packaging", itemName: "1lb Jugs", description: "", moq: "1", landedCostEa: 2.9, intakePackoutConfig: "24/box" },
  { id: "pkg-25g-jars", category: "Packaging", itemName: "25g Jars", description: "", moq: "480", landedCostEa: 0.6, intakePackoutConfig: "480/box" },
  { id: "pkg-25g-caps", category: "Packaging", itemName: "25g Caps", description: "", moq: "2400", landedCostEa: 0.6, intakePackoutConfig: "2400/box" },
  { id: "pkg-4oz-tins", category: "Packaging", itemName: "4oz Tins", description: "", moq: "5000", landedCostEa: 0.55, intakePackoutConfig: "240//box" },
  { id: "pkg-45g-shakers-bottle", category: "Packaging", itemName: "45g Shakers Bottle", description: "", moq: "500", landedCostEa: 0.43, intakePackoutConfig: "500" },
  { id: "pkg-45g-shaker-caps", category: "Packaging", itemName: "45g Shaker Caps", description: "", moq: "1400", landedCostEa: 0.43, intakePackoutConfig: "1400" },
  { id: "pkg-white-flat-caps", category: "Packaging", itemName: "White FLAT Caps", description: "", moq: "4000", landedCostEa: 0.43, intakePackoutConfig: "4000" },
  { id: "pkg-black-flat-caps", category: "Packaging", itemName: "Black FLAT Caps", description: "", moq: "4000", landedCostEa: 0.43, intakePackoutConfig: "4000" },
  { id: "pkg-25g-pump-shrink-bands", category: "Packaging", itemName: "25g pump shrink bands", description: "", moq: "100", landedCostEa: 0.04, intakePackoutConfig: "100" },
  { id: "lbl-4x6-shipping-labels", category: "Labels", itemName: "4x6 (shipping labels)", description: "", moq: "1 roll", landedCostEa: 0.0132, intakePackoutConfig: "250/roll" },
  { id: "lbl-3x3-case-pack-labels", category: "Labels", itemName: "3x3 (case pack labels)", description: "", moq: "1 roll", landedCostEa: 0.81, intakePackoutConfig: "500/roll" },
  { id: "lbl-private-label-4g-jar-label", category: "Labels", itemName: "Private Label 4g Jar Label", description: "", moq: "3 rolls", landedCostEa: 0.0188691729323308, intakePackoutConfig: "6650/rol" },
  { id: "lbl-4g-jar-label", category: "Labels", itemName: "4g Jar Label", description: "", moq: "3 rolls", landedCostEa: 0.0237613636363636, intakePackoutConfig: "5280/roll" },
  { id: "lbl-25g-jar-25g-pump-45g", category: "Labels", itemName: "25G jar, 25G PUMP, 45G", description: "", moq: "3 rolls", landedCostEa: 0.0535140186915888, intakePackoutConfig: "3210/roll" },
  { id: "lbl-pound-bags", category: "Labels", itemName: "Pound Bags", description: "", moq: "3 rolls", landedCostEa: 0.0972071428571429, intakePackoutConfig: "1400/roll" },
  { id: "lbl-10g-pump", category: "Labels", itemName: "10 g Pump", description: "", moq: "3 rolls", landedCostEa: 0.0305793226381461, intakePackoutConfig: "5610/roll" },
  { id: "lbl-4g-pump", category: "Labels", itemName: "4g Pump", description: "", moq: "3 rolls", landedCostEa: 0.02796138996139, intakePackoutConfig: "5180/roll" },
  { id: "lbl-warren-printed-wing-tin-labels", category: "Labels", itemName: "Warren Printed Wing tin Labels", description: "", moq: "5 rolls", landedCostEa: 0.10552, intakePackoutConfig: "2000/roll" },
  { id: "lbl-warren-printed-back-tin-label", category: "Labels", itemName: "Warren Printed Back tin Label", description: "", moq: "5 rolls", landedCostEa: 0.07776, intakePackoutConfig: "1000/roll" },
  { id: "pkg-hang-tabs", category: "Packaging", itemName: "Hang Tabs", description: "", moq: "29 rolls", landedCostEa: 0.0109, intakePackoutConfig: "3500/roll" },
  { id: "pkg-production-sugar-sachet-film", category: "Packaging", itemName: "Production Sugar Sachet Film", description: "", moq: "No Minimum", landedCostEa: 0.0058, intakePackoutConfig: "8,800/roll" },
  { id: "pkg-center-fold-pillow-pack-film", category: "Packaging", itemName: "Center Fold Pillow Pack Film", description: "Used for Michaels tins", moq: "20 rolls", landedCostEa: 124.16, intakePackoutConfig: "Roll" },
  { id: "pkg-13-pillow-pack-film", category: "Packaging", itemName: "13\" Pillow Pack Film", description: "Used for FBA, Walmart, and Michaels blistered units", moq: "96", landedCostEa: 49.13, intakePackoutConfig: "roll" },
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
