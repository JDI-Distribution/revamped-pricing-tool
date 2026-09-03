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

// -- Brand definitions ---------------------------------------------------------
export const BRANDS = [
  { id: "jdi",         label: "JDI Distribution", accent: "#e8473f", phone: "+1 (877) 355 - 0695", email: "sales@jdidistribution.com", address1: "1967 Essex Ct", address2: "Redlands, CA 92373" },
  { id: "brewglitter", label: "Brew Glitter",      accent: "#c0932b", phone: "+1 (877) 316 - 5913", email: "sales@brewglitter.com",    address1: "1967 Essex Ct", address2: "Redlands, CA 92373" },
  { id: "bakell",      label: "Bakell",            accent: "#d6a431", phone: "+1 (800) 292 - 2137", email: "sales@bakell.com",         address1: "1967 Essex Ct", address2: "Redlands, CA 92373" },
  { id: "pfg",         label: "Pro Foods Group",   accent: "#16aa54", phone: "+1 (833) 434 - 2549", email: "sales@profoods.com",       address1: "1967 Essex Ct", address2: "Redlands, CA 92373" },
] as const;

const cleanPhone = (value: string | undefined, fallback = "-") => {
  const phone = String(value ?? "").trim();
  if (!phone) return fallback;
  return phone.replace(/\D/g, "").replace(/^1/, "").replace(/0/g, "") === "" ? fallback : phone;
};

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
  leadTimeDaysOverride?: number;
  leadTimeWeeksOverride?: number;
  quoteIdOverride?:   string;
  pdfFileBaseName?:   string;
  formData:         {
    startDate: string; leadTimeBufferDays: string; ppuDenominator: string;
    outboundFee: string; outboundFeeMarkup: string; palletBuffer: string;
    unitWeight?: string; unitWeightUnit?: string;
    testingEnabled?: string; testingRows?: TestingRow[]; testingMarkup?: string; numSkus?: string;
    intakeFee?: string; intakeFeeMarkup?: string; numPallets?: string; numIntakePallets?: string;
  };
  customer:         CustomerInfo;
};

// -- Helpers -------------------------------------------------------------------
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

function tintRgb(rgb: [number, number, number], amount: number): [number, number, number] {
  return rgb.map((channel) => Math.round(channel + (255 - channel) * amount)) as [number, number, number];
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
    casePack:           "-",
    totalCustomerPrice: totalCustomer,
    totalOurCost:       totalOur,
    ppuDenominator:     denom,
    ppu,
    ppuCost,
    marginDollars:      totalCustomer - totalOur,
    marginPct:          totalCustomer > 0 ? ((totalCustomer - totalOur) / totalCustomer) * 100 : 0,
  };
}

