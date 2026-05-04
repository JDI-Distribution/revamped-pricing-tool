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
  startDate:               (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })(),
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
    id: 3, level: "Inner / Case", type: "Inners", units: "275",
    efficiency: "20", labor: "35", unitCost: "125", tabs: false,
    unitsPerInner: "24",
    rows: mkRows("2", "26", "1", "0.2", "0", "0", "1", "7.3", "5"),
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
  // columns + auto-generated derived columns from MOQ pack sizes
  effectiveColumns: Column[];
  // Derived — active MOQ
  scaledColumns:    Column[];
  detailSections:   DetailSection[];
  summaryRows:      SummaryRow[];
  summaryTableRows: SummaryTableRow[];
  ppuUnits:         number;
  // Derived — all MOQs (for the MOQ pricing table)
  allMoqResults:       MoqPricingRow[];
  perMoqSummaryRows:   Map<number, SummaryRow[]>;
  // Compute costs for an arbitrary unit count (interstitial pricing)
  computeForQty: (qty: number, unitsPerInner: number) => { summaryRows: SummaryRow[]; summaryTableRows: SummaryTableRow[]; totalCustomer: number; totalOur: number; ppuCost: number; ppuCustomer: number } | null;
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

  // ── Auto-generate derived Inner columns from extra MOQ pack sizes ────────────
  // For every unique unitsPerInner in moqRows beyond the base column's own pack,
  // synthesise a derived column so the user doesn't need to fill it in manually.
  const effectiveColumns = useMemo((): Column[] => {
    const baseInner = columns.find(
      (c) => c.level === "Inner / Case" && c.unitsPerInner && n(c.unitsPerInner) > 0,
    );
    if (!baseInner) return columns;

    const basePack  = n(baseInner.unitsPerInner!);
    const extraPacks = Array.from(
      new Set(
        moqRows
          .map((r) => n(r.unitsPerInner))
          .filter((p) => p > 0 && p !== basePack),
      ),
    );
    if (extraPacks.length === 0) return columns;

    const existingDerivedPacks = new Set(
      columns.filter((c) => c.sourceId === baseInner.id).map((c) => n(c.unitsPerInner)),
    );

    const generated: Column[] = extraPacks
      .filter((p) => !existingDerivedPacks.has(p))
      .map((dstPack, i) => {
        const ratio = dstPack / basePack;
        return {
          ...baseInner,
          id:            -(i + 1),
          type:          `Inners ${dstPack}pk`,
          units:         n(baseInner.units) > 0
            ? String(Math.ceil(n(baseInner.units) * (basePack / dstPack)))
            : "",
          sourceId:      baseInner.id,
          unitsPerInner: String(dstPack),
          rows: {
            ...baseInner.rows,
            "Unit Fill Rate / min": n(baseInner.rows?.["Unit Fill Rate / min"]) > 0
              ? String(parseFloat((n(baseInner.rows["Unit Fill Rate / min"]) * ratio).toFixed(4)))
              : "",
          },
        };
      });

    const result: Column[] = [];
    for (const col of columns) {
      result.push(col);
      if (col.id === baseInner.id) result.push(...generated);
    }
    return result;
  }, [columns, moqRows]);

  // ── Per-MOQ pricing rows + per-MOQ summary line items ────────────────────────
  const { allMoqResults, perMoqSummaryRows } = useMemo(() => {
    if (!moqRows[0]) return { allMoqResults: [] as MoqPricingRow[], perMoqSummaryRows: new Map<number, SummaryRow[]>() };
    const ppuDenom     = n(formData.ppuDenominator);
    const pricing:     MoqPricingRow[]              = [];
    const summaryMap = new Map<number, SummaryRow[]>();

    for (const row of moqRows) {
      const rowPack = n(row.unitsPerInner);

      const rowColumns = effectiveColumns.filter((col) => {
        if (col.level !== "Inner / Case") return true;
        const colPack = n(col.unitsPerInner);
        if (colPack === 0) return true;
        return colPack === rowPack;
      });

      const { summaryRows: sRows } = computeDetailSections(rowColumns, [row], formData);
      summaryMap.set(row.id, sRows);

      const totalCustomerPrice = sRows.reduce((s, r) => s + r.customerPrice, 0);
      const totalOurCost       = sRows.reduce((s, r) => s + r.ourCosts, 0);
      const moqVal    = n(row.moq);
      const innerVal  = n(row.unitsPerInner);
      const masterVal = n(row.innersPerMaster);
      const casePack  = masterVal > 0 ? `${innerVal} × ${masterVal}` : innerVal > 0 ? String(innerVal) : "—";
      const effectivePpuDenom = ppuDenom > 0 ? ppuDenom : moqVal || 1;
      const ppu       = effectivePpuDenom > 0 ? totalCustomerPrice / effectivePpuDenom : 0;
      const ppuCost   = effectivePpuDenom > 0 ? totalOurCost / effectivePpuDenom : 0;
      const marginDollars = totalCustomerPrice - totalOurCost;
      const marginPct = totalCustomerPrice > 0 ? ((totalCustomerPrice - totalOurCost) / totalCustomerPrice) * 100 : 0;

      pricing.push({ moqRow: row, casePack, totalCustomerPrice, totalOurCost,
                     ppuDenominator: effectivePpuDenom, ppu, ppuCost, marginDollars, marginPct });
    }

    return { allMoqResults: pricing, perMoqSummaryRows: summaryMap };
  }, [effectiveColumns, moqRows, formData]);

  // ── Interstitial pricing: compute costs for any arbitrary unit count ──────────
  // Substitutes qty into Individual/Final Kit columns, scales container columns
  // proportionally, then runs the full calculation engine.
  const computeForQty = useMemo(() => {
    return (qty: number, unitsPerInner: number) => {
      if (qty <= 0) return null;

      // Find the base qty from the Individual Units column (the reference MOQ)
      const baseQty = n(effectiveColumns.find(c => c.level === "Individual Units")?.units) || qty;

      // Pick the right inner column for this pack size
      const rowColumns = effectiveColumns
        .filter((col) => {
          if (col.level !== "Inner / Case") return true;
          const colPack = n(col.unitsPerInner);
          if (colPack === 0) return true;
          return colPack === unitsPerInner;
        })
        .map((col) => {
          // Scale Individual/Final Kit units to the custom qty
          if (col.level === "Individual Units" || col.level === "Final Kit Units") {
            return { ...col, units: String(qty) };
          }
          // Scale container columns proportionally to the custom qty
          if (col.level === "Inner / Case" || col.level === "Shipper / Outer" || col.level === "Pallet") {
            const baseUnits = n(col.units);
            const scaledUnits = baseUnits > 0 && baseQty > 0
              ? Math.ceil(baseUnits * (qty / baseQty))
              : baseUnits;
            return { ...col, units: String(scaledUnits) };
          }
          return col;
        });

      // Build a synthetic MOQ row for this custom quantity
      const syntheticMoqRow: MoqRow = {
        id: -999,
        moq:             String(qty),
        individualUnits: String(qty),
        unitsPerInner:   String(unitsPerInner),
        innersPerMaster: "0",
      };

      // Override ppuDenominator to qty so all per-unit costs are based on this qty,
      // not the stored ppuDenominator (which is the base MOQ).
      const formDataForQty = { ...formData, ppuDenominator: String(qty) };

      const { summaryRows: sRows, summaryTableRows: sTableRows } =
        computeDetailSections(rowColumns, [syntheticMoqRow], formDataForQty);

      const totalCustomer = sRows.reduce((s, r) => s + r.customerPrice, 0);
      const totalOur      = sRows.reduce((s, r) => s + r.ourCosts, 0);
      const ppuCost       = totalOur      / qty;
      const ppuCustomer   = totalCustomer / qty;

      return { summaryRows: sRows, summaryTableRows: sTableRows, totalCustomer, totalOur, ppuCost, ppuCustomer };
    };
  }, [effectiveColumns, formData]);

  return (
    <ProjectContext.Provider value={{
      moqRows, setMoqRows,
      columns, setColumns,
      formData, setFormField,
      activeMoqId, setActiveMoqId,
      effectiveColumns,
      scaledColumns,
      detailSections, summaryRows, summaryTableRows, ppuUnits,
      allMoqResults,
      perMoqSummaryRows,
      computeForQty,
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
