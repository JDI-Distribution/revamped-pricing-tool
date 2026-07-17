import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { MoqPricingRow } from "./ProjectContext";
import { SummaryRow, SummaryTableRow, TestingRow } from "./types";

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
  customer:         string;
  customerId:       string;
  name:             string;
  phone:            string;
  email:            string;
  salesRep:         string;
  productName:      string;
  productCategory:  string;
  projectOverview:  string;
  ltOverrides?:        string[];
  lineItemOverrides?:  (string | null)[][];
}

export interface AutoTableSnapshot {
  body: { cells: { x: number; y: number; width: number; height: number; raw: string }[] }[];
  finalY: number;
}

export interface QuotePreview {
  filename:        string;
  blobUrl:         string;
  moqLabel:        string;
  packLabel:       string;
  doc:             jsPDF;
  leadTimeTable?:  AutoTableSnapshot;
  pricingTable?:   AutoTableSnapshot;
  overviewBox?:    { xMm: number; yMm: number; wMm: number; hMm: number; prefixWMm: number };
}

export interface OverviewLineItem {
  desc:  string;
  qty:   number | null;
  total: number;
}

type QuoteArgs = {
  brandId:          BrandId;
  moqResults:       MoqPricingRow[];
  moqMargins:       Record<number, string>;
  whatIfPpus?:      Record<number, string>;
  summaryRows:      SummaryRow[];
  summaryTableRows: SummaryTableRow[];
  deliveredQtys?:   number[];
  primaryProductName?: string;
  overviewLineItems?: OverviewLineItem[];  // pre-computed line items from QuotePage Overview table
  adjustedRevenue?:  number;
  adjustedPPU?:      number;
  ppuDenominator?:   number;
  formData:         {
    startDate: string; leadTimeBufferDays: string; ppuDenominator: string;
    outboundFee: string; outboundFeeMarkup: string; palletBuffer: string;
    unitWeight?: string; unitWeightUnit?: string;
    testingEnabled?: string; testingRows?: TestingRow[]; testingMarkup?: string; numSkus?: string;
    intakeFee?: string; intakeFeeMarkup?: string; numPallets?: string; numIntakePallets?: string;
  };
  customer:         CustomerInfo;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });

