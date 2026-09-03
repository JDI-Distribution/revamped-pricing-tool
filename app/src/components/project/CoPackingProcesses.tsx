import { useState, useCallback, useEffect, useRef } from "react";
import React from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Info, Trash2 } from "lucide-react";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { CoPackingProcess, RecipeIngredient } from "@/lib/types";
import { uid as _uid } from "@/lib/uid";
import { RequiredToggle, useSectionRequired } from "@/lib/SectionRequiredContext";
import { useProject } from "@/lib/ProjectContext";
import { qtyWithOverage } from "@/lib/quantityMath";
import {
  convertProcessSpeedValue,
  fromGrams,
  PROCESS_SPEED_WEIGHT_UNITS,
  processSpeedToGramsPerHour,
  roundForDisplay,
  toGrams,
  WEIGHT_FACTORS_TO_GRAMS,
  WEIGHT_INPUT_UNITS,
} from "@/lib/weightUnits";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
const uid = () => String(_uid());

// â"€â"€ Collapse context + Col helper â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const CollapsedContext = React.createContext<Record<string, boolean>>({});

function Col({ proc, children }: { proc: CoPackingProcess; children: React.ReactNode }) {
  const collapsedCols = React.useContext(CollapsedContext);
  return collapsedCols[proc.id]
    ? <td className="border-l border-amber-200 bg-amber-50/40" style={{ width: 36, minWidth: 36 }} />
    : <td className="px-2 py-1 border-l border-amber-200 bg-[#fef9ee]">{children}</td>;
}

// â"€â"€ Style tokens â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const cellInp =
  "h-7 w-full px-2 border border-amber-200 text-[0.7rem] text-zinc-950 bg-amber-50/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/40 focus:border-[#e8473f] transition rounded";
const cellInpSuffix =
  "h-7 flex-1 min-w-0 px-2 border border-amber-200 border-r-0 text-[0.7rem] text-zinc-950 bg-amber-50/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/40 focus:border-[#e8473f] transition rounded-l";
const cellInpPrefix =
  "h-7 flex-1 min-w-0 px-2 border border-amber-200 border-l-0 text-[0.7rem] text-zinc-950 bg-amber-50/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/40 focus:border-[#e8473f] transition rounded-r";
const manualCellInp =
  "h-7 w-full px-2 border border-orange-300 text-[0.7rem] text-zinc-950 bg-orange-100/80 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/40 focus:border-[#e8473f] transition rounded";
const manualCellInpSuffix =
  "h-7 flex-1 min-w-0 px-2 border border-orange-300 border-r-0 text-[0.7rem] text-zinc-950 bg-orange-100/80 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/40 focus:border-[#e8473f] transition rounded-l";
const suffixUnit =
  "h-7 flex items-center px-1.5 border border-amber-200 border-l-0 text-[0.58rem] text-zinc-600 bg-amber-50/60 rounded-r select-none shrink-0";
const prefixUnit =
  "h-7 flex items-center px-1.5 border border-amber-200 border-r-0 text-[0.58rem] text-zinc-600 bg-amber-50/60 rounded-l select-none shrink-0";
const labelCell =
  "px-3 py-1 text-[0.68rem] font-semibold text-zinc-800 bg-[#ede8dc] sticky left-0 z-10";
const PROCESS_COL_WIDTH = 212;

// â"€â"€ Unit conversion to grams â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const TO_GRAMS: Record<string, number> = {
  g: 1, kg: 1000, oz: 28.3495, lbs: 453.592, lb: 453.592, "fl oz": 29.5735, L: 1000, mL: 1, units: 1, batches: 1,
};
Object.assign(TO_GRAMS, WEIGHT_FACTORS_TO_GRAMS);
void ((grams: number, toUnit: string) => grams / (TO_GRAMS[toUnit] ?? 1)); // convertFromGrams - kept for future use

// â"€â"€ Speed UOM options â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const SPEED_UNITS_THROUGHPUT = ["units / min", "units / hr", ...PROCESS_SPEED_WEIGHT_UNITS, "batches / hr"];
const SPEED_UNITS_CYCLE      = ["min / unit", "min / batch", "hrs / batch"];
const PROCESS_QUANTITY_UNITS = ["units", ...WEIGHT_INPUT_UNITS] as const;
const BATCH_SIZE_UNITS       = ["units", "g", "kg", "oz", "lbs", "L", "mL"];
const PROCESS_NAME_OPTIONS   = ["Blending/Batching", "Filling", "Custom"] as const;
type ProcessNameOption = typeof PROCESS_NAME_OPTIONS[number];
// const INGREDIENT_UNITS    = ["g", "kg", "oz", "lbs", "L", "mL"]; // unused after recipe UI simplification

const isProcessNameOption = (value: string): value is ProcessNameOption =>
  PROCESS_NAME_OPTIONS.includes(value as ProcessNameOption);
const getProcessType = (proc: CoPackingProcess): ProcessNameOption | "" =>
  proc.processType ?? (isProcessNameOption(proc.name) ? proc.name : proc.name ? "Custom" : "");
const displayProcessName = (proc: CoPackingProcess, fallback: string) =>
  proc.name || getProcessType(proc) || fallback;
const isBlendingProcess = (proc: CoPackingProcess) => getProcessType(proc) === "Blending/Batching";
const isFillingProcess  = (proc: CoPackingProcess) => getProcessType(proc) === "Filling";

function formatBatchSize(proc: CoPackingProcess, unitWeightG: number): string {
  const overageQty = qtyWithOverage(proc.units, proc.overageRate);
  if (overageQty <= 0) return "";

  const grams = overageQty;
  const converted = proc.batchSizeUnit === "units"
    ? (unitWeightG > 0 ? grams / unitWeightG : grams)
    : grams / (TO_GRAMS[proc.batchSizeUnit] ?? 1);
  return converted.toLocaleString("en-US", { maximumFractionDigits: converted >= 100 ? 0 : 3 });
}

function isUnitProcessSpeed(unit: string): boolean {
  return unit.includes("unit") || unit.includes("batch");
}

// â"€â"€ Labor hour calculation (mirrors coPackingCalculations.ts) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function calculateProcessHours(proc: CoPackingProcess, totalQty: number): number {
  const { processSpeedValue: speed, processSpeedUnit: unit, batchSizeValue: batchSize, efficiencyBuffer } = proc;
  if (speed === 0 || totalQty <= 0) return 0;
  const buffer = 1 - efficiencyBuffer / 100;
  if (buffer <= 0) return 0;
  const gramsPerHour = processSpeedToGramsPerHour(speed, unit);
  if (gramsPerHour > 0) return totalQty / (gramsPerHour * buffer);
  switch (unit) {
    case "units / min":  return (totalQty / (speed * buffer)) / 60;
    case "units / hr":   return totalQty / (speed * buffer);
    case "batches / hr": { const b = batchSize > 0 ? Math.ceil(totalQty / batchSize) : 1; return b / (speed * buffer); }
    case "min / unit":   return (totalQty * (speed / buffer)) / 60;
    case "min / batch":  { const b = batchSize > 0 ? Math.ceil(totalQty / batchSize) : 1; return (b * (speed / buffer)) / 60; }
    case "hrs / batch":  { const b = batchSize > 0 ? Math.ceil(totalQty / batchSize) : 1; return b * (speed / buffer); }
    default: return 0;
  }
}


// â"€â"€ Recipe PDF export â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const BASE_URL = import.meta.env.BASE_URL ?? "/";
const LOGO_SRCS_REC: Record<string, string> = {
  jdi:         `${BASE_URL}logo_jdi.png`,
  brewglitter: `${BASE_URL}logo_brewglitter.png`,
  bakell:      `${BASE_URL}logo_bakell.png`,
  pfg:         `${BASE_URL}logo_pfg.png`,
};

