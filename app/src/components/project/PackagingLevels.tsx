import React, { useState } from "react";
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { PackagingLevel, ManualCharge } from "@/lib/types";
import { useProject } from "@/lib/ProjectContext";
import { uid as _uid } from "@/lib/uid";
import { computeColumnOutputs } from "@/lib/calculations";
import { RequiredToggle, useSectionRequired } from "@/lib/SectionRequiredContext";
const uid = () => String(_uid());

// ── Packaging type presets ────────────────────────────────────────────────────

const PACKAGING_TYPE_NAMES = [
  "Sachets", "Stick Packs", "4g Jars", "4oz Jars", "4oz Tins",
  "Pillow Pack", "Pouches", "Inner / Case", "Shipper / Outer", "Bulk Bags",
];

interface PackagingTypePreset {
  overageRate:      number;
  fillRatePerMin:   number;
  packagingWeightG: number;
  labelApplyRate:   number;
  labelPrintCost:   number;
  efficiencyBuffer: number;
  laborMarkup:      number;
  unitCostMarkup:   number;
  tabsEnabled:      boolean;
}

const PACKAGING_TYPE_PRESETS: Record<string, PackagingTypePreset> = {
  "Sachets":        { overageRate: 20, fillRatePerMin: 10, packagingWeightG: 7,  labelApplyRate: 0,  labelPrintCost: 0,   efficiencyBuffer: 8,  laborMarkup: 35, unitCostMarkup: 125, tabsEnabled: false },
  "Stick Packs":    { overageRate: 20, fillRatePerMin: 10, packagingWeightG: 7,  labelApplyRate: 0,  labelPrintCost: 0,   efficiencyBuffer: 8,  laborMarkup: 35, unitCostMarkup: 125, tabsEnabled: false },
  "4g Jars":        { overageRate: 15, fillRatePerMin: 20, packagingWeightG: 15, labelApplyRate: 20, labelPrintCost: 0.1, efficiencyBuffer: 20, laborMarkup: 35, unitCostMarkup: 125, tabsEnabled: false },
  "4oz Jars":       { overageRate: 15, fillRatePerMin: 20, packagingWeightG: 15, labelApplyRate: 20, labelPrintCost: 0.1, efficiencyBuffer: 20, laborMarkup: 35, unitCostMarkup: 125, tabsEnabled: false },
  "4oz Tins":       { overageRate: 15, fillRatePerMin: 13, packagingWeightG: 25, labelApplyRate: 20, labelPrintCost: 0.1, efficiencyBuffer: 20, laborMarkup: 35, unitCostMarkup: 125, tabsEnabled: false },
  "Pillow Pack":    { overageRate: 3,  fillRatePerMin: 25, packagingWeightG: 5,  labelApplyRate: 0,  labelPrintCost: 0,   efficiencyBuffer: 20, laborMarkup: 35, unitCostMarkup: 125, tabsEnabled: false },
  "Pouches":        { overageRate: 3,  fillRatePerMin: 25, packagingWeightG: 5,  labelApplyRate: 0,  labelPrintCost: 0,   efficiencyBuffer: 20, laborMarkup: 35, unitCostMarkup: 125, tabsEnabled: false },
  "Inner / Case":   { overageRate: 2,  fillRatePerMin: 2,  packagingWeightG: 0,  labelApplyRate: 0,  labelPrintCost: 0,   efficiencyBuffer: 20, laborMarkup: 30, unitCostMarkup: 125, tabsEnabled: false },
  "Shipper / Outer":{ overageRate: 2,  fillRatePerMin: 1,  packagingWeightG: 0,  labelApplyRate: 0,  labelPrintCost: 0,   efficiencyBuffer: 25, laborMarkup: 45, unitCostMarkup: 125, tabsEnabled: false },
  "Bulk Bags":      { overageRate: 0,  fillRatePerMin: 0.5,packagingWeightG: 0,  labelApplyRate: 0,  labelPrintCost: 0,   efficiencyBuffer: 15, laborMarkup: 35, unitCostMarkup: 125, tabsEnabled: false },
};

// ── Defaults ──────────────────────────────────────────────────────────────────

export function defaultPackagingLevel(
  level: string = "",
): PackagingLevel {
  return {
    id:               uid(),
    packagingLevel:   level,
    customLevelName:  "",
    packagingType:    "",
    customTypeName:   "",
    units:            0,
    perOuter:         0,
    isAutoUnits:      true,
    costPerUnit:      0,
    casePack:         0,
    efficiencyBuffer: 20,
    laborMarkup:      35,
    unitCostMarkup:   125,
    overageRate:      15,
    wageRate:         26,
    fillRatePerMin:   12,
    packagingWeightG: 0,
    numStaff:         1,
    hrsPerShift:      7,
    workingDays:      5,
    labelEnabled:     false,
    labelPrintCost:   0,
    labelApplyRate:   0,
    tabsEnabled:      false,
    tabCostPerUnit:   0,
    hvThreshold:      0,
    hvFillRate:       0,
    operations:       [],
    manualCharges:    [],
    isExpanded:       true,
    includedInPdf:    true,
    showOperationsInPdf: false,
    pdfLabel:         "",
  };
}

