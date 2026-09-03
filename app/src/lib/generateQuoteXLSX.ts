import ExcelJS from "exceljs";
import { ProjectFormData, SummaryRow } from "./types";
import { MoqPricingRow } from "./ProjectContext";
import { Column } from "./types";
import { BrandId, CustomerInfo } from "./generateQuotePDF";

// --- helpers ------------------------------------------------------------------

const n = (s: string | undefined) => parseFloat(s || "0") || 0;

// Convert ISO date string "YYYY-MM-DD" to Excel serial number (days since 1900-01-00)
function dateToSerial(iso: string): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  // Excel epoch: Jan 0, 1900 = day 0; JS epoch: Jan 1, 1970
  // Excel serial = (JS ms / ms-per-day) + 25569 (days from 1900-01-01 to 1970-01-01)
  return Math.round(d.getTime() / 86400000) + 25569;
}

// --- column helpers -----------------------------------------------------------

// Find the first column of a given level in the columns array
function colByLevel(columns: Column[], level: string): Column | undefined {
  return columns.find((c) => c.level === level);
}

// --- main export -------------------------------------------------------------

export interface XlsxExportArgs {
  formData:            ProjectFormData;
  allMoqResults:       MoqPricingRow[];
  perMoqSummaryRows:   Map<number, SummaryRow[]>;
  columns:             Column[];           // raw (base) columns from ProjectContext
  customer:            CustomerInfo;
  selectedBrand:       BrandId;
  moqMargins:          Record<number, string>;
  selectedMoq:         MoqPricingRow;     // the MOQ the user chose in the selection modal
  primaryProductName?: string;            // first packaging summary row type name
  primaryDelivQty?:    number;            // primary delivered qty (for filename)
}

