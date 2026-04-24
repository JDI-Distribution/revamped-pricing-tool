"use client";

import { createContext, useContext, useState, useMemo, ReactNode } from "react";
import { MoqRow, Column, ProjectFormData, SummaryRow, SummaryTableRow, DetailSection } from "./types";
import { computeDetailSections } from "./calculations";

const initialMoqRows: MoqRow[] = [
  { id: 1, moq: "6600",  individualUnits: "6600",  unitsPerInner: "24", innersPerMaster: "0" },
  { id: 2, moq: "13200", individualUnits: "13200", unitsPerInner: "24", innersPerMaster: "0" },
  { id: 3, moq: "26400", individualUnits: "26400", unitsPerInner: "24", innersPerMaster: "0" },
  { id: 4, moq: "6600",  individualUnits: "6600",  unitsPerInner: "48", innersPerMaster: "0" },
];

const initialFormData: ProjectFormData = {
  unitWeight:              "113.4",
  costPerGram:             "0.009228",
  numSkus:                 "1",
  rawMaterialSkus:         "1",
  leftOverInventoryCost:   "0",
  leftOverInventoryAbsorb: "0",
  intakeFee:               "195",
  numPallets:              "1",
  outboundFee:             "350",
  outboundFeeMarkup:       "40",
  numFinishedPallets:      "4",
  testingFee:              "350",
  testingFeeMarkup:        "30",
  setupFeeOur:             "598",
  setupFeeCustomer:        "1495",
  ppuDenominator:          "6600",
  leadTimeBufferDays:      "57",
  startDate:               "2026-04-20",
  materialOverage:         "25",
  rawMaterialMarkup:       "300",
  intakeFeeMarkup:         "25",
  unitWeightUnit:          "g",
};

const mkRows = (
  overageRate: string, wageRate: string, unitsPerMin: string,
  packagingCost: string, labelPrint: string, tabCost: string,
  stations: string, hrsPerShift: string, workingDays: string
) => ({
  "Overage Rate":            overageRate,
  "Wage Rate":               wageRate,
  "Unit Fill Rate / min":    unitsPerMin,
  "Packaging Cost / unit":   packagingCost,
  "Label Print Cost / unit": labelPrint,
  "Tab Cost / unit":         tabCost,
  "No. of Staff / Stations": stations,
  "Hrs / Shift":             hrsPerShift,
  "Working Days":            workingDays,
});

const initialColumns: Column[] = [
  {
    id: 1, level: "Individual Units", type: "4oz Sachets", units: "6600",
    efficiency: "20", labor: "35", unitCost: "125", tabs: false,
    rows: mkRows("15", "26", "12", "0.035", "0", "0", "5", "7.3", "5"),
  },
  {
    id: 2, level: "Final Kit Units", type: "4oz Tins", units: "6600",
    efficiency: "20", labor: "35", unitCost: "125", tabs: false,
    rows: mkRows("3", "26", "15", "0.55", "0.2", "0", "3", "7.3", "5"),
  },
  {
    // 24pk inner: 6600/24 = 275 cases, fill rate 1/min
    id: 3, level: "Inner / Case", type: "Inners 24pk", units: "275",
    efficiency: "20", labor: "35", unitCost: "125", tabs: false,
    rows: mkRows("2", "26", "1", "0.2", "0", "0", "1", "7.3", "5"),
  },
  {
    // 48pk inner: auto-derived from 24pk (id:3) — units halve, fill rate doubles
    id: 5, level: "Inner / Case", type: "Inners 48pk", units: "138",
    efficiency: "20", labor: "35", unitCost: "125", tabs: false,
    sourceId: 3, unitsPerInner: "48",
    rows: mkRows("2", "26", "2", "0.2", "0", "0", "1", "7.3", "5"),
  },
  {
    id: 4, level: "Shipper / Outer", type: "Shippers", units: "12",
    efficiency: "25", labor: "35", unitCost: "125", tabs: false,
    rows: mkRows("1", "26", "1", "0.2", "0", "0", "1", "7.3", "5"),
  },
];

const n = (s: string | undefined) => parseFloat(s || "0") || 0;

export interface MoqPricingRow {
  moqRow:            MoqRow;
  casePack:          string;   // "unitsPerInner × innersPerMaster" or just unitsPerInner
  totalCustomerPrice: number;
  totalOurCost:      number;
  ppuDenominator:    number;
  ppu:               number;   // totalCustomerPrice / ppuDenominator
  ppuCost:           number;   // totalOurCost / ppuDenominator
  marginDollars:     number;
  marginPct:         number;
}

