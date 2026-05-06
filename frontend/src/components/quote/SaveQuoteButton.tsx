"use client";

import { useState } from "react";
import { Save, X, Check, AlertCircle } from "lucide-react";
import { useProject } from "@/lib/ProjectContext";

const API = "https://jdi-pricing-tool-914416811.development.catalystserverless.com/server/quotes-api/quotes";

interface Props {
  /** Extra state from the quote page (customer info, margins, brand, etc.) */
  quotePageState: Record<string, unknown>;
}

type ToastState = { type: "success" | "error"; message: string } | null;

export default function SaveQuoteButton({ quotePageState }: Props) {
  const { moqRows, columns, formData } = useProject();

  const [open,      setOpen]      = useState(false);
  const [quoteName, setQuoteName] = useState("");
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState<ToastState>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  const handleSave = async () => {
    const name = quoteName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const quote_data = JSON.stringify({ moqRows, columns, formData, ...quotePageState });
      const res = await fetch(API, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ quote_name: name, quote_data }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setOpen(false);
      setQuoteName("");
      showToast("success", `Quote "${name}" saved`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-[60] flex items-center gap-2 px-4 py-3 rounded shadow-lg text-xs font-semibold text-white transition-all ${
          toast.type === "success" ? "bg-green-600" : "bg-red-500"
        }`}>
          {toast.type === "success" ? <Check size={13} /> : <AlertCircle size={13} />}
          {toast.message}
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-xs font-medium px-3 h-7 transition-colors"
      >
        <Save size={12} />
        Save Quote
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-sm shadow-xl w-80 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Save Quote</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">Give this quote a name so you can find it later.</p>
            <input
              autoFocus
              type="text"
              placeholder="e.g. Bartesian 4oz Sachets Q2"
              value={quoteName}
              onChange={(e) => setQuoteName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              className="w-full h-8 px-3 text-xs border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setOpen(false)}
                className="px-3 h-7 text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !quoteName.trim()}
                className="px-3 h-7 text-xs font-semibold text-white bg-[#e8473f] hover:bg-[#d43f37] disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {saving ? "Saving…" : <><Save size={11} /> Save</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
