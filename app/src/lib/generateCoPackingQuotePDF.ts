import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BRANDS, BrandId, CustomerInfo, QuotePreview } from "./generateQuotePDF";
import { CoPackingState, CoPackingResult, CoPackingProcess } from "./types";
import { computePricingTiers } from "./coPackingCalculations";

const BASE = import.meta.env.BASE_URL ?? "/";
const LOGO_SRCS: Record<string, string> = {
  jdi:         `${BASE}logo_jdi.png`,
  brewglitter: `${BASE}logo_brewglitter.png`,
  bakell:      `${BASE}logo_bakell.png`,
  pfg:         `${BASE}logo_pfg.png`,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });

// PPU formatter: 4 decimal places for values < $1, 2 for values >= $1 (matches standard mode)
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

// Format an integer quantity with a unit suffix
function fmtQty(qty: number, unit: string): string {
  return `${Math.round(qty).toLocaleString()} ${unit}`;
}

export interface CoPackingPdfArgs {
  brandId:             BrandId;
  customer:            CustomerInfo;
  coPackingState:      CoPackingState;
  coPackingResults:    CoPackingResult[];
  coPackingProcesses?: CoPackingProcess[];
  adjustedRevenue?:    number;  // when set, overrides the natural grand total in the PDF
}

export async function buildCoPackingQuotePreview(args: CoPackingPdfArgs): Promise<QuotePreview> {
  const { brandId, customer, coPackingState, coPackingResults, coPackingProcesses = [], adjustedRevenue } = args;
  const s = coPackingState;

  const brand        = BRANDS.find(b => b.id === brandId)!;
  const quoteId      = generateQuoteId();
  const today        = new Date();
  const logoDataUrl  = await loadImageAsDataUrl(LOGO_SRCS[brand.id]);
  const [ar, ag, ab] = hexToRgb(brand.accent);

  const doc   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const L = 14;           // left margin
  const R = pageW - L;    // right edge
  const W = pageW - 2*L;  // usable width

  // Typography helpers (identical to standard mode)
  const sf = (style: "normal" | "bold" | "italic" = "normal", size = 10) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
  };
  const gray    = [40, 40, 40]  as [number,number,number];
  const ltGray  = [180,180,180] as [number,number,number];
  const rowGray = [245,245,245] as [number,number,number];

  // ── Section 1 — Header Box (identical to standard mode) ──────────────────
  const HDR_TOP = 10;
  const HDR_H   = 50;
  const HDR_BOT = HDR_TOP + HDR_H;

  doc.setDrawColor(...ltGray);
  doc.setLineWidth(0.3);
  doc.rect(L, HDR_TOP, W, HDR_H);

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

  sf("normal", 11); doc.setTextColor(...gray);
  doc.text(brand.address1, R - 3, HDR_TOP + 9,  { align: "right" });
  doc.text(brand.address2, R - 3, HDR_TOP + 15, { align: "right" });

  // ── Section 2 — Customer Info Box (identical to standard mode) ───────────
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

  // ── Section 3 — Product Name / Description Block (identical to standard) ──
  y += CUST_H + 5;
  const unitLabel = s.unitSizeUnit || "g";
  const projectName = customer.productName || `${customer.customer || "Customer"} Co-Packing`;
  const prodFields: [string, string][] = [
    ["Project Name:",    projectName || "—"],
    ["Unit Size:",       s.sachetSizeG > 0 ? `${s.sachetSizeG} ${unitLabel}` : "—"],
    ["Product Category:", customer.productCategory || "—"],
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

  // ── Section 4 — Lead Time Table (identical to standard, omitted if no data) ─
  // Co-packing does not currently track lead-time/start-date inputs, so this
  // table is shown only if the host ever supplies that data via pricingAssumptions
  // metadata. With no source of truth for these values, the section is omitted —
  // matching the spec's "omit if all values are zero/empty" rule.
  y += PROD_H + 5;

  // ── Page-break helper (mutates y via closure) ─────────────────────────────
  const MARGIN_BOTTOM = 15;
  const checkPageBreak = (neededMm: number) => {
    if (y + neededMm > pageH - MARGIN_BOTTOM) {
      doc.addPage();
      y = 20;
    }
  };

  // Grand total — computed up front so the summary callout can reference it
  // (adjustedRevenue overrides the natural/minimum-applied total)
  const naturalTotal = coPackingResults.reduce((acc, r) => acc + r.customerPrice, 0);
  const minCharge    = s.minimumJobCharge ?? 0;
  const minApplies   = minCharge > 0 && naturalTotal < minCharge;
  const grandTotal   = adjustedRevenue ?? (minApplies ? minCharge : naturalTotal);
  const grandPPU     = s.unitsDelivered > 0 ? grandTotal / s.unitsDelivered : 0;

  // ── Section 5 — Project Overview Box (identical to standard mode) ────────
  const overviewText = customer.projectOverview || "";

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
  const summaryLine = `Total Project Cost ${fmt(grandTotal)}  (${fmtPPU(grandPPU)} / unit)  —  see itemized breakdown below for details.`;
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

  sf("bold", 10); doc.setTextColor(ar, ag, ab);
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

  y += SUMMARY_H + 5;

  // ── Section 6 — Pricing Table ─────────────────────────────────────────────
  const body: string[][] = [];

  // Inbound Material Handling & Intake (always shown)
  const inboundResult = coPackingResults.find(r => r.label.toLowerCase().includes("inbound"));
  if (inboundResult) {
    const delGrams = s.unitsDelivered * s.sachetSizeG;
    const ppu      = delGrams > 0 ? inboundResult.customerPrice / delGrams : 0;
    body.push([
      "Inbound Material Handling & Intake (receiving, inspection & staging)",
      fmtQty(delGrams, unitLabel),
      fmtPPU(ppu),
      fmt(inboundResult.customerPrice),
    ]);
  }

  // Testing & Documentation — each test rendered as its own line item
  if (s.testingEnabled && s.testingRows?.length) {
    const markup = s.testingMarkup ?? 0;
    for (const row of s.testingRows) {
      const testCustomer = (row.cost ?? 0) * s.numSkus * (1 + markup);
      if (testCustomer <= 0) continue;
      const testName = row.testType === "Custom" ? (row.customTestName || "Custom") : row.testType;
      const ppu = s.unitsDelivered > 0 ? testCustomer / s.unitsDelivered : 0;
      body.push([
        `Testing & Documentation – ${testName}`,
        `${s.numSkus} SKUs`,
        fmtPPU(ppu),
        fmt(testCustomer),
      ]);
    }
  }

  // Project Setup, Line Dial-In & Quality Assurance (always shown)
  const setupResult = coPackingResults.find(r => r.label.toLowerCase().includes("setup"));
  if (setupResult) {
    body.push([
      "Project Setup, Line Dial-In & Quality Assurance",
      "1",
      fmt(setupResult.customerPrice),
      fmt(setupResult.customerPrice),
    ]);
  }



  // Packaging levels — one row per coPackingColumn / packaging summary row with non-zero customer total
  const ADMIN_LABELS = ["inbound", "setup", "pallet", "overhead", "minimum labor", "minimum job"];
  const levelResults = coPackingResults.filter(r => {
    const lbl = r.label.toLowerCase();
    return !ADMIN_LABELS.some(a => lbl.includes(a));
  });
  for (const r of levelResults) {
    if (r.customerPrice <= 0) continue;
    const ppu = r.deliveredQty > 0 ? r.customerPrice / r.deliveredQty : 0;
    const desc = r.description ? `${r.label} – ${r.description}` : (r.label || "Primary Fill");
    body.push([
      desc,
      fmtQty(r.deliveredQty, "units"),
      fmtPPU(ppu),
      fmt(r.customerPrice),
    ]);
  }

  // Overhead & Indirect Costs (only if enabled and non-zero)
  const overheadResult = coPackingResults.find(r => r.label.toLowerCase().includes("overhead"));
  if (s.overheadEnabled && overheadResult && overheadResult.customerPrice > 0) {
    body.push([
      "Overhead & Indirect Costs",
      "—",
      "—",
      fmt(overheadResult.customerPrice),
    ]);
  }

  // Palletization & Outbound Staging (always shown)
  const palletResult = coPackingResults.find(r => r.label.toLowerCase().includes("pallet"));
  if (palletResult) {
    const inbPallets = palletResult.requiredQty;
    const outPallets = palletResult.deliveredQty;
    const ppu = outPallets > 0 ? palletResult.customerPrice / outPallets : 0;
    body.push([
      `Palletization & Outbound Staging\n(${inbPallets} inbound / ${outPallets} outbound pallets)`,
      `${outPallets} out`,
      fmtPPU(ppu),
      fmt(palletResult.customerPrice),
    ]);
  }

  // Minimum Job Charge Adjustment (only if applied)
  if (minApplies) {
    const diff = minCharge - naturalTotal;
    body.push([
      "Minimum Job Charge Adjustment",
      "—",
      "—",
      fmt(diff),
    ]);
  }

  // ── Upfront page-break check before drawing the table ────────────────────
  const rowCount    = body.length;
  const tableHeight = rowCount * 14 + 16; // 14mm/row + 16mm for the Total row
  if (tableHeight + y > pageH - 60) {
    doc.addPage();
    y = 20;
  }

  autoTable(doc, {
    startY: y, margin: { left: L, right: L },
    head: [["Description", "Delivered Qty", "PPU", "Total"]],
    body,
    styles: {
      font: "helvetica", fontSize: 9.5,
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
      textColor: gray, lineColor: ltGray, lineWidth: 0.2,
      fillColor: [255,255,255],
      minCellHeight: 7,
    },
    headStyles: { fontStyle: "bold", fillColor: [255,255,255], textColor: gray },
    alternateRowStyles: { fillColor: rowGray },
    columnStyles: {
      0: { halign: "left",  cellWidth: "auto" },
      1: { halign: "right", cellWidth: 28 },
      2: { halign: "right", cellWidth: 28 },
      3: { halign: "right", cellWidth: 28 },
    },
    tableLineColor: ltGray, tableLineWidth: 0.2,
  });

  // ── Total Project Cost row — drawn on the SAME page as the last table row ──
  y = (doc as any).lastAutoTable.finalY;

  const ROW_H      = 10;
  const totalRowY  = y;

  doc.setDrawColor(...gray);
  doc.setLineWidth(0.5);
  doc.line(L, totalRowY, L + W, totalRowY);  // bold top border

  sf("bold", 10.5); doc.setTextColor(...gray);
  doc.text("Total Project Cost", L + 4, totalRowY + 6.5);

  const totalColX = L + W - 4;
  doc.text(fmt(grandTotal), totalColX, totalRowY + 6.5, { align: "right" });

  doc.setDrawColor(...ltGray);
  doc.setLineWidth(0.2);
  doc.line(L, totalRowY + ROW_H, L + W, totalRowY + ROW_H);

  y = totalRowY + ROW_H + 10;

  // ── Section 7 — Footer ────────────────────────────────────────────────────

  // Co-packing-specific: Pricing Assumptions block (rendered first, ahead of the
  // standard footer items) — preserves existing co-packing behavior of surfacing
  // material-supply assumptions text before the universal cancellation/disclaimer.
  const pricingAssumptionsText =
    "Customer supplies all materials (product, film, cartons). Pricing assumes production rates and handling consistent with prior testing. Material delays or product variability may impact schedule and/or cost.\n\nThis quote is valid for fourteen (14) days from the date of issue and subject to production scheduling availability and timely receipt of all customer-supplied materials.";

  sf("bold", 10); doc.setTextColor(...gray);
  const paPrefix = "Pricing Assumptions:  ";
  const paW = doc.getTextWidth(paPrefix);
  sf("italic", 8); doc.setTextColor(90, 90, 90);
  const paLines = doc.splitTextToSize(pricingAssumptionsText, W - paW);
  const paH = Math.max(paLines.length, 1) * 3.8 + 2;

  // Pre-compute Cancellation Policy + Disclaimer heights too, so checkPageBreak
  // for Pricing Assumptions accounts for the whole footer staying together.
  const cancelPolicy = "All wholesale and bulk orders are final and non-cancellable upon approval. No refunds, returns, cancellations, or modifications will be accepted thereafter.";
  const cancelPrefix = "Cancellation Policy:  ";
  sf("bold", 10);
  const cpW = doc.getTextWidth(cancelPrefix);
  sf("normal", 10);
  const cancelLines = doc.splitTextToSize(cancelPolicy, W - cpW);
  const cancelH = Math.max(cancelLines.length, 1) * 5 + 2;

  const disclaimer = "This document is a quotation only and does not constitute a formal offer, contract, or order. Prices and terms are subject to change without notice and are valid only for the period specified (14 days from the date hereof). All quotes are subject to product availability, credit approval, and our standard Terms and Conditions (available upon request). Acceptance of this quote requires written confirmation and may be subject to final review.";
  const disclaimerPrefix = "Quote Disclaimer:  ";
  sf("italic", 8);
  const disclaimerLines = doc.splitTextToSize(`${disclaimerPrefix}${disclaimer}`, W);
  const disclaimerH = disclaimerLines.length * 3.8 + 2;

  const footerH = paH + 6 + cancelH + 6 + disclaimerH;
  checkPageBreak(footerH);

  sf("bold", 10); doc.setTextColor(...gray);
  doc.text(paPrefix, L, y);
  sf("italic", 8); doc.setTextColor(90, 90, 90);
  doc.text(paLines[0], L + paW, y);
  if (paLines.length > 1) doc.text(paLines.slice(1), L, y + 3.8);
  y += paH + 6;

  // Cancellation Policy
  sf("bold", 10); doc.setTextColor(...gray);
  doc.text(cancelPrefix, L, y);
  sf("normal", 10);
  doc.text(cancelLines[0], L + cpW, y);
  if (cancelLines.length > 1) doc.text(cancelLines.slice(1), L, y + 5);
  y += cancelH + 6;

  // Quote Disclaimer
  sf("italic", 8); doc.setTextColor(90, 90, 90);
  doc.text(disclaimerLines, L, y);
  y += disclaimerH;

  // ── Pricing Tiers (separate page) ─────────────────────────────────────────
  if (s.tiersEnabled) {
    const tierResults = computePricingTiers(s, coPackingProcesses);
    if (tierResults.length > 1) {
      doc.addPage();
      let ty = 15;
      sf("bold", 13); doc.setTextColor(...gray);
      doc.text("Volume Pricing Scenarios", L, ty); ty += 10;

      const allLabels    = Array.from(new Set(tierResults.flatMap(tr => tr.results.map(r => r.label))));
      const tierHead     = ["Cost Component", ...tierResults.map(tr => `${tr.tier.label}\n(${tr.tier.units.toLocaleString()} units)`)];
      const tierBody: string[][] = allLabels.map(lbl => [
        lbl,
        ...tierResults.map(tr => {
          const r = tr.results.find(r => r.label === lbl);
          return r ? fmt(r.customerPrice) : "—";
        }),
      ]);
      tierBody.push(["Total", ...tierResults.map(tr => fmt(tr.totalCustomer))]);
      tierBody.push(["PPU",   ...tierResults.map(tr => fmt(tr.ppu))]);
      tierBody.push(["Margin %", ...tierResults.map(tr => `${tr.margin.toFixed(1)}%`)]);
      if (tierResults.length > 1) {
        const pilotPPU = tierResults[0].ppu;
        tierBody.push(["Savings vs " + tierResults[0].tier.label, ...tierResults.map((tr, i) =>
          i === 0 ? "—" : tr.ppu < pilotPPU ? `-${fmt(pilotPPU - tr.ppu)}/unit` : "—"
        )]);
      }
      const totalsStartIdx = allLabels.length;
      autoTable(doc, {
        startY: ty, margin: { left: L, right: L },
        head: [tierHead],
        body: tierBody,
        styles: { font: "helvetica", fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 }, textColor: gray, lineColor: ltGray, lineWidth: 0.2 },
        headStyles: { fontStyle: "bold", fillColor: [255,255,255], textColor: gray },
        alternateRowStyles: { fillColor: rowGray },
        willDrawCell: (data) => {
          if (data.section === "body" && data.row.index >= totalsStartIdx) {
            doc.setFont("helvetica", "bold");
          }
        },
        tableLineColor: ltGray, tableLineWidth: 0.2,
      });
    }
  }

  // ── Filename: {CustomerName}_{ProjectName}_{Units}_{YYYY-MM-DD}.pdf ────────
  const clean = (str: string) => (str || "Unknown").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "");
  const dateStr = today.toISOString().split("T")[0]; // YYYY-MM-DD
  const filename = [
    clean(customer.customer),
    clean(projectName),
    String(Math.round(s.unitsDelivered) || 0),
    dateStr,
  ].join("_") + ".pdf";

  const blob    = doc.output("blob");
  const blobUrl = URL.createObjectURL(blob);

  return { filename, blobUrl, moqLabel: "Co-Packing", packLabel: "", doc };
}