export function effectiveTypeName(lvl: PackagingLevel): string {
  if (lvl.packagingType === "custom_mode") return lvl.customTypeName || "";
  return lvl.packagingType;
}


// ── Shared cell styles ────────────────────────────────────────────────────────

const cellInp =
  "h-7 w-full px-2 border border-amber-300 text-[0.7rem] text-zinc-950 bg-amber-100/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/40 focus:border-[#e8473f] transition rounded";
const cellInpSuffix =
  "h-7 flex-1 min-w-0 px-2 border border-amber-300 border-r-0 text-[0.7rem] text-zinc-950 bg-amber-100/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/40 focus:border-[#e8473f] transition rounded-l";
const suffixUnit =
  "h-7 flex items-center px-1.5 border border-amber-300 border-l-0 text-[0.58rem] text-zinc-600 bg-amber-100/60 rounded-r select-none shrink-0";
const naCell = "text-[0.65rem] text-zinc-500 italic";

// ── Stable Col helper (defined outside component to avoid remount on every render) ──

const CollapsedContext = React.createContext<Record<string, boolean>>({});

function Col({ lvl, children }: { lvl: PackagingLevel; children?: React.ReactNode }) {
  const collapsedCols = React.useContext(CollapsedContext);
  return collapsedCols[lvl.id]
    ? <td className="border-l border-amber-200 bg-amber-50/40" style={{ width: 36, minWidth: 36 }} />
    : <td className="px-2 py-1 border-l border-amber-200 bg-[#fef9ee]">{children}</td>;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  packagingLevels:    PackagingLevel[];
  setPackagingLevels: React.Dispatch<React.SetStateAction<PackagingLevel[]>>;
  className?: string;
  sectionTitle?: string;
  sectionId?: string;
  onOpenChange?: (open: boolean) => void;
}

