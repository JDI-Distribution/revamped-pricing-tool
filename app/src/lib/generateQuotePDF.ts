import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { MoqPricingRow } from "./ProjectContext";
import { SummaryRow, SummaryTableRow } from "./types";

// Resolve base path: Catalyst hosts at /app/, local dev serves from /
const BASE = import.meta.env.BASE_URL ?? "/";
const LOGO_SRCS: Record<string, string> = {
  jdi:         `${BASE}logo_jdi.png`,
  brewglitter: `${BASE}logo_brewglitter.png`,
  bakell:      `${BASE}logo_bakell.png`,
  pfg:         `${BASE}logo_pfg.png`,
};

// ── Brand definitions ─────────────────────────────────────────────────────────
export const BRANDS = [
  { id: "jdi",         label: "JDI Distribution", accent: "#e8473f", phone: "1-800-000-0000", email: "sales@jdidistribution.com", address1: "1967 Essex Ct", address2: "Redlands, CA 92373" },
  { id: "brewglitter", label: "Brew Glitter",      accent: "#c0932b", phone: "1-800-292-2137", email: "sales@brewglitter.com",    address1: "1967 Essex Ct", address2: "Redlands, CA 92373" },
  { id: "bakell",      label: "Bakell",            accent: "#d45f8a", phone: "1-800-000-0000", email: "sales@bakell.com",         address1: "1967 Essex Ct", address2: "Redlands, CA 92373" },
  { id: "pfg",         label: "Pro Foods Group",   accent: "#2e6faf", phone: "1-800-000-0000", email: "sales@profoods.com",       address1: "1967 Essex Ct", address2: "Redlands, CA 92373" },
] as const;

export type BrandId = typeof BRANDS[number]["id"];

export interface CustomerInfo {
  customer:        string;
  customerId:      string;
  name:            string;
  phone:           string;
  email:           string;
  salesRep:        string;
  productName:     string;
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
  formData:         { startDate: string; leadTimeBufferDays: string; ppuDenominator: string; outboundFee: string; outboundFeeMarkup: string; palletBuffer: string };
  customer:         CustomerInfo;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });

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

