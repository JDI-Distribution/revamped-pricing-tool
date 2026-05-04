"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Navbar from "@/components/navbar/Navbar";
import ProjectDetails from "@/components/project/ProjectDetails";
import ColumnsSection from "@/components/project/ColumnsSection";
import SummaryTables from "@/components/project/SummaryTables";
import { useProject } from "@/lib/ProjectContext";

export default function Home() {
  const [summaryOpen, setSummaryOpen] = useState(true);
  const expanded = !summaryOpen;

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

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left column ──────────────────────────────────────── */}
        <div className="flex-1 overflow-auto min-w-0">
          <ProjectDetails
            expanded={expanded}
            moqRows={moqRows}
            setMoqRows={setMoqRows}
            formData={formData}
            setFormField={setFormField}
            summaryTableRows={summaryTableRows}
          />
          <ColumnsSection
            expanded={expanded}
            columns={effectiveColumns}
            setColumns={setColumns}
          />
        </div>

        {/* ── Pill toggle — zero-width seam anchor ─────────────── */}
        <div className="relative w-0 z-20 flex items-start">
          <button
            onClick={() => setSummaryOpen(!summaryOpen)}
            className="absolute top-8 -translate-x-1/2 flex items-center gap-1.5 whitespace-nowrap h-7 px-3 rounded-full bg-white border border-gray-200 shadow-md text-gray-400 hover:text-[#e8473f] hover:border-[#e8473f] transition-colors cursor-pointer"
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
        </div>

        {/* ── Right panel ──────────────────────────────────────── */}
        <div
          className={`border-l border-gray-100 flex flex-col transition-all duration-300 ease-in-out overflow-hidden ${summaryOpen ? "flex-1" : "w-0 flex-none"}`}
          style={{ minWidth: summaryOpen ? "960px" : undefined, maxWidth: summaryOpen ? "1200px" : undefined }}
        >
          {/* Summary header + MOQ switcher */}
          <div className="shrink-0 px-3 py-2 border-b border-gray-100 flex items-center gap-3">
            <span className="text-[0.6rem] font-bold uppercase tracking-widest text-gray-400 shrink-0">
              Summary
            </span>
            <div className="flex items-center gap-1 flex-wrap">
              {moqRows.map((row) => (
                <button
                  key={row.id}
                  onClick={() => setActiveMoqId(row.id)}
                  className={`h-5 px-2 text-[0.6rem] font-semibold rounded-full transition-colors whitespace-nowrap ${
                    row.id === activeMoqId
                      ? "bg-[#e8473f] text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
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