async function loadLogoDataUrl(src: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const MAX_W = 400;
      const scale = Math.min(1, MAX_W / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.85), w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function exportRecipePDF(
  proc: CoPackingProcess,
  unitWeightG: number,
  ppuDenominator: number,
  customer: { customer?: string; name?: string; email?: string; productName?: string },
  brandId: string
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const L = 14, R = pageW - 14, W = R - L;
  const gray    = [30, 30, 30]   as [number,number,number];
  const midGray = [100,100,100]  as [number,number,number];
  const ltGray  = [200,200,200]  as [number,number,number];
  const amber   = [200,120,46]   as [number,number,number];
  const paleAmber = [250,245,236] as [number,number,number];
  const navy    = [31,42,68]     as [number,number,number];
  const black   = [0,0,0]        as [number,number,number];

  const sf = (style: "normal"|"bold"|"italic" = "normal", size = 9) => {
    doc.setFont("helvetica", style); doc.setFontSize(size);
  };
  const fmt = (n: number, digits = 0) => n.toLocaleString("en-US", { maximumFractionDigits: digits });
  const weightSummary = (grams: number) =>
    grams > 0 ? `${fmt(grams)} g | ${(grams / 1000).toFixed(3)} kg | ${(grams / 453.592).toFixed(3)} lbs` : "-";
  const sectionTitle = (title: string) => {
    sf("bold", 8);
    doc.setTextColor(...navy);
    doc.text(title.toUpperCase(), L, y);
    doc.setDrawColor(...amber);
    doc.setLineWidth(0.3);
    doc.line(L, y + 2.4, R, y + 2.4);
    y += 8;
  };
  const templateTableStyles: any = {
    styles: {
      font: "helvetica",
      fontSize: 8.6,
      cellPadding: { top: 2, bottom: 2, left: 2.6, right: 2.6 },
      textColor: gray,
      lineColor: black,
      lineWidth: 0.15,
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: navy,
      textColor: [255, 255, 255] as [number, number, number],
      lineColor: black,
      lineWidth: 0.2,
    },
    alternateRowStyles: { fillColor: [255, 255, 255] as [number, number, number] },
    tableLineColor: black,
    tableLineWidth: 0.15,
  };
  const totalCustomerGrams = unitWeightG > 0 && ppuDenominator > 0 ? unitWeightG * ppuDenominator : 0;
  const batchGrams = totalCustomerGrams;

  let y = 14;

  // Logo
  const logoSrc = LOGO_SRCS_REC[brandId] ?? LOGO_SRCS_REC["jdi"];
  const logoData = await loadLogoDataUrl(logoSrc);
  if (logoData) {
    const maxW = 52, maxH = 16;
    const ratio = Math.min(maxW / logoData.w, maxH / logoData.h);
    const drawW = logoData.w * ratio;
    const drawH = logoData.h * ratio;
    try { doc.addImage(logoData.dataUrl, "JPEG", L, y, drawW, drawH); } catch { /* skip */ }
    y += drawH + 6;
  }

  // Title
  sf("bold", 16); doc.setTextColor(...amber);
  doc.text("Recipe Composition", L, y);
  y += 7;

  // Customer info block
  if (customer.customer || customer.name) {
    sf("normal", 8); doc.setTextColor(...midGray);
    const custLines = [
      customer.customer && `Customer: ${customer.customer}`,
      customer.name     && `Contact:  ${customer.name}`,
      customer.email    && `Email:    ${customer.email}`,
      customer.productName && `Product:  ${customer.productName}`,
    ].filter(Boolean) as string[];
    custLines.forEach(line => { doc.text(line, L, y); y += 4.5; });
  }

  // Date
  sf("normal", 8); doc.setTextColor(...midGray);
  doc.text(`Date: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, R, 14, { align: "right" });

  y += 3;
  doc.setDrawColor(...ltGray); doc.setLineWidth(0.3);
  doc.line(L, y, R, y); y += 6;

  // Clean basis summary
  sf("bold", 9); doc.setTextColor(...amber);
  doc.text("Composition Basis", L, y); y += 3.5;
  doc.setFillColor(...paleAmber);
  doc.setDrawColor(230, 214, 188);
  doc.roundedRect(L, y, W, 18, 1.5, 1.5, "FD");
  const boxTop = y + 5.2;
  const basis = [
    ["Unit Size", unitWeightG > 0 ? `${fmt(unitWeightG, 4)} g` : "-"],
    ["Customer Units", ppuDenominator > 0 ? fmt(ppuDenominator) : "-"],
    ["Total Weight", weightSummary(totalCustomerGrams)],
  ];
  basis.forEach(([label, value], idx) => {
    const x = L + 5 + idx * (W / 3);
    sf("bold", 6.8); doc.setTextColor(...midGray);
    doc.text(label.toUpperCase(), x, boxTop);
    sf("bold", 9); doc.setTextColor(...gray);
    doc.text(value, x, boxTop + 5.5);
  });
  y += 24;

  /*
  // Batch summary
  sf("bold", 9); doc.setTextColor(...amber);
  doc.text("Composition Basis", L, y); y += 4;
  sf("normal", 9); doc.setTextColor(...gray);
  if (batchGrams > 0) {
    doc.text(`${batchGrams.toLocaleString("en-US", { maximumFractionDigits: 0 })} g`, L, y);
    doc.text(`${(batchGrams/1000).toFixed(3)} kg`, L + 40, y);
    doc.text(`${(batchGrams/453.592).toFixed(3)} lbs`, L + 80, y);
  } else {
    doc.text("-", L, y);
  }
  y += 8;
  */

  const sum = proc.recipeIngredients.reduce((a, i) => a + (i.percentage || 0), 0);
  const statusLabel = Math.abs(sum - 100) < 0.01
    ? "Complete"
    : sum > 100
      ? `${(sum - 100).toFixed(1)}% over`
      : `${(100 - sum).toFixed(1)}% remaining`;
  autoTable(doc, {
    startY: y,
    margin: { left: L, right: L },
    head: [["Total Composition", "Status"]],
    body: [[`${sum.toFixed(1)}%`, statusLabel]],
    ...templateTableStyles,
    columnStyles: {
      0: { halign: "right", cellWidth: 42, fontStyle: "bold" },
      1: { halign: "left", cellWidth: "auto", fontStyle: "bold" },
    },
  });
  y = ((doc as any).lastAutoTable?.finalY ?? y) + 2;
  const originalText = doc.text.bind(doc);
  (doc as any).text = (text: any, ...args: any[]) => {
    if (typeof text === "string" && text.startsWith("Total Composition:")) return doc;
    return (originalText as any)(text, ...args);
  };

  // Composition bar (text representation)
  void proc.recipeIngredients.reduce((a, i) => a + (i.percentage || 0), 0);
  sf("bold", 8); doc.setTextColor(...midGray);
  doc.text(`Total Composition: ${sum.toFixed(1)}%  ${Math.abs(sum-100) < 0.01 ? "OK Complete" : sum > 100 ? `(${(sum-100).toFixed(1)}% over)` : `(${(100-sum).toFixed(1)}% remaining)`}`, L, y);
  y += 6;

  (doc as any).text = originalText;

  // Composition per unit table
  sectionTitle("Composition Per Unit");

  const unitIngredientRows: string[][] = proc.recipeIngredients.map(ing => {
    const grams = (ing.percentage / 100) * unitWeightG;
    return [
      ing.name || "-",
      `${(ing.percentage || 0).toFixed(1)}%`,
      unitWeightG > 0 ? `${grams.toFixed(4)} g` : "-",
      unitWeightG > 0 ? `${(grams/1000).toFixed(6)} kg` : "-",
      unitWeightG > 0 ? `${(grams/453.592).toFixed(6)} lbs` : "-",
    ];
  });
  const unitTotalGrams = proc.recipeIngredients.reduce(
    (total, ing) => total + ((ing.percentage || 0) / 100) * unitWeightG,
    0
  );
  const unitTableBody: string[][] = unitIngredientRows.length > 0
    ? [
        ...unitIngredientRows,
        [
          "TOTALS",
          `${sum.toFixed(1)}%`,
          unitWeightG > 0 ? `${unitTotalGrams.toFixed(4)} g` : "-",
          unitWeightG > 0 ? `${(unitTotalGrams / 1000).toFixed(6)} kg` : "-",
          unitWeightG > 0 ? `${(unitTotalGrams / 453.592).toFixed(6)} lbs` : "-",
        ],
      ]
    : [];

  if (unitTableBody.length > 0) {
    autoTable(doc, {
      startY: y, margin: { left: L, right: L },
      head: [["Ingredient", "% Composition", "Grams / Unit", "Kg / Unit", "Lbs / Unit"]],
      body: unitTableBody,
      ...templateTableStyles,
      didParseCell: data => {
        if (data.section === "body" && data.row.index === unitTableBody.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [245, 245, 245];
        }
      },
      columnStyles: {
        0: { halign: "left", cellWidth: "auto" },
        1: { halign: "right", cellWidth: 28 },
        2: { halign: "right", cellWidth: 30 },
        3: { halign: "right", cellWidth: 30 },
        4: { halign: "right", cellWidth: 30 },
      },
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 9;
  }

  // Composition for customer-required units table
  sectionTitle("Composition for Customer Required Units");

  const customerIngredientRows: string[][] = proc.recipeIngredients.map(ing => {
    const grams = (ing.percentage / 100) * batchGrams;
    return [
      ing.name || "-",
      `${(ing.percentage || 0).toFixed(1)}%`,
      batchGrams > 0 ? `${grams.toFixed(1)} g` : "-",
      batchGrams > 0 ? `${(grams/1000).toFixed(3)} kg` : "-",
      batchGrams > 0 ? `${(grams/453.592).toFixed(3)} lbs` : "-",
    ];
  });
  const customerTotalGrams = proc.recipeIngredients.reduce(
    (total, ing) => total + ((ing.percentage || 0) / 100) * batchGrams,
    0
  );
  const tableBody: string[][] = customerIngredientRows.length > 0
    ? [
        ...customerIngredientRows,
        [
          "TOTALS",
          `${sum.toFixed(1)}%`,
          batchGrams > 0 ? `${customerTotalGrams.toFixed(1)} g` : "-",
          batchGrams > 0 ? `${(customerTotalGrams / 1000).toFixed(3)} kg` : "-",
          batchGrams > 0 ? `${(customerTotalGrams / 453.592).toFixed(3)} lbs` : "-",
        ],
      ]
    : [];

  if (tableBody.length === 0) {
    sf("italic", 8); doc.setTextColor(...midGray);
    doc.text("No ingredients defined.", L, y);
  } else {
    autoTable(doc, {
      startY: y, margin: { left: L, right: L },
      head: [["Ingredient", "% Composition", "Total Grams", "Total Kilograms", "Total Pounds"]],
      body: tableBody,
      ...templateTableStyles,
      didParseCell: data => {
        if (data.section === "body" && data.row.index === tableBody.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [245, 245, 245];
        }
      },
      columnStyles: {
        0: { halign: "left", cellWidth: "auto" },
        1: { halign: "right", cellWidth: 28 },
        2: { halign: "right", cellWidth: 28 },
        3: { halign: "right", cellWidth: 28 },
        4: { halign: "right", cellWidth: 28 },
      },
    });
  }

  const filename = [
    (proc.name || "recipe").replace(/\s+/g, "_"),
    (customer.customer || "").replace(/\s+/g, "_"),
    new Date().toISOString().slice(0,10),
  ].filter(Boolean).join("_") + ".pdf";

  doc.save(filename);
}

// â"€â"€ Recipe Popover â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const ING_COLORS_POP = ["bg-blue-400","bg-emerald-400","bg-violet-400","bg-orange-400","bg-pink-400","bg-teal-400","bg-yellow-400","bg-red-400"];

function RecipePopover({ proc, onClose, anchorRef, addIngredient, removeIngredient, updateIngredient }: {
  proc: CoPackingProcess;
  onClose: () => void;
  anchorRef: { current: HTMLButtonElement | null };
  addIngredient: (procId: string) => void;
  removeIngredient: (procId: string, ingId: string) => void;
  updateIngredient: (procId: string, ingId: string, patch: Partial<RecipeIngredient>) => void;
}) {
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [exporting, setExporting] = useState(false);
  const { customer, selectedBrand, formData } = useProject();

  // Position below the anchor button
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + window.scrollY + 6, left: rect.left + window.scrollX });
    }
  }, [anchorRef]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, anchorRef]);

  const batchGrams = qtyWithOverage(proc.units, proc.overageRate);
  const unitWeightG = (parseFloat(formData.unitWeight) || 0) * (TO_GRAMS[formData.unitWeightUnit ?? "g"] ?? 1);
  const ppuDenominator = parseFloat(formData.ppuDenominator) || 0;
  const sum = proc.recipeIngredients.reduce((a, i) => a + (i.percentage || 0), 0);
  const isOk   = Math.abs(sum - 100) < 0.01;
  const isOver = sum > 100.01;

  return createPortal(
    <div ref={popRef}
      style={{ position: "absolute", top: pos.top, left: pos.left, zIndex: 9999, width: 720 }}
      className="bg-white border border-gray-200 rounded-xl shadow-xl shadow-gray-200/80 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border-b border-amber-200">
        <div>
          <span className="text-[0.65rem] font-bold text-amber-800 uppercase tracking-wider">Recipe Composition</span>
          <span className="text-[0.58rem] text-amber-500 ml-2">- {proc.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" title="Export recipe as PDF" disabled={exporting}
            onClick={async () => { setExporting(true); try { await exportRecipePDF(proc, unitWeightG, ppuDenominator, customer, selectedBrand); } finally { setExporting(false); } }}
            className="flex items-center gap-1 px-2 py-0.5 text-[0.6rem] font-semibold bg-[#e8473f] hover:bg-[#d43f37] disabled:opacity-50 text-white rounded transition-colors">
            <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M2 2h9l3 3v9a1 1 0 01-1 1H2a1 1 0 01-1-1V3a1 1 0 011-1zm8 0v3h3M4 9h8M4 12h5"/></svg>
            {exporting ? "..." : "PDF"}
          </button>
          <button type="button" onClick={onClose} className="text-zinc-600 hover:text-zinc-800 text-lg leading-none">x</button>
        </div>
      </div>

      {/* Batch size info */}
      <div className="px-3 py-2 bg-amber-50/40 border-b border-amber-100 text-[0.6rem] text-amber-700">
        Total batch: <span className="font-bold">{batchGrams > 0 ? batchGrams.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "-"} g</span>
        {batchGrams > 0 && <span className="ml-2 text-amber-500">({(batchGrams/1000).toFixed(3)} kg  -  {(batchGrams/453.592).toFixed(3)} lbs)</span>}
      </div>

      {/* Total % bar */}
      {proc.recipeIngredients.length > 0 && (
        <div className="px-3 pt-2 pb-1">
          <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
            {(() => {
              let offset = 0;
              return proc.recipeIngredients.map((ing, i) => {
                const w = Math.min(ing.percentage ?? 0, 100 - offset);
                const seg = <div key={ing.id} className={`absolute h-full ${ING_COLORS_POP[i % ING_COLORS_POP.length]}`} style={{ left: `${offset}%`, width: `${w}%` }} />;
                offset += w;
                return seg;
              });
            })()}
          </div>
          <div className={`text-[0.58rem] font-semibold tabular-nums ${isOk ? "text-green-600" : isOver ? "text-red-500" : "text-amber-600"}`}>
            {sum.toFixed(1)}% {isOk ? "OK Complete" : isOver ? `- ${(sum-100).toFixed(1)}% over` : `- ${(100-sum).toFixed(1)}% remaining`}
          </div>
        </div>
      )}

      {/* Ingredient table */}
      <div className="max-h-96 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#ede8dc] text-[0.56rem] uppercase tracking-wider text-zinc-600">
              <th className="border border-gray-200 px-2 py-2 text-left w-8">#</th>
              <th className="border border-gray-200 px-2 py-2 text-left min-w-48">Ingredient</th>
              <th className="border border-gray-200 px-2 py-2 text-right w-24">Percent</th>
              <th className="border border-gray-200 px-2 py-2 text-right w-24">g / Unit</th>
              <th className="border border-gray-200 px-2 py-2 text-right w-28">Total g</th>
              <th className="border border-gray-200 px-2 py-2 text-right w-24">Total kg</th>
              <th className="border border-gray-200 px-2 py-2 text-right w-24">Total lbs</th>
              <th className="border border-gray-200 px-2 py-2 text-center w-10"></th>
            </tr>
          </thead>
          <tbody>
            {proc.recipeIngredients.length === 0 ? (
              <tr>
                <td colSpan={8} className="border border-gray-200 px-3 py-6 text-center text-zinc-500">
                  No ingredients yet. Add a row to start the recipe.
                </td>
              </tr>
            ) : proc.recipeIngredients.map((ing, idx) => {
              const ingGrams = (ing.percentage / 100) * batchGrams;
              const unitIngredientGrams = (ing.percentage / 100) * unitWeightG;
              return (
                <tr key={ing.id} className="bg-white hover:bg-amber-50/30">
                  <td className="border border-gray-200 px-2 py-1.5 align-middle">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${ING_COLORS_POP[idx % ING_COLORS_POP.length]}`} />
                      <span className="text-[0.65rem] font-semibold text-zinc-500 tabular-nums">{idx + 1}</span>
                    </div>
                  </td>
                  <td className="border border-gray-200 px-1 py-1 align-middle">
                    <input type="text" value={ing.name}
                      onChange={e => updateIngredient(proc.id, ing.id, { name: e.target.value })}
                      placeholder="Ingredient name"
                      className="h-7 w-full px-2 text-xs border border-amber-200 rounded-sm bg-amber-50/70 focus:outline-none focus:ring-1 focus:ring-amber-400 placeholder:text-zinc-500" />
                  </td>
                  <td className="border border-gray-200 px-1 py-1 align-middle">
                    <div className="flex items-center">
                      <input type="number" min={0} max={100} step={0.1}
                        value={ing.percentage || ""}
                        onChange={e => updateIngredient(proc.id, ing.id, { percentage: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                        className="h-7 min-w-0 flex-1 px-2 text-xs border border-amber-200 border-r-0 rounded-l-sm text-right tabular-nums bg-amber-50/70 focus:outline-none focus:ring-1 focus:ring-amber-400" />
                      <span className="h-7 px-1.5 text-[0.6rem] text-zinc-600 border border-l-0 border-amber-200 bg-amber-50/60 flex items-center rounded-r-sm select-none">%</span>
                    </div>
                  </td>
                  <td className="border border-gray-200 px-2 py-1.5 text-right tabular-nums bg-gray-50 text-zinc-800 align-middle">
                    {unitWeightG > 0 && ing.percentage > 0 ? unitIngredientGrams.toFixed(4) : "-"}
                  </td>
                  <td className="border border-gray-200 px-2 py-1.5 text-right tabular-nums bg-gray-50 text-zinc-800 align-middle">
                    {ing.percentage > 0 && batchGrams > 0 ? ingGrams.toFixed(1) : "-"}
                  </td>
                  <td className="border border-gray-200 px-2 py-1.5 text-right tabular-nums bg-gray-50 text-zinc-800 align-middle">
                    {ing.percentage > 0 && batchGrams > 0 ? (ingGrams / 1000).toFixed(3) : "-"}
                  </td>
                  <td className="border border-gray-200 px-2 py-1.5 text-right tabular-nums bg-gray-50 text-zinc-800 align-middle">
                    {ing.percentage > 0 && batchGrams > 0 ? (ingGrams / 453.592).toFixed(3) : "-"}
                  </td>
                  <td className="border border-gray-200 px-1 py-1 text-center align-middle">
                    <button type="button" onClick={() => removeIngredient(proc.id, ing.id)}
                      title="Delete row"
                      className="inline-flex h-7 w-7 items-center justify-center rounded border border-red-200 bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="hidden">
      {/* Ingredient rows */}
      <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
        {proc.recipeIngredients.length > 0 && (
          <div className="px-3 pt-1.5 pb-1 grid grid-cols-[1fr_70px_80px_18px] gap-1.5 text-[0.52rem] font-bold text-zinc-500 uppercase tracking-wider">
            <span>Ingredient</span>
            <span className="text-right">Percent</span>
            <span className="text-right">g / unit</span>
            <span />
          </div>
        )}
        {proc.recipeIngredients.map((ing, idx) => {
          const ingGrams = (ing.percentage / 100) * batchGrams;
          const unitIngredientGrams = (ing.percentage / 100) * unitWeightG;
          return (
            <div key={ing.id} className="px-3 py-2 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full shrink-0 ${ING_COLORS_POP[idx % ING_COLORS_POP.length]}`} />
                <input type="text" value={ing.name}
                  onChange={e => updateIngredient(proc.id, ing.id, { name: e.target.value })}
                  placeholder="Ingredient name..."
                  className="h-6 flex-1 min-w-0 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-400 placeholder:text-zinc-500" />
                <div className="flex items-center shrink-0">
                  <input type="number" min={0} max={100} step={0.1}
                    value={ing.percentage || ""}
                    onChange={e => updateIngredient(proc.id, ing.id, { percentage: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="h-6 w-14 px-1.5 text-xs border border-gray-200 rounded-l text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-amber-400" />
                  <span className="h-6 px-1.5 text-[0.6rem] text-zinc-600 border border-l-0 border-gray-200 bg-gray-50 flex items-center rounded-r select-none">%</span>
                </div>
                <div
                  title="Ingredient weight per finished unit"
                  className="h-6 w-20 px-2 text-[0.6rem] text-right tabular-nums border border-amber-200 bg-amber-50/70 text-amber-800 rounded flex items-center justify-end shrink-0"
                >
                  {unitWeightG > 0 && ing.percentage > 0 ? `${unitIngredientGrams.toFixed(3)} g` : "-"}
                </div>
                <button type="button" onClick={() => removeIngredient(proc.id, ing.id)}
                  className="text-zinc-500 hover:text-red-400 text-base leading-none shrink-0">x</button>
              </div>
              {ing.percentage > 0 && batchGrams > 0 && (
                <div className="ml-4 flex gap-3 text-[0.58rem] text-amber-700 tabular-nums">
                  <span><span className="text-zinc-600">g </span>{ingGrams.toFixed(1)}</span>
                  <span><span className="text-zinc-600">kg </span>{(ingGrams/1000).toFixed(3)}</span>
                  <span><span className="text-zinc-600">lbs </span>{(ingGrams/453.592).toFixed(3)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      </div>

      {/* Add ingredient */}
      <div className="px-3 py-2 border-t border-gray-100">
        <button type="button" onClick={() => addIngredient(proc.id)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-[0.65rem] font-semibold text-[#e8473f] border border-[#e8473f]/35 rounded-md bg-white hover:bg-red-50 transition-colors">
          + Add Row
        </button>
      </div>
    </div>,
    document.body
  );
}

function GramsInfoPopover({ processes, unitWeightG, unitWeightLabel, anchorRef, onClose }: {
  processes: CoPackingProcess[];
  unitWeightG: number;
  unitWeightLabel: string;
  anchorRef: { current: HTMLButtonElement | null };
  onClose: () => void;
}) {
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const fmtN = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const fmtN2 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + window.scrollY + 6, left: rect.left + window.scrollX });
    }
  }, [anchorRef]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, anchorRef]);

  return createPortal(
    <div ref={popRef}
      style={{ position: "absolute", top: pos.top, left: pos.left, zIndex: 9999, width: 320 }}
      className="bg-white border border-gray-200 rounded-xl shadow-xl shadow-gray-200/80 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border-b border-amber-200">
        <span className="text-[0.65rem] font-bold text-amber-800 uppercase tracking-wider">Grams to Units</span>
        <button type="button" onClick={onClose} className="text-zinc-600 hover:text-zinc-800 text-lg leading-none">x</button>
      </div>
      <div className="px-3 py-2 bg-amber-50/40 border-b border-amber-100 text-[0.6rem] text-amber-700">
        Unit size per ea: <span className="font-bold">{unitWeightG > 0 ? `${fmtN2(unitWeightG)} g` : "-"}</span>
        <span className="text-amber-500 ml-1">({unitWeightLabel})</span>
      </div>
      <div className="divide-y divide-gray-100">
        {processes.length === 0 ? (
          <div className="px-3 py-3 text-[0.65rem] text-zinc-500">Select Blending/Batching to see the conversion.</div>
        ) : processes.map(proc => {
          const units = unitWeightG > 0 ? proc.units / unitWeightG : 0;
          return (
            <div key={proc.id} className="px-3 py-2">
              <div className="text-[0.65rem] font-semibold text-zinc-800 mb-1">{displayProcessName(proc, "Blending/Batching")}</div>
              <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[0.6rem]">
                <span className="text-zinc-500">Raw material grams</span>
                <span className="font-semibold text-zinc-900 tabular-nums">{proc.units > 0 ? `${fmtN(proc.units)} g` : "-"}</span>
                <span className="text-zinc-500">Formula</span>
                <span className="font-semibold text-zinc-900 tabular-nums">grams / g/ea</span>
                <span className="text-zinc-500">Raw-material equiv. units</span>
                <span className="font-bold text-amber-700 tabular-nums">{units > 0 ? fmtN(units) : "-"}</span>
              </div>
              <p className="mt-2 text-[0.56rem] leading-snug text-zinc-500">
                This unit count includes raw material overage. Filling units are based on packaged units and process overage.
              </p>
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

export function defaultCoPackingProcess(): CoPackingProcess {
  return {
    id:                  uid(),
    processType:         undefined,
    name:                "",
    units:               0,
    quantityStoredAs:    "grams",
    quantityUnit:        "g",
    perOuter:            0,
    isAutoUnits:         true,
    overageRate:         10,
    processSpeedValue:   0,
    processSpeedUnit:    "units / min",
    batchSizeValue:      0,
    batchSizeUnit:       "g",
    laborRate:           27,
    laborMarkup:         30,
    costMarkup:          0,
    efficiencyBuffer:    20,
    numStaff:            1,
    numMachines:         1,
    hrsPerShift:         7,
    workingDays:         5,
    minLaborHrs:         0,
    recipeIngredients:   [],
    includedInPdf:       true,
    showOperationsInPdf: false,
    pdfLabel:            "",
  };
}

function defaultIngredient(): RecipeIngredient {
  return { id: uid(), name: "", percentage: 0, unit: "kg" };
}

interface Props {
  processes:    CoPackingProcess[];
  setProcesses: React.Dispatch<React.SetStateAction<CoPackingProcess[]>>;
  openRecipeRequest?: number;
  recipeAnchorRef?: { current: HTMLButtonElement | null };
}

export default function CoPackingProcesses({ processes, setProcesses, openRecipeRequest = 0, recipeAnchorRef }: Props) {
  const [sectionOpen, setSectionOpen] = useState(true);
  const { notRequired } = useSectionRequired();
  const { packagingLevels, formData } = useProject();

  const unitWeightG = (parseFloat(formData.unitWeight) || 0) * (TO_GRAMS[formData.unitWeightUnit ?? "g"] ?? 1);
  const unitWeightLabel = `${formData.unitWeight || "0"} ${formData.unitWeightUnit ?? "g"}`;
  const packagingRequiredQtys: number[] = [];
  for (let i = 0; i < packagingLevels.length; i++) {
    const lvl = packagingLevels[i];
    if (!lvl.unitsRefId) {
      packagingRequiredQtys.push(lvl.units);
    } else {
      const refIdx = packagingLevels.findIndex(l => l.id === lvl.unitsRefId);
      const refQty = refIdx >= 0 ? packagingRequiredQtys[refIdx] ?? 0 : 0;
      packagingRequiredQtys.push(lvl.units > 0 ? Math.ceil(refQty / lvl.units) : 0);
    }
  }

  const firstLvlQty = packagingRequiredQtys[0] ?? 0;
  const firstLvlWeightG = unitWeightG > 0 && firstLvlQty > 0 ? firstLvlQty * unitWeightG : 0;
  const rawMaterialBaseQty = packagingRequiredQtys[0] ?? packagingLevels[0]?.units ?? 0;
  const rawMaterialOveragePct = parseFloat(formData.materialOverage as string) || 0;
  const totalRawMaterialGrams = unitWeightG > 0 && rawMaterialBaseQty > 0
    ? Math.ceil(rawMaterialBaseQty * (1 + rawMaterialOveragePct / 100)) * unitWeightG
    : 0;
  // Refs to track last auto-computed values per process id, so we don't clobber user edits
  const lastAutoUnits = useRef<Record<string, number>>({});
  const migratedBlendingBatchUnits = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (firstLvlWeightG <= 0 && totalRawMaterialGrams <= 0) return;
    setProcesses(prev => prev.map(proc => {
      const nextAutoUnits = isBlendingProcess(proc) ? totalRawMaterialGrams : firstLvlWeightG;
      if (nextAutoUnits <= 0) return proc;
      const prevAutoUnits = lastAutoUnits.current[proc.id];
      const unitsUntouched = proc.units === 0 || proc.units === prevAutoUnits || prevAutoUnits === undefined;
      lastAutoUnits.current[proc.id] = nextAutoUnits;
      if (unitsUntouched && proc.units !== nextAutoUnits) return { ...proc, units: nextAutoUnits };
      return proc;
    }));
  }, [firstLvlWeightG, totalRawMaterialGrams, processes.map(p => `${p.id}:${getProcessType(p)}`).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const closeTo = (value: number, target: number) => {
      if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) return false;
      return Math.abs(value - target) <= Math.max(1, Math.abs(target) * 0.02);
    };

    setProcesses(prev => prev.map(proc => {
      const needsLegacyMigration =
        (proc.quantityUnit === "units" || proc.quantityUnit == null || proc.batchSizeUnit === "units" || proc.batchSizeUnit === "batches") &&
        !migratedBlendingBatchUnits.current.has(proc.id);

      if (!needsLegacyMigration) return proc;
      migratedBlendingBatchUnits.current.add(proc.id);

      const targetUnits = isBlendingProcess(proc) ? rawMaterialBaseQty : firstLvlQty;
      const targetGrams = isBlendingProcess(proc) ? totalRawMaterialGrams : firstLvlWeightG;
      const unitBasedLegacyValue =
        proc.quantityStoredAs !== "grams" &&
        proc.quantityUnit === "units" &&
        unitWeightG > 0 &&
        closeTo(proc.units, targetUnits) &&
        !closeTo(proc.units, targetGrams);

      return {
        ...proc,
        units: unitBasedLegacyValue ? proc.units * unitWeightG : proc.units,
        quantityStoredAs: "grams",
        batchSizeUnit: proc.batchSizeUnit === "units" || proc.batchSizeUnit === "batches" ? "g" : proc.batchSizeUnit,
        quantityUnit: "g",
      };
    }));
  }, [unitWeightG, firstLvlQty, firstLvlWeightG, rawMaterialBaseQty, totalRawMaterialGrams, processes.map(p => `${p.id}:${getProcessType(p)}:${p.batchSizeUnit}:${p.quantityUnit ?? ""}:${p.quantityStoredAs ?? ""}`).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (id: string, patch: Partial<CoPackingProcess>) =>
    setProcesses(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));

  const addProcess = () => {
    const proc = defaultCoPackingProcess();
    if (firstLvlQty > 0) proc.units = firstLvlQty;
    setProcesses(prev => [...prev, proc]);
  };

  const removeProcess = (id: string) => {
    if (processes.length <= 1) return;
    setProcesses(prev => prev.filter(p => p.id !== id));
  };

  const getEffectiveUnits = (index: number): number => {
    const proc = processes[index];
    if (!proc) return 0;
    return proc.units;
  };

  const deriveStats = (proc: CoPackingProcess, _index: number) => {
    const deliveredUnits = getEffectiveUnits(_index);
    const totalQty = qtyWithOverage(deliveredUnits, proc.overageRate);
    let calcHrs = calculateProcessHours(proc, totalQty);
    const minApplied = proc.minLaborHrs > 0 && calcHrs < proc.minLaborHrs;
    if (minApplied) calcHrs = proc.minLaborHrs;
    const laborOur  = calcHrs * proc.laborRate;
    const laborCust = laborOur * (1 + proc.laborMarkup / 100);
    const batchCount = proc.batchSizeValue > 0 ? Math.ceil(totalQty / proc.batchSizeValue) : null;
    return { deliveredUnits, totalQty, calcHrs, laborOur, laborCust, batchCount, minApplied };
  };

  const addIngredient = (procId: string) =>
    setProcesses(prev => prev.map(p =>
      p.id === procId ? { ...p, recipeIngredients: [...p.recipeIngredients, defaultIngredient()] } : p
    ));
  const removeIngredient = (procId: string, ingId: string) =>
    setProcesses(prev => prev.map(p =>
      p.id === procId ? { ...p, recipeIngredients: p.recipeIngredients.filter(i => i.id !== ingId) } : p
    ));
  const updateIngredient = (procId: string, ingId: string, patch: Partial<RecipeIngredient>) =>
    setProcesses(prev => prev.map(p =>
      p.id === procId ? { ...p, recipeIngredients: p.recipeIngredients.map(i => i.id === ingId ? { ...i, ...patch } : i) } : p
    ));

  const handleProcessTypeChange = (id: string, processType: ProcessNameOption) => {
    const proc = processes.find(p => p.id === id);
    if (!proc) return;
    const wasBlending = isBlendingProcess(proc);
    const isBlending  = processType === "Blending/Batching";
    const patch: Partial<CoPackingProcess> = {
      processType,
      name: processType === "Custom" ? (isProcessNameOption(proc.name) ? "" : proc.name) : processType,
      batchSizeUnit: "g",
      processSpeedUnit: processType === "Blending/Batching" ? "g / min" : proc.processSpeedUnit,
      quantityUnit: "g",
      units: processType === "Blending/Batching"
        ? (totalRawMaterialGrams > 0 ? totalRawMaterialGrams : proc.units)
        : (firstLvlWeightG > 0 ? firstLvlWeightG : proc.units),
    };
    if (isBlending && !wasBlending && proc.recipeIngredients.length === 0) {
      patch.recipeIngredients = [defaultIngredient(), defaultIngredient()];
    }
    update(id, patch);
  };

  const handleCustomNameChange = (id: string, name: string) => {
    update(id, { processType: "Custom", name });
  };

  const processQuantityDisplayValue = (proc: CoPackingProcess) => {
    const unit = proc.quantityUnit ?? "g";
    if (unit === "units") return unitWeightG > 0 ? proc.units / unitWeightG : proc.units;
    return fromGrams(proc.units, unit);
  };

  const processQuantityToGrams = (value: number, unit: string) => {
    if (unit === "units") return unitWeightG > 0 ? value * unitWeightG : value;
    return toGrams(value, unit);
  };

  const handleQuantityChange = (proc: CoPackingProcess, value: number) => {
    update(proc.id, { units: processQuantityToGrams(value, proc.quantityUnit ?? "g"), quantityStoredAs: "grams" });
  };

  const handleQuantityUnitChange = (proc: CoPackingProcess, newUnit: string) => {
    update(proc.id, { quantityUnit: newUnit, quantityStoredAs: "grams" });
  };

  const handleProcessSpeedUnitChange = (proc: CoPackingProcess, newUnit: string) => {
    update(proc.id, {
      processSpeedUnit: newUnit,
      processSpeedValue: convertProcessSpeedValue(proc.processSpeedValue, proc.processSpeedUnit, newUnit),
    });
  };


  const [collapsedCols,    setCollapsedCols]    = useState<Record<string, boolean>>({});
  const [laborDetailsOpen, setLaborDetailsOpen] = useState(false);
  const [outputsOpen,      setOutputsOpen]      = useState<Record<string, boolean>>({});
  const [recipeOpen,       setRecipeOpen]       = useState<Record<string, boolean>>({});
  const [gramsInfoProcId, setGramsInfoProcId] = useState<string | null>(null);
  const gramsInfoBtnRefs = useRef<Record<string, { current: HTMLButtonElement | null }>>({});
  const recipeBtnRefs = useRef<Record<string, { current: HTMLButtonElement | null }>>({});
  const getGramsInfoBtnRef = (id: string) => {
    if (!gramsInfoBtnRefs.current[id]) gramsInfoBtnRefs.current[id] = { current: null };
    return gramsInfoBtnRefs.current[id];
  };
  const getRecipeBtnRef = (id: string) => {
    if (!recipeBtnRefs.current[id]) recipeBtnRefs.current[id] = { current: null };
    return recipeBtnRefs.current[id];
  };
  const toggleLaborDetails = useCallback(() => setLaborDetailsOpen(o => !o), []);

  useEffect(() => {
    if (!openRecipeRequest) return;
    const blending = processes.find(isBlendingProcess);
    if (!blending) return;
    setSectionOpen(true);
    setRecipeOpen(prev => ({ ...prev, [blending.id]: true }));
  }, [openRecipeRequest, processes]);

  const toggleCol = (id: string) =>
    setCollapsedCols(prev => ({ ...prev, [id]: !prev[id] }));

  const numCols = processes.length;
  const visibleCols = processes.filter(p => !collapsedCols[p.id]).length;
  const collapsedCount = numCols - visibleCols;
  const tableMinWidth = 140 + visibleCols * PROCESS_COL_WIDTH + collapsedCount * 36;
  const quantityRowLabel = "Quantity";
  const fmtN0 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const fmtN2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtN4 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const fmtD = (v: number) => "$" + fmtN2(v);
  const processOutputSummaries = processes.map(proc => {
    const totalWeightG = qtyWithOverage(proc.units, proc.overageRate);
    const unitsRequired = unitWeightG > 0 ? totalWeightG / unitWeightG : 0;
    const laborQty = isUnitProcessSpeed(proc.processSpeedUnit) ? unitsRequired : totalWeightG;
    let hrsRequired = calculateProcessHours(proc, laborQty);
    if (proc.minLaborHrs > 0 && hrsRequired < proc.minLaborHrs) hrsRequired = proc.minLaborHrs;
    const operators = proc.numStaff > 0 ? proc.numStaff : 1;
    const laborOur = hrsRequired * proc.laborRate * operators;
    const laborCust = laborOur * (1 + proc.laborMarkup / 100) * (1 + (proc.costMarkup ?? 0) / 100);
    const totalMinutes = hrsRequired * 60;
    return { unitsRequired, hrsRequired, totalMinutes, laborOur, laborCust, totalWeightG };
  });
  const processRunningTotals = processOutputSummaries.reduce(
    (acc, item) => ({
      unitsRequired: Math.max(acc.unitsRequired, item.unitsRequired),
      hrsRequired: acc.hrsRequired + item.hrsRequired,
      totalMinutes: acc.totalMinutes + item.totalMinutes,
      laborOur: acc.laborOur + item.laborOur,
      laborCust: acc.laborCust + item.laborCust,
      totalWeightG: Math.max(acc.totalWeightG, item.totalWeightG),
    }),
    { unitsRequired: 0, hrsRequired: 0, totalMinutes: 0, laborOur: 0, laborCust: 0, totalWeightG: 0 }
  );
  const runningUnitsPerMinute = processRunningTotals.totalMinutes > 0
    ? processRunningTotals.unitsRequired / processRunningTotals.totalMinutes
    : 0;
  const runningUnitsPerHour = processRunningTotals.hrsRequired > 0
    ? processRunningTotals.unitsRequired / processRunningTotals.hrsRequired
    : 0;
  const runningCostPerUnit = processRunningTotals.unitsRequired > 0
    ? processRunningTotals.laborOur / processRunningTotals.unitsRequired
    : 0;

  return (
    <div id="section-processes" className="bg-white border border-gray-200 rounded-xl overflow-hidden max-w-4xl flex-1 min-w-0">

      {/* â"€â"€ Section header â"€â"€ */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-3">
        <button type="button" onClick={() => setSectionOpen(o => !o)}
          className="flex items-center gap-1.5 group">
          <span className="text-sm font-bold text-zinc-950 group-hover:text-[#e8473f] transition-colors">Processes</span>
          {sectionOpen && !notRequired["section-processes"]
            ? <ChevronUp size={13} className="text-zinc-500 group-hover:text-[#e8473f] transition-colors shrink-0" />
            : <ChevronDown size={13} className="text-zinc-500 group-hover:text-[#e8473f] transition-colors shrink-0" />}
        </button>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button type="button" onClick={addProcess}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[0.68rem] font-semibold text-[#e8473f] border border-[#e8473f]/40 rounded-md hover:bg-red-50 hover:border-[#e8473f]/70 transition-colors">
            <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>
            Add Process
          </button>
          <RequiredToggle sectionId="section-processes" />
        </div>
      </div>

      {sectionOpen && !notRequired["section-processes"] && (
        <div className="px-3 pb-3">
          <div className="flex items-start gap-4">
        <div className="overflow-x-auto min-w-0">
          <CollapsedContext.Provider value={collapsedCols}>
          <table className="border-collapse" style={{ minWidth: tableMinWidth, width: tableMinWidth, tableLayout: "fixed" }}>

            {/* â"€â"€ Column headers â"€â"€ */}
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-[0.55rem] font-semibold text-zinc-600 uppercase tracking-widest border-b border-amber-200/70 bg-white sticky left-0 z-10" style={{ width: 140, minWidth: 140 }}>
                  Rate Field
                </th>
                {processes.map((proc, idx) => {
                  const { calcHrs } = deriveStats(proc, idx);
                  const isCollapsed = collapsedCols[proc.id];
                  if (isCollapsed) {
                    return (
                      <th key={proc.id}
                        className="relative bg-gray-800 border-b border-l border-gray-700 cursor-pointer select-none"
                        style={{ width: 36, minWidth: 36 }}
                        onClick={() => toggleCol(proc.id)}
                        title={`Expand ${displayProcessName(proc, `Process ${idx + 1}`)}`}>
                        <div className="flex items-center justify-center h-full py-2">
                          <ChevronRight size={12} className="text-zinc-600" />
                        </div>
                        <span
                          className="absolute text-[0.5rem] font-bold text-zinc-600 uppercase tracking-widest whitespace-nowrap"
                          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", bottom: 8, left: "50%", translate: "-50% 0" }}>
                          {displayProcessName(proc, `P${idx + 1}`)}
                        </span>
                      </th>
                    );
                  }
                  return (
                    <th key={proc.id}
                      className="px-2 py-2 text-left text-[0.65rem] font-bold text-white bg-gray-800 border-b border-l border-gray-700"
                      style={{ width: PROCESS_COL_WIDTH, minWidth: PROCESS_COL_WIDTH }}>
                      <div className="flex items-center justify-between gap-1">
                        <div className="min-w-0">
                          <span className="truncate block">{displayProcessName(proc, `Process ${idx + 1}`)}</span>
                          {proc.processSpeedValue > 0 && (() => {
                            const isFilling = isFillingProcess(proc);
                            const totalWeightG = qtyWithOverage(proc.units, proc.overageRate);
                            const totalUnits = unitWeightG > 0 ? totalWeightG / unitWeightG : 0;
                            const buffer = proc.efficiencyBuffer > 0 ? 1 - proc.efficiencyBuffer / 100 : 1;
                            const upm = proc.processSpeedUnit === "units / min" ? proc.processSpeedValue
                                      : proc.processSpeedUnit === "units / hr"  ? proc.processSpeedValue / 60 : 0;
                            const effectiveUph = upm * 60 * buffer;
                            const hrs = effectiveUph > 0 ? totalUnits / effectiveUph : calcHrs;
                            if (!isFilling || hrs <= 0 || hrs >= 100000) return null;
                            return <span className="text-[0.55rem] text-zinc-600 tabular-nums font-normal">~{hrs.toFixed(1)} hrs  -  {(upm * 60).toFixed(0)} u/hr</span>;
                          })()}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => toggleCol(proc.id)}
                            title="Collapse column"
                            className="text-white/80 hover:text-white transition-colors">
                            <ChevronLeft size={11} />
                          </button>
                          {processes.length > 1 && (
                            <button type="button" onClick={() => removeProcess(proc.id)}
                              title={`Remove Process ${idx + 1}`}
                              className="text-white/80 hover:text-white transition-colors">
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>

              {/* â"€â"€ Name â"€â"€ */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}>Name</td>
                {processes.map((proc) => (
                  <Col key={proc.id} proc={proc}>
                    <div className="space-y-1">
                      <select value={getProcessType(proc)}
                        onChange={e => handleProcessTypeChange(proc.id, e.target.value as ProcessNameOption)}
                        className={manualCellInp}>
                        <option value="" disabled>Select process</option>
                        {PROCESS_NAME_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                      </select>
                      {getProcessType(proc) === "Custom" && (
                        <input type="text" value={isProcessNameOption(proc.name) ? "" : proc.name}
                          onChange={e => handleCustomNameChange(proc.id, e.target.value)}
                          placeholder="Enter process name"
                          className={manualCellInp} />
                      )}
                    </div>
                  </Col>
                ))}
              </tr>

              {/* â"€â"€ Units â"€â"€ */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}>
                  <div className="flex items-center gap-1.5">
                    <span>{quantityRowLabel}</span>
                  </div>
                </td>
                {processes.map((proc) => (
                  <Col key={proc.id} proc={proc}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="block text-[0.52rem] font-semibold uppercase tracking-wider text-amber-700">
                          Weight
                        </span>
                        <button type="button"
                          ref={el => { getGramsInfoBtnRef(proc.id).current = el; }}
                          onClick={() => setGramsInfoProcId(openId => openId === proc.id ? null : proc.id)}
                          title="Show weight to units conversion"
                          className="h-4 w-4 inline-flex items-center justify-center rounded-full border border-amber-400 text-amber-700 hover:bg-amber-100 transition-colors">
                          <Info size={10} />
                        </button>
                      </div>
                      <div className="flex items-center">
                        <CurrencyInput
                          type="rate"
                          value={roundForDisplay(processQuantityDisplayValue(proc))}
                          onChange={v => handleQuantityChange(proc, v)}
                          placeholder="0"
                          className={cellInpSuffix}
                        />
                        <select
                          value={proc.quantityUnit ?? "g"}
                          onChange={e => handleQuantityUnitChange(proc, e.target.value)}
                          className="h-7 px-1 border border-l-0 border-amber-200 text-[0.58rem] text-zinc-600 bg-amber-50/60 focus:outline-none rounded-r shrink-0 w-20"
                        >
                          {PROCESS_QUANTITY_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    </div>
                  </Col>
                ))}
              </tr>

              {/* â"€â"€ Overage Rate â"€â"€ */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}>Overage Rate</td>
                {processes.map((proc) => (
                  <Col key={proc.id} proc={proc}>
                    <div className="flex items-center">
                      <CurrencyInput type="percent" value={proc.overageRate}
                        onChange={v => update(proc.id, { overageRate: v })}
                        className={cellInpSuffix} />
                      <span className={suffixUnit}>%</span>
                    </div>
                  </Col>
                ))}
              </tr>

              {/* â"€â"€ Batch Weight (auto-computed: quantity weight x (1 + overage%), editable unit) â"€â"€ */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}>Batch Weight</td>
                {processes.map((proc) => {
                  const computed = formatBatchSize(proc, unitWeightG);
                  return (
                    <Col key={proc.id} proc={proc}>
                      <div className="flex items-center gap-1">
                        <div className="h-7 flex-1 min-w-0 px-2 border border-amber-200 text-[0.7rem] font-semibold text-zinc-800 bg-amber-50/70 flex items-center tabular-nums rounded-l select-none">
                          {computed || <span className="text-zinc-500">auto</span>}
                        </div>
                        <select value={proc.batchSizeUnit}
                          onChange={e => update(proc.id, { batchSizeUnit: e.target.value })}
                          className="h-7 px-1 border border-l-0 border-amber-200 text-[0.6rem] text-zinc-800 bg-amber-50/60 focus:outline-none rounded-r shrink-0 w-14">
                          {BATCH_SIZE_UNITS.map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                    </Col>
                  );
                })}
              </tr>

              {/* â"€â"€ Process Speed â"€â"€ */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}>Process Speed</td>
                {processes.map((proc) => (
                  <Col key={proc.id} proc={proc}>
                    <div className="flex items-center gap-1">
                      <input type="number" min={0} step={0.01}
                        value={proc.processSpeedValue || ""}
                        onChange={e => update(proc.id, { processSpeedValue: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                        className={manualCellInpSuffix} />
                      <select value={proc.processSpeedUnit}
                        onChange={e => handleProcessSpeedUnitChange(proc, e.target.value)}
                        className="h-7 px-1.5 border border-l-0 border-orange-300 text-[0.6rem] text-zinc-800 bg-orange-100/70 focus:outline-none rounded-r shrink-0 w-28">
                        <optgroup label="Throughput">
                          {SPEED_UNITS_THROUGHPUT.map(u => <option key={u} value={u}>{u}</option>)}
                        </optgroup>
                        <optgroup label="Cycle Time">
                          {SPEED_UNITS_CYCLE.map(u => <option key={u} value={u}>{u}</option>)}
                        </optgroup>
                      </select>
                    </div>
                  </Col>
                ))}
              </tr>

              {/* â"€â"€ # of Operators â"€â"€ */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}># of Operators</td>
                {processes.map((proc) => (
                  <Col key={proc.id} proc={proc}>
                    <CurrencyInput type="integer" value={proc.numStaff}
                      onChange={v => update(proc.id, { numStaff: v })}
                      placeholder="1"
                      className={cellInp} />
                  </Col>
                ))}
              </tr>

              {/* â"€â"€ # of Machines â"€â"€ */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}># of Machines</td>
                {processes.map((proc) => (
                  <Col key={proc.id} proc={proc}>
                    <CurrencyInput type="integer" value={proc.numMachines ?? 1}
                      onChange={v => update(proc.id, { numMachines: v })}
                      placeholder="1"
                      className={cellInp} />
                  </Col>
                ))}
              </tr>

              {/* â"€â"€ Cost Markup â"€â"€ */}
              <tr className="border-b border-amber-200/70">
                <td className={labelCell}>Cost Markup</td>
                {processes.map((proc) => (
                  <Col key={proc.id} proc={proc}>
                    <div className="flex items-center">
                      <CurrencyInput type="percent" value={proc.costMarkup ?? 0}
                        onChange={v => update(proc.id, { costMarkup: v })}
                        className={cellInpSuffix} />
                      <span className={suffixUnit}>%</span>
                    </div>
                  </Col>
                ))}
              </tr>

              {/* â"€â"€ Labor Details toggle header â"€â"€ */}
              <tr className="border-b border-amber-300/60 cursor-pointer select-none bg-amber-50/80 hover:bg-amber-100/60 transition-colors"
                onClick={toggleLaborDetails}>
                <td colSpan={processes.length + 2} className="px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    {laborDetailsOpen
                      ? <ChevronUp size={11} className="text-amber-600 shrink-0" />
                      : <ChevronDown size={11} className="text-amber-600 shrink-0" />}
                    <span className="text-[0.62rem] font-bold text-amber-700 uppercase tracking-widest">Labor Details</span>
                  </div>
                </td>
              </tr>

              {/* â"€â"€ Labor Details rows (collapsible) â"€â"€ */}
              {laborDetailsOpen && (<>

                {/* â"€â"€ Labor Rate â"€â"€ */}
                <tr className="border-b border-amber-200/70">
                  <td className={labelCell}>Labor Rate ($/hr)</td>
                  {processes.map((proc) => (
                    <Col key={proc.id} proc={proc}>
                      <div className="flex items-center">
                        <span className={prefixUnit}>$</span>
                        <CurrencyInput type="dollar" value={proc.laborRate}
                          onChange={v => update(proc.id, { laborRate: v })}
                          className={cellInpPrefix} />
                      </div>
                    </Col>
                  ))}
                  </tr>

                {/* â"€â"€ Efficiency Buffer â"€â"€ */}
                <tr className="border-b border-amber-200/70">
                  <td className={labelCell}>Efficiency Buffer</td>
                  {processes.map((proc) => (
                    <Col key={proc.id} proc={proc}>
                      <div className="flex items-center">
                        <CurrencyInput type="percent" value={proc.efficiencyBuffer}
                          onChange={v => update(proc.id, { efficiencyBuffer: v })}
                          className={cellInpSuffix} />
                        <span className={suffixUnit}>%</span>
                      </div>
                    </Col>
                  ))}
                  </tr>

                {/* â"€â"€ Labor Markup â"€â"€ */}
                <tr className="border-b border-amber-200/70">
                  <td className={labelCell}>Labor Markup</td>
                  {processes.map((proc) => (
                    <Col key={proc.id} proc={proc}>
                      <div className="flex items-center">
                        <CurrencyInput type="percent" value={proc.laborMarkup}
                          onChange={v => update(proc.id, { laborMarkup: v })}
                          className={cellInpSuffix} />
                        <span className={suffixUnit}>%</span>
                      </div>
                    </Col>
                  ))}
                </tr>

                {/* â"€â"€ Hrs / Shift â"€â"€ */}
                <tr className="border-b border-amber-200/70">
                  <td className={labelCell}>Hours / Shift</td>
                  {processes.map((proc) => (
                    <Col key={proc.id} proc={proc}>
                      <CurrencyInput type="rate" value={proc.hrsPerShift}
                        onChange={v => update(proc.id, { hrsPerShift: v })}
                        placeholder="7"
                        className={cellInp} />
                    </Col>
                  ))}
                  </tr>

                {/* â"€â"€ Working Days â"€â"€ */}
                <tr className="border-b border-amber-200/70">
                  <td className={labelCell}>Working Days</td>
                  {processes.map((proc) => (
                    <Col key={proc.id} proc={proc}>
                      <CurrencyInput type="integer" value={proc.workingDays}
                        onChange={v => update(proc.id, { workingDays: v })}
                        placeholder="5"
                        className={cellInp} />
                    </Col>
                  ))}
                  </tr>

                {/* â"€â"€ Min Labor Hrs â"€â"€ */}
                <tr className="border-b border-amber-200/70">
                  <td className={labelCell}>Min Labor Hrs</td>
                  {processes.map((proc) => (
                    <Col key={proc.id} proc={proc}>
                      <div className="flex items-center">
                        <input type="number" min={0} step={0.5}
                          value={proc.minLaborHrs || ""}
                          onChange={e => update(proc.id, { minLaborHrs: parseFloat(e.target.value) || 0 })}
                          placeholder="0"
                          className={cellInpSuffix} />
                        <span className={suffixUnit}>hrs</span>
                      </div>
                    </Col>
                  ))}
                  </tr>

              </>)}

              {/* â"€â"€ Outputs toggle row â"€â"€ */}
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td className="px-3 py-1 sticky left-0 z-10 bg-gray-50">
                  <span className="text-[0.55rem] font-semibold uppercase tracking-widest text-zinc-600">Outputs</span>
                </td>
                {processes.map(proc =>
                  collapsedCols[proc.id]
                    ? <td key={proc.id} className="w-9 border-l border-amber-200 bg-amber-50/40" />
                    : (
                      <td key={proc.id} className="px-2 py-1 border-l border-amber-200 bg-amber-50/40">
                        <button type="button"
                          onClick={() => setOutputsOpen(o => ({ ...o, [proc.id]: !o[proc.id] }))}
                          className="flex items-center gap-1 text-[0.6rem] font-semibold text-zinc-600 hover:text-[#e8473f] transition-colors uppercase tracking-wider">
                          {outputsOpen[proc.id] ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                          {outputsOpen[proc.id] ? "Hide" : "Show"}
                        </button>
                      </td>
                    )
                )}
              </tr>

              {/* â"€â"€ Outputs rows â"€â"€ */}
              {processes.some(p => outputsOpen[p.id] && !collapsedCols[p.id]) && (() => {
                const fmtN0 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
                const fmtN2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const fmtN4 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
                const fmtD  = (v: number) => "$" + fmtN2(v);

                type OutRow =
                  | { kind: "metric"; label: string; val: (i: number) => string; bold?: boolean }
                  | { kind: "cost"; label: string; our: (i: number) => number; cx: (i: number) => number; bold?: boolean };

                // Compute per-process outputs
                const procOutputs = processes.map(proc => {
                  const totalWeightG = qtyWithOverage(proc.units, proc.overageRate);
                  const unitsRequired = unitWeightG > 0 ? totalWeightG / unitWeightG : 0;
                  const laborQty = isUnitProcessSpeed(proc.processSpeedUnit) ? unitsRequired : totalWeightG;
                  let hrsRequired = calculateProcessHours(proc, laborQty);
                  if (proc.minLaborHrs > 0 && hrsRequired < proc.minLaborHrs) hrsRequired = proc.minLaborHrs;
                  const operators     = proc.numStaff > 0 ? proc.numStaff : 1;
                  const laborOur      = hrsRequired * proc.laborRate * operators;
                  const laborCust     = laborOur * (1 + proc.laborMarkup / 100) * (1 + (proc.costMarkup ?? 0) / 100);
                  const baselineQty = isUnitProcessSpeed(proc.processSpeedUnit) && unitWeightG > 0 ? proc.units / unitWeightG : proc.units;
                  const baselineHrsRequired = calculateProcessHours(proc, baselineQty);
                  const baselineOur = baselineHrsRequired * proc.laborRate * operators;
                  const totalMinutes  = hrsRequired * 60;
                  const unitsPerMin   = totalMinutes > 0 ? unitsRequired / totalMinutes : 0;
                  const unitsPerHr    = hrsRequired > 0 ? unitsRequired / hrsRequired : 0;
                  const costPerMin    = totalMinutes > 0 ? laborOur / totalMinutes : 0;
                  const costPerHr     = hrsRequired > 0 ? laborOur / hrsRequired : 0;
                  const costPerUnit   = unitsRequired > 0 ? laborOur / unitsRequired : 0;
                  return { unitsRequired, unitsPerHr, unitsPerMin, hrsRequired, totalMinutes, costPerMin, costPerHr, laborOur, laborCust, baselineOur, costPerUnit, totalWeightG };
                });

                // Per-process type: blending = time/cost only; filling = units+time+cost; general = hrs+cost
                const blendingRows: OutRow[] = [
                  { kind: "metric", label: "Batch Weight (g)", val: i => procOutputs[i].totalWeightG > 0 ? fmtN2(procOutputs[i].totalWeightG) : "-" },
                  { kind: "metric", label: "Hrs Required",     val: i => procOutputs[i].hrsRequired > 0 ? fmtN2(procOutputs[i].hrsRequired) : "-" },
                  { kind: "cost",   label: "Baseline Project Cost", our: i => procOutputs[i].baselineOur, cx: () => 0 },
                  { kind: "cost",   label: "Total Labor Cost", our: i => procOutputs[i].laborOur, cx: i => procOutputs[i].laborCust, bold: true },
                ];

                const fillingRows: OutRow[] = [
                  { kind: "metric", label: "# of Units",       val: i => procOutputs[i].unitsRequired > 0 ? fmtN0(procOutputs[i].unitsRequired) : "-" },
                  { kind: "metric", label: "Units / Hour",     val: i => procOutputs[i].unitsPerHr > 0  ? fmtN0(procOutputs[i].unitsPerHr)  : "-" },
                  { kind: "metric", label: "Units / Minute",   val: i => procOutputs[i].unitsPerMin > 0 ? fmtN4(procOutputs[i].unitsPerMin) : "-" },
                  { kind: "metric", label: "Hrs Required",     val: i => procOutputs[i].hrsRequired > 0 ? fmtN2(procOutputs[i].hrsRequired) : "-" },
                  { kind: "cost",   label: "Baseline Project Cost", our: i => procOutputs[i].baselineOur, cx: () => 0 },
                  { kind: "cost",   label: "Total Labor Cost", our: i => procOutputs[i].laborOur, cx: i => procOutputs[i].laborCust, bold: true },
                ];

                const generalRows: OutRow[] = [
                  { kind: "metric", label: "Weight (g)",       val: i => procOutputs[i].totalWeightG > 0 ? fmtN2(procOutputs[i].totalWeightG) : "-" },
                  { kind: "metric", label: "Hrs Required",       val: i => procOutputs[i].hrsRequired > 0 ? fmtN2(procOutputs[i].hrsRequired) : "-" },
                  { kind: "cost",   label: "Baseline Project Cost",  our: i => procOutputs[i].baselineOur, cx: () => 0 },
                  { kind: "cost",   label: "Labor Cost",         our: i => procOutputs[i].laborOur, cx: i => procOutputs[i].laborCust, bold: true },
                ];

                // Pick row set based on first open process type
                const firstOpen = processes.find(p => outputsOpen[p.id]);
                let outRows: OutRow[] = firstOpen && isBlendingProcess(firstOpen) ? blendingRows
                  : firstOpen && isFillingProcess(firstOpen) ? fillingRows
                  : generalRows;

                outRows = [
                  { kind: "metric", label: "Weight required (g)",    val: i => procOutputs[i].totalWeightG > 0 ? fmtN2(procOutputs[i].totalWeightG) : "-" },
                  { kind: "metric", label: "# of units equivalent",  val: i => procOutputs[i].unitsRequired > 0 ? fmtN0(procOutputs[i].unitsRequired) : "-" },
                  { kind: "metric", label: "Units filled / minute",  val: i => procOutputs[i].unitsPerMin > 0 ? fmtN4(procOutputs[i].unitsPerMin) : "-" },
                  { kind: "metric", label: "Units filled / hour",    val: i => procOutputs[i].unitsPerHr > 0 ? fmtN2(procOutputs[i].unitsPerHr) : "-" },
                  { kind: "metric", label: "Total hours required",   val: i => procOutputs[i].hrsRequired > 0 ? fmtN2(procOutputs[i].hrsRequired) : "-" },
                  { kind: "metric", label: "Total minutes required", val: i => procOutputs[i].totalMinutes > 0 ? fmtN2(procOutputs[i].totalMinutes) : "-" },
                  { kind: "metric", label: "Cost per minute",        val: i => procOutputs[i].costPerMin > 0 ? fmtD(procOutputs[i].costPerMin) : "-" },
                  { kind: "metric", label: "Cost per hour",          val: i => procOutputs[i].costPerHr > 0 ? fmtD(procOutputs[i].costPerHr) : "-" },
                  { kind: "metric", label: "Total Labor",            val: i => procOutputs[i].laborOur > 0 ? fmtD(procOutputs[i].laborOur) : "-", bold: true },
                  { kind: "metric", label: "Cost per unit",          val: i => procOutputs[i].costPerUnit > 0 ? fmtD(procOutputs[i].costPerUnit) : "-" },
                ];

                const subHeader = (
                  <tr key="subheader" className="border-b border-amber-200/70 bg-amber-50/40">
                    <td className="px-3 py-1 sticky left-0 z-10 bg-amber-50/40" />
                    {processes.map(proc =>
                      collapsedCols[proc.id]
                        ? <td key={proc.id} className="w-9 border-l border-amber-200 bg-amber-50/40" />
                        : (
                          <td key={proc.id} className="px-2 py-0.5 border-l border-amber-200 bg-amber-50/40">
                            {outputsOpen[proc.id] && (
                              <div className="flex justify-between">
                                <span className="text-[0.52rem] font-bold text-zinc-600 uppercase tracking-wider">Project Cost</span>
                                <span className="text-[0.52rem] font-bold text-[#e8473f] uppercase tracking-wider">Selling Price</span>
                              </div>
                            )}
                          </td>
                        )
                    )}
                  </tr>
                );

                void subHeader;

                const dataRows = outRows.map(row => {
                  const isCost = row.kind === "cost";
                  const bold   = Boolean((row as { bold?: boolean }).bold);
                  return (
                    <tr key={row.label} className={`border-b ${isCost ? "border-amber-100" : "border-gray-100"} ${bold ? "bg-amber-50/60" : isCost ? "bg-amber-50/20" : "bg-gray-50/60"}`}>
                      <td className={`px-3 py-1 text-[0.63rem] sticky left-0 z-10 ${bold ? "font-bold text-amber-800 bg-amber-50/60" : isCost ? "text-zinc-700 bg-amber-50/30" : "text-zinc-600 bg-gray-50/80"}`}>
                        {row.label}
                      </td>
                      {processes.map((proc, i) => {
                        if (collapsedCols[proc.id]) return <td key={proc.id} className="w-9 border-l border-amber-200 bg-amber-50/40" />;
                        if (!outputsOpen[proc.id]) return <td key={proc.id} className="px-2 py-1 border-l border-amber-200 text-right"><span className="text-[0.65rem] text-zinc-500">-</span></td>;
                        return (
                          <td key={proc.id} className={`px-2 py-1 border-l ${isCost ? "border-amber-200" : "border-gray-200"}`}>
                            {isCost ? (
                              <div className="flex justify-between gap-1">
                                <span className={`text-[0.7rem] tabular-nums ${bold ? "font-bold text-zinc-800" : "font-semibold text-zinc-700"}`}>
                                  {(row as { our: (i: number) => number }).our(i) > 0 ? fmtD((row as { our: (i: number) => number }).our(i)) : "-"}
                                </span>
                                <span className={`text-[0.7rem] tabular-nums ${bold ? "font-bold text-[#e8473f]" : "font-semibold text-[#e8473f]/80"}`}>
                                  {(row as { cx: (i: number) => number }).cx(i) > 0 ? fmtD((row as { cx: (i: number) => number }).cx(i)) : "-"}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[0.7rem] tabular-nums text-zinc-800 font-medium">
                                {(row as { val: (i: number) => string }).val(i)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                });

                return <>{dataRows}</>;
              })()}

              {/* Recipe is now a floating popover - rendered below the table */}
              {false && (() => {
                const ING_COLORS = ["bg-blue-400"];
                const maxIngs = 0;
                return (
                  <>
                    {/* Section divider header */}
                    <tr>
                      <td colSpan={processes.length + 2} className="p-0">
                        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-t-2 border-amber-200">
                          <div className="w-1 h-4 rounded-full bg-amber-400 shrink-0" />
                          <span className="text-[0.6rem] font-bold text-amber-700 uppercase tracking-widest">Recipe Composition</span>
                          <span className="text-[0.55rem] text-amber-500 ml-1">- visible on Blending processes</span>
                        </div>
                      </td>
                    </tr>

                    {/* Composition bar + Add Ingredient per blending column */}
                    <tr className="border-b border-amber-100">
                      <td className="px-3 py-2 bg-amber-50/60 sticky left-0 z-10">
                        <span className="text-[0.6rem] text-amber-600 font-semibold">Composition</span>
                      </td>
                      {processes.map((proc, idx) => {
                        const isBlending = isBlendingProcess(proc) && recipeOpen[proc.id];
                        const { totalQty } = deriveStats(proc, idx);
                        const sum = proc.recipeIngredients.reduce((a, i) => a + (i.percentage || 0), 0);
                        const isOk   = Math.abs(sum - 100) < 0.01;
                        const isOver = sum > 100.01;
                        return (
                          <Col key={proc.id} proc={proc}>
                            {isBlending ? (
                              <div className="space-y-1.5 py-0.5">
                                {/* Stacked composition bar */}
                                {proc.recipeIngredients.length > 0 && (
                                  <div>
                                    <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                                      {(() => {
                                        let offset = 0;
                                        return proc.recipeIngredients.map((ing, i) => {
                                          const w = Math.min(ing.percentage ?? 0, 100 - offset);
                                          const seg = (
                                            <div key={ing.id}
                                              title={`${ing.name || `Ingredient ${i+1}`}: ${(ing.percentage ?? 0).toFixed(1)}%`}
                                              className={`absolute h-full ${ING_COLORS[i % ING_COLORS.length]} transition-all`}
                                              style={{ left: `${offset}%`, width: `${w}%` }} />
                                          );
                                          offset += w;
                                          return seg;
                                        });
                                      })()}
                                      {isOver && <div className="absolute inset-0 bg-red-400 opacity-20 rounded-full" />}
                                    </div>
                                    <div className="flex items-center justify-between mt-0.5">
                                      <span className={`text-[0.55rem] font-semibold tabular-nums ${isOk ? "text-green-600" : isOver ? "text-red-500" : "text-amber-500"}`}>
                                        {sum.toFixed(1)}% {isOk ? "OK" : isOver ? `(+${(sum-100).toFixed(1)}%)` : `(${(100-sum).toFixed(1)}% left)`}
                                      </span>
                                      <span className="text-[0.5rem] text-zinc-600">target 100%</span>
                                    </div>
                                  </div>
                                )}
                                {proc.batchSizeValue > 0 && totalQty > 0 && (
                                  <p className="text-[0.55rem] text-amber-600">
                                    {totalQty.toFixed(2)} {proc.batchSizeUnit} total
                                    {proc.overageRate > 0 ? ` (+${proc.overageRate}% ovg)` : ""}
                                  </p>
                                )}
                                <button type="button" onClick={() => addIngredient(proc.id)}
                                  className="text-[0.6rem] font-semibold text-[#e8473f] hover:text-[#c73d36] transition-colors whitespace-nowrap">
                                  + Add Ingredient
                                </button>
                              </div>
                            ) : (
                              <span className="text-[0.6rem] text-zinc-500 italic">-</span>
                            )}
                          </Col>
                        );
                      })}
                      <td className="border-l border-amber-100 bg-amber-50/40" />
                    </tr>

                    {/* One row per ingredient slot */}
                    {maxIngs > 0 && Array.from({ length: maxIngs }).map((_, ingIdx) => (
                      <tr key={`ing-${ingIdx}`} className="border-b border-amber-100">
                        <td className="px-3 py-1.5 bg-amber-50/60 sticky left-0 z-10">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${ING_COLORS[ingIdx % ING_COLORS.length]}`} />
                            <span className="text-[0.63rem] text-amber-700 font-medium">Ingredient {ingIdx + 1}</span>
                          </div>
                        </td>
                        {processes.map((proc) => {
                          const isBlending = isBlendingProcess(proc) && recipeOpen[proc.id];
                          if (!isBlending) return (
                            <Col key={proc.id} proc={proc}>
                              <span className="text-[0.6rem] text-zinc-500 italic">-</span>
                            </Col>
                          );
                          const ing = proc.recipeIngredients[ingIdx];
                          if (!ing) return (
                            <Col key={proc.id} proc={proc}>
                              <span className="text-[0.6rem] text-zinc-500 italic">-</span>
                            </Col>
                          );
                          const batchGrams = isBlendingProcess(proc)
                            ? proc.units
                            : qtyWithOverage(proc.units, proc.overageRate) * (TO_GRAMS[proc.batchSizeUnit] ?? 1);
                          const ingGrams   = (ing.percentage / 100) * batchGrams;
                          const ingKg      = ingGrams / 1000;
                          const ingLbs     = ingGrams / 453.592;
                          return (
                            <Col key={proc.id} proc={proc}>
                              <div className="space-y-1 py-0.5">
                                <div className="flex items-center gap-1">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ING_COLORS[ingIdx % ING_COLORS.length]}`} />
                                  <input type="text" value={ing.name}
                                    onChange={e => updateIngredient(proc.id, ing.id, { name: e.target.value })}
                                    placeholder="Ingredient name..."
                                    className="h-6 flex-1 min-w-0 px-2 text-[0.7rem] border border-orange-300 bg-orange-100/80 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/40 rounded transition placeholder:text-zinc-500" />
                                  <button type="button" onClick={() => removeIngredient(proc.id, ing.id)}
                                    className="text-zinc-500 hover:text-red-400 transition-colors text-sm leading-none shrink-0" title="Remove">x</button>
                                </div>
                                <div className="flex gap-1 items-center">
                                  <input type="number" min={0} max={100} step={0.1}
                                    value={ing.percentage || ""}
                                    onChange={e => updateIngredient(proc.id, ing.id, { percentage: parseFloat(e.target.value) || 0 })}
                                    placeholder="%"
                                    className="h-6 w-12 px-1.5 text-[0.7rem] border border-orange-300 bg-orange-100/80 focus:outline-none rounded-l text-right tabular-nums" />
                                  <span className="h-6 px-1 text-[0.55rem] text-zinc-600 border border-l-0 border-orange-300 bg-orange-100/70 flex items-center rounded-r select-none">%</span>
                                </div>
                                {ing.percentage > 0 && batchGrams > 0 && (
                                  <div className="text-[0.55rem] text-amber-700 tabular-nums space-y-0.5">
                                    <div>{ingGrams.toFixed(1)} g</div>
                                    <div>{ingKg.toFixed(3)} kg</div>
                                    <div>{ingLbs.toFixed(3)} lbs</div>
                                  </div>
                                )}
                              </div>
                            </Col>
                          );
                        })}
                        <td className="border-l border-amber-100 bg-amber-50/40" />
                      </tr>
                    ))}

                    {/* Total % summary row */}
                    <tr className="border-b-2 border-amber-200">
                      <td className="px-3 py-1.5 bg-amber-100/60 sticky left-0 z-10">
                        <span className="text-[0.6rem] font-bold text-amber-700 uppercase tracking-wider">Total %</span>
                      </td>
                      {processes.map((proc) => {
                        const isBlending = isBlendingProcess(proc) && recipeOpen[proc.id];
                        if (!isBlending) return (
                          <Col key={proc.id} proc={proc}>
                            <span className="text-[0.6rem] text-zinc-500 italic">-</span>
                          </Col>
                        );
                        const sum    = proc.recipeIngredients.reduce((a, i) => a + (i.percentage || 0), 0);
                        const isOk   = Math.abs(sum - 100) < 0.01;
                        const isOver = sum > 100.01;
                        return (
                          <Col key={proc.id} proc={proc}>
                            <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[0.6rem] font-bold tabular-nums ${
                              isOk   ? "bg-green-100 text-green-700" :
                              isOver ? "bg-red-100 text-red-600"     :
                                       "bg-amber-100 text-amber-700"
                            }`}>
                              {sum.toFixed(1)}%
                              {isOk   ? " OK" :
                               isOver ? ` - ${(sum-100).toFixed(1)}% over` :
                                        ` - ${(100-sum).toFixed(1)}% left`}
                            </div>
                          </Col>
                        );
                      })}
                      <td className="border-l border-amber-100 bg-amber-100/40" />
                    </tr>
                  </>
                );
              })()}

            </tbody>
          </table>

          </CollapsedContext.Provider>
        </div>
        <aside className="sticky top-24 w-56 shrink-0 rounded-lg border border-gray-200 bg-white shadow-lg shadow-gray-200/70 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
            <div className="text-[0.58rem] font-bold uppercase tracking-widest text-zinc-800">Process Running Totals</div>
            <div className="mt-0.5 text-[0.58rem] text-zinc-500">{processes.length} process{processes.length === 1 ? "" : "es"}</div>
          </div>
          <div className="divide-y divide-gray-100 text-[0.66rem]">
            {[
              ["Weight required (g)", processRunningTotals.totalWeightG > 0 ? fmtN2(processRunningTotals.totalWeightG) : "-"],
              ["Weight required (lbs)", processRunningTotals.totalWeightG > 0 ? fmtN2(processRunningTotals.totalWeightG / 453.592) : "-"],
              ["Weight required (oz)", processRunningTotals.totalWeightG > 0 ? fmtN2(processRunningTotals.totalWeightG / 28.3495) : "-"],
              ["# units equivalent", processRunningTotals.unitsRequired > 0 ? fmtN0(processRunningTotals.unitsRequired) : "-"],
              ["Units filled / minute", runningUnitsPerMinute > 0 ? fmtN4(runningUnitsPerMinute) : "-"],
              ["Units filled / hour", runningUnitsPerHour > 0 ? fmtN2(runningUnitsPerHour) : "-"],
              ["Total hours", processRunningTotals.hrsRequired > 0 ? fmtN2(processRunningTotals.hrsRequired) : "-"],
              ["Total minutes", processRunningTotals.totalMinutes > 0 ? fmtN2(processRunningTotals.totalMinutes) : "-"],
              ["Our labor", processRunningTotals.laborOur > 0 ? fmtD(processRunningTotals.laborOur) : "-"],
              ["Selling price", processRunningTotals.laborCust > 0 ? fmtD(processRunningTotals.laborCust) : "-"],
              ["Cost / unit", runningCostPerUnit > 0 ? fmtD(runningCostPerUnit) : "-"],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2">
                <span className="text-zinc-600">{label}</span>
                <span className="font-semibold tabular-nums text-zinc-950 text-right">{value}</span>
              </div>
            ))}
          </div>
        </aside>
          </div>
        </div>
      )}

      {/* â"€â"€ Recipe popovers - one per blending process â"€â"€ */}
      {processes.filter(p => isBlendingProcess(p) && recipeOpen[p.id]).map(proc => (
        <RecipePopover key={proc.id} proc={proc}
          anchorRef={recipeAnchorRef?.current ? recipeAnchorRef : getRecipeBtnRef(proc.id)}
          onClose={() => setRecipeOpen(o => ({ ...o, [proc.id]: false }))}
          addIngredient={addIngredient}
          removeIngredient={removeIngredient}
          updateIngredient={updateIngredient}
        />
      ))}
      {gramsInfoProcId && (
        <GramsInfoPopover
          processes={processes.filter(p => p.id === gramsInfoProcId)}
          unitWeightG={unitWeightG}
          unitWeightLabel={unitWeightLabel}
          anchorRef={getGramsInfoBtnRef(gramsInfoProcId)}
          onClose={() => setGramsInfoProcId(null)}
        />
      )}
    </div>
  );
}