function fmtPPU(v: number): string {
  if (!isFinite(v)) return "$0.00";
  if (Math.abs(v) < 1) {
    return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
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

function syntheticBaseRow(summaryRows: SummaryRow[], ppuDenominator: number): MoqPricingRow {
  const totalCustomer = summaryRows.reduce((s, r) => s + r.customerPrice, 0);
  const totalOur      = summaryRows.reduce((s, r) => s + r.ourCosts, 0);
  const denom         = ppuDenominator > 0 ? ppuDenominator : 1;
  const ppu           = totalCustomer / denom;
  const ppuCost       = totalOur / denom;
  return {
    moqRow: { id: 0, moq: "Base", individualUnits: String(denom), unitsPerInner: "0", innersPerMaster: "0" },
    casePack:           "—",
    totalCustomerPrice: totalCustomer,
    totalOurCost:       totalOur,
    ppuDenominator:     denom,
    ppu,
    ppuCost,
    marginDollars:      totalCustomer - totalOur,
    marginPct:          totalCustomer > 0 ? ((totalCustomer - totalOur) / totalCustomer) * 100 : 0,
  };
}

// ── Core builder ──────────────────────────────────────────────────────────────
async function buildDocs(args: QuoteArgs): Promise<{ doc: jsPDF; filename: string; moqLabel: string; packLabel: string; leadTimeTable?: AutoTableSnapshot; pricingTable?: AutoTableSnapshot; overviewBox?: QuotePreview["overviewBox"] }[]> {
  const { brandId, moqMargins, whatIfPpus = {}, summaryRows, summaryTableRows,
          deliveredQtys = [], primaryProductName = "", formData, customer,
          overviewLineItems, adjustedRevenue, adjustedPPU, ppuDenominator: argPpuDenominator } = args;
  const moqResults = args.moqResults.length > 0
    ? args.moqResults
    : [syntheticBaseRow(summaryRows, parseFloat(formData.ppuDenominator) || 1)];
  const brand      = BRANDS.find((b) => b.id === brandId)!;
  const quoteId    = generateQuoteId();
  const today      = new Date();
  const logoDataUrl = await loadImageAsDataUrl(LOGO_SRCS[brand.id]);
  if (!logoDataUrl) console.error(`[PDF] Logo failed to load for brand "${brand.id}" from ${LOGO_SRCS[brand.id]}`);

  const indivRow      = summaryTableRows.find(r => r.leadTimeWeeks != null && !r.isLeadTimeSummary && r.leadTimeWeeks > 0);
  const totalLTRow    = summaryTableRows.find(r => r.isLeadTimeSummary && r.label === "Estimated Total Lead Time");
  const leadTimeWeeks = totalLTRow?.leadTimeWeeks ?? indivRow?.leadTimeWeeks ?? 0;
  const startDate     = formData.startDate ? new Date(formData.startDate + "T00:00:00") : today;
  const shipDate      = addBusinessDays(startDate, leadTimeWeeks * 5);

  void primaryProductName; // used in line items below

  void hexToRgb(brand.accent); // accent available for future tinting

  const results: { doc: jsPDF; filename: string; moqLabel: string; packLabel: string; leadTimeTable?: AutoTableSnapshot; pricingTable?: AutoTableSnapshot; overviewBox?: QuotePreview["overviewBox"] }[] = [];

  for (const r of moqResults) {
    const wiPpuStr   = whatIfPpus[r.moqRow.id];
    const wiPpu      = wiPpuStr !== undefined && wiPpuStr !== "" ? parseFloat(wiPpuStr) : 0;
    const marginStr  = moqMargins[r.moqRow.id] ?? "";
    const marginVal  = parseFloat(marginStr);
    const hasMargin  = marginStr !== "" && !isNaN(marginVal) && marginVal < 100;
    const custPPU    = wiPpu > 0 ? wiPpu
                     : hasMargin ? r.ppuCost / (1 - marginVal / 100)
                     : r.ppu;
    const totalRevenue = custPPU * r.ppuDenominator;

    const moqQty         = parseFloat(r.moqRow.moq || "0") || 0;
    const primaryDelivQty = (deliveredQtys.length > 0 && deliveredQtys[0] > 0)
      ? deliveredQtys[0]
      : moqQty;
    const totalPPU = custPPU;

    const doc   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const L = 14;
    const R = pageW - L;
    const W = pageW - 2*L;

    // Color palette
    const gray     = [30,  30,  30]  as [number,number,number];
    const midGray  = [100, 100, 100] as [number,number,number];
    const ltGray   = [200, 200, 200] as [number,number,number];
    const rowEven  = [250, 250, 250] as [number,number,number];

    const sf = (style: "normal" | "bold" | "italic" = "normal", size = 9) => {
      doc.setFont("helvetica", style);
      doc.setFontSize(size);
    };

    // Spaced-letter section header (like Bakell: "Q U O T E  D E T A I L S")
    const sectionLabel = (text: string, x: number, y: number, align: "left" | "right" | "center" = "left") => {
      const spaced = text.toUpperCase().split("").join(" ");
      sf("bold", 7);
      doc.setTextColor(...midGray);
      doc.text(spaced, x, y, { align });
    };

    // Thin full-width rule
    const rule = (y: number, color: [number,number,number] = ltGray, width = 0.25) => {
      doc.setDrawColor(...color);
      doc.setLineWidth(width);
      doc.line(L, y, R, y);
    };

    let y = 14;

    // ── LOGO (top-left) ───────────────────────────────────────────────────────
    if (logoDataUrl) {
      const { dataUrl, width: srcW, height: srcH } = logoDataUrl;
      const maxW = 52, maxH = 16;
      const ratio  = Math.min(maxW / srcW, maxH / srcH);
      const drawW  = srcW * ratio;
      const drawH  = srcH * ratio;
      try { doc.addImage(dataUrl, "JPEG", L, y, drawW, drawH); } catch { /* skip */ }
    }

    // ── QUOTE ID (top-right) ──────────────────────────────────────────────────
    sf("normal", 7); doc.setTextColor(...midGray);
    doc.text("Quote ID:", R, y + 3, { align: "right" });
    sf("bold", 11); doc.setTextColor(...gray);
    doc.text(quoteId, R, y + 9, { align: "right" });

    y += 22;
    rule(y);

    // ── QUOTE DETAILS — two-column grid ──────────────────────────────────────
    y += 5;
    sectionLabel("Quote Details", L, y);
    y += 5;
    rule(y);
    y += 4;

    const colMid = L + W / 2;  // midpoint for two-column layout

    // Left column: customer info
    const leftFields: [string, string][] = [
      ["CUSTOMER",     customer.customer   || "—"],
      ["CUSTOMER ID",  customer.customerId || "—"],
      ["NAME",         customer.name       || "—"],
      ["PHONE",        customer.phone      || "—"],
      ["EMAIL",        customer.email      || "—"],
    ];
    const validThrough = new Date(today);
    validThrough.setDate(validThrough.getDate() + 14);

    // Right column: quote meta
    const rightFields: [string, string][] = [
      ["DATE ISSUED",  fmtDate(today)],
      ["VALID FOR",    `14 Days (${fmtDate(validThrough)})`],
      ["SALES REP",    customer.salesRep || "—"],
      ["PHONE",        brand.phone],
      ["EMAIL",        brand.email],
    ];

    const fieldLineH = 10.5;   // allows wrapped values without clipping
    const drawField = (label: string, val: string, x: number, fy: number, maxW: number) => {
      sf("bold", 7); doc.setTextColor(...midGray);
      doc.text(label, x, fy);
      sf("normal", 9); doc.setTextColor(...gray);
      const wrapped = doc.splitTextToSize(val, maxW).slice(0, 2);
      doc.text(wrapped, x, fy + 3.5);
    };

    const colW = W / 2 - 4;
    const drawInfoColumn = (fields: [string, string][], x: number, startY: number, width: number, boxed = false) => {
      const prepared = fields.map(([label, val]) => ({
        label,
        lines: doc.splitTextToSize(val, boxed ? width - 5 : width).slice(0, 3) as string[],
      }));
      const boxH = prepared.reduce((sum, item) => sum + 4.2 + item.lines.length * 3.8 + 2, 4);
      if (boxed) {
        doc.setFillColor(249, 250, 251);
        doc.roundedRect(x - 2.5, startY - 4, width + 5, boxH, 1.2, 1.2, "F");
      }

      let cy = startY;
      prepared.forEach(({ label, lines }) => {
        sf("bold", 6.8); doc.setTextColor(...midGray);
        doc.text(label, x, cy);
        sf("normal", 8.7); doc.setTextColor(...gray);
        doc.text(lines, x, cy + 3.4);
        cy += 4.2 + lines.length * 3.8 + 2;
      });
      return cy;
    };

    const leftBottom  = drawInfoColumn(leftFields, L, y, colW);
    const rightBottom = drawInfoColumn(rightFields, colMid, y, colW, true);

    y = Math.max(leftBottom, rightBottom) + 2;
    rule(y);

    // ── PROJECT OVERVIEW ──────────────────────────────────────────────────────
    y += 5;
    sectionLabel("Project Overview", L, y);
    y += 5;
    rule(y);
    y += 4;

    const unitSizeG  = parseFloat(formData.unitWeight || "0") || 0;
    const unitLabel  = formData.unitWeightUnit || "g";
    const overviewFields: [string, string][] = [
      ["PRODUCT NAME",               customer.productName || primaryProductName || "—"],
      ["PRODUCT CATEGORY",           customer.productCategory || "—"],
      [`UNIT / EA SIZE (${unitLabel.toUpperCase()})`, unitSizeG > 0 ? `${unitSizeG} ${unitLabel}` : "—"],
    ];

    overviewFields.forEach(([label, val], i) => {
      const fy = y + i * fieldLineH;
      drawField(label, val, L, fy, colW);
    });

    // ── Packaging breakdown — single line with arrows (right column) ──
    const packRows = summaryTableRows.filter(str => !str.isLeadTimeSummary && (str.totalUnits ?? 0) > 0);
    const overviewBoxSnapshot: QuotePreview["overviewBox"] | undefined = undefined;
    const maxPackagingLineW = W / 2 - 2;
    const packagingDisplayLines = packRows.flatMap((row, index) => {
      const lbl = row.label.replace(/ & Fees$/i, "");
      const qty = Math.round(row.totalUnits ?? 0).toLocaleString();
      const prefix = index === 0 ? "" : "-> ";
      return doc.splitTextToSize(`${prefix}${lbl}: ${qty}`, maxPackagingLineW) as string[];
    });
    if (packRows.length > 0) {
      sf("bold", 7); doc.setTextColor(...midGray);
      doc.text("PACKAGING STRUCTURE", colMid, y);

      const wrapped = packagingDisplayLines;
      sf("normal", 8); doc.setTextColor(...gray);
      wrapped.forEach((line: string, li: number) => {
        doc.text(line, colMid, y + 4.5 + li * 4.4);
      });
    } else if (customer.projectOverview) {
      // fallback: custom text paragraph
      sf("normal", 8.5); doc.setTextColor(...midGray);
      const ovWrapped = doc.splitTextToSize(customer.projectOverview, W / 2 - 4);
      ovWrapped.forEach((line: string, li: number) => {
        doc.text(line, colMid, y + li * 4.2);
      });
    }

    const packagingLines = packagingDisplayLines.length;
    const overviewSectionH = Math.max(overviewFields.length * fieldLineH, packRows.length > 0 ? 8 + packagingLines * 4.4 + 4 : 0);
    y += overviewSectionH + 4;
    rule(y);

    // ── Page-break helper ─────────────────────────────────────────────────────
    // ── PRICING BREAKDOWN ─────────────────────────────────────────────────────
    y += 7;

    const body: string[][] = [];

    if (overviewLineItems && overviewLineItems.length > 0) {
      // Use pre-computed Overview line items from QuotePage
      for (const item of overviewLineItems) {
        const qtyStr = item.qty != null ? Math.round(item.qty).toLocaleString() : "—";
        const ppu    = item.qty && item.qty > 0 ? item.total / item.qty : item.total;
        body.push([item.desc, qtyStr, fmtPPU(ppu), fmt(item.total)]);
      }
    } else {
      // Fallback: build from summaryRows (legacy path)
      const setupRow    = summaryRows.find(sr => sr.label.toLowerCase().includes("setup"));
      const materialRow = summaryRows.find(sr => sr.label.toLowerCase().includes("material"));
      const palletRow   = summaryRows.find(sr => sr.label.toLowerCase().includes("pallet"));
      const colItems    = summaryTableRows.filter(str =>
        !str.isLeadTimeSummary &&
        !str.label.toLowerCase().includes("material") &&
        !str.label.toLowerCase().includes("pallet") &&
        !str.label.toLowerCase().includes("setup") &&
        !str.label.toLowerCase().startsWith("testing –")
      );
      const palletSTR  = summaryTableRows.find(str => str.label.toLowerCase().includes("pallet") && !str.isLeadTimeSummary);
      const primaryCol = colItems[0];

      if (setupRow) {
        body.push(["Project Setup, Line Dial-In & Quality Assurance", "1", fmtPPU(setupRow.customerPrice), fmt(setupRow.customerPrice)]);
      }
      {
        const matCx     = materialRow?.customerPrice ?? 0;
        const primCx    = primaryCol?.totalPrice ?? 0;
        const combTotal = matCx + primCx;
        const combDeliv = primaryDelivQty > 0 ? primaryDelivQty : 1;
        const combPPU   = combDeliv > 0 ? combTotal / combDeliv : 0;
        const primName  = primaryCol?.label || customer.productName || primaryProductName || "Primary Fill";
        body.push([`Product Filling, Handling & Intake - ${primName}`, Math.round(combDeliv).toLocaleString(), fmtPPU(combPPU), fmt(combTotal)]);
      }
      const testingSTRs = summaryTableRows.filter(str => str.label.toLowerCase().startsWith("testing –"));
      const nSkus = parseInt(formData.numSkus ?? "1", 10) || 1;
      for (const t of testingSTRs) {
        const cx = t.totalPrice ?? 0;
        body.push([`Testing & Documentation – ${t.label.replace(/^testing\s*[–-]\s*/i, "")}`, `${nSkus} SKUs`, fmtPPU(nSkus > 0 ? cx / nSkus : 0), fmt(cx)]);
      }
      colItems.slice(1).forEach((col) => {
        const delivQty = col.totalUnits ?? 0;
        const totalPrice = col.totalPrice ?? 0;
        body.push([`${col.label} - Total`, delivQty > 0 ? Math.round(delivQty).toLocaleString() : "—", fmtPPU(delivQty > 0 ? totalPrice / delivQty : 0), fmt(totalPrice)]);
      });
      if (palletRow) {
        const nPal  = palletSTR?.totalUnits != null ? Math.round(palletSTR.totalUnits) : 0;
        const palCx = palletRow.customerPrice;
        body.push(["Palletization & Outbound Staging", nPal > 0 ? String(nPal) : "—", fmtPPU(nPal > 0 ? palCx / nPal : 0), fmt(palCx)]);
      }
    }

    // Apply PDF editor line-item overrides
    const liOv = customer.lineItemOverrides ?? [];
    if (liOv.length > 0) {
      body.forEach((row, ri) => {
        const rowOv = liOv[ri];
        if (!rowOv) return;
        rowOv.forEach((val, ci) => { if (val !== null && val !== undefined && val !== "") row[ci] = val; });
      });
    }

    // Totals row
    const finalRevenue  = adjustedRevenue ?? totalRevenue;
    const finalPPU      = adjustedPPU ?? totalPPU;
    const finalDenom    = argPpuDenominator ?? r.ppuDenominator;
    void finalDenom;
    const totalsRowOv   = liOv[body.length];
    const totalsTotal   = (totalsRowOv?.[3] && totalsRowOv[3] !== "") ? totalsRowOv[3] : fmt(finalRevenue);
    body.push(["TOTALS", "", fmtPPU(finalPPU), totalsTotal]);
    const totalsIdx = body.length - 1;

    // Estimate full table height: header (8mm) + each row (~8mm each, some wrap to 2 lines)
    // + section label (10mm) — force new page if it won't all fit
    sectionLabel("Pricing Breakdown", L, y);
    y += 5;

    const compactPricing = body.length > 7;
    autoTable(doc, {
      startY: y, margin: { left: L, right: L },
      head: [["Description", "Quantity", "Unit Price", "Total"]],
      body,
      styles: {
        font: "helvetica", fontSize: compactPricing ? 7.4 : 8,
        cellPadding: compactPricing
          ? { top: 1.4, bottom: 1.4, left: 2.5, right: 2.5 }
          : { top: 1.8, bottom: 1.8, left: 3, right: 3 },
        textColor: gray, lineColor: ltGray, lineWidth: 0.2,
        fillColor: [255, 255, 255],
        minCellHeight: compactPricing ? 4.8 : 5.4,
      },
      headStyles: {
        fontStyle: "bold", fontSize: compactPricing ? 7.2 : 7.6,
        fillColor: [240, 240, 240],
        textColor: midGray,
        halign: "left",
      },
      alternateRowStyles: { fillColor: rowEven },
      columnStyles: {
        0: { halign: "left",  cellWidth: "auto" },
        1: { halign: "left", cellWidth: 26 },
        2: { halign: "left", cellWidth: 28 },
        3: { halign: "left", cellWidth: 28 },
      },
      willDrawCell: (data) => {
        if (data.section === "body" && data.row.index === totalsIdx) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9.5);
          doc.setTextColor(...gray);
        }
      },
      pageBreak: "auto",
      rowPageBreak: "avoid",
      tableLineColor: ltGray, tableLineWidth: 0.2,
    });
    const pricingSnapshot: AutoTableSnapshot = {
      body: (doc as any).lastAutoTable.body.map((row: any) => ({
        cells: Object.values(row.cells).map((c: any) => ({ x: c.x, y: c.y, width: c.width, height: c.height, raw: String(c.raw ?? "") })),
      })),
      finalY: (doc as any).lastAutoTable.finalY,
    };

    // ── TIMELINE & DELIVERY ───────────────────────────────────────────────────
    y = (doc as any).lastAutoTable.finalY + 5;
    if (y + 32 > pageH - 14) {
      y = pageH - 46;
    }
    rule(y, ltGray, 0.2);
    y += 5;
    sectionLabel("Timeline & Delivery", L, y);
    y += 5;

    const ltOv = customer.ltOverrides ?? [];
    autoTable(doc, {
      startY: y, margin: { left: L, right: L },
      head: [["Milestone", "Date / Duration"]],
      body: [
        ["Lead Time",                       ltOv[0] ?? (leadTimeWeeks > 0 ? `${leadTimeWeeks.toFixed(2)} Weeks` : "—")],
        ["Start Date (Week Of)",             ltOv[1] ?? fmtDate(startDate)],
        ["Estimated Ship Date (Week Of)",    ltOv[2] ?? fmtDate(shipDate)],
      ],
      styles: {
        font: "helvetica", fontSize: 8,
        cellPadding: { top: 1.6, bottom: 1.6, left: 3, right: 3 },
        textColor: gray, lineColor: ltGray, lineWidth: 0.2,
        fillColor: [255, 255, 255],
      },
      headStyles: { fontStyle: "bold", fontSize: 7.6, fillColor: [240, 240, 240], textColor: midGray },
      alternateRowStyles: { fillColor: rowEven },
      columnStyles: {
        0: { halign: "left",  cellWidth: "auto", fontStyle: "bold" },
        1: { halign: "right", cellWidth: 52 },
      },
      pageBreak: "avoid",
      tableLineColor: ltGray, tableLineWidth: 0.2,
    });
    const leadTimeSnapshot: AutoTableSnapshot = {
      body: (doc as any).lastAutoTable.body.map((row: any) => ({
        cells: Object.values(row.cells).map((c: any) => ({ x: c.x, y: c.y, width: c.width, height: c.height, raw: String(c.raw ?? "") })),
      })),
      finalY: (doc as any).lastAutoTable.finalY,
    };

    // ── TERMS & CONDITIONS ────────────────────────────────────────────────────
    const firstPageFooterY = pageH - 10;
    rule(firstPageFooterY, ltGray, 0.2);
    sf("normal", 7); doc.setTextColor(...midGray);
    doc.text(`${brand.address1}, ${brand.address2}  â€¢  ${brand.email}  â€¢  ${brand.phone}`, pageW / 2, firstPageFooterY + 4, { align: "center" });
    doc.text("Page 1 of 2", R, firstPageFooterY + 4, { align: "right" });

    doc.addPage();
    y = 14;

    const disclaimer = "This document is a quotation only and does not constitute a formal offer, contract, or order. Prices and terms are subject to change without notice and are valid only for the period specified (14 days from the date hereof). All quotes are subject to product availability, credit approval, and our standard Terms and Conditions, available upon request or at our website. Acceptance of this quote requires written confirmation and may be subject to final review.";
    const cancelPolicy = "All wholesale and bulk orders are final and non-cancellable upon approval. No refunds, returns, cancellations, or modifications will be accepted thereafter.";

    sf("italic", 7.5); doc.setTextColor(...midGray);
    const disclaimerLines = doc.splitTextToSize(disclaimer, W);
    const cancelLines     = doc.splitTextToSize(cancelPolicy, W);
    const footerH = 18 + cancelLines.length * 3.8 + 7 + disclaimerLines.length * 3.5 + 12;
    void footerH;

    rule(y, ltGray, 0.2);
    y += 4;

    sectionLabel("Terms & Conditions", L, y);
    y += 5;

    sf("bold", 8); doc.setTextColor(...gray);
    doc.text("Cancellation Policy", L, y);
    sf("normal", 8); doc.setTextColor(...midGray);
    y += 4;
    doc.text(cancelLines, L, y);
    y += Math.max(cancelLines.length, 1) * 3.8 + 5;

    sf("bold", 8); doc.setTextColor(...gray);
    doc.text("Quote Disclaimer", L, y);
    sf("italic", 7.5); doc.setTextColor(...midGray);
    y += 4;
    doc.text(disclaimerLines, L, y);

    // ── Footer bar ────────────────────────────────────────────────────────────
    const footerY = pageH - 10;
    const totalPages = doc.getNumberOfPages();
    rule(footerY, ltGray, 0.2);
    sf("normal", 7); doc.setTextColor(...midGray);
    doc.text(`${brand.address1}, ${brand.address2}  •  ${brand.email}  •  ${brand.phone}`, pageW / 2, footerY + 4, { align: "center" });
    doc.text(`Page ${doc.getCurrentPageInfo().pageNumber} of ${totalPages}`, R, footerY + 4, { align: "right" });

    // ── Filename ──────────────────────────────────────────────────────────────
    const clean = (s: string) => (s || "Unknown").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "");
    const dateStr = today.toISOString().split("T")[0];
    const unitsOrMoq = moqResults.length > 1
      ? moqResults.map(m => m.moqRow.moq || "0").join("-")
      : String(Math.round(primaryDelivQty) || r.moqRow.moq || "0");
    const filename = [clean(customer.customer), clean(customer.productName || primaryProductName), unitsOrMoq, dateStr].join("_") + ".pdf";
    console.log("[PDF] filename:", filename);

    results.push({ doc, filename, moqLabel: r.moqRow.moq || "—", packLabel: r.casePack, leadTimeTable: leadTimeSnapshot, pricingTable: pricingSnapshot, overviewBox: overviewBoxSnapshot });
  }

  return results;
}

// ── Preview: returns blob URLs (no download) ──────────────────────────────────
export async function buildQuotePreviews(args: QuoteArgs): Promise<QuotePreview[]> {
  const docs = await buildDocs(args);
  return docs.map(({ doc, filename, moqLabel, packLabel, leadTimeTable, pricingTable, overviewBox }) => {
    const blob    = doc.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    return { filename, moqLabel, packLabel, blobUrl, doc, leadTimeTable, pricingTable, overviewBox };
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

  const { doc, filename, moqLabel, packLabel, leadTimeTable, pricingTable, overviewBox } = docs[0];
  const blob    = doc.output("blob");
  const blobUrl = URL.createObjectURL(blob);
  return { filename, moqLabel, packLabel, blobUrl, doc, leadTimeTable, pricingTable, overviewBox };
}