async function loadImageAsDataUrl(src: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const MAX_W = 400;
      const scale = Math.min(1, MAX_W / img.naturalWidth);
      const w = Math.round(img.naturalWidth  * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.7), width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ── Core builder ──────────────────────────────────────────────────────────────
async function buildDocs(args: QuoteArgs): Promise<{ doc: jsPDF; filename: string; moqLabel: string; packLabel: string }[]> {
  const { brandId, moqResults, moqMargins, summaryRows, summaryTableRows, formData, customer } = args;
  const brand      = BRANDS.find((b) => b.id === brandId)!;
  const quoteId    = generateQuoteId();
  const today      = new Date();
  const logoDataUrl = await loadImageAsDataUrl(LOGO_SRCS[brand.id]);

  // Lead time — pick the longest non-summary week value
  const indivRow      = summaryTableRows.find(r => r.leadTimeWeeks != null && !r.isLeadTimeSummary && r.leadTimeWeeks > 0);
  const totalLTRow    = summaryTableRows.find(r => r.isLeadTimeSummary && r.label === "Estimated Total Lead Time");
  const leadTimeWeeks = totalLTRow?.leadTimeWeeks ?? indivRow?.leadTimeWeeks ?? 0;
  const startDate     = formData.startDate ? new Date(formData.startDate + "T00:00:00") : today;
  const shipDate      = addBusinessDays(startDate, leadTimeWeeks * 5);

  // Accent colour
  const [ar, ag, ab] = hexToRgb(brand.accent);

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
    const L = 14;           // left margin
    const R = pageW - L;    // right edge
    const W = pageW - 2*L;  // usable width

    // Typography helpers
    const sf = (style: "normal" | "bold" | "italic" = "normal", size = 10) => {
      doc.setFont("helvetica", style);
      doc.setFontSize(size);
    };
    const gray    = [40, 40, 40]  as [number,number,number];
    const ltGray  = [180,180,180] as [number,number,number];
    const rowGray = [245,245,245] as [number,number,number];

    // ── Section 1 — Header Box ────────────────────────────────────────────────
    // Height: top pad + logo(~14mm) + gap + 5 contact lines(×4.5mm) + bottom pad
    const HDR_TOP = 10;
    const HDR_H   = 50;
    const HDR_BOT = HDR_TOP + HDR_H;

    doc.setDrawColor(...ltGray);
    doc.setLineWidth(0.3);
    doc.rect(L, HDR_TOP, W, HDR_H);

    // Logo (top-left inside box, max 70mm wide × 14mm tall)
    const LOGO_X = L + 3;
    const LOGO_Y = HDR_TOP + 4;
    let logoDrawH = 0;
    if (logoDataUrl) {
      const { dataUrl, width: srcW, height: srcH } = logoDataUrl;
      const maxW = 70, maxH = 14;
      const ratio = Math.min(maxW / srcW, maxH / srcH);
      const drawW = srcW * ratio;
      logoDrawH   = srcH * ratio;
      try { doc.addImage(dataUrl, "JPEG", LOGO_X, LOGO_Y, drawW, logoDrawH); } catch { /* skip */ }
    }

    // Contact lines below logo (10pt body)
    const CONTACT_Y = LOGO_Y + Math.max(logoDrawH, 6) + 3;
    const contactLines = [
      `(p): ${brand.phone}`,
      `(e): ${brand.email}`,
      `Sales Rep: ${customer.salesRep || "—"}`,
      `Date: ${fmtDate(today)}`,
      `Price Good For Date: 14 days`,
    ];
    sf("normal", 10); doc.setTextColor(...gray);
    contactLines.forEach((line, i) => doc.text(line, LOGO_X, CONTACT_Y + i * 4.5));

    // Address top-right (11pt, right-aligned)
    sf("normal", 11); doc.setTextColor(...gray);
    doc.text(brand.address1, R - 3, HDR_TOP + 9,  { align: "right" });
    doc.text(brand.address2, R - 3, HDR_TOP + 15, { align: "right" });

    // ── Section 2 — Customer Info Box ─────────────────────────────────────────
    let y = HDR_BOT + 5;
    const CUST_H = 30;
    doc.setDrawColor(...ltGray);
    doc.rect(L, y, W, CUST_H);

    const custFields: [string, string][] = [
      ["Customer:",    customer.customer   || "—"],
      ["Customer ID:", customer.customerId || "—"],
      ["Name:",        customer.name       || "—"],
      ["Phone:",       customer.phone      || "—"],
      ["Email:",       customer.email      || "—"],
    ];
    const LBL_W = 26; // width reserved for bold label
    custFields.forEach(([label, val], i) => {
      const cy = y + 5 + i * 5;
      sf("bold", 10); doc.setTextColor(...gray);
      doc.text(label, L + 3, cy);
      sf("normal", 10);
      doc.text(val, L + 3 + LBL_W, cy);
    });

    // Quote ID — right side, larger text
    sf("bold", 10); doc.setTextColor(...gray);
    doc.text("Quote ID:", R - 55, y + 8);
    sf("bold", 12); doc.setTextColor(...gray);
    doc.text(quoteId, R - 3, y + 8, { align: "right" });

    // ── Section 3 — Lead Time Table ───────────────────────────────────────────
    y += CUST_H + 5;
    autoTable(doc, {
      startY: y, margin: { left: L, right: L },
      head: [["Lead Time / Delivery Dates", "Delivery Dates"]],
      body: [
        ["Estimated Lead Time (in weeks)",        leadTimeWeeks > 0 ? leadTimeWeeks.toFixed(2) : "—"],
        ["Estimated Start Date (week of)",        fmtDate(startDate)],
        ["Estimated Ship Ready Date (week of)",   fmtDate(shipDate)],
      ],
      styles: {
        font: "helvetica", fontSize: 10,
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
        textColor: gray, lineColor: ltGray, lineWidth: 0.2,
        fillColor: [255,255,255],
      },
      headStyles: { fontStyle: "bold", fillColor: [255,255,255], textColor: gray },
      // Alternating row backgrounds
      alternateRowStyles: { fillColor: rowGray },
      columnStyles: {
        0: { halign: "left",  cellWidth: "auto" },
        1: { halign: "right", cellWidth: 42 },
      },
      tableLineColor: ltGray, tableLineWidth: 0.2,
    });

    // ── Section 4 — Line Items / Pricing Table ────────────────────────────────
    y = (doc as any).lastAutoTable.finalY + 5;

    const moqQty  = parseFloat(r.moqRow.moq || "0") || 0;
    const innerQt = parseFloat(r.moqRow.unitsPerInner || "0") || 0;

    const setupRow  = summaryRows.find(sr => sr.label.toLowerCase().includes("setup"));
    const palletRow = summaryRows.find(sr => sr.label.toLowerCase().includes("pallet"));
    // Packaging columns — exclude materials, pallets, setup, lead-time summaries
    const colItems  = summaryTableRows.filter(str =>
      !str.isLeadTimeSummary &&
      !str.label.toLowerCase().includes("material") &&
      !str.label.toLowerCase().includes("pallet") &&
      !str.label.toLowerCase().includes("setup")
    );

    const body: (string | number)[][] = [];
    if (setupRow) {
      body.push(["Project Setup, Line Dial-In & Quality Assurance", "1", fmt(setupRow.customerPrice), fmt(setupRow.customerPrice)]);
    }
    colItems.forEach((col) => {
      const qty = col.totalUnits != null ? Math.round(col.totalUnits).toLocaleString() : "0";
      const ppu = col.costPerUnit != null && col.costPerUnit > 0 ? fmt(col.costPerUnit) : "$0.00";
      const tot = col.totalPrice  != null && col.totalPrice  > 0 ? fmt(col.totalPrice)  : "$0.00";
      body.push([col.label, qty, ppu, tot]);
    });
    const innerCount = innerQt > 0 ? Math.ceil(moqQty / innerQt) : 0;
    const innerRow   = summaryRows.find(sr => sr.label.toLowerCase().includes("inner") || sr.label.toLowerCase().includes("case"));
    if (innerRow || innerCount > 0) {
      const iPPU = innerCount > 0 && innerRow ? innerRow.customerPrice / innerCount : 0;
      body.push([
        "Inners (case packs) - Total",
        String(innerCount || 0),
        iPPU > 0 ? fmt(iPPU) : "$0.00",
        innerRow ? fmt(innerRow.customerPrice) : "$0.00",
      ]);
    }
    if (palletRow) {
      // Derive pallet count from outbound fee (auto-calculated, not stored in formData).
      const outFee = parseFloat(formData.outboundFee || "0") || 0;
      const outMkp = parseFloat(formData.outboundFeeMarkup || "0") || 0;
      const feePerPallet = outFee > 0 ? outFee * (1 + outMkp / 100) : 0;
      const nPal = (feePerPallet > 0 && palletRow.customerPrice > 0)
        ? Math.round(palletRow.customerPrice / feePerPallet)
        : 0;
      const palPPU = nPal > 0 ? fmt(palletRow.customerPrice / nPal) : "$0.00";
      body.push(["Palletization & Outbound Staging", nPal > 0 ? String(nPal) : "—", palPPU, fmt(palletRow.customerPrice)]);
    }
    // TOTALS row — bold 11pt
    body.push(["TOTALS", "", custPPU > 0 ? fmt(custPPU) : "—", fmt(totalRevenue)]);
    const totalsIdx = body.length - 1;

    autoTable(doc, {
      startY: y, margin: { left: L, right: L },
      head: [["Description", "Delivered Qty", "PPU", "Total"]],
      body,
      styles: {
        font: "helvetica", fontSize: 10,
        cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
        textColor: gray, lineColor: ltGray, lineWidth: 0.2,
        fillColor: [255,255,255],
        minCellHeight: 7,
      },
      headStyles: { fontStyle: "bold", fillColor: [255,255,255], textColor: gray },
      columnStyles: {
        0: { halign: "left",  cellWidth: "auto" },
        1: { halign: "right", cellWidth: 28 },
        2: { halign: "right", cellWidth: 26 },
        3: { halign: "right", cellWidth: 28 },
      },
      willDrawCell: (data) => {
        if (data.section === "body" && data.row.index === totalsIdx) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(...gray);
        }
      },
      tableLineColor: ltGray, tableLineWidth: 0.2,
    });

    // ── Section 5 — Project Overview Box ─────────────────────────────────────
    y = (doc as any).lastAutoTable.finalY + 5;
    const overviewText = customer.projectOverview ||
      `${moqQty.toLocaleString()} units. MOQ ${r.moqRow.moq}, ${r.casePack} case pack. Shipping/freight not included. Lead time is approx ${leadTimeWeeks > 0 ? leadTimeWeeks.toFixed(1) : "—"} wks.`;

    const prefix    = "Project Overview:  ";
    sf("bold", 10); doc.setTextColor(ar, ag, ab);
    const prefixW   = doc.getTextWidth(prefix);
    const bodyWrapped = doc.splitTextToSize(overviewText, W - 8 - prefixW);
    // Total box height: top pad + first line + any continuation lines + bottom pad
    const overviewH = 8 + Math.max(bodyWrapped.length - 1, 0) * 5;

    // Yellow/cream fill
    doc.setFillColor(255, 253, 231);  // #FFFDE7
    doc.setDrawColor(...ltGray);
    doc.setLineWidth(0.3);
    doc.rect(L, y, W, overviewH, "FD");

    // "Project Overview:" in brand accent, bold
    sf("bold", 10); doc.setTextColor(ar, ag, ab);
    doc.text(prefix, L + 4, y + 6);

    // Body text in dark gray, normal weight, same line
    sf("normal", 10); doc.setTextColor(...gray);
    doc.text(bodyWrapped[0], L + 4 + prefixW, y + 6);
    if (bodyWrapped.length > 1) {
      doc.text(bodyWrapped.slice(1), L + 4, y + 11);
    }

    // ── Section 6 — Cancellation Policy ──────────────────────────────────────
    y += overviewH + 6;
    const cancelPolicy = "All wholesale and bulk orders are final and non-cancellable upon approval. No refunds, returns, cancellations, or modifications will be accepted thereafter.";
    const cancelPrefix = "Cancellation Policy:  ";
    sf("bold", 10); doc.setTextColor(...gray);
    doc.text(cancelPrefix, L, y);
    const cpW = doc.getTextWidth(cancelPrefix);
    sf("normal", 10);
    const cancelLines = doc.splitTextToSize(cancelPolicy, W - cpW);
    doc.text(cancelLines[0], L + cpW, y);
    if (cancelLines.length > 1) doc.text(cancelLines.slice(1), L, y + 5);

    // ── Section 7 — Disclaimer Footer ────────────────────────────────────────
    const disclaimer = "Quote Disclaimer: This document is a quotation only and does not constitute a formal offer, contract, or order. Prices and terms are subject to change without notice and are valid only for the period specified (14 days from the date hereof). All quotes are subject to product availability, credit approval, and our standard Terms and Conditions (available upon request). Acceptance of this quote requires written confirmation and may be subject to final review.";
    sf("italic", 8); doc.setTextColor(90, 90, 90);
    const disclaimerLines = doc.splitTextToSize(disclaimer, W);
    doc.text(disclaimerLines, L, pageH - 6 - disclaimerLines.length * 3.8);

    // ── Filename ──────────────────────────────────────────────────────────────
    const safe = (s: string) => s.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
    const safeMoq  = safe(r.moqRow.moq || "MOQ");
    const safePack = r.casePack.replace(/[×\s]+/g, "x").replace(/[^a-zA-Z0-9_-]/g, "");
    const filename = [
      safe(customer.customer   || "Customer"),
      safe(customer.productName || "Product"),
      safe(brand.label),
      `${safeMoq}_${safePack}pk`,
    ].join("_") + ".pdf";

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

// ── Custom quantity preview ───────────────────────────────────────────────────
export interface CustomQtyQuoteArgs {
  brandId:          BrandId;
  qty:              number;
  unitsPerInner:    number;
  ppuCost:          number;
  custPPU:          number;
  summaryRows:      SummaryRow[];
  summaryTableRows: SummaryTableRow[];
  formData:         QuoteArgs["formData"];
  customer:         CustomerInfo;
}

export async function buildCustomQtyPreview(args: CustomQtyQuoteArgs): Promise<QuotePreview> {
  const { brandId, qty, unitsPerInner, ppuCost, custPPU, summaryRows, summaryTableRows, formData, customer } = args;

  const syntheticMoqResult: MoqPricingRow = {
    moqRow: {
      id:              -999,
      moq:             String(qty),
      individualUnits: String(qty),
      unitsPerInner:   String(unitsPerInner),
      innersPerMaster: "0",
    },
    casePack:           String(unitsPerInner),
    totalCustomerPrice: custPPU * qty,
    totalOurCost:       ppuCost * qty,
    ppuDenominator:     qty,
    ppu:                custPPU,
    ppuCost:            ppuCost,
    marginDollars:      (custPPU - ppuCost) * qty,
    marginPct:          custPPU > 0 ? ((custPPU - ppuCost) / custPPU) * 100 : 0,
  };

  const impliedMargin = custPPU > 0 && ppuCost > 0
    ? ((custPPU - ppuCost) / custPPU) * 100
    : 0;

  const docs = await buildDocs({
    brandId,
    moqResults:    [syntheticMoqResult],
    moqMargins:    { [-999]: impliedMargin.toFixed(4) },
    summaryRows,
    summaryTableRows,
    formData,
    customer,
  });

  const { doc, filename, moqLabel, packLabel } = docs[0];
  const blob    = doc.output("blob");
  const blobUrl = URL.createObjectURL(blob);
  return { filename, moqLabel, packLabel, blobUrl, doc };
}