export default function PackagingLevels({ packagingLevels, setPackagingLevels, className, sectionTitle = "Packaging Line Setup", sectionId = "section-packaging-summary", onOpenChange }: Props) {
  const [sectionOpen, setSectionOpen]     = useState(true);
  const handleToggle = (open: boolean) => { setSectionOpen(open); onOpenChange?.(open); };
  const [manualChargeOpen, setManualChargeOpen] = useState(false);
  const [outputsOpen, setOutputsOpen]     = useState<Record<string, boolean>>({});
  const [collapsedCols, setCollapsedCols] = useState<Record<string, boolean>>({});
  const { moqRows, activeMoqId } = useProject();
  const { notRequired } = useSectionRequired();

  const activeRow = moqRows.find(r => r.id === activeMoqId) ?? moqRows[0];
  const moqQty = activeRow ? (parseFloat(activeRow.individualUnits) || parseFloat(activeRow.moq) || 0) : 0;


  const effectiveUnits = (lvl: PackagingLevel, index: number, allLevels: PackagingLevel[]): number => {
    if (lvl.units > 0) return lvl.units;
    if (index === 0) return moqQty;
    if (lvl.perOuter > 0) {
      const parentUnits = effectiveUnits(allLevels[index - 1], index - 1, allLevels);
      return parentUnits > 0 ? Math.ceil(parentUnits / lvl.perOuter) : 0;
    }
    return 0;
  };

  const update = (id: string, patch: Partial<PackagingLevel>) =>
    setPackagingLevels(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));


  const applyPreset = (id: string, typeName: string) => {
    const preset = PACKAGING_TYPE_PRESETS[typeName];
    if (!preset) return;
    update(id, {
      packagingType:    typeName,
      overageRate:      preset.overageRate,
      fillRatePerMin:   preset.fillRatePerMin,
      packagingWeightG: preset.packagingWeightG,
      labelApplyRate:   preset.labelApplyRate,
      labelPrintCost:   preset.labelPrintCost,
      labelEnabled:     preset.labelPrintCost > 0 || preset.labelApplyRate > 0,
      efficiencyBuffer: preset.efficiencyBuffer,
      laborMarkup:      preset.laborMarkup,
      unitCostMarkup:   preset.unitCostMarkup,
      tabsEnabled:      preset.tabsEnabled,
    });
  };

  // ── Manual charges ─────────────────────────────────────────────────────────
  const [draftCharge, setDraftCharge] = useState<{ name: string; amount: string; basis: "per_unit" | "fixed"; levelId: string }>({
    name: "", amount: "", basis: "per_unit", levelId: "",
  });

  const addCharge = () => {
    const amount = parseFloat(draftCharge.amount);
    if (!draftCharge.name.trim() || isNaN(amount) || amount <= 0) return;
    const charge: ManualCharge = {
      id: uid(), name: draftCharge.name.trim(), amount, basis: draftCharge.basis,
      ...(draftCharge.levelId ? { levelId: draftCharge.levelId } : {}),
    };
    setPackagingLevels(prev => prev.map(l => ({ ...l, manualCharges: [...(l.manualCharges ?? []), charge] })));
    setDraftCharge({ name: "", amount: "", basis: "per_unit", levelId: draftCharge.levelId });
  };

  const removeCharge = (chargeId: string) =>
    setPackagingLevels(prev => prev.map(l => ({ ...l, manualCharges: (l.manualCharges ?? []).filter(c => c.id !== chargeId) })));

  // All levels share the same charge list (stored on the first level as source of truth)
  const allCharges: ManualCharge[] = packagingLevels[0]?.manualCharges ?? [];

  const numCols = packagingLevels.length;
  const visibleCols = packagingLevels.filter(l => !collapsedCols[l.id]).length;
  const collapsedCount = numCols - visibleCols;
  const tableMinWidth = 140 + visibleCols * 168 + collapsedCount * 36;


  return (
    <div id={sectionId} className={className ?? "bg-white border border-gray-200 rounded-xl mx-4 md:mx-6 mb-4 overflow-hidden max-w-4xl"}>

      {/* ── Section header ── */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-3">
        <button type="button" onClick={() => handleToggle(!sectionOpen)}
          className="flex items-center gap-1.5 group">
          <span className="text-sm font-bold text-zinc-950 group-hover:text-[#e8473f] transition-colors">
            {sectionTitle}
          </span>
          {sectionOpen
            ? <ChevronUp size={13} className="text-zinc-500 group-hover:text-[#e8473f] transition-colors shrink-0" />
            : <ChevronDown size={13} className="text-zinc-500 group-hover:text-[#e8473f] transition-colors shrink-0" />}
        </button>
        <div className="ml-auto shrink-0"><RequiredToggle sectionId={sectionId} /></div>
      </div>

      {/* ── Subtitle ── */}
      {sectionOpen && !notRequired[sectionId] && (
        <div className="px-4 pb-2">
          <p className="text-[0.6rem] text-[#e8473f] leading-relaxed">
            Type, rates, staffing, and markup for each packaging level set in{" "}
            <span className="font-semibold">Project Overview</span>. Add or remove levels there — this section always tracks whatever levels exist. Picking a <span className="font-semibold">Type</span> auto-fills typical values for the rows below; every value stays editable after.
          </p>
        </div>
      )}

      {sectionOpen && !notRequired[sectionId] && packagingLevels.length > 0 && (
        <CollapsedContext.Provider value={collapsedCols}>
        <div className="overflow-x-auto">
          <table className="border-collapse" style={{ minWidth: tableMinWidth }}>

            {/* ── Column headers ── */}
            <thead>
              <tr>
                {/* Rate Field label cell */}
                <th className="w-36 min-w-[140px] px-3 py-2 text-left text-[0.55rem] font-semibold text-zinc-600 uppercase tracking-widest border-b border-amber-200/70 bg-white sticky left-0 z-10">
                  Rate Field
                </th>
                {packagingLevels.map((lvl, index) => {
                  const isCollapsed = !!collapsedCols[lvl.id];
                  const levelLabel = lvl.packagingLevel || lvl.customLevelName || effectiveTypeName(lvl) || `Level ${index + 1}`;
                  return (
                    <th key={lvl.id}
                      className="px-2 py-2 text-left text-[0.65rem] font-bold text-white bg-gray-800 border-b border-l border-gray-700"
                      style={isCollapsed ? { width: 36, minWidth: 36, overflow: "visible", position: "relative" } : { minWidth: 160 }}>
                      {isCollapsed ? (
                        <>
                          <button type="button"
                            onClick={() => setCollapsedCols(c => ({ ...c, [lvl.id]: false }))}
                            title={`Expand ${levelLabel}`}
                            className="flex items-center justify-center w-full text-zinc-600 hover:text-white transition-colors">
                            <ChevronRight size={12} />
                          </button>
                          {/* vertical label — absolutely positioned so it doesn't stretch the header row */}
                          <span
                            className="text-[0.65rem] font-bold text-zinc-950 uppercase tracking-widest whitespace-nowrap pointer-events-none select-none"
                            style={{
                              position: "absolute",
                              top: "100%",
                              left: "50%",
                              transform: "translateX(-50%) translateY(180px) rotate(180deg)",
                              writingMode: "vertical-rl",
                              textShadow: "0 0 0 #111",
                            }}>
                            {levelLabel}
                          </span>
                        </>

                      ) : (
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate">{levelLabel}</span>
                          <button type="button"
                            onClick={() => setCollapsedCols(c => ({ ...c, [lvl.id]: true }))}
                            title="Collapse column"
                            className="text-zinc-600 hover:text-white transition-colors shrink-0">
                            <ChevronLeft size={11} />
                          </button>
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {/* ── Type row ── */}
              <tr className="border-b border-amber-200/70">
                <td className="px-3 py-1.5 text-[0.68rem] font-semibold text-zinc-800 bg-[#ede8dc] sticky left-0 z-10">Type</td>
                {packagingLevels.map(lvl => (
                  <Col key={lvl.id} lvl={lvl}>
                    {lvl.packagingType === "custom_mode" ? (
                      <div className="flex items-center gap-0.5">
                        <input type="text" value={lvl.customTypeName}
                          onChange={e => update(lvl.id, { customTypeName: e.target.value })}
                          placeholder="Type name…"
                          className={`${cellInp} flex-1 min-w-0`} autoFocus />
                        <button type="button"
                          onClick={() => update(lvl.id, { packagingType: "", customTypeName: "" })}
                          className="shrink-0 text-zinc-600 hover:text-[#e8473f] text-sm">×</button>
                      </div>
                    ) : (
                      <select
                        value={PACKAGING_TYPE_NAMES.includes(lvl.packagingType) ? lvl.packagingType : ""}
                        onChange={e => {
                          if (e.target.value === "custom_mode") update(lvl.id, { packagingType: "custom_mode" });
                          else if (e.target.value) applyPreset(lvl.id, e.target.value);
                          else update(lvl.id, { packagingType: "" });
                        }}
                        className={cellInp}>
                        <option value="">— select type —</option>
                        {PACKAGING_TYPE_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                        <option value="custom_mode">Custom…</option>
                      </select>
                    )}
                  </Col>
                ))}
              </tr>

              {/* ── Overage Rate ── */}
              <tr className="border-b border-amber-200/70">
                <td className="px-3 py-1.5 text-[0.68rem] font-semibold text-zinc-800 bg-[#ede8dc] sticky left-0 z-10">Overage Rate</td>
                {packagingLevels.map(lvl => (
                  <Col key={lvl.id} lvl={lvl}>
                    <div className="flex items-center">
                      <CurrencyInput type="percent" value={lvl.overageRate}
                        onChange={v => update(lvl.id, { overageRate: v })}
                        className={cellInpSuffix} />
                      <span className={suffixUnit}>%</span>
                    </div>
                  </Col>
                ))}
              </tr>

              {/* ── Wage Rate ── */}
              <tr className="border-b border-amber-200/70">
                <td className="px-3 py-1.5 text-[0.68rem] font-semibold text-zinc-800 bg-[#ede8dc] sticky left-0 z-10">Wage Rate</td>
                {packagingLevels.map(lvl => (
                  <Col key={lvl.id} lvl={lvl}>
                    <div className="flex items-center">
                      <span className={suffixUnit + " border-r-0 border-l rounded-l rounded-r-none"}>$</span>
                      <CurrencyInput type="dollar" value={lvl.wageRate}
                        onChange={v => update(lvl.id, { wageRate: v })}
                        className={cellInp + " rounded-l-none border-l-0"} />
                    </div>
                  </Col>
                ))}
              </tr>

              {/* ── Unit Fill Rate / Min ── */}
              <tr className="border-b border-amber-200/70">
                <td className="px-3 py-1.5 text-[0.68rem] font-semibold text-zinc-800 bg-[#ede8dc] sticky left-0 z-10">Unit Fill Rate / Min</td>
                {packagingLevels.map(lvl => (
                  <Col key={lvl.id} lvl={lvl}>
                    <CurrencyInput type="rate" value={lvl.fillRatePerMin}
                      onChange={v => update(lvl.id, { fillRatePerMin: v })}
                      className={cellInp} />
                  </Col>
                ))}
              </tr>

              {/* ── Label Print Cost / Unit ── */}
              <tr className="border-b border-amber-200/70">
                <td className="px-3 py-1.5 text-[0.68rem] font-semibold text-zinc-800 bg-[#ede8dc] sticky left-0 z-10">Label Print Cost / Unit</td>
                {packagingLevels.map(lvl => (
                  <Col key={lvl.id} lvl={lvl}>
                    <div className="flex items-center">
                      <span className={suffixUnit + " border-r-0 border-l rounded-l rounded-r-none"}>$</span>
                      <CurrencyInput type="dollar" value={lvl.labelPrintCost}
                        onChange={v => update(lvl.id, { labelPrintCost: v, labelEnabled: v > 0 || lvl.labelApplyRate > 0 })}
                        className={cellInp + " rounded-l-none border-l-0"} />
                    </div>
                  </Col>
                ))}
              </tr>

              {/* ── Label Apply Rate / Min ── */}
              <tr className="border-b border-amber-200/70">
                <td className="px-3 py-1.5 text-[0.68rem] font-semibold text-zinc-800 bg-[#ede8dc] sticky left-0 z-10">Label Apply Rate / Min</td>
                {packagingLevels.map(lvl => (
                  <Col key={lvl.id} lvl={lvl}>
                    <CurrencyInput type="integer" value={lvl.labelApplyRate}
                      onChange={v => update(lvl.id, { labelApplyRate: v, labelEnabled: v > 0 || lvl.labelPrintCost > 0 })}
                      className={cellInp} />
                  </Col>
                ))}
              </tr>

              {/* ── Packaging Weight ── */}
              <tr className="border-b border-amber-200/70">
                <td className="px-3 py-1.5 text-[0.68rem] font-semibold text-zinc-800 bg-[#ede8dc] sticky left-0 z-10">Packaging Weight</td>
                {packagingLevels.map(lvl => (
                  <Col key={lvl.id} lvl={lvl}>
                    <div className="flex items-center">
                      <CurrencyInput type="rate" value={lvl.packagingWeightG}
                        onChange={v => update(lvl.id, { packagingWeightG: v })}
                        className={cellInpSuffix} />
                      <span className={suffixUnit}>g</span>
                    </div>
                  </Col>
                ))}
              </tr>

              {/* ── No. of Staff / Stations ── */}
              <tr className="border-b border-amber-200/70">
                <td className="px-3 py-1.5 text-[0.68rem] font-semibold text-zinc-800 bg-[#ede8dc] sticky left-0 z-10">No. of Staff / Stations</td>
                {packagingLevels.map(lvl => (
                  <Col key={lvl.id} lvl={lvl}>
                    <CurrencyInput type="integer" value={lvl.numStaff}
                      onChange={v => update(lvl.id, { numStaff: v })}
                      className={cellInp} />
                  </Col>
                ))}
              </tr>

              {/* ── Hrs / Shift ── */}
              <tr className="border-b border-amber-200/70">
                <td className="px-3 py-1.5 text-[0.68rem] font-semibold text-zinc-800 bg-[#ede8dc] sticky left-0 z-10">Hrs / Shift</td>
                {packagingLevels.map(lvl => (
                  <Col key={lvl.id} lvl={lvl}>
                    <CurrencyInput type="integer" value={lvl.hrsPerShift}
                      onChange={v => update(lvl.id, { hrsPerShift: v })}
                      className={cellInp} />
                  </Col>
                ))}
              </tr>

              {/* ── Working Days ── */}
              <tr className="border-b border-amber-200/70">
                <td className="px-3 py-1.5 text-[0.68rem] font-semibold text-zinc-800 bg-[#ede8dc] sticky left-0 z-10">Working Days</td>
                {packagingLevels.map(lvl => (
                  <Col key={lvl.id} lvl={lvl}>
                    <CurrencyInput type="integer" value={lvl.workingDays}
                      onChange={v => update(lvl.id, { workingDays: v })}
                      className={cellInp} />
                  </Col>
                ))}
              </tr>

              {/* ── Tab Cost / Unit ── */}
              <tr className="border-b border-amber-200/70">
                <td className="px-3 py-1.5 text-[0.68rem] font-semibold text-zinc-800 bg-[#ede8dc] sticky left-0 z-10">Tab Cost / Unit</td>
                {packagingLevels.map(lvl => (
                  <Col key={lvl.id} lvl={lvl}>
                    {lvl.tabsEnabled ? (
                      <div className="flex items-center">
                        <span className={suffixUnit + " border-r-0 border-l rounded-l rounded-r-none"}>$</span>
                        <CurrencyInput type="dollar" value={lvl.tabCostPerUnit}
                          onChange={v => update(lvl.id, { tabCostPerUnit: v })}
                          className={cellInp + " rounded-l-none border-l-0"} />
                      </div>
                    ) : (
                      <span className={naCell}>—</span>
                    )}
                  </Col>
                ))}
              </tr>

              {/* ── Eff. Buffer % ── */}
              <tr className="border-b border-amber-200/70">
                <td className="px-3 py-1.5 text-[0.68rem] font-semibold text-zinc-800 bg-[#ede8dc] sticky left-0 z-10">Eff. Buffer %</td>
                {packagingLevels.map(lvl => (
                  <Col key={lvl.id} lvl={lvl}>
                    <div className="flex items-center">
                      <CurrencyInput type="percent" value={lvl.efficiencyBuffer}
                        onChange={v => update(lvl.id, { efficiencyBuffer: v })}
                        className={cellInpSuffix} />
                      <span className={suffixUnit}>%</span>
                    </div>
                  </Col>
                ))}
              </tr>

              {/* ── Labor Mkp % ── */}
              <tr className="border-b border-amber-200/70">
                <td className="px-3 py-1.5 text-[0.68rem] font-semibold text-zinc-800 bg-[#ede8dc] sticky left-0 z-10">Labor Mkp %</td>
                {packagingLevels.map(lvl => (
                  <Col key={lvl.id} lvl={lvl}>
                    <div className="flex items-center">
                      <CurrencyInput type="percent" value={lvl.laborMarkup}
                        onChange={v => update(lvl.id, { laborMarkup: v })}
                        className={cellInpSuffix} />
                      <span className={suffixUnit}>%</span>
                    </div>
                  </Col>
                ))}
              </tr>

              {/* ── Unit Mkp % ── */}
              <tr className="border-b border-amber-200/70">
                <td className="px-3 py-1.5 text-[0.68rem] font-semibold text-zinc-800 bg-[#ede8dc] sticky left-0 z-10">Unit Mkp %</td>
                {packagingLevels.map(lvl => (
                  <Col key={lvl.id} lvl={lvl}>
                    <div className="flex items-center">
                      <CurrencyInput type="percent" value={lvl.unitCostMarkup}
                        onChange={v => update(lvl.id, { unitCostMarkup: v })}
                        className={cellInpSuffix} />
                      <span className={suffixUnit}>%</span>
                    </div>
                  </Col>
                ))}
              </tr>


              {/* ── Outputs toggle row ── */}
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td className="px-3 py-1 sticky left-0 z-10 bg-gray-50">
                  <span className="text-[0.55rem] font-semibold uppercase tracking-widest text-zinc-600">Outputs</span>
                </td>
                {packagingLevels.map(lvl => {
                  const isOpen = !!outputsOpen[lvl.id];
                  return collapsedCols[lvl.id]
                    ? <td key={lvl.id} className="w-9 border-l border-amber-200 bg-amber-50/40" />
                    : (
                      <td key={lvl.id} className="px-2 py-1 border-l border-amber-200 bg-amber-50/40">
                        <button
                          type="button"
                          onClick={() => setOutputsOpen(o => ({ ...o, [lvl.id]: !o[lvl.id] }))}
                          className="flex items-center gap-1 text-[0.6rem] font-semibold text-zinc-600 hover:text-[#e8473f] transition-colors uppercase tracking-wider">
                          {isOpen ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                          {isOpen ? "Hide" : "Show"}
                        </button>
                      </td>
                    );
                })}
              </tr>

              {/* ── Outputs rows (shown per-level when toggled open) ── */}
              {packagingLevels.some(lvl => outputsOpen[lvl.id] && !collapsedCols[lvl.id]) && (() => {
                const fmtN0 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
                const fmtN2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const fmtD  = (v: number) => "$" + fmtN2(v);

                const outputs = packagingLevels.map((lvl, index) => {
                  const computedUnits = lvl.cpoRequiredQty != null && lvl.cpoRequiredQty > 0
                    ? lvl.cpoRequiredQty
                    : effectiveUnits(lvl, index, packagingLevels);
                  const displayUnits = (lvl.cpoRequiredQty != null && lvl.cpoRequiredQty > 0)
                    ? lvl.cpoRequiredQty
                    : (lvl.isAutoUnits || lvl.units === 0 ? computedUnits : lvl.units);
                  return computeColumnOutputs(
                    lvl.fillRatePerMin, lvl.efficiencyBuffer, lvl.wageRate, lvl.numStaff,
                    lvl.hrsPerShift, lvl.workingDays, lvl.packagingWeightG, displayUnits,
                    lvl.overageRate, lvl.costPerUnit, lvl.laborMarkup, lvl.labelApplyRate,
                  );
                });

                const costs = packagingLevels.map((lvl, index) => {
                  const out    = outputs[index];
                  const ourLabor = out.ourLaborCost;
                  const cxLabor  = out.customerLaborCost;
                  // Material cost = (packaging cost/unit + label cost/unit + tab cost/unit) × units required
                  // Customer material = our material × (1 + unitCostMarkup%)
                  const labelCost = lvl.labelEnabled ? lvl.labelPrintCost : 0;
                  const tabCost   = lvl.tabsEnabled  ? lvl.tabCostPerUnit : 0;
                  const ourPkgPerUnit = lvl.costPerUnit + labelCost + tabCost;
                  const ourPkg   = ourPkgPerUnit * out.unitsReq;
                  const cxPkg    = ourPkg * (1 + lvl.unitCostMarkup / 100);
                  return { ourLabor, cxLabor, ourPkg, cxPkg, ourTotal: ourLabor + ourPkg, cxTotal: cxLabor + cxPkg };
                });

                // Each row is either a single-value metric or a dual our/customer cost row
                type Row =
                  | { kind: "metric"; label: string; val: (i: number) => string }
                  | { kind: "cost";   label: string; our: (i: number) => number; cx: (i: number) => number; bold?: boolean };

                const rows: Row[] = [
                  { kind: "metric", label: "Units Required",       val: i => outputs[i].unitsReq > 0      ? fmtN0(outputs[i].unitsReq)      : "—" },
                  { kind: "metric", label: "Eff. Rate / min",      val: i => outputs[i].effRate > 0       ? fmtN2(outputs[i].effRate)        : "—" },
                  { kind: "metric", label: "Per Hour",             val: i => outputs[i].perHr > 0         ? fmtN0(outputs[i].perHr)          : "—" },
                  { kind: "metric", label: "Total Hrs Required",   val: i => outputs[i].totalHrsReq > 0   ? fmtN0(outputs[i].totalHrsReq)    : "—" },
                  { kind: "metric", label: "Total Min Required",   val: i => outputs[i].totalMinReq > 0   ? fmtN0(outputs[i].totalMinReq)    : "—" },
                  { kind: "cost",   label: "Cost / Min",           our: i => outputs[i].costPerMin,       cx: i => outputs[i].costPerMin * (1 + packagingLevels[i].laborMarkup / 100)  },
                  { kind: "cost",   label: "Labor Cost",           our: i => costs[i].ourLabor,           cx: i => costs[i].cxLabor },
                  { kind: "cost",   label: "Packaging Cost",       our: i => costs[i].ourPkg,             cx: i => costs[i].cxPkg },
                  { kind: "cost",   label: "Total Cost",           our: i => costs[i].ourTotal,           cx: i => costs[i].cxTotal, bold: true },
                  { kind: "metric", label: "Pkg Total Weight (g)", val: i => outputs[i].pkgWeight > 0     ? fmtN0(outputs[i].pkgWeight)      : "—" },
                  { kind: "metric", label: "Lead Time (days)",     val: i => outputs[i].leadTimeDays > 0  ? outputs[i].leadTimeDays.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—" },
                  { kind: "metric", label: "Lead Time (weeks)",    val: i => outputs[i].leadTimeWeeks > 0 ? fmtN2(outputs[i].leadTimeWeeks)  : "—" },
                ];

                // Sub-header row showing Our / Customer column labels
                const subHeader = (
                  <tr key="col-subheader" className="border-b border-amber-200/70 bg-amber-50/40">
                    <td className="px-3 py-1 sticky left-0 z-10 bg-amber-50/40" />
                    {packagingLevels.map(lvl =>
                      collapsedCols[lvl.id]
                        ? <td key={lvl.id} className="w-9 border-l border-amber-200 bg-amber-50/40" />
                        : (
                          <td key={lvl.id} className="px-2 py-0.5 border-l border-amber-200 bg-amber-50/40">
                            {outputsOpen[lvl.id] && (
                              <div className="flex justify-between">
                                <span className="text-[0.52rem] font-bold text-zinc-600 uppercase tracking-wider">Our Cost</span>
                                <span className="text-[0.52rem] font-bold text-[#e8473f] uppercase tracking-wider">Customer</span>
                              </div>
                            )}
                          </td>
                        )
                    )}
                  </tr>
                );

                const dataRows = rows.map(row => {
                  const isCost = row.kind === "cost";
                  const bold   = isCost && (row as { bold?: boolean }).bold;
                  return (
                    <tr key={row.label} className={`border-b ${isCost ? "border-amber-100" : "border-gray-100"} ${bold ? "bg-amber-50/60" : isCost ? "bg-amber-50/20" : "bg-gray-50/60"}`}>
                      <td className={`px-3 py-1 text-[0.63rem] sticky left-0 z-10 ${bold ? "font-bold text-amber-800 bg-amber-50/60" : isCost ? "text-zinc-700 bg-amber-50/30" : "text-zinc-600 bg-gray-50/80"}`}>
                        {row.label}
                      </td>
                      {packagingLevels.map((lvl, i) => {
                        if (collapsedCols[lvl.id]) return <td key={lvl.id} className="w-9 border-l border-amber-200 bg-amber-50/40" />;
                        if (!outputsOpen[lvl.id]) return <td key={lvl.id} className="px-2 py-1 border-l border-amber-200 text-right"><span className="text-[0.65rem] text-zinc-500">—</span></td>;
                        return (
                          <td key={lvl.id} className={`px-2 py-1 border-l ${isCost ? "border-amber-200" : "border-gray-200"}`}>
                            {isCost ? (
                              <div className="flex justify-between gap-1">
                                <span className={`text-[0.7rem] tabular-nums ${bold ? "font-bold text-zinc-800" : "font-semibold text-zinc-700"}`}>
                                  {(row as { our: (i: number) => number }).our(i) > 0 ? fmtD((row as { our: (i: number) => number }).our(i)) : "—"}
                                </span>
                                <span className={`text-[0.7rem] tabular-nums ${bold ? "font-bold text-[#e8473f]" : "font-semibold text-[#e8473f]/80"}`}>
                                  {(row as { cx: (i: number) => number }).cx(i) > 0 ? fmtD((row as { cx: (i: number) => number }).cx(i)) : "—"}
                                </span>
                              </div>
                            ) : (
                              <div className="flex justify-between gap-1">
                                <span className="text-[0.72rem] font-semibold text-zinc-900 tabular-nums">
                                  {(row as { val: (i: number) => string }).val(i)}
                                </span>
                                <span className="text-[0.65rem] text-zinc-500">—</span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                });

                return [subHeader, ...dataRows];
              })()}

            </tbody>
          </table>
        </div>

        {/* ── Manual Charge (toggle) — outside scroll container so it respects card width ── */}
        <div className="mx-4 mb-3 mt-1 border border-dashed border-amber-400 rounded-lg bg-amber-50/60">
          <button
            type="button"
            onClick={() => setManualChargeOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-2 group"
          >
            <span className="text-[0.55rem] font-semibold text-zinc-600 uppercase tracking-widest group-hover:text-amber-700 transition-colors">
              Manual Charge {allCharges.length > 0 && <span className="text-amber-600">({allCharges.length})</span>}
            </span>
            {manualChargeOpen
              ? <ChevronUp size={12} className="text-zinc-600 group-hover:text-amber-600 transition-colors" />
              : <ChevronDown size={12} className="text-zinc-600 group-hover:text-amber-600 transition-colors" />}
          </button>

          {manualChargeOpen && (
            <div className="px-3 pb-3 border-t border-amber-300/40">
              {/* existing charges */}
              {allCharges.length > 0 && (
                <div className="mt-2 mb-3 space-y-1">
                  {allCharges.map(c => {
                    const assignedLevels = c.levelId
                      ? packagingLevels.filter(l => l.id === c.levelId)
                      : packagingLevels;
                    const assignedLabel = c.levelId
                      ? (packagingLevels.find(l => l.id === c.levelId)?.customLevelName || packagingLevels.find(l => l.id === c.levelId)?.packagingLevel || "Level")
                      : "All levels";
                    const chargeRows = assignedLevels.map((lvl) => {
                      const index = packagingLevels.indexOf(lvl);
                      const baseUnits = lvl.cpoRequiredQty != null && lvl.cpoRequiredQty > 0
                        ? lvl.cpoRequiredQty
                        : effectiveUnits(lvl, index, packagingLevels);
                      const unitsWithOverage = Math.ceil(baseUnits * (1 + lvl.overageRate / 100));
                      const total = c.basis === "per_unit" ? c.amount * unitsWithOverage : c.amount;
                      return { lvl, total, unitsWithOverage };
                    });
                    return (
                      <div key={c.id} className="flex items-center gap-2 text-[0.65rem] bg-white border border-amber-200 rounded px-2 py-1.5">
                        <span className="font-semibold text-zinc-800 flex-1 min-w-0 truncate">{c.name}</span>
                        <span className="text-[0.6rem] text-zinc-600 shrink-0 italic">{assignedLabel}</span>
                        <span className="text-zinc-600 shrink-0 text-[0.6rem]">${c.amount.toFixed(2)} {c.basis === "per_unit" ? "/unit" : "fixed"}</span>
                        <span className="text-zinc-500 shrink-0">→</span>
                        {chargeRows.map(({ lvl, total, unitsWithOverage }) => (
                          <span key={lvl.id} className="text-[#e8473f] font-semibold tabular-nums shrink-0 text-[0.65rem]">
                            ${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {c.basis === "per_unit" && <span className="text-zinc-600 font-normal"> ({unitsWithOverage.toLocaleString()}u)</span>}
                          </span>
                        ))}
                        <button type="button" onClick={() => removeCharge(c.id)}
                          className="shrink-0 text-zinc-500 hover:text-red-400 transition-colors ml-1">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* add new charge — compact 2-row grid layout */}
              <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-x-2 gap-y-1.5 items-end">
                {/* Row 1: Name + Level + Amount */}
                <div>
                  <p className="text-[0.5rem] text-zinc-600 mb-0.5">Charge Name</p>
                  <input
                    type="text"
                    value={draftCharge.name}
                    onChange={e => setDraftCharge(d => ({ ...d, name: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addCharge()}
                    placeholder="e.g. Tray Insert Cost"
                    className="h-7 w-full px-2 text-xs text-zinc-800 border border-amber-300 bg-white rounded focus:outline-none focus:ring-1 focus:ring-[#e8473f]/40 focus:border-[#e8473f] placeholder:text-zinc-600 transition"
                  />
                </div>
                <div>
                  <p className="text-[0.5rem] text-zinc-600 mb-0.5">Level</p>
                  <select
                    value={draftCharge.levelId}
                    onChange={e => setDraftCharge(d => ({ ...d, levelId: e.target.value }))}
                    className="h-7 px-2 text-xs text-zinc-800 border border-amber-300 bg-white rounded focus:outline-none focus:ring-1 focus:ring-[#e8473f]/40 focus:border-[#e8473f] transition cursor-pointer"
                  >
                    <option value="">All</option>
                    {packagingLevels.map(lvl => (
                      <option key={lvl.id} value={lvl.id}>
                        {lvl.customLevelName || lvl.packagingLevel || effectiveTypeName(lvl) || `Level ${packagingLevels.indexOf(lvl) + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-[0.5rem] text-zinc-600 mb-0.5">Amount ($)</p>
                  <input
                    type="number" min={0} step={0.01}
                    value={draftCharge.amount}
                    onChange={e => setDraftCharge(d => ({ ...d, amount: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addCharge()}
                    placeholder="0.00"
                    className="h-7 w-20 px-2 text-xs text-zinc-800 border border-amber-300 bg-white rounded focus:outline-none focus:ring-1 focus:ring-[#e8473f]/40 focus:border-[#e8473f] placeholder:text-zinc-600 transition"
                  />
                </div>
              </div>
              {/* Row 2: basis toggle + add button */}
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex items-center border border-gray-300 rounded overflow-hidden h-7 text-xs font-semibold">
                  <button type="button"
                    onClick={() => setDraftCharge(d => ({ ...d, basis: "per_unit" }))}
                    className={`px-2.5 h-7 flex items-center transition-colors text-[0.65rem] ${draftCharge.basis === "per_unit" ? "bg-gray-800 text-white" : "text-zinc-600 hover:text-zinc-800"}`}>
                    Per Unit
                  </button>
                  <button type="button"
                    onClick={() => setDraftCharge(d => ({ ...d, basis: "fixed" }))}
                    className={`px-2.5 h-7 flex items-center transition-colors border-l border-gray-300 text-[0.65rem] ${draftCharge.basis === "fixed" ? "bg-gray-800 text-white" : "text-zinc-600 hover:text-zinc-800"}`}>
                    Fixed
                  </button>
                </div>
                <button type="button" onClick={addCharge}
                  className="h-7 px-3 text-[0.65rem] font-semibold text-white rounded transition-colors whitespace-nowrap disabled:opacity-40"
                  style={{ backgroundColor: "#e8473f" }}
                  disabled={!draftCharge.name.trim() || !draftCharge.amount || parseFloat(draftCharge.amount) <= 0}>
                  + Add
                </button>
              </div>
            </div>
          )}
        </div>
        </CollapsedContext.Provider>
      )}



      {sectionOpen && packagingLevels.length === 0 && (
        <div className="px-5 py-4">
          <p className="text-xs text-zinc-500 italic text-center">No packaging levels — click Add Level</p>
        </div>
      )}
    </div>
  );
}
