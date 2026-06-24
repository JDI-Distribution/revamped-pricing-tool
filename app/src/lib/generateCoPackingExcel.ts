import ExcelJS from "exceljs";
import { CoPackingState, CoPackingResult } from "./types";
import { BrandId, CustomerInfo } from "./generateQuotePDF";

// ── Helpers ───────────────────────────────────────────────────────────────────
const currFmt   = '"$"#,##0.00';
const ppuFmt    = '"$"#,##0.0000';
const intFmt    = "#,##0";
const pctFmt    = '0.0"%"';

function dateFmt(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function bold(cell: ExcelJS.Cell) { cell.font = { ...(cell.font ?? {}), bold: true }; }
function bg(cell: ExcelJS.Cell, color: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
}
function border(cell: ExcelJS.Cell) {
  const b = { style: "thin" as const, color: { argb: "FFD0D0D0" } };
  cell.border = { top: b, left: b, bottom: b, right: b };
}
function headerRow(row: ExcelJS.Row, bgColor = "FFE8E8E8") {
  row.eachCell(cell => { bold(cell); bg(cell, bgColor); border(cell); cell.alignment = { vertical: "middle" }; });
}

// ── Sheet 1: Customer View – Quote ───────────────────────────────────────────
function buildCustomerSheet(
  ws: ExcelJS.Worksheet,
  results: CoPackingResult[],
  s: CoPackingState,
) {
  ws.columns = [
    { header: "Description",   key: "desc",  width: 52 },
    { header: "Required Qty",  key: "req",   width: 18 },
    { header: "Delivered Qty", key: "del",   width: 18 },
    { header: "Unit Price (PPU)", key: "ppu", width: 18 },
    { header: "Total Price",   key: "total", width: 18 },
  ];

  const hdr = ws.getRow(1);
  hdr.font = { bold: true };
  hdr.eachCell(cell => { bg(cell, "FFE8E8E8"); border(cell); cell.alignment = { vertical: "middle", wrapText: true }; });
  hdr.height = 22;

  let rowIdx = 2;
  for (const r of results) {
    const row = ws.getRow(rowIdx++);
    row.getCell(1).value = r.description ? `${r.label}\n(${r.description})` : r.label;
    row.getCell(1).alignment = { wrapText: true, vertical: "top" };

    const isSetup    = r.label.toLowerCase().includes("setup");
    const isPallet   = r.label.toLowerCase().includes("pallet");
    const isInbound  = r.label.toLowerCase().includes("inbound");

    if (isSetup) {
      row.getCell(2).value = 1;
      row.getCell(3).value = 1;
    } else if (isPallet) {
      row.getCell(2).value = `${r.requiredQty} in`;
      row.getCell(3).value = `${r.deliveredQty} out`;
    } else {
      row.getCell(2).value = Math.round(r.requiredQty);
      row.getCell(3).value = isInbound ? Math.round(r.deliveredQty) : Math.round(r.deliveredQty);
      row.getCell(2).numFmt = intFmt;
      row.getCell(3).numFmt = intFmt;
    }

    row.getCell(4).value  = r.ppu;
    row.getCell(4).numFmt = r.ppu < 1 ? ppuFmt : currFmt;
    row.getCell(5).value  = r.customerPrice;
    row.getCell(5).numFmt = currFmt;
    row.eachCell(cell => border(cell));
    row.height = r.description ? 30 : 18;
  }

  // Totals row
  const grandTotal = results.reduce((s, r) => s + r.customerPrice, 0);
  const totRow = ws.getRow(rowIdx++);
  totRow.getCell(1).value = "Total Project Cost";
  totRow.getCell(5).value = grandTotal;
  totRow.getCell(5).numFmt = currFmt;
  totRow.eachCell(cell => { bold(cell); bg(cell, "FFFFF3CC"); border(cell); });

  // Pricing assumptions
  const assumptionsRow = ws.getRow(rowIdx + 1);
  const assumptionsText = s.pricingAssumptions?.trim() ||
    "Customer supplies all materials (product, film, cartons). Pricing assumes production rates and handling consistent with prior testing. Material delays or product variability may impact schedule and/or cost. This quote is valid for fourteen (14) days from the date of issue.";
  assumptionsRow.getCell(1).value = `Pricing assumptions: ${assumptionsText}`;
  assumptionsRow.getCell(1).alignment = { wrapText: true };
  ws.mergeCells(`A${rowIdx + 1}:E${rowIdx + 1}`);
  assumptionsRow.height = 50;
  assumptionsRow.getCell(1).font = { italic: true, size: 9 };
}

// ── Sheet 2: Overview ─────────────────────────────────────────────────────────
function buildOverviewSheet(
  ws: ExcelJS.Worksheet,
  results: CoPackingResult[],
  customer: CustomerInfo,
) {
  ws.columns = [
    { key: "a", width: 30 },
    { key: "b", width: 18 },
    { key: "c", width: 18 },
    { key: "d", width: 18 },
    { key: "e", width: 18 },
    { key: "f", width: 4 },
    { key: "g", width: 22 },
    { key: "h", width: 18 },
    { key: "i", width: 18 },
    { key: "j", width: 14 },
  ];

  // Left table header
  const h1 = ws.getRow(1);
  ["Project Overview", "Required Qty", "Delivered Qty", "PPU", "Total Price"].forEach((t, i) => {
    h1.getCell(i + 1).value = t;
  });
  headerRow(h1);

  let r = 2;
  for (const res of results) {
    const row = ws.getRow(r++);
    row.getCell(1).value = res.label;
    row.getCell(2).value = res.label.toLowerCase().includes("setup") ? 1 : Math.round(res.requiredQty);
    row.getCell(3).value = res.label.toLowerCase().includes("setup") ? 1 : Math.round(res.deliveredQty);
    row.getCell(4).value = res.ppu;
    row.getCell(4).numFmt = res.ppu < 1 ? ppuFmt : currFmt;
    row.getCell(5).value = res.customerPrice;
    row.getCell(5).numFmt = currFmt;
    if (![2, 3].includes(r - 2)) {
      row.getCell(2).numFmt = intFmt;
      row.getCell(3).numFmt = intFmt;
    }
    row.eachCell(c => border(c));
  }

  // Totals
  const totR = ws.getRow(r);
  const totalOur = results.reduce((s, res) => s + res.ourCost, 0);
  const totalCx  = results.reduce((s, res) => s + res.customerPrice, 0);
  totR.getCell(1).value = "TOTAL";
  totR.getCell(5).value = totalCx;
  totR.getCell(5).numFmt = currFmt;
  totR.eachCell(c => { bold(c); bg(c, "FFE8E8E8"); border(c); });

  // Right table: cost breakdown
  const rh = ws.getRow(1);
  rh.getCell(7).value = "Total Project Costs";
  rh.getCell(8).value = "Customer Price";
  rh.getCell(9).value = "Our Costs";
  rh.getCell(10).value = "Margin %";
  [7, 8, 9, 10].forEach(i => { bold(rh.getCell(i)); bg(rh.getCell(i), "FFE8E8E8"); border(rh.getCell(i)); });

  let rr = 2;
  for (const res of results) {
    const row = ws.getRow(rr++);
    row.getCell(7).value = res.label;
    row.getCell(8).value = res.customerPrice;
    row.getCell(8).numFmt = currFmt;
    row.getCell(9).value = res.ourCost;
    row.getCell(9).numFmt = currFmt;
    const margin = res.customerPrice > 0 ? ((res.customerPrice - res.ourCost) / res.customerPrice) * 100 : 0;
    row.getCell(10).value = margin / 100;
    row.getCell(10).numFmt = '0.0%';
    [7, 8, 9, 10].forEach(i => border(row.getCell(i)));
  }

  const totRR = ws.getRow(rr);
  const overallMargin = totalCx > 0 ? ((totalCx - totalOur) / totalCx) * 100 : 0;
  totRR.getCell(7).value = "TOTAL";
  totRR.getCell(8).value = totalCx;
  totRR.getCell(8).numFmt = currFmt;
  totRR.getCell(9).value = totalOur;
  totRR.getCell(9).numFmt = currFmt;
  totRR.getCell(10).value = overallMargin / 100;
  totRR.getCell(10).numFmt = '0.0%';
  [7, 8, 9, 10].forEach(i => { bold(totRR.getCell(i)); bg(totRR.getCell(i), "FFE8E8E8"); border(totRR.getCell(i)); });

  // Customer info block below
  const infoStart = Math.max(r, rr) + 2;
  [
    ["Customer:", customer.customer],
    ["Customer ID:", customer.customerId],
    ["Contact:", customer.name],
    ["Email:", customer.email],
    ["Product:", customer.productName],
    ["Quote Date:", new Date().toLocaleDateString("en-US")],
  ].forEach(([lbl, val], i) => {
    const row = ws.getRow(infoStart + i);
    row.getCell(1).value = lbl;
    row.getCell(1).font = { bold: true };
    row.getCell(2).value = val;
  });
}

// ── Sheet 3: Co-Packing Pricing (internal costing) ───────────────────────────
function buildCostingSheet(
  ws: ExcelJS.Worksheet,
  s: CoPackingState,
  results: CoPackingResult[],
) {
  ws.columns = [
    { key: "a", width: 28 },
    { key: "b", width: 20 },
    { key: "c", width: 20 },
    { key: "d", width: 16 },
  ];

  const section = (row: ExcelJS.Row, label: string) => {
    row.getCell(1).value = label;
    row.eachCell(c => { bold(c); bg(c, "FFDFE6F0"); border(c); });
    ws.mergeCells(`A${row.number}:D${row.number}`);
  };
  // Header
  const hdr = ws.getRow(1);
  hdr.values = ["Category", "Project Details", "Project Costs", "Overage Req"];
  headerRow(hdr, "FFD0D8E4");

  let rowN = 2;

  const addRows = (rows: [string, number][], fmtFn?: (lbl: string) => string | undefined) => {
    rows.forEach(([lbl, d]) => {
      const row = ws.getRow(rowN++);
      row.getCell(1).value = lbl;
      row.getCell(2).value = d;
      const fmt = fmtFn?.(lbl);
      if (fmt) row.getCell(2).numFmt = fmt;
      row.eachCell(c => border(c));
    });
  };

  // ── Project Overview ──
  section(ws.getRow(rowN++), "Customer Project Overview");
  addRows([
    ["Units Delivered",        s.unitsDelivered],
    [`Unit Size (${s.unitSizeUnit || "g"}/ea)`, s.sachetSizeG],
    ["Total Units",            s.unitsDelivered * s.sachetSizeG],
    ["Units / Inner",          s.sachetsPerInner],
    ["Inners / Master",       s.innersPerMaster],
    ["Setup Fee (Customer)",  s.setupFeeCustomer],
    ["Setup Fee (Our Cost)",  s.setupFeeOurCost],
  ], lbl => lbl.includes("Fee") || lbl.includes("Grams") ? currFmt : undefined);

  // ── Inbound ──
  const inboundResult = results.find(r => r.label.toLowerCase().includes("inbound"));
  if (inboundResult) {
    section(ws.getRow(rowN++), "Inbound Material Handling");
    addRows([
      ["Overage Rate",            s.inboundOverage * 100],
      ["Intake Fee / Pallet",     s.intakeFeePerPallet],
      ["# of Inbound Pallets",    s.inboundPallets],
      ["Intake Fee Markup %",     s.intakeMarkup * 100],
      ["Testing Cost / SKU",       s.testingRows?.reduce((sum, r) => sum + (r.cost ?? 0), 0) ?? 0],
      ["# of SKUs",               s.numSkus],
      ["Testing Fee Markup %",    (s.testingMarkup ?? 0.20) * 100],
      ["Our Cost",                inboundResult.ourCost],
      ["Customer Price",          inboundResult.customerPrice],
      ["PPU (per gram)",          inboundResult.ppu],
    ], lbl => lbl.includes("Cost") || lbl.includes("Price") || lbl.includes("Fee / P") ? currFmt : lbl.includes("PPU") ? ppuFmt : undefined);
  }

  // ── Packaging & Packout (per-column loop, mirrors coPackingCalculations.ts) ──
  const cpSummaryRows = s.coPackingPackagingSummaryRows ?? [];
  const cpCols        = s.coPackingColumns ?? [];
  cpCols.forEach((col, i) => {
    const sRow = cpSummaryRows[i];
    if (!sRow) return;
    const deliveredQty = sRow.units;
    const unitsReq     = deliveredQty * (1 + col.overageRate);
    const nominal = (col.labelEnabled && col.labelApplyRate > 0)
      ? (col.fillRatePerMin * col.labelApplyRate) / (col.fillRatePerMin + col.labelApplyRate)
      : col.fillRatePerMin;
    const effectiveRate = nominal * (1 - col.efficiencyBuffer);
    const calcHrs = effectiveRate > 0 ? (unitsReq / effectiveRate) / 60 : 0;
    const colResult = results[results.findIndex(r => r.label === (col.type || sRow.packagingLevel || `Packaging Level ${i + 1}`))];
    section(ws.getRow(rowN++), `${sRow.packagingLevel || `Level ${i + 1}`} – ${col.type || "Packaging"}`);
    addRows([
      ["Delivered Qty",          deliveredQty],
      ["Overage Rate %",         col.overageRate * 100],
      ["Required Qty",           unitsReq],
      ["Fill Rate / min",        col.fillRatePerMin],
      ["Efficiency Buffer %",    col.efficiencyBuffer * 100],
      ["Effective Rate / min",   effectiveRate],
      ["Total Hours",            calcHrs],
      ["Wage Rate / hr",         col.wageRate],
      ["Labor Markup %",         col.laborMarkup * 100],
      ["Unit Cost Markup %",     col.unitCostMarkup * 100],
      ["Packaging Cost / unit",  sRow.costPerUnit],
      ["Our Cost",               colResult?.ourCost ?? 0],
      ["Customer Price",         colResult?.customerPrice ?? 0],
      ["PPU",                    colResult?.ppu ?? 0],
    ], lbl => lbl.includes("Cost") || lbl.includes("Price") ? currFmt : lbl === "PPU" ? ppuFmt : lbl.includes("Hours") ? "0.00" : undefined);
  });

  // ── Palletization ──
  const palletResult = results.find(r => r.label.toLowerCase().includes("pallet"));
  if (palletResult) {
    section(ws.getRow(rowN++), "Palletization & Outbound");
    addRows([
      ["# of Outbound Pallets",  s.outboundPallets],
      ["Outbound Fee / Pallet",  s.outboundFeePerPallet],
      ["Outbound Markup %",      s.outboundMarkup * 100],
      ["Our Cost",               palletResult.ourCost],
      ["Customer Price",         palletResult.customerPrice],
    ], lbl => lbl.includes("Cost") || lbl.includes("Price") || lbl.includes("Fee") ? currFmt : undefined);
  }

  // ── Totals ──
  const soTot = ws.getRow(rowN++); section(soTot, "Project Totals");
  const totalOur = results.reduce((s, r) => s + r.ourCost, 0);
  const totalCx  = results.reduce((s, r) => s + r.customerPrice, 0);
  const margin   = totalCx > 0 ? ((totalCx - totalOur) / totalCx) * 100 : 0;

  [
    ["Total Our Cost", totalOur],
    ["Total Customer Price", totalCx],
    ["Overall Margin %", margin],
  ].forEach(([lbl, val]) => {
    const row = ws.getRow(rowN++);
    row.getCell(1).value = lbl;
    row.getCell(2).value = val as number;
    if ((lbl as string).includes("%")) row.getCell(2).numFmt = pctFmt;
    else row.getCell(2).numFmt = currFmt;
    bold(row.getCell(1));
    bold(row.getCell(2));
    row.eachCell(c => border(c));
  });
}

// ── Main export function ───────────────────────────────────────────────────────
export interface CoPackingExcelArgs {
  brandId:          BrandId;
  customer:         CustomerInfo;
  coPackingState:   CoPackingState;
  coPackingResults: CoPackingResult[];
}

export async function generateCoPackingExcel(args: CoPackingExcelArgs): Promise<void> {
  const { customer, coPackingState, coPackingResults } = args;

  const wb = new ExcelJS.Workbook();
  wb.creator = "JDI Distribution";
  wb.created = new Date();

  const ws1 = wb.addWorksheet("Customer View - Quote");
  const ws2 = wb.addWorksheet("Overview");
  const ws3 = wb.addWorksheet("Co Packing Pricing");

  buildCustomerSheet(ws1, coPackingResults, coPackingState);
  buildOverviewSheet(ws2, coPackingResults, customer);
  buildCostingSheet(ws3, coPackingState, coPackingResults);

  const buffer = await wb.xlsx.writeBuffer();
  const safe = (s: string) => s.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
  // ProductName = first packaging level description, Units = unitsDelivered
  const coProductName = coPackingState.sachetSizeG > 0
    ? `${coPackingState.sachetSizeG}${coPackingState.unitSizeUnit || "g"}_Units`
    : "Units";
  const filename = [
    safe(customer.customer || "Customer"),
    safe(coProductName),
    String(Math.round(coPackingState.unitsDelivered) || 0),
    dateFmt(),
  ].join("_") + ".xlsx";

  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}