// -- Core builder --------------------------------------------------------------
async function buildDocs(args: QuoteArgs): Promise<{ doc: jsPDF; filename: string; moqLabel: string; packLabel: string; leadTimeTable?: AutoTableSnapshot; pricingTable?: AutoTableSnapshot; overviewBox?: QuotePreview["overviewBox"] }[]> {
  const { brandId, moqMargins, whatIfPpus = {}, summaryRows, summaryTableRows,
          deliveredQtys = [], primaryProductName = "", formData, customer,
          overviewLineItems, adjustedRevenue, adjustedPPU, ppuDenominator: argPpuDenominator,
          leadTimeDaysOverride, leadTimeWeeksOverride } = args;
  const moqResults = args.moqResults.length > 0
    ? args.moqResults
    : [syntheticBaseRow(summaryRows, parseFloat(formData.ppuDenominator) || 1)];
  const brand      = BRANDS.find((b) => b.id === brandId)!;
  const quoteId    = args.quoteIdOverride || generateQuoteId();
  const today      = new Date();
  const logoDataUrl = await loadImageAsDataUrl(LOGO_SRCS[brand.id]);
  if (!logoDataUrl) console.error(`[PDF] Logo failed to load for brand "${brand.id}" from ${LOGO_SRCS[brand.id]}`);

  const indivRow      = summaryTableRows.find(r => r.leadTimeWeeks != null && !r.isLeadTimeSummary && r.leadTimeWeeks > 0);
  const totalLTRow    = summaryTableRows.find(r => r.isLeadTimeSummary && r.label === "Estimated Total Lead Time");
  const fallbackLeadTimeWeeks = totalLTRow?.leadTimeWeeks ?? indivRow?.leadTimeWeeks ?? 0;
  const leadTimeWeeks = Number.isFinite(leadTimeWeeksOverride ?? NaN) && (leadTimeWeeksOverride ?? 0) > 0
    ? leadTimeWeeksOverride!
    : fallbackLeadTimeWeeks;
  const leadTimeDays = Number.isFinite(leadTimeDaysOverride ?? NaN) && (leadTimeDaysOverride ?? 0) > 0
    ? leadTimeDaysOverride!
    : leadTimeWeeks * 5;
  const startDate     = formData.startDate ? new Date(formData.startDate + "T00:00:00") : today;
  const shipDate      = addBusinessDays(startDate, leadTimeDays);

  void primaryProductName; // used in line items below

  const accent = hexToRgb(brand.accent);
  const accentSoft = tintRgb(accent, 0.92);
  const accentSubtle = tintRgb(accent, 0.96);
  const accentLine = tintRgb(accent, 0.58);

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
    const rowEven  = accentSubtle;

    const sf = (style: "normal" | "bold" | "italic" = "normal", size = 9) => {
      doc.setFont("helvetica", style);
      doc.setFontSize(size);
    };

    // Spaced-letter section header (like Bakell: "Q U O T E  D E T A I L S")
    const sectionLabel = (text: string, x: number, y: number, align: "left" | "right" | "center" = "left") => {
      const spaced = text.toUpperCase().split("").join(" ");
      sf("bold", 7);
      doc.setTextColor(...accent);
      doc.text(spaced, x, y, { align });
    };

    // Thin full-width rule
    const rule = (y: number, color: [number,number,number] = accentLine, width = 0.25) => {
      doc.setDrawColor(...color);
      doc.setLineWidth(width);
      doc.line(L, y, R, y);
    };

    let y = 12;

    // -- LOGO (top-left) -------------------------------------------------------
    if (logoDataUrl) {
      const { dataUrl, width: srcW, height: srcH } = logoDataUrl;
      const maxW = 46, maxH = 13;
      const ratio  = Math.min(maxW / srcW, maxH / srcH);
      const drawW  = srcW * ratio;
      const drawH  = srcH * ratio;
      try { doc.addImage(dataUrl, "JPEG", L, y, drawW, drawH); } catch { /* skip */ }
    }

    // -- QUOTE ID (top-right) --------------------------------------------------
    sf("normal", 6.5); doc.setTextColor(...midGray);
    doc.text("Quote ID:", R, y + 3, { align: "right" });
    sf("bold", 10); doc.setTextColor(...accent);
    doc.text(quoteId, R, y + 8, { align: "right" });

    y += 18;
    rule(y);

    // -- QUOTE DETAILS - two-column grid --------------------------------------
    y += 4;
    sectionLabel("Quote Details", L, y);
    y += 4;
    const quoteDetailsTopY = y;
    rule(y);
    y += 3;

    const colMid = L + W / 2;  // midpoint for two-column layout

    // Left column: customer info
    const leftFields: [string, string][] = [
      ["CUSTOMER",     customer.customer   || "-"],
      ["CUSTOMER ID",  customer.customerId || "-"],
      ["NAME",         customer.name       || "-"],
      ["PHONE",        customer.phone      || "-"],
      ["EMAIL",        customer.email      || "-"],
    ];
    const validThrough = new Date(today);
    validThrough.setDate(validThrough.getDate() + 14);

    // Right column: quote meta
    const rightFields: [string, string][] = [
      ["DATE ISSUED",  fmtDate(today)],
      ["VALID FOR",    `14 Days (${fmtDate(validThrough)})`],
      ["SALES REP",    customer.salesRep || "-"],
      ["PHONE",        brand.phone],
      ["EMAIL",        brand.email],
    ];

    leftFields[3][1] = cleanPhone(customer.phone);
    rightFields[3][1] = cleanPhone(brand.phone);
    [...leftFields, ...rightFields].forEach(field => {
      if (field[1].includes("\u00e2")) field[1] = "-";
    });

    const fieldLineH = 5.2;   // compact single-line label/value rows
    const drawField = (label: string, val: string, x: number, fy: number, maxW: number) => {
      const labelW = 38;
      sf("bold", 6.5); doc.setTextColor(...midGray);
      doc.text(label, x, fy);
      sf("normal", 8.3); doc.setTextColor(...gray);
      const wrapped = doc.splitTextToSize(val, Math.max(24, maxW - labelW)).slice(0, 2);
      doc.text(wrapped, x + labelW, fy);
    };

    const colW = W / 2 - 4;
    const infoLabelW = 24;
    const layoutInfoColumn = (fields: [string, string][], width: number, boxed = false) => {
      const prepared = fields.map(([label, val]) => ({
        label,
        lines: doc.splitTextToSize(val, Math.max(24, (boxed ? width - 5 : width) - infoLabelW)).slice(0, 2) as string[],
      }));
      const rowHeights = prepared.map((item) => Math.max(4.5, item.lines.length * 3.2 + 1));
      const bottom = rowHeights.reduce((sum, h) => sum + h, y);
      return { prepared, rowHeights, bottom };
    };

    const drawInfoColumn = (
      layout: ReturnType<typeof layoutInfoColumn>,
      x: number,
      startY: number,
    ) => {
      let cy = startY;
      layout.prepared.forEach(({ label, lines }, index) => {
        sf("bold", 6.4); doc.setTextColor(...midGray);
        doc.text(label, x, cy);
        sf("normal", 8.1); doc.setTextColor(...gray);
        doc.text(lines, x + infoLabelW, cy);
        cy += layout.rowHeights[index];
      });
      return cy;
    };

    const leftLayout = layoutInfoColumn(leftFields, colW);
    const rightLayout = layoutInfoColumn(rightFields, colW, true);
    const quoteDetailsBottomY = Math.max(leftLayout.bottom, rightLayout.bottom) + 2;

    doc.setFillColor(...accentSoft);
    doc.rect(colMid - 2.8, quoteDetailsTopY, colW + 5.6, quoteDetailsBottomY - quoteDetailsTopY, "F");

    drawInfoColumn(leftLayout, L, y);
    drawInfoColumn(rightLayout, colMid, y);

    rule(quoteDetailsTopY);
    y = quoteDetailsBottomY;
    rule(y);

    // -- PROJECT OVERVIEW ------------------------------------------------------
    y += 4;
    sectionLabel("Project Overview", L, y);
    y += 4;
    rule(y);
    y += 3;

    const unitSizeG  = parseFloat(formData.unitWeight || "0") || 0;
    const unitLabel  = formData.unitWeightUnit || "g";
    const overviewFields: [string, string][] = [
      ["PRODUCT NAME",               customer.productName || primaryProductName || "-"],
      ["PRODUCT CATEGORY",           customer.productCategory || "-"],
      [`UNIT / EA SIZE (${unitLabel.toUpperCase()})`, unitSizeG > 0 ? `${unitSizeG} ${unitLabel}` : "-"],
    ];

    overviewFields.forEach(([label, val], i) => {
      const fy = y + i * fieldLineH;
      drawField(label, val, L, fy, colW);
    });

    // -- Packaging breakdown - single line with arrows (right column) --
    const overviewSummary = (customer.projectOverview || "")
      .replace(/^\s*project\s+overview\s*:?\s*/i, "")
      .trim();
    const summaryY = y + overviewFields.length * fieldLineH + 0.8;
    let summaryLines: string[] = [];
    if (overviewSummary) {
      sf("bold", 6.5); doc.setTextColor(...midGray);
      doc.text("SUMMARY", L, summaryY);
      sf("normal", 7.4); doc.setTextColor(...gray);
      summaryLines = (doc.splitTextToSize(overviewSummary, W - 4) as string[]).slice(0, 4);
      doc.text(summaryLines, L, summaryY + 3.7);
    }
    const overviewBoxSnapshot: QuotePreview["overviewBox"] | undefined = undefined;
    const overviewSectionH = overviewFields.length * fieldLineH
      + (summaryLines.length > 0 ? 5.2 + summaryLines.length * 3.3 : 0);
    y += overviewSectionH + 3;
    rule(y);

    // -- Page-break helper -----------------------------------------------------
    // -- PRICING BREAKDOWN -----------------------------------------------------
    y += 5;

    const body: string[][] = [];
    let renderedLineTotal: number | null = null;

    if (overviewLineItems && overviewLineItems.length > 0) {
      // Use pre-computed Overview line items from QuotePage
      const pdfItems = overviewLineItems.map(item => ({ ...item }));
      if (adjustedRevenue !== undefined) {
        const lineTotal = pdfItems.reduce((sum, item) => sum + item.total, 0);
        const delta = adjustedRevenue - lineTotal;
        if (Math.abs(delta) >= 0.005) {
          const targetIdx = pdfItems.findIndex(item => item.desc.toLowerCase().includes("product filling"));
          const fallbackIdx = pdfItems.reduce((bestIdx, item, idx) =>
            item.total > (pdfItems[bestIdx]?.total ?? -Infinity) ? idx : bestIdx, 0);
          const idx = targetIdx >= 0 ? targetIdx : fallbackIdx;
          if (pdfItems[idx]) pdfItems[idx].total += delta;
        }
      }
      renderedLineTotal = pdfItems.reduce((sum, item) => sum + item.total, 0);
      for (const item of pdfItems) {
        const qtyStr = item.qty != null ? Math.round(item.qty).toLocaleString() : "-";
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
        !str.label.toLowerCase().startsWith("testing -")
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
      const testingSTRs = summaryTableRows.filter(str => str.label.toLowerCase().startsWith("testing -"));
      const nSkus = parseInt(formData.numSkus ?? "1", 10) || 1;
      for (const t of testingSTRs) {
        const cx = t.totalPrice ?? 0;
        body.push([`Testing & Documentation - ${t.label.replace(/^testing\s*[--]\s*/i, "")}`, `${nSkus} SKUs`, fmtPPU(nSkus > 0 ? cx / nSkus : 0), fmt(cx)]);
      }
      colItems.slice(1).forEach((col) => {
        const delivQty = col.totalUnits ?? 0;
        const totalPrice = col.totalPrice ?? 0;
        body.push([`${col.label} - Total`, delivQty > 0 ? Math.round(delivQty).toLocaleString() : "-", fmtPPU(delivQty > 0 ? totalPrice / delivQty : 0), fmt(totalPrice)]);
      });
      if (palletRow) {
        const nPal  = palletSTR?.totalUnits != null ? Math.round(palletSTR.totalUnits) : 0;
        const palCx = palletRow.customerPrice;
        body.push(["Palletization & Outbound Staging", nPal > 0 ? String(nPal) : "-", fmtPPU(nPal > 0 ? palCx / nPal : 0), fmt(palCx)]);
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
    const finalDenom    = argPpuDenominator ?? r.ppuDenominator;
    const finalRevenue  = adjustedRevenue ?? renderedLineTotal ?? totalRevenue;
    const finalPPU      = adjustedPPU ?? (finalDenom > 0 ? finalRevenue / finalDenom : totalPPU);
    const totalsRowOv   = liOv[body.length];
    const totalsTotal   = (totalsRowOv?.[3] && totalsRowOv[3] !== "") ? totalsRowOv[3] : fmt(finalRevenue);
    body.push(["TOTALS", "", fmtPPU(finalPPU), totalsTotal]);
    const totalsIdx = body.length - 1;

    // Estimate full table height: header (8mm) + each row (~8mm each, some wrap to 2 lines)
    // + section label (10mm) - force new page if it won't all fit
    sectionLabel("Pricing Breakdown", L, y);
    y += 4;

    const compactPricing = body.length > 7;
    autoTable(doc, {
      startY: y, margin: { left: L, right: L },
      head: [["Description", "Quantity", "Unit Price", "Total"]],
      body,
      styles: {
        font: "helvetica", fontSize: compactPricing ? 6.7 : 7.2,
        cellPadding: compactPricing
          ? { top: 0.85, bottom: 0.85, left: 2, right: 2 }
          : { top: 1.1, bottom: 1.1, left: 2.2, right: 2.2 },
        textColor: gray, lineColor: ltGray, lineWidth: 0.2,
        fillColor: [255, 255, 255],
        minCellHeight: compactPricing ? 3.8 : 4.4,
      },
      headStyles: {
        fontStyle: "bold", fontSize: compactPricing ? 6.7 : 7,
        fillColor: accent,
        textColor: [255, 255, 255],
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
          doc.setFontSize(8.5);
          doc.setTextColor(...gray);
        } else if (data.section === "body" && data.column.index === 0) {
          doc.setFont("helvetica", "bold");
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

    // -- TIMELINE & DELIVERY ---------------------------------------------------
    y = (doc as any).lastAutoTable.finalY + 4;
    if (y + 27 > pageH - 13) {
      y = pageH - 41;
    }
    rule(y);
    y += 4;
    sectionLabel("Timeline & Delivery", L, y);
    y += 4;

    const ltOv = customer.ltOverrides ?? [];
    const leadTimeText = leadTimeWeeks > 0
      ? `${leadTimeDays.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Days (${leadTimeWeeks.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Weeks)`
      : "-";
    autoTable(doc, {
      startY: y, margin: { left: L, right: L },
      head: [["Milestone", "Date / Duration"]],
      body: [
        ["Lead Time",                       ltOv[0] ?? leadTimeText],
        ["Start Date (Week Of)",             ltOv[1] ?? fmtDate(startDate)],
        ["Estimated Ship Date (Week Of)",    ltOv[2] ?? fmtDate(shipDate)],
      ],
      styles: {
        font: "helvetica", fontSize: 7.1,
        cellPadding: { top: 0.9, bottom: 0.9, left: 2.2, right: 2.2 },
        textColor: gray, lineColor: ltGray, lineWidth: 0.2,
        fillColor: [255, 255, 255],
      },
      headStyles: { fontStyle: "bold", fontSize: 6.9, fillColor: accent, textColor: [255, 255, 255] },
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

    // -- TERMS & CONDITIONS ----------------------------------------------------
    const disclaimer = "This document is a quotation only and does not constitute a formal offer, contract, or order. Prices and terms are subject to change without notice and are valid only for the period specified (14 days from the date hereof). All quotes are subject to product availability, credit approval, and our standard Terms and Conditions, available upon request or at our website. Acceptance of this quote requires written confirmation and may be subject to final review.";
    const cancelPolicy = "All wholesale and bulk orders are final and non-cancellable upon approval. No refunds, returns, cancellations, or modifications will be accepted thereafter.";

    const footerY = pageH - 10;
    const termsStart = Math.min((doc as any).lastAutoTable.finalY + 5, footerY - 29);
    y = Math.max(termsStart, 236);

    rule(y);
    y += 3.4;

    sectionLabel("Terms & Conditions", L, y);
    y += 4;

    sf("bold", 6.6); doc.setTextColor(...gray);
    doc.text("Cancellation Policy", L, y);
    sf("normal", 6.4); doc.setTextColor(...midGray);
    const cancelLines = doc.splitTextToSize(cancelPolicy, W);
    y += 3.1;
    doc.text(cancelLines.slice(0, 2), L, y);
    y += Math.min(cancelLines.length, 2) * 2.9 + 2.4;

    sf("bold", 6.6); doc.setTextColor(...gray);
    doc.text("Quote Disclaimer", L, y);
    sf("italic", 6.2); doc.setTextColor(...midGray);
    const disclaimerLines = doc.splitTextToSize(disclaimer, W);
    y += 3;
    doc.text(disclaimerLines.slice(0, 4), L, y);

    // -- Footer bar ------------------------------------------------------------
    rule(footerY, ltGray, 0.2);
    sf("normal", 7); doc.setTextColor(...midGray);
    doc.text(`${brand.address1}, ${brand.address2} | ${brand.email} | ${cleanPhone(brand.phone)}`, pageW / 2, footerY + 4, { align: "center" });
    doc.text("Page 1 of 1", R, footerY + 4, { align: "right" });

    // -- Filename --------------------------------------------------------------
    const clean = (s: string) => (s || "Unknown").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
    const dateStr = today.toISOString().split("T")[0];
    const unitsOrMoq = moqResults.length > 1
      ? moqResults.map(m => m.moqRow.moq || "0").join("-")
      : String(Math.round(primaryDelivQty) || r.moqRow.moq || "0");
    const generatedPdfBaseName = args.pdfFileBaseName
      || [unitsOrMoq, `${formData.unitWeight || "0"}${formData.unitWeightUnit || "g"}`, customer.productName || primaryProductName || "Product", customer.customer || "Company", dateStr].join("_");
    const filename = clean(generatedPdfBaseName) + ".pdf";
    console.log("[PDF] filename:", filename);

    results.push({ doc, filename, moqLabel: r.moqRow.moq || "-", packLabel: r.casePack, leadTimeTable: leadTimeSnapshot, pricingTable: pricingSnapshot, overviewBox: overviewBoxSnapshot });
  }

  return results;
}

// -- Preview: returns blob URLs (no download) ----------------------------------
export async function buildQuotePreviews(args: QuoteArgs): Promise<QuotePreview[]> {
  const docs = await buildDocs(args);
  return docs.map(({ doc, filename, moqLabel, packLabel, leadTimeTable, pricingTable, overviewBox }) => {
    const blob    = doc.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    return { filename, moqLabel, packLabel, blobUrl, doc, leadTimeTable, pricingTable, overviewBox };
  });
}

// -- Download: saves all PDFs directly ----------------------------------------
export async function generateQuotePDFs(args: QuoteArgs): Promise<void> {
  const docs = await buildDocs(args);
  docs.forEach(({ doc, filename }) => doc.save(filename));
}

// -- Custom quantity preview ---------------------------------------------------
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
