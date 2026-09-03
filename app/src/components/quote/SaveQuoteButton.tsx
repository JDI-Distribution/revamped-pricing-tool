import { useState, useEffect } from "react";
import { Save, X, Check, AlertCircle, BookmarkPlus, RefreshCw, Pencil } from "lucide-react";
import { useProject } from "@/lib/ProjectContext";
import { buildQuoteBaseName, buildVersionedQuoteName, nextQuoteRevisionVersion, quoteFamilyKey } from "@/lib/quoteVersioning";

const API = "https://jdi-pricing-tool-914416811.development.catalystserverless.com/server/quotes-api/quotes";

interface Props {
  quotePageState:  Record<string, unknown>;
  disabled?:       boolean;
  disabledReason?: string;
}

interface QuoteListItem {
  id: string;
  quote_name: string;
}

type ToastState = { type: "success" | "error"; message: string } | null;

export default function SaveQuoteButton({ quotePageState, disabled = false, disabledReason }: Props) {
  const { moqRows, columns, formData, customer, selectedBrand, crmAccountId, crmContactId, packagingLevels, projectType, coPackingState, coPackingProcesses, currentUser, saveState, markSaved } = useProject();

  const [open,       setOpen]       = useState(false);
  const [quoteName,  setQuoteName]  = useState("");
  const [saving,     setSaving]     = useState(false);
  const [toast,      setToast]      = useState<ToastState>(null);

  // Existing quotes list (fetched on open)
  const [existing,    setExisting]    = useState<QuoteListItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [updateFilter, setUpdateFilter] = useState("");

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  // Fetch existing quotes when modal opens
  useEffect(() => {
    if (!open) return;
    setLoadingList(true);
    fetch(API)
      .then((r) => r.json())
      .then((data: QuoteListItem[]) => {
        setExisting(Array.isArray(data) ? data.sort((a, b) => a.quote_name.localeCompare(b.quote_name)) : []);
      })
      .catch(() => setExisting([]))
      .finally(() => setLoadingList(false));
  }, [open]);

  const currentUserName = currentUser?.name || currentUser?.email || "";
  const normalizedCoPackingProcesses = () => coPackingProcesses.map(proc => ({ ...proc, quantityStoredAs: "grams" as const }));
  const quoteData = (meta: Record<string, unknown> = {}) => JSON.stringify({ moqRows, columns, formData, customer, selectedBrand, crmAccountId, crmContactId, packagingLevels, projectType, coPackingState, coPackingProcesses: normalizedCoPackingProcesses(), createdBy: currentUserName, modifiedBy: currentUserName, savedBy: currentUserName, ...quotePageState, ...meta });

  // Duplicate name check (client-side against fetched list)
  const generatedBaseName = () => buildQuoteBaseName({ formData, customer });
  const duplicateEntry = quoteName.trim()
    ? existing.find((q) => q.quote_name.toLowerCase() === quoteName.trim().toLowerCase())
    : null;

  const handleSaveNew = async () => {
    setSaving(true);
    try {
      const baseName = generatedBaseName();
      const existingNames = existing.map((q) => q.quote_name);
      const version = nextQuoteRevisionVersion(
        baseName,
        existingNames,
        saveState.savedQuoteId && saveState.hasUnsavedChanges ? saveState.savedQuoteName : null,
      );
      const name = buildVersionedQuoteName(baseName, version);
      const familyKey = quoteFamilyKey(baseName, crmAccountId);
      const res = await fetch(API, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          quote_name: name,
          quote_data: quoteData({
            quoteVersion: version,
            quoteBaseName: baseName,
            quoteFamilyKey: familyKey,
            crmDealId: crmAccountId,
            sentToCrm: false,
          }),
        }),
      });
      if (res.status === 409) {
        const body = await res.json();
        showToast("error", body.error ?? "A quote with this name already exists");
        return;
      }
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const created: { id: string } = await res.json();
      markSaved(created.id, name);
      close();
      showToast("success", `"${name}" saved`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    setOpen(false);
    setQuoteName("");
    setUpdateFilter("");
  };

  const filteredExisting = existing.filter((q) =>
    q.quote_name.toLowerCase().includes(updateFilter.toLowerCase())
  );

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-xl text-sm font-semibold text-white ${
          toast.type === "success" ? "bg-green-600" : "bg-red-500"
        }`}>
          {toast.type === "success" ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.message}
        </div>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        title={disabledReason}
        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 disabled:opacity-40 text-white text-xs font-semibold px-4 h-7 rounded-lg transition-colors"
      >
        <Save size={12} />
        Save Quote
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

            {/* Header + tabs */}
            <div className="bg-[#e8473f] px-6 pt-5 pb-0">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 rounded-xl p-2.5">
                    <BookmarkPlus size={20} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white leading-tight">Save Quote</h2>
                    <p className="text-[0.7rem] text-white/70 mt-0.5">Save or update a quote</p>
                  </div>
                </div>
                <button type="button" onClick={close} className="text-white/60 hover:text-white transition-colors mt-0.5">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-6">

              {/* -- Save as New -- */}
              {(
                <>
                  <label className="block text-[0.65rem] font-semibold text-zinc-600 uppercase tracking-wider mb-2">
                    Quote Name
                  </label>
                  <input
                    autoFocus
                    type="text"
                    placeholder={generatedBaseName()}
                    value={quoteName || `${generatedBaseName()}_v...`}
                    onChange={(e) => setQuoteName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !duplicateEntry && handleSaveNew()}
                    readOnly
                    className={`w-full h-11 px-4 text-sm border-2 rounded-xl focus:outline-none transition-colors placeholder:text-zinc-500 ${
                      duplicateEntry ? "border-amber-400 focus:border-amber-400 bg-amber-50" : "border-gray-200 focus:border-[#e8473f]"
                    }`}
                  />

                  {/* Duplicate warning */}
                  {duplicateEntry && (
                    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-xs text-amber-800 font-medium mb-2">
                        A quote with this name already exists. Save as a new copy or update the existing one?
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveNew}
                          disabled={saving}
                          className="flex-1 h-8 text-xs font-semibold text-amber-800 border border-amber-300 bg-white hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-40"
                        >
                          Save as New Copy
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setQuoteName("");
                          }}
                          className="flex-1 h-8 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors"
                        >
                          Regenerate
                        </button>
                      </div>
                    </div>
                  )}

                  {!duplicateEntry && (
                    <div className="flex gap-3 mt-5">
                      <button
                        type="button"
                        onClick={close}
                        className="flex-1 h-11 text-sm font-medium text-zinc-700 border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveNew}
                        disabled={saving}
                        className="flex-1 h-11 text-sm font-bold text-white bg-[#e8473f] hover:bg-[#d43f37] disabled:opacity-40 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm shadow-[#e8473f]/30"
                      >
                        {saving ? "Saving..." : <><Save size={15} /> Save Quote</>}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* -- Update Existing -- */}
              {false && (
                <>
                  <label className="block text-[0.65rem] font-semibold text-zinc-600 uppercase tracking-wider mb-2">
                    Select Quote to Update
                  </label>

                  {/* Search filter */}
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search quotes..."
                    value={updateFilter}
                    onChange={(e) => setUpdateFilter(e.target.value)}
                    className="w-full h-9 px-3 text-sm border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#e8473f] transition-colors placeholder:text-zinc-500 mb-2"
                  />

                  {/* Quote list */}
                  <div className="border-2 border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    {loadingList ? (
                      <div className="flex items-center justify-center py-6 text-xs text-zinc-600">
                        <RefreshCw size={12} className="animate-spin mr-2" /> Loading...
                      </div>
                    ) : filteredExisting.length === 0 ? (
                      <p className="py-6 text-center text-xs text-zinc-600 italic">
                        {updateFilter ? "No quotes match" : "No saved quotes"}
                      </p>
                    ) : filteredExisting.map((q) => (
                      <button
                        type="button"
                        key={q.id}
                          onClick={() => undefined}
                          className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-100 last:border-0 transition-colors ${
                          false
                            ? "bg-[#e8473f]/8 text-[#e8473f] font-semibold"
                            : "text-zinc-800 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            false ? "border-[#e8473f]" : "border-gray-300"
                          }`}>
                            {false && <div className="w-1.5 h-1.5 rounded-full bg-[#e8473f]" />}
                          </div>
                          {q.quote_name}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-3 mt-4">
                    <button
                      type="button"
                      onClick={close}
                      className="flex-1 h-11 text-sm font-medium text-zinc-700 border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveNew}
                      disabled={saving}
                      className="flex-1 h-11 text-sm font-bold text-white bg-[#e8473f] hover:bg-[#d43f37] disabled:opacity-40 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm shadow-[#e8473f]/30"
                    >
                      {saving ? "Updating..." : <><Pencil size={14} /> Update Quote</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
