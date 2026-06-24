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
  // Optional overrides for PDF table content (set by PDF editor, not persisted to project)
  ltOverrides?:        string[];              // [weeks, startDate, shipDate] — value col (col 1)
  // Per-row overrides for pricing table (excludes TOTALS). Each entry = [desc, qty, ppu, total]
  lineItemOverrides?:  (string | null)[][];   // lineItemOverrides[rowIdx][colIdx 0-3]
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

type QuoteArgs = {
  brandId:          BrandId;
  moqResults:       MoqPricingRow[];
  moqMargins:       Record<number, string>;
  whatIfPpus?:      Record<number, string>;
  summaryRows:      SummaryRow[];
  summaryTableRows: SummaryTableRow[];
  deliveredQtys?:   number[];
  primaryProductName?: string;
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

// PPU formatter: 4 decimal places for values < $1, 2 for values >= $1
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

// ── Synthesise a base-quote MoqPricingRow from summary data (used when no MOQ rows) ──
function syntheticBaseRow(summaryRows: SummaryRow[], ppuDenominator: number): MoqPricingRow {
  const totalCustomer = summaryRows.reduce((s, r) => s + r.customerPrice, 0);
  const totalOur      = summaryRows.reduce((s, r) => s + r.ourCosts, 0);
  const denom         = ppuDenominator > 0 ? ppuDenominator : 1;
  const ppu           = totalCustomer / denom;
  const ppuCost       = totalOur / denom;
  return {
    // id: 0 matches the key used by the Price Adjustment fallback row (whatIfPpus[0])
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
          deliveredQtys = [], primaryProductName = "", formData, customer } = args;
  // When no MOQ rows, generate a single "Base Quote" PDF from summary data
  const moqResults = args.moqResults.length > 0
    ? args.moqResults
    : [syntheticBaseRow(summaryRows, parseFloat(formData.ppuDenominator) || 1)];
  const brand      = BRANDS.find((b) => b.id === brandId)!;
  const quoteId    = generateQuoteId();
  const today      = new Date();
  const logoDataUrl = await loadImageAsDataUrl(LOGO_SRCS[brand.id]);
  // Fix 1: log logo load failures so they're visible in console
  if (!logoDataUrl) console.error(`[PDF] Logo failed to load for brand "${brand.id}" from ${LOGO_SRCS[brand.id]}`);

  // Lead time — pick the longest non-summary week value
  const indivRow      = summaryTableRows.find(r => r.leadTimeWeeks != null && !r.isLeadTimeSummary && r.leadTimeWeeks > 0);
  const totalLTRow    = summaryTableRows.find(r => r.isLeadTimeSummary && r.label === "Estimated Total Lead Time");
  const leadTimeWeeks = totalLTRow?.leadTimeWeeks ?? indivRow?.leadTimeWeeks ?? 0;
  const startDate     = formData.startDate ? new Date(formData.startDate + "T00:00:00") : today;
  const shipDate      = addBusinessDays(startDate, leadTimeWeeks * 5);

  // Auto-generate project overview from packaging levels when user left it blank
  const autoOverview = (() => {
    const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
    const rows = summaryTableRows.filter(r => !r.isLeadTimeSummary && (r.totalUnits ?? 0) > 0);
    if (rows.length === 0) return "";
    const parts: string[] = [];
    const primary = rows[0];
    const primaryUnits = fmt(primary.totalUnits ?? 0);
    const productName = customer.productName || primaryProductName || "product";
    parts.push(`${primaryUnits} Units, ${productName}`);
    rows.slice(1).forEach(row => {
      const u = fmt(row.totalUnits ?? 0);
      parts.push(`packed into ${u} ${row.label}`);
    });
    const ltStr = leadTimeWeeks > 0 ? ` Lead time is approx ${Math.round(leadTimeWeeks)} wks.` : "";
    return parts.join(". ") + `. Shipping/freight not included.${ltStr}`;
  })();

  // Accent colour
  const [ar, ag, ab] = hexToRgb(brand.accent);

  const results: { doc: jsPDF; filename: string; moqLabel: string; packLabel: string; leadTimeTable?: AutoTableSnapshot; pricingTable?: AutoTableSnapshot; overviewBox?: QuotePreview["overviewBox"] }[] = [];

  for (const r of moqResults) {
    // Fix 4: Price Adjustment (whatIfPpus) takes priority over moqMargins
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
    // totalPPU uses ppuDenominator basis (same as Price Adjustment input), not primaryDelivQty,
    // so the TOTALS PPU matches what the user typed in the price adjustment field.
    const totalPPU = custPPU;

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
    doc.setLineWidth(0.3);
    doc.rect(L, y, W, CUST_H);

    const custFields: [string, string][] = [
      ["Customer:",    customer.customer   || "—"],
      ["Customer ID:", customer.customerId || "—"],
      ["Name:",        customer.name       || "—"],
      ["Phone:",       customer.phone      || "—"],
      ["Email:",       customer.email      || "—"],
    ];
    const LBL_W = 26;
    custFields.forEach(([label, val], i) => {
      const cy = y + 5 + i * 5;
      sf("bold", 10); doc.setTextColor(...gray);
      doc.text(label, L + 3, cy);
      sf("normal", 10);
      doc.text(val, L + 3 + LBL_W, cy);
    });
    sf("bold", 10); doc.setTextColor(...gray);
    doc.text("Quote ID:", R - 55, y + 8);
    sf("bold", 12); doc.setTextColor(...gray);
    doc.text(quoteId, R - 3, y + 8, { align: "right" });

    // ── Section 3 — Product Name / Description Block ──────────────────────────
    y += CUST_H + 5;
    const unitSizeG = parseFloat(formData.unitWeight || "0") || 0;
    const unitLabel = formData.unitWeightUnit || "g";
    const prodFields: [string, string][] = [
      ["Product Name:",            customer.productName || primaryProductName || "—"],
      [`Unit / Ea Size (${unitLabel}):`, unitSizeG > 0 ? String(unitSizeG) : "—"],
      ["Product Category:",        customer.productCategory || "—"],
    ];
    const PROD_H = 5 + prodFields.length * 5 + 3;
    doc.setDrawColor(...ltGray);
    doc.setLineWidth(0.3);
    doc.rect(L, y, W, PROD_H);
    sf("bold", 9); doc.setTextColor(...ltGray);
    doc.text("Product Name / Description", L + 3, y + 4);
    const PLBL_W = 38;
    prodFields.forEach(([label, val], i) => {
      const py = y + 9 + i * 5;
      sf("bold", 10); doc.setTextColor(...gray);
      doc.text(label, L + 3, py);
      sf("normal", 10);
      doc.text(val, L + 3 + PLBL_W, py);
    });

    // ── Section 4 — Lead Time Table ───────────────────────────────────────────
    y += PROD_H + 5;
    const ltOv = customer.ltOverrides ?? [];
    autoTable(doc, {
      startY: y, margin: { left: L, right: L },
      head: [["Lead Time / Delivery Dates", "Delivery Dates"]],
      body: [
        ["Estimated Lead Time (in weeks)",         ltOv[0] ?? (leadTimeWeeks > 0 ? leadTimeWeeks.toFixed(2) : "—")],
        ["Estimated Start Date (week of)",         ltOv[1] ?? fmtDate(startDate)],
        ["Estimated Ship Ready Date (week of)",    ltOv[2] ?? fmtDate(shipDate)],
      ],
      styles: {
        font: "helvetica", fontSize: 10,
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
        textColor: gray, lineColor: ltGray, lineWidth: 0.2,
        fillColor: [255,255,255],
      },
      headStyles: { fontStyle: "bold", fillColor: [255,255,255], textColor: gray },
      alternateRowStyles: { fillColor: rowGray },
      columnStyles: {
        0: { halign: "left",  cellWidth: "auto" },
        1: { halign: "right", cellWidth: 42 },
      },
      tableLineColor: ltGray, tableLineWidth: 0.2,
    });
    const leadTimeSnapshot: AutoTableSnapshot = {
      body: (doc as any).lastAutoTable.body.map((row: any) => ({
        cells: Object.values(row.cells).map((c: any) => ({ x: c.x, y: c.y, width: c.width, height: c.height, raw: String(c.raw ?? "") })),
      })),
      finalY: (doc as any).lastAutoTable.finalY,
    };

    // ── Page-break helper ─────────────────────────────────────────────────────
    const MARGIN_BOTTOM = 15; // mm to reserve at bottom before forcing new page
    const checkPageBreak = (neededMm: number) => {
      if (y + neededMm > pageH - MARGIN_BOTTOM) {
        doc.addPage();
        y = 15;
      }
    };

    // ── Section 5 — Project Overview Box ─────────────────────────────────────
    y = (doc as any).lastAutoTable.finalY + 8;
    const overviewText = customer.projectOverview || autoOverview;

    const ovPrefix  = "Project Overview:  ";
    sf("bold", 10); doc.setTextColor(ar, ag, ab);
    const ovPrefixW = doc.getTextWidth(ovPrefix);
    const ovWrapped = overviewText
      ? doc.splitTextToSize(overviewText, W - 8 - ovPrefixW)
      : [""];
    const overviewH = Math.max(15, 8 + ovWrapped.length * 5);

    // Pricing summary callout — drawn directly below the overview box, gives the
    // reader the bottom line up front and points them to the itemized table below.
    const summaryPrefix = "Pricing Summary:  ";
    sf("bold", 10);
    const summaryPrefixW = doc.getTextWidth(summaryPrefix);
    sf("normal", 10);
    const summaryLine = `Total Project Cost ${fmt(totalRevenue)}  (${fmtPPU(totalPPU)} / unit)  —  see itemized breakdown below for details.`;
    const summaryWrapped = doc.splitTextToSize(summaryLine, W - 8 - summaryPrefixW);
    const SUMMARY_H = Math.max(14, 6 + summaryWrapped.length * 5);

    // Reserve room for the overview box, the summary callout, AND the pricing
    // table header + a few rows — so nothing gets orphaned onto the next page.
    const PRICING_TABLE_MIN_H = 50;
    checkPageBreak(overviewH + 2 + SUMMARY_H + 4 + PRICING_TABLE_MIN_H);

    doc.setFillColor(255, 253, 231);
    doc.setDrawColor(...ltGray);
    doc.setLineWidth(0.3);
    doc.rect(L, y, W, overviewH, "FD");

    // Capture overview box coordinates for PDF editor overlay
    sf("bold", 10); doc.setTextColor(ar, ag, ab);
    const ovPrefixWCaptured = doc.getTextWidth(ovPrefix);
    const overviewBoxSnapshot = {
      xMm: L + 4 + ovPrefixWCaptured, yMm: y + 3,
      wMm: W - 8 - ovPrefixWCaptured, hMm: overviewH - 6,
      prefixWMm: ovPrefixWCaptured,
    };

    doc.text(ovPrefix, L + 4, y + 6);
    sf("normal", 10); doc.setTextColor(...gray);
    if (overviewText) {
      doc.text(ovWrapped[0], L + 4 + ovPrefixW, y + 6);
      if (ovWrapped.length > 1) doc.text(ovWrapped.slice(1), L + 4, y + 11);
    }

    // ── Pricing Summary callout ───────────────────────────────────────────────
    y += overviewH + 5;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...ltGray);
    doc.setLineWidth(0.3);
    doc.rect(L, y, W, SUMMARY_H, "FD");

    sf("bold", 10); doc.setTextColor(ar, ag, ab);
    doc.text(summaryPrefix, L + 4, y + 8);
    sf("normal", 10); doc.setTextColor(...gray);
    doc.text(summaryWrapped[0], L + 4 + summaryPrefixW, y + 8);
    if (summaryWrapped.length > 1) doc.text(summaryWrapped.slice(1), L + 4, y + 13);

    // ── Section 6 — Pricing Table ─────────────────────────────────────────────
    y += SUMMARY_H + 5;

    const setupRow    = summaryRows.find(sr => sr.label.toLowerCase().includes("setup"));
    const materialRow = summaryRows.find(sr => sr.label.toLowerCase().includes("material"));
    const palletRow   = summaryRows.find(sr => sr.label.toLowerCase().includes("pallet"));

    // Packaging level rows from summaryTableRows (excludes materials, pallets, setup, lead time, testing)
    const colItems = summaryTableRows.filter(str =>
      !str.isLeadTimeSummary &&
      !str.label.toLowerCase().includes("material") &&
      !str.label.toLowerCase().includes("pallet") &&
      !str.label.toLowerCase().includes("setup") &&
      !str.label.toLowerCase().startsWith("testing –")
    );
    const palletSTR = summaryTableRows.find(str => str.label.toLowerCase().includes("pallet") && !str.isLeadTimeSummary);
    const primaryCol = colItems[0];

    const body: string[][] = [];

    // Row 1: Setup
    if (setupRow) {
      body.push(["Project Setup, Line Dial-In & Quality Assurance", "1",
        fmtPPU(setupRow.customerPrice), fmt(setupRow.customerPrice)]);
    }

    // Row 2: Combined "Product Filling, Handling & Intake" = raw material cost (excl. testing) + primary level labor
    {
      // Compute intake total from formData
      const intakeFee    = parseFloat(formData.intakeFee ?? "0") || 0;
      const intakeMarkup = parseFloat(formData.intakeFeeMarkup ?? "0") || 0;
      const nPallets     = parseFloat(formData.numIntakePallets ?? formData.numPallets ?? "0") || 0;
      const intakeCx     = intakeFee * nPallets * (1 + intakeMarkup / 100);

      // materialRow now excludes testing (testing has its own summaryTableRows entries)
      const matCx     = (materialRow?.customerPrice ?? 0) - intakeCx;
      const primCx    = primaryCol?.totalPrice ?? 0;
      const combTotal = matCx + primCx;
      const combDeliv = primaryDelivQty > 0 ? primaryDelivQty : 1;
      const combPPU   = combDeliv > 0 ? combTotal / combDeliv : 0;
      const primName  = primaryCol?.label || customer.productName || primaryProductName || "Primary Fill";
      body.push([
        `Product Filling, Handling & Intake (receiving, inspection, staging) - ${primName}`,
        Math.round(combDeliv).toLocaleString(),
        fmtPPU(combPPU),
        fmt(combTotal),
      ]);

      // Intake fee line item
      if (intakeCx > 0) {
        const intakePPU = nPallets > 0 ? intakeCx / nPallets : 0;
        body.push([
          "Intake Fee / Pallet",
          nPallets > 0 ? String(Math.round(nPallets)) : "—",
          fmtPPU(intakePPU),
          fmt(intakeCx),
        ]);
      }
    }

    // Testing rows — each test from summaryTableRows as its own line item
    const testingSTRs = summaryTableRows.filter(str => str.label.toLowerCase().startsWith("testing –"));
    const nSkus = parseInt(formData.numSkus ?? "1", 10) || 1;
    for (const t of testingSTRs) {
      const cx  = t.totalPrice ?? 0;
      const ppu = nSkus > 0 ? cx / nSkus : 0;
      body.push([
        `Testing & Documentation – ${t.label.replace(/^testing\s*[–-]\s*/i, "")}`,
        `${nSkus} SKUs`,
        fmtPPU(ppu),
        fmt(cx),
      ]);
    }

    // Rows 3+: All packaging levels beyond the primary fill, in order
    // deliveredQtys is index-aligned to colItems: [0]=primary, [1]=second, etc.
    colItems.slice(1).forEach((col, i) => {
      const colItemsIdx = i + 1;
      const delivQty   = (deliveredQtys.length > colItemsIdx && deliveredQtys[colItemsIdx] > 0)
        ? deliveredQtys[colItemsIdx]
        : (col.totalUnits ?? 0);
      const totalPrice = col.totalPrice ?? 0;
      const ppu        = delivQty > 0 && totalPrice > 0 ? totalPrice / delivQty : 0;
      body.push([
        `${col.label} - Total`,
        delivQty > 0 ? Math.round(delivQty).toLocaleString() : "—",
        fmtPPU(ppu),
        fmt(totalPrice),
      ]);
    });

    // Pallets
    if (palletRow) {
      const nPal   = palletSTR?.totalUnits != null && palletSTR.totalUnits > 0
        ? Math.round(palletSTR.totalUnits) : 0;
      const palCx  = palletRow.customerPrice;
      const palPPU = nPal > 0 ? palCx / nPal : 0;
      body.push([
        "Palletization & Outbound Staging",
        nPal > 0 ? String(nPal) : "—",
        fmtPPU(palPPU),
        fmt(palCx),
      ]);
    }

    // Apply user-edited cell overrides to line item rows (all before TOTALS)
    const liOv = customer.lineItemOverrides ?? [];
    if (liOv.length > 0) {
      body.forEach((row, ri) => {
        const rowOv = liOv[ri];
        if (!rowOv) return;
        rowOv.forEach((val, ci) => { if (val !== null && val !== undefined && val !== "") row[ci] = val; });
      });
    }

    // TOTALS row — use adjusted PPU/revenue when set; allow Total cell override from editor
    const totalsRowOv = liOv[body.length]; // sentinel appended by editor at index = body.length
    const totalsTotal = (totalsRowOv?.[3] && totalsRowOv[3] !== "") ? totalsRowOv[3] : fmt(totalRevenue);
    body.push(["TOTALS", "", fmtPPU(totalPPU), totalsTotal]);
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
        2: { halign: "right", cellWidth: 28 },
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
    const pricingSnapshot: AutoTableSnapshot = {
      body: (doc as any).lastAutoTable.body.map((row: any) => ({
        cells: Object.values(row.cells).map((c: any) => ({ x: c.x, y: c.y, width: c.width, height: c.height, raw: String(c.raw ?? "") })),
      })),
      finalY: (doc as any).lastAutoTable.finalY,
    };

    // ── Section 7 — Footer ────────────────────────────────────────────────────
    y = (doc as any).lastAutoTable.finalY + 10;

    // Pre-compute footer text sizes to know if we need a page break
    const disclaimer = "Quote Disclaimer: This document is a quotation only and does not constitute a formal offer, contract, or order. Prices and terms are subject to change without notice and are valid only for the period specified (14 days from the date hereof). All quotes are subject to product availability, credit approval, and our standard Terms and Conditions (available upon request or at your website). Acceptance of this quote requires written confirmation and may be subject to final review.";
    sf("italic", 8); doc.setTextColor(90, 90, 90);
    const disclaimerLines = doc.splitTextToSize(disclaimer, W);
    const disclaimerH = disclaimerLines.length * 3.8 + 2;

    const cancelPolicy = "All wholesale and bulk orders are final and non-cancellable upon approval. No refunds, returns, cancellations, or modifications will be accepted thereafter.";
    const cancelPrefix = "Cancellation Policy:  ";
    sf("bold", 10); doc.setTextColor(...gray);
    const cpW = doc.getTextWidth(cancelPrefix);
    sf("normal", 10);
    const cancelLines = doc.splitTextToSize(cancelPolicy, W - cpW);
    const cancelH = Math.max(cancelLines.length, 1) * 5 + 2;

    const footerH = cancelH + 6 + disclaimerH;
    checkPageBreak(footerH);

    // Cancellation Policy first
    sf("bold", 10); doc.setTextColor(...gray);
    doc.text(cancelPrefix, L, y);
    sf("normal", 10);
    doc.text(cancelLines[0], L + cpW, y);
    if (cancelLines.length > 1) doc.text(cancelLines.slice(1), L, y + 5);
    y += cancelH + 6;

    // Quote Disclaimer below
    sf("italic", 8); doc.setTextColor(90, 90, 90);
    doc.text(disclaimerLines, L, y);

    // ── Filename: {CompanyName}_{ProductName}_{Units}_{YYYY-MM-DD}.pdf ──────────
    const clean = (s: string) => (s || "Unknown").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "");
    const dateStr = today.toISOString().split("T")[0]; // YYYY-MM-DD
    const unitsOrMoq = moqResults.length > 1
      ? moqResults.map(m => m.moqRow.moq || "0").join("-")
      : String(Math.round(primaryDelivQty) || r.moqRow.moq || "0");
    const filename = [
      clean(customer.customer),
      clean(customer.productName || primaryProductName),
      unitsOrMoq,
      dateStr,
    ].join("_") + ".pdf";
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
