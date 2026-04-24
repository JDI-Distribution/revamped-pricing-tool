import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { MoqPricingRow } from "./ProjectContext";
import { SummaryRow, SummaryTableRow } from "./types";

// ── Brand definitions ─────────────────────────────────────────────────────────
export const BRANDS = [
  { id: "jdi",         label: "JDI Distribution", logo: "/logo-jdi.png",         accent: "#e8473f", phone: "1-800-000-0000", email: "sales@jdidistribution.com", address1: "1967 Essex Ct", address2: "Redlands, CA 92373" },
  { id: "brewglitter", label: "Brew Glitter",      logo: "/logo-brewglitter.png", accent: "#c0932b", phone: "1-800-292-2137", email: "sales@brewglitter.com",    address1: "1967 Essex Ct", address2: "Redlands, CA 92373" },
  { id: "bakell",      label: "Bakell",            logo: "/logo-bakell.png",      accent: "#d45f8a", phone: "1-800-000-0000", email: "sales@bakell.com",         address1: "1967 Essex Ct", address2: "Redlands, CA 92373" },
  { id: "pfg",         label: "Pro Foods Group",   logo: "/logo-pfg.png",         accent: "#2e6faf", phone: "1-800-000-0000", email: "sales@profoods.com",       address1: "1967 Essex Ct", address2: "Redlands, CA 92373" },
] as const;

export type BrandId = typeof BRANDS[number]["id"];

export interface CustomerInfo {
  customer:        string;
  customerId:      string;
  name:            string;
  phone:           string;
  email:           string;
  salesRep:        string;
  projectOverview: string;
}

export interface QuotePreview {
  filename:  string;
  blobUrl:   string;
  moqLabel:  string;
  packLabel: string;
  doc:       jsPDF;
}