export async function generateQuoteXLSX(args: XlsxExportArgs): Promise<void> {
  const { formData, allMoqResults, perMoqSummaryRows, columns, customer, moqMargins, selectedMoq,
          primaryProductName = "", primaryDelivQty = 0 } = args;

  // 1. Fetch the template from /app/costing_template.xlsx
  const resp = await fetch("/app/costing_template.xlsx");
  if (!resp.ok) throw new Error(`Could not load template: ${resp.status}`);
  const arrayBuffer = await resp.arrayBuffer();

  // 2. Load into ExcelJS
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);

  const ws = wb.getWorksheet("Co Packing Inputs");
  if (!ws) throw new Error("Template is missing 'Co Packing Inputs' sheet");

  // Use the user-selected MOQ for quantity/pack cells
  const firstMoq    = selectedMoq ?? allMoqResults[0];
  const moqQty      = n(firstMoq?.moqRow.moq) || n(firstMoq?.moqRow.individualUnits);
  const moqPack     = n(firstMoq?.moqRow.unitsPerInner);

  // 3. Map app columns to template sections.
  // For Inner / Case: prefer the column whose unitsPerInner matches the selected MOQ's
  // pack size so row-data (fill rate, cost/unit, etc.) is correct for that pack.
  const col1 = colByLevel(columns, "Individual Units");
  const col2 = colByLevel(columns, "Final Kit Units");
  const col3 = moqPack > 0
    ? (columns.find((c) => c.level === "Inner / Case" && n(c.unitsPerInner) === moqPack)
       ?? colByLevel(columns, "Inner / Case"))
    : colByLevel(columns, "Inner / Case");
  const col4 = colByLevel(columns, "Shipper / Outer");

  // Helper: write a value to a cell by address (e.g. "H5"), preserving style/formula
  const set = (addr: string, value: string | number) => {
    const cell = ws.getCell(addr);
    cell.value = value;
  };

  // -- G/H: Customer Project Overview inputs ---------------------------------
  set("H3",  col1?.type ?? "4oz Sachets");                       // Packaging Type 1
  set("H4",  col2?.type ?? "4oz Tins");                          // Packaging Type 2
  set("H5",  moqQty || n(col1?.units || formData.ppuDenominator)); // # of units Pkg 1
  set("H6",  moqQty || n(col2?.units || formData.ppuDenominator)); // # of units Final Kit
  set("H7",  n(formData.unitWeight));                              // Unit size (g)
  set("H8",  moqPack > 0 ? moqPack : 24);                          // Units per inner
  set("H9",  firstMoq ? n(firstMoq.moqRow.innersPerMaster) : 0);  // Inners per master
  set("H10", n(formData.setupFeeCustomer));                        // Setup + QA fee (customer)
  set("H12", moqQty || n(formData.ppuDenominator));               // PPU Denominator

  set("H27", n(formData.leadTimeBufferDays));                    // Lead time buffer (days)

  // H34 is Start Date - template stores as Excel serial number
  const startSerial = dateToSerial(formData.startDate);
  if (startSerial > 0) {
    const cell = ws.getCell("H34");
    cell.value = startSerial;
    // Keep whatever number format the template already has for dates
  }

  // H39: Landed price per lb - template has 4.18, not directly in our formData.
  // We can derive it: costPerGram * 453.592 (g/lb). If zero, leave template default.
  const landedPricePerLb = n(formData.costPerGram) * 453.592;
  if (landedPricePerLb > 0) set("H39", landedPricePerLb);

  set("H44", moqQty || n(col1?.units || formData.ppuDenominator)); // Units (same as H5)
  set("H45", moqPack > 0 ? moqPack : 24);                         // Units per case pack

  // -- J/K: Raw Material inputs ----------------------------------------------
  set("K3",  n(formData.materialOverage) / 100);                 // Overage rate (decimal)
  set("K4",  n(formData.intakeFee));                             // Intake fee per pallet
  set("K5",  n(formData.numPallets));                            // # of pallets
  // K6 = # of Product SKUs (template uses K6, not K5 for SKUs based on inspection)
  set("K6",  n(formData.numSkus));                               // # of Product SKUs
  set("K7",  (formData.testingRows ?? []).reduce((sum, r) => sum + (r.cost ?? 0), 0)); // Total testing cost / SKU
  set("K9",  n(formData.costPerGram));                           // Cost per gram
  set("K10", n(formData.leftOverInventoryCost));                 // Left over inventory cost
  set("K11", n(formData.leftOverInventoryAbsorb) / 100);         // Left over inventory absorb %

  // Markup section (rows 17-19)
  set("K17", n(formData.intakeFeeMarkup) / 100);                 // Intake fee markup %
  set("K18", n(formData.testingMarkup) / 100);                   // Testing markup %
  set("K19", n(formData.rawMaterialMarkup) / 100);               // Raw material markup %

  // -- M/N: Packaging 1 (Individual Units) inputs ---------------------------
  if (col1) {
    set("N3",  n(col1.rows?.["Overage Rate"]) / 100);
    set("N4",  n(col1.rows?.["Wage Rate"]));
    set("N5",  n(col1.rows?.["Unit Fill Rate / min"]));
    set("N6",  n(col1.rows?.["Packaging Cost / unit"]));
    set("N7",  n(col1.rows?.["Label Print Cost / unit"]));
    set("N8",  n(col1.rows?.["Label Apply Rate / min"]));
    set("N9",  0);                                                // packaging weight (g) - not stored per-column in our model
    set("N10", n(col1.rows?.["No. of Staff / Stations"]));
    set("N11", n(col1.rows?.["Hrs / Shift"]));
    set("N12", n(col1.rows?.["Working Days"]) || 5);
    // Markup rows
    set("N17", n(col1.efficiency) / 100);                        // Efficiency buffer %
    set("N18", n(col1.labor) / 100);                             // Labor cost markup %
    set("N19", n(col1.unitCost) / 100);                          // Cost per unit markup %
  }

  // -- P/Q: Packaging 2 (Final Kit Units) inputs ----------------------------
  if (col2) {
    set("Q3",  n(col2.rows?.["Overage Rate"]) / 100);
    set("Q4",  n(col2.rows?.["Wage Rate"]));
    set("Q5",  n(col2.rows?.["Unit Fill Rate / min"]));
    set("Q6",  n(col2.rows?.["Packaging Cost / unit"]));
    set("Q7",  n(col2.rows?.["Label Print Cost / unit"]));
    set("Q8",  col2.tabs ? n(col2.rows?.["Tab Cost / unit"]) : 0);
    set("Q9",  n(col2.rows?.["Label Apply Rate / min"]));
    set("Q10", 0);                                                // packaging weight (g)
    set("Q11", n(col2.rows?.["No. of Staff / Stations"]));
    set("Q12", n(col2.rows?.["Hrs / Shift"]));
    set("Q13", n(col2.rows?.["Working Days"]) || 5);
    set("Q17", n(col2.efficiency) / 100);
    set("Q18", n(col2.labor) / 100);
    set("Q19", n(col2.unitCost) / 100);
  }

  // -- S/T: Packout 1 - Inners inputs ---------------------------------------
  if (col3) {
    set("T3",  n(col3.rows?.["Overage Rate"]) / 100);
    set("T4",  n(col3.rows?.["Wage Rate"]));
    set("T5",  n(col3.rows?.["Unit Fill Rate / min"]));
    set("T6",  n(col3.rows?.["Packaging Cost / unit"]));
    set("T7",  0);                                                // carton weight (g) - not in our model
    set("T8",  n(col3.rows?.["No. of Staff / Stations"]));
    set("T9",  n(col3.rows?.["Hrs / Shift"]));
    set("T10", n(col3.rows?.["Working Days"]) || 5);
    set("T17", n(col3.efficiency) / 100);
    set("T18", n(col3.labor) / 100);
    set("T19", n(col3.unitCost) / 100);
  }

  // -- V/W: Packout 2 - Shippers inputs -------------------------------------
  if (col4) {
    set("W3",  n(col4.rows?.["Overage Rate"]) / 100);
    set("W4",  n(col4.rows?.["Wage Rate"]));
    set("W5",  n(col4.rows?.["Unit Fill Rate / min"]));
    set("W6",  n(col4.rows?.["Packaging Cost / unit"]));
    set("W7",  0);                                                // carton weight (g)
    set("W8",  n(col4.rows?.["No. of Staff / Stations"]));
    set("W9",  n(col4.rows?.["Hrs / Shift"]));
    set("W10", n(col4.rows?.["Working Days"]) || 5);
    set("W17", n(col4.efficiency) / 100);
    set("W18", n(col4.labor) / 100);
    set("W19", n(col4.unitCost) / 100);
  }

  // -- Y/Z: Packout 3 - Pallets & Outbound inputs ---------------------------
  set("Z3",  n(formData.outboundFee));                           // Outbound fee per pallet
  // Z4: total pallets - derive from pallet summary row: palletOurCost / outboundFee
  const moqSRows    = perMoqSummaryRows.get(firstMoq?.moqRow.id ?? -1) ?? [];
  const palletSRow  = moqSRows.find(r => r.label === "Pallets & Fees");
  const outFeeXlsx  = n(formData.outboundFee);
  const palletCount = (palletSRow && outFeeXlsx > 0)
    ? Math.round(palletSRow.ourCosts / outFeeXlsx)
    : 0;
  set("Z4",  palletCount);
  set("Z17", n(formData.outboundFeeMarkup) / 100);               // Outbound fee markup %
  set("Z18", n(formData.palletBuffer) || 1);                     // Added pallets buffer

  // -- C61: What If - Lowered Sale Price (customer PPU from selected MOQ) --
  if (firstMoq) {
    const marginStr = moqMargins[firstMoq.moqRow.id] ?? "";
    const marginVal = parseFloat(marginStr);
    const hasMargin = marginStr !== "" && !isNaN(marginVal) && marginVal < 100;
    const adjPPU    = hasMargin ? firstMoq.ppuCost / (1 - marginVal / 100) : firstMoq.ppu;
    if (adjPPU > 0) set("C61", adjPPU);
  }

  // 4. Generate and download
  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement("a");

  const safeStr = (s: string) => s.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const units   = primaryDelivQty > 0
    ? String(Math.round(primaryDelivQty))
    : (firstMoq?.moqRow.moq || formData.ppuDenominator || "0");
  a.href         = url;
  a.download     = [
    safeStr(customer.customer || "Customer"),
    safeStr(primaryProductName || customer.productName || "Quote"),
    units,
    dateStr,
  ].join("_") + ".xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