interface ProjectContextValue {
  // Raw state
  moqRows:      MoqRow[];
  setMoqRows:   React.Dispatch<React.SetStateAction<MoqRow[]>>;
  columns:      Column[];
  setColumns:   React.Dispatch<React.SetStateAction<Column[]>>;
  formData:     ProjectFormData;
  setFormField: (field: keyof ProjectFormData, value: string) => void;
  activeMoqId:  number;
  setActiveMoqId: React.Dispatch<React.SetStateAction<number>>;
  // Derived — active MOQ
  scaledColumns:    Column[];
  detailSections:   DetailSection[];
  summaryRows:      SummaryRow[];
  summaryTableRows: SummaryTableRow[];
  ppuUnits:         number;
  // Derived — all MOQs (for the MOQ pricing table)
  allMoqResults:    MoqPricingRow[];
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [moqRows,  setMoqRows]  = useState<MoqRow[]>(initialMoqRows);
  const [columns,  setColumns]  = useState<Column[]>(initialColumns);
  const [formData, setFormData] = useState<ProjectFormData>(initialFormData);
  const [activeMoqId, setActiveMoqId] = useState<number>(initialMoqRows[0].id);

  const setFormField = (field: keyof ProjectFormData, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const scaledColumns = useMemo(() => {
    const base   = moqRows[0];
    const active = moqRows.find((r) => r.id === activeMoqId) ?? base;
    if (!base || !active || active.id === base.id) return columns;

    const baseVal   = n(base.unitsPerInner)   || n(base.moq)   || 1;
    const activeVal = n(active.unitsPerInner) || n(active.moq) || 1;
    const scale     = activeVal / baseVal;
    if (scale === 1) return columns;

    const containerLevels = new Set(["Inner / Case", "Shipper / Outer", "Pallet"]);
    return columns.map((col) =>
      containerLevels.has(col.level)
        ? { ...col, units: String(Math.round(n(col.units) * scale)) }
        : col
    );
  }, [columns, moqRows, activeMoqId]);

  const { detailSections, summaryRows, summaryTableRows, ppuUnits } = useMemo(
    () => computeDetailSections(scaledColumns, moqRows, formData),
    [scaledColumns, moqRows, formData],
  );

  // ── Per-MOQ pricing rows (for the MOQ pricing table on the quote page) ──────
  const allMoqResults = useMemo((): MoqPricingRow[] => {
    const base = moqRows[0];
    if (!base) return [];

    const baseVal = n(base.unitsPerInner) || n(base.moq) || 1;
    const containerLevels = new Set(["Inner / Case", "Shipper / Outer", "Pallet"]);
    const ppuDenom = n(formData.ppuDenominator);

    return moqRows.map((row) => {
      const activeVal = n(row.unitsPerInner) || n(row.moq) || 1;
      const scale     = activeVal / baseVal;

      const rowColumns = (row.id === base.id || scale === 1)
        ? columns
        : columns.map((col) =>
            containerLevels.has(col.level)
              ? { ...col, units: String(Math.round(n(col.units) * scale)) }
              : col
          );

      const { summaryRows: sRows } = computeDetailSections(rowColumns, [row], formData);
      const totalCustomerPrice = sRows.reduce((s, r) => s + r.customerPrice, 0);
      const totalOurCost       = sRows.reduce((s, r) => s + r.ourCosts, 0);

      const moqVal   = n(row.moq);
      const innerVal = n(row.unitsPerInner);
      const masterVal = n(row.innersPerMaster);

      const casePack = masterVal > 0
        ? `${innerVal} × ${masterVal}`
        : innerVal > 0 ? String(innerVal) : "—";

      // PPU denominator: use the field value if set, otherwise fall back to the MOQ qty
      const effectivePpuDenom = ppuDenom > 0 ? ppuDenom : moqVal || 1;
      const ppu     = effectivePpuDenom > 0 ? totalCustomerPrice / effectivePpuDenom : 0;
      const ppuCost = effectivePpuDenom > 0 ? totalOurCost       / effectivePpuDenom : 0;
      const marginDollars = totalCustomerPrice - totalOurCost;
      const marginPct     = totalCustomerPrice > 0
        ? ((totalCustomerPrice - totalOurCost) / totalCustomerPrice) * 100
        : 0;

      return {
        moqRow: row,
        casePack,
        totalCustomerPrice,
        totalOurCost,
        ppuDenominator: effectivePpuDenom,
        ppu,
        ppuCost,
        marginDollars,
        marginPct,
      };
    });
  }, [columns, moqRows, formData]);

  return (
    <ProjectContext.Provider value={{
      moqRows, setMoqRows,
      columns, setColumns,
      formData, setFormField,
      activeMoqId, setActiveMoqId,
      scaledColumns,
      detailSections, summaryRows, summaryTableRows, ppuUnits,
      allMoqResults,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used inside <ProjectProvider>");
  return ctx;
}