type QuoteArgs = {
  brandId:          BrandId;
  moqResults:       MoqPricingRow[];
  moqMargins:       Record<number, string>;
  summaryRows:      SummaryRow[];
  summaryTableRows: SummaryTableRow[];
  formData:         { startDate: string; leadTimeBufferDays: string; ppuDenominator: string; numFinishedPallets: string; outboundFee: string; outboundFeeMarkup: string };
  customer:         CustomerInfo;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt    = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

function addBusinessDays(date: Date, days: number): Date {
  const d = new Date(date);
  let added = 0;
  while (added < Math.round(days)) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" });
}

function generateQuoteId(): string {
  const now = new Date();
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `Q-${now.getFullYear()}${p(now.getMonth()+1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

async function loadImageAsDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ── Core builder — returns one {doc, filename} per MOQ row ────────────────────
async function buildDocs(args: QuoteArgs): Promise<{ doc: jsPDF; filename: string; moqLabel: string; packLabel: string }[]> {
  const { brandId, moqResults, moqMargins, summaryRows, summaryTableRows, formData, customer } = args;
  const brand    = BRANDS.find((b) => b.id === brandId)!;
  const quoteId  = generateQuoteId();
  const today    = new Date();
  const logoDataUrl = await loadImageAsDataUrl(brand.logo);

  const indivRow      = summaryTableRows.find(r => r.leadTimeWeeks != null && r.leadTimeWeeks > 0);
  const leadTimeWeeks = indivRow?.leadTimeWeeks ?? 0;
  const startDate     = formData.startDate ? new Date(formData.startDate) : today;
  const shipDate      = addBusinessDays(startDate, leadTimeWeeks * 5);

  const totalOurCost       = summaryRows.reduce((s, r) => s + r.ourCosts, 0);
  const totalCustomerPrice = summaryRows.reduce((s, r) => s + r.customerPrice, 0);

  const results: { doc: jsPDF; filename: string; moqLabel: string; packLabel: string }[] = [];

  for (const r of moqResults) {
    const marginStr  = moqMargins[r.moqRow.id] ?? "";
    const marginVal  = parseFloat(marginStr);
    const hasMargin  = marginStr !== "" && !isNaN(marginVal) && marginVal < 100;
    const custPPU    = hasMargin ? r.ppuCost / (1 - marginVal / 100) : r.ppu;
    const totalRevenue = custPPU * r.ppuDenominator;

    const doc   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const L = 14, R = pageW - 14;

    const sf = (style: "normal" | "bold" | "italic" = "normal", size = 9) => {
      doc.setFont("helvetica", style);
      doc.setFontSize(size);
    };

    // ── 1. COMPANY HEADER BOX ─────────────────────────────────────────────────
    // Layout (matching sample): logo top-left, address top-right, contact lines below logo
    // Header height = 6 (top pad) + 12 (logo) + 2 (gap) + 5×4.5 (5 contact lines) + 4 (bottom pad) ≈ 46mm
    const HDR_TOP  = 10;
    const HDR_H    = 46;
    const HDR_BOT  = HDR_TOP + HDR_H;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.rect(L, HDR_TOP, pageW - L * 2, HDR_H);

    // Logo — max 70mm wide × 12mm tall, top-left
    const LOGO_Y = HDR_TOP + 5;
    let   logoDrawH = 0;
    if (logoDataUrl) {
      const dims: Record<string, [number, number]> = {
        brewglitter: [6667, 2500], jdi: [6250, 1287], bakell: [2959, 1722], pfg: [96, 95],
      };
      const [srcW, srcH] = dims[brand.id] ?? [200, 80];
      const maxW = 70, maxH = 12;
      const ratio  = Math.min(maxW / srcW, maxH / srcH);
      const drawW  = srcW * ratio;
      logoDrawH    = srcH * ratio;
      try { doc.addImage(logoDataUrl, "PNG", L + 3, LOGO_Y, drawW, logoDrawH); } catch { /* skip */ }
    }

    // Contact lines — immediately below logo with 2mm gap
    const CONTACT_START = LOGO_Y + Math.max(logoDrawH, 0) + 3;
    const contactLines: string[] = [
      `(p): ${brand.phone}`,
      `(e): ${brand.email}`,
      `Sales Rep: ${customer.salesRep || "—"}`,
      `Date: ${fmtDate(today)}`,
      `Price Good For Date: 14 days`,
    ];
    sf("normal", 8); doc.setTextColor(40, 40, 40);
    contactLines.forEach((line, i) => doc.text(line, L + 3, CONTACT_START + i * 4.5));

    // Address — top-right, bold
    sf("bold", 9); doc.setTextColor(40, 40, 40);
    doc.text(brand.address1, R - 3, HDR_TOP + 8,  { align: "right" });
    doc.text(brand.address2, R - 3, HDR_TOP + 14, { align: "right" });

    // ── 2. CUSTOMER INFO BOX ──────────────────────────────────────────────────
    let y = HDR_BOT + 5;
    doc.setDrawColor(180, 180, 180);
    doc.rect(L, y, pageW - L * 2, 28);

    const rows2: [string, string][] = [
      ["Customer:",    customer.customer   || "—"],
      ["Customer ID:", customer.customerId || "—"],
      ["Name:",        customer.name       || "—"],
      ["Phone:",       customer.phone      || "—"],
      ["Email:",       customer.email      || "—"],
    ];
    rows2.forEach(([label, val], i) => {
      sf("bold", 8.5); doc.setTextColor(40, 40, 40);
      doc.text(label, L + 3, y + 5 + i * 5);
      sf("normal", 8.5);
      doc.text(val, L + 27, y + 5 + i * 5);
    });
    sf("bold", 8.5);
    doc.text("Quote ID:", R - 55, y + 5);
    sf("normal", 8.5);
    doc.text(quoteId, R - 3, y + 5, { align: "right" });

    // ── 3. LEAD TIME TABLE ────────────────────────────────────────────────────
    y += 34;
    autoTable(doc, {
      startY: y, margin: { left: L, right: L },
      head: [["Lead Time / Delivery Dates", "Delivery Dates"]],
      body: [
        ["Estimated Lead Time (in weeks)",        leadTimeWeeks > 0 ? leadTimeWeeks.toFixed(2) : "—"],
        ["Estimated Start Date (week of)",        fmtDate(startDate)],
        ["Estimated Ship Ready Date (week of)",   fmtDate(shipDate)],
      ],
      styles:      { font: "helvetica", fontSize: 8.5, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 }, textColor: [40,40,40], fillColor: [255,255,255], lineColor: [180,180,180], lineWidth: 0.2 },
      headStyles:  { fontStyle: "bold", fillColor: [255,255,255], textColor: [40,40,40], lineWidth: 0.2 },
      columnStyles:{ 0: { halign: "left", cellWidth: "auto" }, 1: { halign: "right", cellWidth: 40 } },
      tableLineColor: [180,180,180], tableLineWidth: 0.2,
    });

    // ── 4. PRICING TABLE ──────────────────────────────────────────────────────
    y = (doc as any).lastAutoTable.finalY + 6;

    const moqQty  = parseFloat(r.moqRow.moq || "0") || 0;
    const innerQt = parseFloat(r.moqRow.unitsPerInner || "0") || 0;
    const setupRow  = summaryRows.find(sr => sr.label.toLowerCase().includes("setup"));
    const palletRow = summaryRows.find(sr => sr.label.toLowerCase().includes("pallet"));
    const colItems  = summaryTableRows.filter(str =>
      !str.label.toLowerCase().includes("material") &&
      !str.label.toLowerCase().includes("pallet") &&
      !str.label.toLowerCase().includes("setup")
    );

    const body: (string | number)[][] = [];
    if (setupRow) {
      body.push(["Project Setup, Line Dial-In & Quality Assurance", "1", fmt(setupRow.customerPrice), fmt(setupRow.customerPrice)]);
    }
    colItems.forEach((col) => {
      body.push([
        col.label,
        col.totalUnits != null ? Math.round(col.totalUnits).toLocaleString() : "0",
        col.costPerUnit != null && col.costPerUnit > 0 ? fmt(col.costPerUnit) : "$0.00",
        col.totalPrice  != null && col.totalPrice  > 0 ? fmt(col.totalPrice)  : "$0.00",
      ]);
    });
    const innerCount = innerQt > 0 ? Math.ceil(moqQty / innerQt) : 0;
    const innerRow   = summaryRows.find(sr => sr.label.toLowerCase().includes("inner") || sr.label.toLowerCase().includes("case"));
    if (innerRow || innerCount > 0) {
      const iPPU   = innerCount > 0 && innerRow ? innerRow.customerPrice / innerCount : 0;
      body.push(["Inners (case packs) - Total", String(innerCount || 0), iPPU > 0 ? fmt(iPPU) : "$0.00", innerRow ? fmt(innerRow.customerPrice) : "$0.00"]);
    }
    if (palletRow) {
      const nPal = parseFloat(formData.numFinishedPallets || "0") || 0;
      body.push(["Palletization & Outbound Staging", nPal > 0 ? String(nPal) : "—", nPal > 0 ? fmt(palletRow.customerPrice / nPal) : "$0.00", fmt(palletRow.customerPrice)]);
    }
    body.push(["TOTALS", "", custPPU > 0 ? fmt(custPPU) : "—", fmt(totalRevenue)]);

    autoTable(doc, {
      startY: y, margin: { left: L, right: L },
      head: [["Description", "Delivered Qty", "PPU", "Total"]],
      body,
      styles:     { font: "helvetica", fontSize: 8.5, cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 }, textColor: [40,40,40], fillColor: [255,255,255], lineColor: [200,200,200], lineWidth: 0.2 },
      headStyles: { fontStyle: "bold", fillColor: [255,255,255], textColor: [40,40,40], lineWidth: 0.2 },
      columnStyles: { 0: { halign: "left", cellWidth: "auto" }, 1: { halign: "right", cellWidth: 28 }, 2: { halign: "right", cellWidth: 24 }, 3: { halign: "right", cellWidth: 28 } },
      willDrawCell: (data) => {
        if (data.section === "body" && data.row.index === body.length - 1) {
          doc.setFont("helvetica", "bold");
        }
      },
      tableLineColor: [180,180,180], tableLineWidth: 0.2,
    });

    // ── 5. PROJECT OVERVIEW BOX ───────────────────────────────────────────────
    y = (doc as any).lastAutoTable.finalY + 6;
    const overviewText = customer.projectOverview ||
      `${moqQty.toLocaleString()} units. MOQ ${r.moqRow.moq}, ${r.casePack} case pack. Shipping/freight not included. Lead time is approx ${leadTimeWeeks > 0 ? leadTimeWeeks.toFixed(1) : "—"} wks.`;

    doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
    const overviewWrapped = doc.splitTextToSize(`Project Overview: ${overviewText}`, pageW - L * 2 - 8);
    const boxH = overviewWrapped.length * 5 + 8;
    doc.rect(L, y, pageW - L * 2, boxH);

    const [ar, ag, ab] = hexToRgb(brand.accent);
    const prefix = "Project Overview: ";
    sf("bold", 8.5); doc.setTextColor(ar, ag, ab);
    const prefixW = doc.getTextWidth(prefix);
    doc.text(prefix, L + 4, y + 6);
    sf("normal", 8.5); doc.setTextColor(ar, ag, ab);
    const bodyTxt  = overviewText;
    const bodyLines = doc.splitTextToSize(bodyTxt, pageW - L * 2 - 8 - prefixW);
    doc.text(bodyLines[0], L + 4 + prefixW, y + 6);
    if (bodyLines.length > 1) doc.text(bodyLines.slice(1).join("\n"), L + 4, y + 11);

    // ── 6. CANCELLATION POLICY ────────────────────────────────────────────────
    y += boxH + 6;
    sf("bold", 8.5); doc.setTextColor(40, 40, 40);
    const cancelPrefix = "Cancellation Policy: ";
    doc.text(cancelPrefix, L, y);
    const cpW = doc.getTextWidth(cancelPrefix);
    sf("normal", 8.5);
    const cancelText = "All wholesale and bulk orders are final and non-cancellable upon approval. No refunds, returns, cancellations, or modifications will be accepted thereafter.";
    const cancelLines = doc.splitTextToSize(cancelText, pageW - L * 2 - cpW);
    doc.text(cancelLines[0], L + cpW, y);
    if (cancelLines.length > 1) doc.text(cancelLines.slice(1).join("\n"), L, y + 5);

    // ── 7. DISCLAIMER FOOTER ──────────────────────────────────────────────────
    const disclaimer = "Quote Disclaimer: This document is a quotation only and does not constitute a formal offer, contract, or order. Prices and terms are subject to change without notice and are valid only for the period specified (14 days from the date hereof). All quotes are subject to product availability, credit approval, and our standard Terms and Conditions (available upon request). Acceptance of this quote requires written confirmation and may be subject to final review.";
    sf("italic", 7.5); doc.setTextColor(80, 80, 80);
    const disclaimerLines = doc.splitTextToSize(disclaimer, pageW - L * 2);
    doc.text(disclaimerLines, L, pageH - 8 - disclaimerLines.length * 4);

    const safeMoq  = (r.moqRow.moq || "moq").replace(/\s+/g, "_");
    const safePack = r.casePack.replace(/[×\s]+/g, "x").replace(/[^a-zA-Z0-9_-]/g, "");
    const filename = `Quote_${brand.label.replace(/\s+/g, "_")}_${quoteId}_MOQ${safeMoq}_${safePack}pk.pdf`;

    results.push({ doc, filename, moqLabel: r.moqRow.moq || "—", packLabel: r.casePack });
  }

  return results;
}

// ── Preview: returns blob URLs (no download) ──────────────────────────────────
export async function buildQuotePreviews(args: QuoteArgs): Promise<QuotePreview[]> {
  const docs = await buildDocs(args);
  return docs.map(({ doc, filename, moqLabel, packLabel }) => {
    const blob    = doc.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    return { filename, moqLabel, packLabel, blobUrl, doc };
  });
}

// ── Download: saves all PDFs directly ────────────────────────────────────────
export async function generateQuotePDFs(args: QuoteArgs): Promise<void> {
  const docs = await buildDocs(args);
  docs.forEach(({ doc, filename }) => doc.save(filename));
}
