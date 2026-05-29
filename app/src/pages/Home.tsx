import { useState, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Navbar from "@/components/navbar/Navbar";
import ProjectInfoSection from "@/components/project/ProjectInfoSection";
import ProjectDetails from "@/components/project/ProjectDetails";
import ColumnsSection from "@/components/project/ColumnsSection";
import SummaryTables from "@/components/project/SummaryTables";
import { useProject } from "@/lib/ProjectContext";

export default function Home() {
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(1000);
  const dragging = useRef(false);
  const startX   = useRef(0);
  const startW   = useRef(0);
  const expanded = !summaryOpen;

  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current   = e.clientX;
    startW.current   = sidebarWidth;
    document.body.style.cursor    = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      // Dragging left edge: moving mouse left increases width
      const delta = startX.current - ev.clientX;
      setSidebarWidth(Math.min(1600, Math.max(600, startW.current + delta)));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor    = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  }, [sidebarWidth]);

  const {
    moqRows, setMoqRows,
    setColumns,
    formData, setFormField,
    activeMoqId, setActiveMoqId,
    effectiveColumns,
    detailSections, summaryRows, summaryTableRows, ppuUnits,
  } = useProject();

  return (
    <main className="min-h-screen flex flex-col">
      <Navbar />

      {/* ── Mobile: stacked layout ─────────────────────────────────── */}
      <div className="flex flex-col md:hidden flex-1 overflow-auto">
        {/* Inputs */}
        <div>
          <ProjectInfoSection />
          <ProjectDetails
            expanded={false}
            moqRows={moqRows}
            setMoqRows={setMoqRows}
            formData={formData}
            setFormField={setFormField}
          />
          <ColumnsSection
            expanded={false}
            columns={effectiveColumns}
            setColumns={setColumns}
          />
        </div>

        {/* Summary — always visible on mobile, collapsible */}
        <div className="border-t border-gray-100">
          <button
            onClick={() => setSummaryOpen(!summaryOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-600 bg-gray-50 border-b border-gray-100 min-h-11"
          >
            <div className="flex items-center gap-2">
              <span className="text-[0.6rem] font-bold uppercase tracking-widest text-gray-400">Summary</span>
              <div className="flex items-center gap-1 flex-wrap">
                {moqRows.map((row) => (
                  <button
                    key={row.id}
                    onClick={(e) => { e.stopPropagation(); setActiveMoqId(row.id); }}
                    className={`h-5 px-2 text-[0.6rem] font-semibold rounded-full transition-colors whitespace-nowrap ${
                      row.id === activeMoqId ? "bg-[#e8473f] text-white" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {row.moq || "—"} MOQ
                  </button>
                ))}
              </div>
            </div>
            {summaryOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
          {summaryOpen && (
            <div className="overflow-x-auto">
              <SummaryTables
                summaryRows={summaryRows}
                summaryTableRows={summaryTableRows}
                detailSections={detailSections}
                ppuUnits={ppuUnits}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Desktop: side-by-side split-panel layout ───────────────── */}
      <div className="hidden md:flex flex-1 overflow-hidden">

        {/* Left column */}
        <div className="flex-1 overflow-auto min-w-0">
          <ProjectInfoSection />
          <ProjectDetails
            expanded={expanded}
            moqRows={moqRows}
            setMoqRows={setMoqRows}
            formData={formData}
            setFormField={setFormField}
          />
          <ColumnsSection
            expanded={expanded}
            columns={effectiveColumns}
            setColumns={setColumns}
          />
        </div>

        {/* Drag handle + pill toggle — sits at the seam between panels */}
        <div className="relative w-0 z-20 flex items-start">
          {/* Pill toggle button */}
          <button
            onClick={() => setSummaryOpen(!summaryOpen)}
            className="absolute top-8 -translate-x-1/2 flex items-center gap-1.5 whitespace-nowrap h-7 px-3 rounded-full bg-white border border-gray-200 shadow-md text-gray-400 hover:text-[#e8473f] hover:border-[#e8473f] transition-colors cursor-pointer z-10"
          >
            {summaryOpen ? (
              <>
                <span className="text-[0.6rem] font-semibold uppercase tracking-wider">Summary</span>
                <ChevronRight size={10} strokeWidth={2.5} />
              </>
            ) : (
              <>
                <ChevronLeft size={10} strokeWidth={2.5} />
                <span className="text-[0.6rem] font-semibold uppercase tracking-wider">Summary</span>
              </>
            )}
          </button>

          {/* Resize drag handle — only visible when panel is open */}
          {summaryOpen && (
            <div
              onMouseDown={onDragStart}
              className="absolute inset-y-0 -translate-x-full w-1.5 cursor-col-resize group flex items-center justify-center hover:bg-[#e8473f]/20 active:bg-[#e8473f]/30 transition-colors"
              title="Drag to resize"
            >
              <div className="w-0.5 h-12 rounded-full bg-gray-200 group-hover:bg-[#e8473f]/60 transition-colors" />
            </div>
          )}
        </div>

        {/* Right panel */}
        <div
          className={`border-l border-gray-100 flex flex-col overflow-hidden ${summaryOpen ? "" : "w-0 flex-none"}`}
          style={summaryOpen ? { width: sidebarWidth, minWidth: 600, maxWidth: 1600, flexShrink: 0 } : undefined}
        >
          <div className="shrink-0 px-3 py-2 border-b border-gray-100 flex items-center gap-3">
            <span className="text-[0.6rem] font-bold uppercase tracking-widest text-gray-400 shrink-0">Summary</span>
            <div className="flex items-center gap-1 flex-wrap">
              {moqRows.map((row) => (
                <button
                  key={row.id}
                  onClick={() => setActiveMoqId(row.id)}
                  className={`h-5 px-2 text-[0.6rem] font-semibold rounded-full transition-colors whitespace-nowrap ${
                    row.id === activeMoqId ? "bg-[#e8473f] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {row.moq || "—"} MOQ
                  {row.unitsPerInner ? ` · ${row.unitsPerInner}/inner` : ""}
                  {row.innersPerMaster && row.innersPerMaster !== "0" ? ` · ${row.innersPerMaster}/master` : ""}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <SummaryTables
              summaryRows={summaryRows}
              summaryTableRows={summaryTableRows}
              detailSections={detailSections}
              ppuUnits={ppuUnits}
            />
          </div>
        </div>

      </div>
    </main>
  );
}
