"use client";

import { useState, useEffect } from "react";
import { X, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { QuotePreview } from "@/lib/generateQuotePDF";

interface Props {
  previews: QuotePreview[];
  onClose:  () => void;
}

export default function PdfPreviewModal({ previews, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const current = previews[index];

  // Revoke blob URLs only after a 60s delay on unmount — gives iframe time to fully load
  useEffect(() => {
    return () => {
      setTimeout(() => previews.forEach((p) => URL.revokeObjectURL(p.blobUrl)), 60_000);
    };
  }, [previews]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const downloadCurrent = () => current.doc.save(current.filename);
  const downloadAll     = () => previews.forEach((p) => p.doc.save(p.filename));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm">

      {/* ── Top bar ── */}
      <div className="shrink-0 h-12 bg-white border-b border-gray-200 flex items-center px-4 gap-3">

        {/* Close */}
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          <X size={15} />
        </button>

        {/* Tab strip — one per MOQ row */}
        <div className="flex items-center gap-1 overflow-x-auto flex-1">
          {previews.map((p, i) => (
            <button
              key={p.filename}
              onClick={() => setIndex(i)}
              className={`shrink-0 h-7 px-3 text-[0.65rem] font-semibold rounded-full transition-colors whitespace-nowrap ${
                i === index
                  ? "bg-[#e8473f] text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              MOQ {p.moqLabel} · {p.packLabel}pk
            </button>
          ))}
        </div>

        {/* Nav arrows */}
        {previews.length > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="w-6 h-6 flex items-center justify-center border border-gray-200 text-gray-500 hover:border-[#e8473f] hover:text-[#e8473f] disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={12} />
            </button>
            <span className="text-[0.65rem] text-gray-400 w-10 text-center">
              {index + 1} / {previews.length}
            </span>
            <button
              onClick={() => setIndex((i) => Math.min(previews.length - 1, i + 1))}
              disabled={index === previews.length - 1}
              className="w-6 h-6 flex items-center justify-center border border-gray-200 text-gray-500 hover:border-[#e8473f] hover:text-[#e8473f] disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        )}

        {/* Download buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={downloadCurrent}
            className="flex items-center gap-1.5 h-7 px-3 text-[0.65rem] font-semibold border border-gray-200 text-gray-700 hover:border-[#e8473f] hover:text-[#e8473f] transition-colors"
          >
            <Download size={11} />
            This PDF
          </button>
          {previews.length > 1 && (
            <button
              onClick={downloadAll}
              className="flex items-center gap-1.5 h-7 px-3 text-[0.65rem] font-semibold bg-[#e8473f] hover:bg-[#d43f37] text-white transition-colors"
            >
              <Download size={11} />
              All {previews.length} PDFs
            </button>
          )}
        </div>
      </div>

      {/* ── iframe ── */}
      <div className="flex-1 bg-gray-200 flex items-center justify-center p-4">
        <iframe
          key={current.blobUrl}
          src={current.blobUrl}
          className="w-full max-w-3xl h-full bg-white shadow-2xl"
          style={{ minHeight: 0 }}
        />
      </div>

    </div>
  );
}
