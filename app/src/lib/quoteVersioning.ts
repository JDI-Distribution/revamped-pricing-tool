import { CustomerInfo } from "./generateQuotePDF";
import { ProjectFormData } from "./types";

export type QuoteVersionInfo = {
  baseName: string;
  familyKey: string;
  version: number;
  name: string;
};

type QuoteNameInputs = {
  formData: ProjectFormData;
  customer: CustomerInfo;
  ppuDenominator?: number;
  productNameFallback?: string;
  date?: Date;
};

const normalizePart = (value: string | number | undefined | null, fallback = "Quote") => {
  const cleaned = String(value ?? "")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
};

const formatNumberPart = (value: string | number | undefined | null, fallback = "0") => {
  const parsed = Number(String(value ?? "").replace(/[$,%\s,]/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed.toLocaleString("en-US", { maximumFractionDigits: 4 });
};

export const formatQuoteDatePart = (date = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
};

export function buildQuoteBaseName({ formData, customer, ppuDenominator, productNameFallback, date = new Date() }: QuoteNameInputs) {
  const denominator = formatNumberPart(ppuDenominator ?? formData.ppuDenominator);
  const unitSize = `${formatNumberPart(formData.unitWeight)}${normalizePart(formData.unitWeightUnit || "g", "g")}`;
  const productName = normalizePart(customer.productName || productNameFallback, "Product");
  const companyName = normalizePart(customer.customer, "Company");
  return [denominator, unitSize, productName, companyName, formatQuoteDatePart(date)].join("_");
}

export function quoteFamilyKey(baseName: string, dealId = "") {
  return `${dealId || "no-deal"}|${baseName.toLowerCase()}`;
}

export function parseQuoteVersion(name: string, baseName: string) {
  const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = name.match(new RegExp(`^${escaped}_v(\\d+)$`, "i"));
  return match ? Number(match[1]) || 0 : 0;
}

export function parseTrailingQuoteVersion(name: string | undefined | null) {
  const match = String(name ?? "").match(/_v(\d+)$/i);
  return match ? Number(match[1]) || 0 : 0;
}

export function nextQuoteVersion(baseName: string, existingNames: string[]) {
  const maxVersion = existingNames.reduce((max, name) => Math.max(max, parseQuoteVersion(name, baseName)), 0);
  return maxVersion + 1;
}

export function nextQuoteRevisionVersion(baseName: string, existingNames: string[], sourceQuoteName?: string | null) {
  const nextForCurrentBase = nextQuoteVersion(baseName, existingNames);
  const nextFromLoadedQuote = parseTrailingQuoteVersion(sourceQuoteName) + 1;
  return Math.max(nextForCurrentBase, nextFromLoadedQuote || 1);
}

export function buildVersionedQuoteName(baseName: string, version: number) {
  return `${baseName}_v${version}`;
}
