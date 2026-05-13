import { useState, useEffect, useCallback } from "react";
import { X, Check } from "lucide-react";
import { useProject } from "@/lib/ProjectContext";

interface Props {
  open:    boolean;
  onClose: () => void;
  /** Called when user clicks "Apply to Quote" — passes moqRowId → adjusted PPU */
  onApply: (moqRowId: number, adjPPU: number) => void;
}

const fmt    = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtPct = (v: number) => v.toFixed(1) + "%";

function marginColor(pct: number): string {
  if (pct >= 65) return "text-green-600";
  if (pct >= 50) return "text-amber-500";
  return "text-red-500";
}

export default function MarginCalculator({ open, onClose, onApply }: Props) {
  const { allMoqResults, activeMoqId } = useProject();

  // Per-row: PPU override (string for controlled input)
  const [ppuInputs, setPpuInputs]     = useState<Record<number, string>>({});
  const [marginInputs, setMarginInputs] = useState<Record<number, string>>({});
  // Which field was last edited per row
  const [lastEdited, setLastEdited]   = useState<Record<number, "ppu" | "margin">>({});

  // Global controls
  const [globalMode,   setGlobalMode]   = useState<"margin" | "multiplier">("margin");
  const [globalMargin, setGlobalMargin] = useState("");
  const [globalMult,   setGlobalMult]   = useState("");

  const [toast, setToast] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Reset local state whenever the modal opens
  useEffect(() => {
    if (open) {
      setPpuInputs({});
      setMarginInputs({});
      setLastEdited({});
      setGlobalMargin("");
      setGlobalMult("");
    }
  }, [open]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Resolve effective PPU for a row (user override or base)
  const effectivePpu = useCallback((id: number, basePpu: number, baseCostPpu: number): number => {
    const le = lastEdited[id] ?? "ppu";
    if (le === "margin") {
      const m = parseFloat(marginInputs[id] ?? "");
      if (!isNaN(m) && m < 100 && baseCostPpu > 0) return baseCostPpu / (1 - m / 100);
    }
    const p = parseFloat(ppuInputs[id] ?? "");
    if (!isNaN(p) && p > 0) return p;
    return basePpu;
  }, [ppuInputs, marginInputs, lastEdited]);

  const effectiveMargin = useCallback((id: number, basePpu: number, costPpu: number): number => {
    const ppu = effectivePpu(id, basePpu, costPpu);
    return ppu > 0 ? ((ppu - costPpu) / ppu) * 100 : 0;
  }, [effectivePpu]);

  const resetAll = () => {
    setPpuInputs({});
    setMarginInputs({});
    setLastEdited({});
    setGlobalMargin("");
    setGlobalMult("");
  };

  // Push a global margin value into every row's margin input immediately
  const pushGlobalMargin = (raw: string) => {
    setGlobalMargin(raw);
    const m = parseFloat(raw);
    if (isNaN(m) || m >= 100 || m < 0) return;
    const newMargin: Record<number, string> = {};
    const newPpu:    Record<number, string> = {};
    const newLE:     Record<number, "ppu" | "margin"> = {};
    for (const r of allMoqResults) {
      newMargin[r.moqRow.id] = String(m);
      newPpu[r.moqRow.id]    = "";
      newLE[r.moqRow.id]     = "margin";
    }
    setMarginInputs(newMargin);
    setPpuInputs(newPpu);
    setLastEdited(newLE);
  };

  // Push a global multiplier value into every row's PPU input immediately
  const pushGlobalMult = (raw: string) => {
    setGlobalMult(raw);
    const mult = parseFloat(raw);
    if (isNaN(mult) || mult <= 0) return;
    const newPpu:    Record<number, string> = {};
    const newMargin: Record<number, string> = {};
    const newLE:     Record<number, "ppu" | "margin"> = {};
    for (const r of allMoqResults) {
      newPpu[r.moqRow.id]    = String((r.ppuCost * mult).toFixed(4));
      newMargin[r.moqRow.id] = "";
      newLE[r.moqRow.id]     = "ppu";
    }
    setPpuInputs(newPpu);
    setMarginInputs(newMargin);
    setLastEdited(newLE);
  };


  // Aggregate stats
  const revenues = allMoqResults.map((r) => effectivePpu(r.moqRow.id, r.ppu, r.ppuCost) * r.ppuDenominator);
  const avgMargin = allMoqResults.length > 0
    ? allMoqResults.reduce((s, r) => s + effectiveMargin(r.moqRow.id, r.ppu, r.ppuCost), 0) / allMoqResults.length
    : 0;
  const minRev = revenues.length > 0 ? Math.min(...revenues) : 0;
  const maxRev = revenues.length > 0 ? Math.max(...revenues) : 0;
  const activeResult = allMoqResults.find((r) => r.moqRow.id === activeMoqId);
  const activeRev    = activeResult
    ? effectivePpu(activeResult.moqRow.id, activeResult.ppu, activeResult.ppuCost) * activeResult.ppuDenominator
    : 0;

  const inputBase = "h-8 px-2 text-xs bg-amber-50 border border-amber-200 rounded focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition w-full";

  return (
    <>
      {/* Overlay + centered modal */}
      <div
        className={`fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
      {/* Modal */}
      <div
        className={`relative w-full md:max-w-225 max-h-[90vh] bg-white rounded-lg shadow-2xl flex flex-col transition-all duration-200 ${open ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
      >
        {/* ── Header ── */}
        <div className="shrink-0 px-5 py-4 border-b border-gray-100 flex items-start justify-between bg-white">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Margin Calculator</h2>
            <p className="text-[0.65rem] text-gray-400 mt-0.5">Adjust pricing across all MOQ configurations</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors mt-0.5">
            <X size={18} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Section 1 — MOQ Overview Table ── */}
          <div className="px-5 pt-4 pb-2">
            <p className="text-[0.6rem] font-bold uppercase tracking-widest text-gray-400 mb-2">MOQ Overview</p>
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="py-2 px-2 text-left text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider">MOQ</th>
                    <th className="py-2 px-2 text-left text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider">Pack</th>
                    <th className="py-2 px-2 text-right text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider">Cost PPU</th>
                    <th className="py-2 px-2 text-right text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider">PPU</th>
                    <th className="py-2 px-2 text-right text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider">Margin</th>
                    <th className="py-2 px-2 text-right text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {allMoqResults.map((r, i) => {
                    const isActive = r.moqRow.id === activeMoqId;
                    const adjPpu   = effectivePpu(r.moqRow.id, r.ppu, r.ppuCost);
                    const adjMargin = adjPpu > 0 ? ((adjPpu - r.ppuCost) / adjPpu) * 100 : 0;
                    const rev      = adjPpu * r.ppuDenominator;
                    return (
                      <tr
                        key={r.moqRow.id}
                        className={`border-b border-gray-50 last:border-0 ${isActive ? "bg-[#e8473f]/5" : i % 2 === 1 ? "bg-gray-50/40" : ""}`}
                      >
                        <td className={`py-2 px-2 font-semibold ${isActive ? "text-[#e8473f]" : "text-gray-900"}`}>{r.moqRow.moq}</td>
                        <td className="py-2 px-2 text-gray-500">{r.casePack}</td>
                        <td className="py-2 px-2 text-right text-gray-600">{r.ppuCost > 0 ? fmt(r.ppuCost) : "—"}</td>
                        <td className="py-2 px-2 text-right text-gray-800 font-medium">{adjPpu > 0 ? fmt(adjPpu) : "—"}</td>
                        <td className={`py-2 px-2 text-right font-semibold ${marginColor(adjMargin)}`}>{fmtPct(adjMargin)}</td>
                        <td className="py-2 px-2 text-right text-gray-700">{rev > 0 ? fmt(rev) : "—"}</td>
                      </tr>
                    );
                  })}
                  {allMoqResults.length === 0 && (
                    <tr><td colSpan={6} className="py-6 text-center text-xs text-gray-400 italic">No MOQ data — fill in project details first</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Section 3 — Global controls (above per-row) ── */}
          <div className="px-5 pt-3 pb-2">
            <p className="text-[0.6rem] font-bold uppercase tracking-widest text-gray-400 mb-2">Apply to All MOQs</p>
            <div className="border border-gray-100 rounded-lg p-3 space-y-3">
              {/* Mode toggle */}
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                <button
                  onClick={() => setGlobalMode("margin")}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${globalMode === "margin" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  Set by Margin %
                </button>
                <button
                  onClick={() => setGlobalMode("multiplier")}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${globalMode === "multiplier" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  Set by PPU Multiplier
                </button>
              </div>

              {globalMode === "margin" ? (
                <div className="flex items-center gap-2">
                  <input
                    type="range" min={0} max={99} step={0.5}
                    value={parseFloat(globalMargin) || 0}
                    onChange={(e) => pushGlobalMargin(e.target.value)}
                    className="flex-1 accent-[#e8473f]"
                  />
                  <div className="flex items-center">
                    <input
                      type="number" value={globalMargin}
                      onChange={(e) => pushGlobalMargin(e.target.value)}
                      placeholder="66.6"
                      className="w-16 h-8 px-2 text-xs bg-amber-50 border border-amber-200 rounded-l focus:outline-none focus:ring-1 focus:ring-[#e8473f]"
                    />
                    <span className="h-8 px-2 flex items-center text-xs text-gray-400 border border-l-0 border-amber-200 bg-amber-50/50 rounded-r">%</span>
                  </div>
                  <button onClick={resetAll} className="h-8 px-3 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap">Reset</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="range" min={1} max={10} step={0.1}
                    value={parseFloat(globalMult) || 1}
                    onChange={(e) => pushGlobalMult(e.target.value)}
                    className="flex-1 accent-[#e8473f]"
                  />
                  <div className="flex items-center">
                    <input
                      type="number" value={globalMult}
                      onChange={(e) => pushGlobalMult(e.target.value)}
                      placeholder="3.0"
                      className="w-16 h-8 px-2 text-xs bg-amber-50 border border-amber-200 rounded-l focus:outline-none focus:ring-1 focus:ring-[#e8473f]"
                    />
                    <span className="h-8 px-2 flex items-center text-xs text-gray-400 border border-l-0 border-amber-200 bg-amber-50/50 rounded-r">×</span>
                  </div>
                  <button onClick={resetAll} className="h-8 px-3 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap">Reset</button>
                </div>
              )}
            </div>
          </div>

          {/* ── Live Output Preview ── */}
          {(() => {
            // Pre-compute per-row adjusted values and original values
            const rows = allMoqResults.map((r) => {
              const adjPpu     = effectivePpu(r.moqRow.id, r.ppu, r.ppuCost);
              const adjMargin  = adjPpu > 0 ? ((adjPpu - r.ppuCost) / adjPpu) * 100 : 0;
              const adjRev     = adjPpu * r.ppuDenominator;
              const origMargin = r.ppu > 0 ? ((r.ppu - r.ppuCost) / r.ppu) * 100 : 0;
              const origRev    = r.ppu * r.ppuDenominator;
              const deltaRev   = adjRev - origRev;
              const deltaPpu   = adjPpu - r.ppu;
              const deltaMargin = adjMargin - origMargin;
              return { r, adjPpu, adjMargin, adjRev, origMargin, origRev, deltaRev, deltaPpu, deltaMargin };
            });

            const hasChanges = rows.some((row) => Math.abs(row.deltaRev) > 0.005);

            const origAvgMargin = allMoqResults.length > 0
              ? allMoqResults.reduce((s, r) => s + (r.ppu > 0 ? ((r.ppu - r.ppuCost) / r.ppu) * 100 : 0), 0) / allMoqResults.length
              : 0;

            const activeRow = rows.find((row) => row.r.moqRow.id === activeMoqId);
            const origActiveRev = activeRow?.origRev ?? 0;
            const adjActiveRev  = activeRow?.adjRev  ?? 0;
            const barMax = Math.max(origActiveRev, adjActiveRev, 1);

            const deltaFmt = (v: number, isCurrency = true) => {
              const sign = v > 0 ? "+" : "";
              const arrow = v > 0 ? " ↑" : v < 0 ? " ↓" : "";
              const val = isCurrency ? fmt(v) : fmtPct(v);
              return `${sign}${val}${arrow}`;
            };
            const deltaColor = (v: number) =>
              Math.abs(v) < 0.005 ? "text-gray-400" : v > 0 ? "text-green-600" : "text-red-500";

            return (
              <div className="px-5 pt-1 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[0.6rem] font-bold uppercase tracking-widest text-gray-400">Live Output Preview</p>
                  {!hasChanges && (
                    <span className="text-[0.6rem] text-gray-300 italic">Adjust the controls above to preview changes</span>
                  )}
                </div>

                {hasChanges ? (
                  <div className="border border-gray-100 rounded-lg overflow-hidden">
                    {/* Table header */}
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0 bg-gray-50 border-b border-gray-100">
                      {["Line Item","Current Rev","Adjusted Rev","Δ Change"].map((h, i) => (
                        <div key={h} className={`py-2 px-2.5 text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider ${i > 0 ? "text-right" : ""}`}>{h}</div>
                      ))}
                    </div>
                    {rows.map(({ r, adjPpu, adjMargin, adjRev, origMargin, origRev, deltaRev, deltaPpu, deltaMargin }) => {
                      const isActive = r.moqRow.id === activeMoqId;
                      return (
                        <div key={r.moqRow.id} className={`border-b border-gray-50 last:border-0 ${isActive ? "bg-[#e8473f]/3" : ""}`}>
                          {/* Summary row */}
                          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0">
                            <div className={`py-2 px-2.5 text-xs font-semibold ${isActive ? "text-[#e8473f]" : "text-gray-700"}`}>
                              {r.moqRow.moq} · {r.casePack}pk
                            </div>
                            <div className="py-2 px-2.5 text-xs text-right text-gray-500">{origRev > 0 ? fmt(origRev) : "—"}</div>
                            <div className="py-2 px-2.5 text-xs text-right font-semibold text-gray-800">{adjRev > 0 ? fmt(adjRev) : "—"}</div>
                            <div className={`py-2 px-2.5 text-xs text-right font-semibold ${deltaColor(deltaRev)}`}>
                              {Math.abs(deltaRev) > 0.005 ? deltaFmt(deltaRev) : "—"}
                            </div>
                          </div>
                          {/* Detail sub-row */}
                          <div className="grid grid-cols-3 gap-0 px-2.5 pb-2 text-[0.6rem] border-t border-gray-50">
                            <div className="space-y-0.5 pt-1">
                              <div className="text-gray-400">Current</div>
                              <div className="text-gray-600">PPU {r.ppu > 0 ? fmt(r.ppu) : "—"} · {fmtPct(origMargin)}</div>
                            </div>
                            <div className="space-y-0.5 pt-1">
                              <div className="text-gray-400">Adjusted</div>
                              <div className="font-semibold text-gray-800">PPU {fmt(adjPpu)} · <span className={marginColor(adjMargin)}>{fmtPct(adjMargin)}</span></div>
                            </div>
                            <div className="space-y-0.5 pt-1">
                              <div className="text-gray-400">Change</div>
                              <div className="space-x-2">
                                <span className={deltaColor(deltaPpu)}>{Math.abs(deltaPpu) > 0.0001 ? deltaFmt(deltaPpu) : "—"}</span>
                                <span className={deltaColor(deltaMargin)}>{Math.abs(deltaMargin) > 0.005 ? deltaFmt(deltaMargin, false) : ""}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Bar chart — active MOQ only */}
                    {activeRow && (
                      <div className="border-t border-gray-100 px-3 py-3 bg-gray-50/40">
                        <p className="text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider mb-2">Active MOQ Revenue</p>
                        <div className="space-y-1.5">
                          {/* Current bar */}
                          <div className="flex items-center gap-2">
                            <span className="text-[0.6rem] text-gray-400 w-14 shrink-0">Current</span>
                            <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                              <div
                                className="h-full bg-gray-400 rounded transition-all duration-300"
                                style={{ width: `${Math.round((origActiveRev / barMax) * 100)}%` }}
                              />
                            </div>
                            <span className="text-[0.65rem] text-gray-500 font-medium w-20 text-right shrink-0">{fmt(origActiveRev)}</span>
                          </div>
                          {/* Adjusted bar */}
                          <div className="flex items-center gap-2">
                            <span className="text-[0.6rem] text-gray-400 w-14 shrink-0">Adjusted</span>
                            <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                              <div
                                className="h-full bg-[#e8473f] rounded transition-all duration-300"
                                style={{ width: `${Math.round((adjActiveRev / barMax) * 100)}%` }}
                              />
                            </div>
                            <span className="text-[0.65rem] text-[#e8473f] font-bold w-20 text-right shrink-0">{fmt(adjActiveRev)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Margin impact summary */}
                    <div className="border-t border-gray-100 px-3 py-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Avg Margin</span>
                        <span className="font-semibold text-gray-700">
                          {fmtPct(origAvgMargin)}
                          {Math.abs(avgMargin - origAvgMargin) > 0.005 && (
                            <span className={`ml-1 ${deltaColor(avgMargin - origAvgMargin)}`}>
                              → {fmtPct(avgMargin)}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Active Revenue</span>
                        <span className="font-semibold text-gray-700">
                          {fmt(origActiveRev)}
                          {Math.abs(adjActiveRev - origActiveRev) > 0.005 && (
                            <span className={`ml-1 ${deltaColor(adjActiveRev - origActiveRev)}`}>
                              → {fmt(adjActiveRev)}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="col-span-2 flex items-center justify-between">
                        <span className="text-gray-400">Revenue Range</span>
                        <span className="font-semibold text-gray-700">
                          {fmt(Math.min(...rows.map(r => r.origRev)))}–{fmt(Math.max(...rows.map(r => r.origRev)))}
                          {hasChanges && (
                            <span className="ml-1 text-gray-400">
                              → {fmt(Math.min(...rows.map(r => r.adjRev)))}–{fmt(Math.max(...rows.map(r => r.adjRev)))}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })()}

          {/* ── Section 2 — Per-row adjusters ── */}
          <div className="px-5 pt-1 pb-4 space-y-2">
            <p className="text-[0.6rem] font-bold uppercase tracking-widest text-gray-400 mb-2">Per-MOQ Adjustment</p>
            {allMoqResults.map((r) => {
              const isActive  = r.moqRow.id === activeMoqId;
              const le        = lastEdited[r.moqRow.id] ?? "ppu";
              const adjPpu    = effectivePpu(r.moqRow.id, r.ppu, r.ppuCost);
              const adjMargin = adjPpu > 0 ? ((adjPpu - r.ppuCost) / adjPpu) * 100 : 0;
              const rev       = adjPpu * r.ppuDenominator;

              // Derived display values for the non-authoritative field
              const ppuDisplay    = le === "margin" && marginInputs[r.moqRow.id] !== ""
                ? adjPpu.toFixed(4)
                : (ppuInputs[r.moqRow.id] ?? "");
              const marginDisplay = le === "ppu" && ppuInputs[r.moqRow.id] !== ""
                ? adjMargin.toFixed(2)
                : (marginInputs[r.moqRow.id] ?? "");

              return (
                <div
                  key={r.moqRow.id}
                  className={`border rounded-lg p-3 ${isActive ? "border-[#e8473f]/30 bg-[#e8473f]/3" : "border-gray-100"}`}
                >
                  {/* Row label */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {isActive && <div className="w-1.5 h-1.5 rounded-full bg-[#e8473f]" />}
                      <span className={`text-xs font-semibold ${isActive ? "text-[#e8473f]" : "text-gray-700"}`}>
                        {r.moqRow.moq} MOQ · {r.casePack}pk
                      </span>
                      <span className="text-[0.6rem] text-gray-400">Cost PPU: {r.ppuCost > 0 ? fmt(r.ppuCost) : "—"}</span>
                    </div>
                    <span className={`text-xs font-bold ${marginColor(adjMargin)}`}>{fmtPct(adjMargin)}</span>
                  </div>

                  {/* PPU ↔ Margin inputs */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <p className="text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider mb-1">PPU</p>
                      <div className="flex items-center">
                        <span className="h-8 px-2 flex items-center text-xs text-gray-400 border border-r-0 border-amber-200 bg-amber-50/50 rounded-l">$</span>
                        <input
                          type="number"
                          value={ppuDisplay}
                          placeholder={r.ppu > 0 ? r.ppu.toFixed(2) : "0.00"}
                          onChange={(e) => {
                            setPpuInputs((p) => ({ ...p, [r.moqRow.id]: e.target.value }));
                            setMarginInputs((p) => ({ ...p, [r.moqRow.id]: "" }));
                            setLastEdited((p) => ({ ...p, [r.moqRow.id]: "ppu" }));
                          }}
                          className={`${inputBase} rounded-l-none`}
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider mb-1">Margin %</p>
                      <div className="flex items-center">
                        <input
                          type="number"
                          value={marginDisplay}
                          placeholder={r.marginPct > 0 ? r.marginPct.toFixed(1) : "0.0"}
                          onChange={(e) => {
                            setMarginInputs((p) => ({ ...p, [r.moqRow.id]: e.target.value }));
                            setPpuInputs((p) => ({ ...p, [r.moqRow.id]: "" }));
                            setLastEdited((p) => ({ ...p, [r.moqRow.id]: "margin" }));
                          }}
                          className={`${inputBase} rounded-r-none`}
                        />
                        <span className="h-8 px-2 flex items-center text-xs text-gray-400 border border-l-0 border-amber-200 bg-amber-50/50 rounded-r">%</span>
                      </div>
                    </div>
                  </div>

                  {/* Revenue + Apply button */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      Revenue: <span className="font-semibold text-gray-800">{rev > 0 ? fmt(rev) : "—"}</span>
                      {adjPpu !== r.ppu && r.ppu > 0 && (
                        <span className={`ml-1 text-[0.6rem] ${adjPpu > r.ppu ? "text-green-500" : "text-red-500"}`}>
                          ({adjPpu > r.ppu ? "+" : ""}{fmt(adjPpu - r.ppu)} PPU)
                        </span>
                      )}
                    </span>
                    {isActive && (
                      <button
                        onClick={() => {
                          onApply(r.moqRow.id, adjPpu);
                          showToast("Applied to quote");
                        }}
                        className="h-6 px-2.5 text-[0.65rem] font-semibold text-white bg-[#e8473f] hover:bg-[#d43f37] rounded-lg transition-colors"
                      >
                        Apply to Quote
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 border-t border-gray-100 px-5 py-3 bg-white space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Avg Margin</span>
            <span className={`font-bold ${marginColor(avgMargin)}`}>{fmtPct(avgMargin)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Revenue Range</span>
            <span className="font-semibold text-gray-800">{fmt(minRev)} — {fmt(maxRev)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Active MOQ Revenue</span>
            <span className="font-bold text-[#e8473f]">{activeRev > 0 ? fmt(activeRev) : "—"}</span>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl text-sm font-semibold text-white bg-green-600">
          <Check size={14} /> {toast}
        </div>
      )}
      </div>{/* end overlay */}
    </>
  );
}
