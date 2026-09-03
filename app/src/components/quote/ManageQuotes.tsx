import { useState, useEffect, useRef } from "react";
import { FolderOpen, X, Trash2, Search, Check, AlertCircle, RefreshCw } from "lucide-react";
import { useProject } from "@/lib/ProjectContext";
import { MoqRow, Column, ProjectFormData } from "@/lib/types";

const BASE = "https://jdi-pricing-tool-914416811.development.catalystserverless.com/server/quotes-api/quotes";

interface QuoteListItem {
  id: string;
  quote_name: string;
  created_at: string;
  modified_at: string;
}

type ToastState = { type: "success" | "error"; message: string } | null;

function fmt(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return dateStr; }
}

export default function ManageQuotes() {
  const { loadQuoteState } = useProject();

  const [open,     setOpen]     = useState(false);
  const [quotes,   setQuotes]   = useState<QuoteListItem[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [loading1, setLoading1] = useState<string | null>(null);
  const [toast,    setToast]    = useState<ToastState>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchQuotes = async () => {
    setLoading(true);
    try {
      const res = await fetch(BASE);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: QuoteListItem[] = await res.json();
      setQuotes(data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to load quotes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchQuotes();
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleLoad = async (id: string, name: string) => {
    setLoading1(id);
    try {
      const res = await fetch(`${BASE}/${id}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      const state = typeof data.quote_data === "string"
        ? JSON.parse(data.quote_data)
        : data.quote_data;
      if (!state?.moqRows || !state?.columns || !state?.formData) {
        throw new Error("Quote data is missing required fields");
      }
      console.log("[ManageQuotes] raw packagingLevels from DB:", JSON.stringify(state.packagingLevels?.map((l: {id:string;customLevelName:string;packagingType:string}) => ({ id: l.id, customLevelName: l.customLevelName, packagingType: l.packagingType }))));
      loadQuoteState({
        moqRows:           state.moqRows        as MoqRow[],
        columns:           state.columns        as Column[],
        formData:          state.formData       as ProjectFormData,
        customer:          state.customer,
        selectedBrand:     state.selectedBrand,
        packagingLevels:   state.packagingLevels,
        projectType:       state.projectType,
        coPackingState:    state.coPackingState,
        additionalFees:    state.additionalFees,
        coPackingProcesses: state.coPackingProcesses,
        crmAccountId:      state.crmAccountId,
        crmContactId:      state.crmContactId,
      }, id, name);
      setOpen(false);
      showToast("success", `Loaded "${name}"`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to load quote");
    } finally {
      setLoading1(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`${BASE}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setQuotes((prev) => prev.filter((q) => q.id !== id));
      showToast("success", `Deleted "${name}"`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to delete quote");
    } finally {
      setDeleting(null);
    }
  };

  const filtered = quotes.filter((q) =>
    q.quote_name.toLowerCase().includes(filter.toLowerCase())
  );

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
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-1.5 text-sm text-zinc-700 hover:text-zinc-950 transition-colors pb-1 border-b-2 border-transparent hover:border-[#e8473f]"
      >
        <FolderOpen size={14} />
        Saved Quotes
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-sm shadow-xl w-[480px] max-h-[70vh] flex flex-col">

            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <h2 className="text-sm font-semibold text-zinc-950">Saved Quotes</h2>
              <div className="flex items-center gap-2">
                <button type="button" onClick={fetchQuotes} disabled={loading} title="Refresh" className="text-zinc-600 hover:text-zinc-700 disabled:opacity-40">
                  <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                </button>
                <button type="button" onClick={() => setOpen(false)} className="text-zinc-600 hover:text-zinc-700">
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="px-4 py-2 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2 h-7 border border-gray-200 px-2">
                <Search size={11} className="text-zinc-600 shrink-0" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search quotes..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="flex-1 text-xs bg-transparent outline-none text-zinc-800 placeholder:text-zinc-500"
                />
                {filter && (
                  <button type="button" onClick={() => setFilter("")} className="text-zinc-500 hover:text-zinc-600">
                    <X size={10} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-xs text-zinc-600">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-xs text-zinc-600 italic">
                  {filter ? "No quotes match your search." : "No saved quotes yet."}
                </div>
              ) : (
                filtered.map((q) => (
                  <div key={q.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 hover:bg-gray-50/60 group">
                    <div className="min-w-0 flex-1 pr-3">
                      <p className="text-xs font-medium text-zinc-950 truncate">{q.quote_name}</p>
                      <p className="text-[0.6rem] text-zinc-600 mt-0.5">Saved {fmt(q.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleLoad(q.id, q.quote_name)}
                        disabled={loading1 === q.id}
                        className="h-6 px-2.5 text-[0.65rem] font-semibold text-white bg-[#e8473f] hover:bg-[#d43f37] disabled:opacity-50 rounded-lg transition-colors"
                      >
                        {loading1 === q.id ? "Loading..." : "Load"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(q.id, q.quote_name)}
                        disabled={deleting === q.id}
                        className="h-6 w-6 flex items-center justify-center text-zinc-500 hover:text-red-400 disabled:opacity-40 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {!loading && quotes.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-100 text-[0.6rem] text-zinc-600 shrink-0">
                {filtered.length} of {quotes.length} quote{quotes.length !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
