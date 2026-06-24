import { useState, useEffect } from "react";
import { Save, X, Check, AlertCircle, BookmarkPlus, Pencil, FilePlus } from "lucide-react";
import { useProject } from "@/lib/ProjectContext";

const API = "https://jdi-pricing-tool-914416811.development.catalystserverless.com/server/quotes-api/quotes";

interface QuoteListItem {
  id: string;
  quote_name: string;
}

type ToastState = { type: "success" | "error"; message: string } | null;

export default function NavbarSaveButton() {
  const { moqRows, columns, formData, customer, selectedBrand, crmAccountId, crmContactId, saveState, markSaved, clearSave, loadQuoteState } = useProject();
  const { savedQuoteId, savedQuoteName, hasUnsavedChanges } = saveState;

  const [modalOpen,    setModalOpen]    = useState(false);
  const [renameOpen,   setRenameOpen]   = useState(false);
  const [newQuoteOpen, setNewQuoteOpen] = useState(false);
  const [quoteName,    setQuoteName]    = useState("");
  const [renameName,   setRenameName]   = useState("");
  const [saving,       setSaving]       = useState(false);
  const [toast,        setToast]        = useState<ToastState>(null);
  const [existing,     setExisting]     = useState<QuoteListItem[]>([]);
  const [loadingList,  setLoadingList]  = useState(false);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch quote list when modal opens
  useEffect(() => {
    if (!modalOpen) return;
    setLoadingList(true);
    fetch(API)
      .then(r => r.json())
      .then((data: QuoteListItem[]) =>
        setExisting(Array.isArray(data) ? data.sort((a, b) => a.quote_name.localeCompare(b.quote_name)) : [])
      )
      .catch(() => setExisting([]))
      .finally(() => setLoadingList(false));
  }, [modalOpen]);

  const quoteData = () => JSON.stringify({ moqRows, columns, formData, customer, selectedBrand, crmAccountId, crmContactId });

  // Auto-save (PUT) when quote already has an ID
  const handleAutoSave = async () => {
    if (!savedQuoteId) { setModalOpen(true); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/${savedQuoteId}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ quote_data: quoteData() }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      markSaved(savedQuoteId, savedQuoteName!);
      showToast("success", `"${savedQuoteName}" saved ✓`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // Save as new (POST)
  const handleSaveNew = async () => {
    const name = quoteName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await fetch(API, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ quote_name: name, quote_data: quoteData() }),
      });
      if (res.status === 409) {
        const body = await res.json();
        showToast("error", body.error ?? "Name already exists");
        return;
      }
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const created: { id: string } = await res.json();
      markSaved(created.id, name);
      setModalOpen(false);
      setQuoteName("");
      showToast("success", `"${name}" saved ✓`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // Rename current saved quote
  const handleRename = async () => {
    if (!savedQuoteId || !renameName.trim()) return;
    const name = renameName.trim();
    setSaving(true);
    try {
      const res = await fetch(`${API}/${savedQuoteId}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ quote_name: name }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      markSaved(savedQuoteId, name);
      setRenameOpen(false);
      showToast("success", `Renamed to "${name}" ✓`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Rename failed");
    } finally {
      setSaving(false);
    }
  };

  // New quote — clears all state
  const handleNewQuote = () => {
    if (hasUnsavedChanges) {
      setNewQuoteOpen(true);
    } else {
      doNewQuote();
    }
  };

  const doNewQuote = () => {
    loadQuoteState({
      moqRows: [],
      columns: [],
      formData: formData,
      projectType: "standard",
    });
    clearSave();
    setNewQuoteOpen(false);
    showToast("success", "New quote started");
  };

  // Determine button label and state
  const isKnown = !!savedQuoteId;

  return (
    <>
      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-60 flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-xl text-sm font-semibold text-white transition-all ${
          toast.type === "success" ? "bg-green-600" : "bg-red-500"
        }`}>
          {toast.type === "success" ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.message}
        </div>
      )}

      {/* ── New Quote confirm dialog ── */}
      {newQuoteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <p className="text-sm font-semibold text-gray-900 mb-1">Start a new quote?</p>
            <p className="text-xs text-gray-500 mb-5">Unsaved changes will be lost.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setNewQuoteOpen(false)}
                className="flex-1 h-10 text-sm font-medium text-gray-600 border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => { await handleAutoSave(); doNewQuote(); }}
                className="flex-1 h-10 text-xs font-semibold text-[#e8473f] border-2 border-[#e8473f] rounded-xl hover:bg-red-50 transition-colors"
              >
                Save first
              </button>
              <button
                type="button"
                onClick={doNewQuote}
                className="flex-1 h-10 text-sm font-bold text-white bg-[#e8473f] rounded-xl hover:bg-[#d43f37] transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rename modal ── */}
      {renameOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => e.target === e.currentTarget && setRenameOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <p className="text-sm font-semibold text-gray-900 mb-3">Rename Quote</p>
            <input
              autoFocus
              type="text"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              placeholder={savedQuoteName ?? "Quote name"}
              className="w-full h-10 px-3 text-sm border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#e8473f] mb-4"
            />
            <div className="flex gap-3">
              <button type="button" onClick={() => setRenameOpen(false)}
                className="flex-1 h-10 text-sm font-medium text-gray-600 border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleRename} disabled={saving || !renameName.trim()}
                className="flex-1 h-10 text-sm font-bold text-white bg-[#e8473f] disabled:opacity-40 rounded-xl hover:bg-[#d43f37] transition-colors">
                {saving ? "Saving…" : "Rename"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Save as New modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-[#e8473f] px-6 pt-5 pb-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 rounded-xl p-2.5">
                    <BookmarkPlus size={20} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white leading-tight">Save Quote</h2>
                    <p className="text-[0.7rem] text-white/70 mt-0.5">Name this quote to save it</p>
                  </div>
                </div>
                <button type="button" onClick={() => setModalOpen(false)} className="text-white/60 hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="px-6 py-5">
              <label className="block text-[0.65rem] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Quote Name
              </label>
              <input
                autoFocus
                type="text"
                placeholder="e.g. Bartesian 4oz Sachets Q2"
                value={quoteName}
                onChange={(e) => setQuoteName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveNew()}
                className="w-full h-11 px-4 text-sm border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#e8473f] mb-4"
              />
              <div className="flex gap-3">
                <button type="button" onClick={() => setModalOpen(false)}
                  className="flex-1 h-11 text-sm font-medium text-gray-600 border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="button" onClick={handleSaveNew} disabled={saving || !quoteName.trim()}
                  className="flex-1 h-11 text-sm font-bold text-white bg-[#e8473f] disabled:opacity-40 rounded-xl hover:bg-[#d43f37] transition-colors flex items-center justify-center gap-2">
                  {saving ? "Saving…" : <><Save size={15} /> Save</>}
                </button>
              </div>
            </div>
            {loadingList === false && existing.length > 0 && (
              <div className="px-6 pb-5 border-t border-gray-100 pt-4">
                <p className="text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider mb-2">Or update existing</p>
                <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg">
                  {existing.slice(0, 8).map(q => (
                    <button type="button" key={q.id}
                      onClick={async () => {
                        setSaving(true);
                        try {
                          const res = await fetch(`${API}/${q.id}`, {
                            method: "PUT", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ quote_data: quoteData() }),
                          });
                          if (!res.ok) throw new Error();
                          markSaved(q.id, q.quote_name);
                          setModalOpen(false);
                          showToast("success", `"${q.quote_name}" updated ✓`);
                        } catch { showToast("error", "Update failed"); }
                        finally { setSaving(false); }
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors">
                      {q.quote_name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Navbar button group ── */}
      <div className="flex items-center gap-1">
        {/* New Quote */}
        <button
          type="button"
          onClick={handleNewQuote}
          title="New quote"
          className="h-8 px-2 flex items-center gap-1 text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
        >
          <FilePlus size={13} />
          <span className="text-[0.65rem] font-medium hidden lg:inline">New</span>
        </button>

        {/* Save button */}
        {isKnown ? (
          // Known quote: show name + auto-save + rename
          <div className="flex items-center gap-0.5 h-8 border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={handleAutoSave}
              disabled={saving}
              title={hasUnsavedChanges ? "Save changes" : "Saved"}
              className="flex items-center gap-1.5 px-2.5 text-[0.65rem] font-semibold text-gray-700 hover:bg-gray-50 h-full transition-colors disabled:opacity-50 max-w-32"
            >
              <Save size={12} className={hasUnsavedChanges ? "text-[#e8473f]" : "text-gray-400"} />
              <span className="truncate">{savedQuoteName}</span>
              {hasUnsavedChanges && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#e8473f] shrink-0" />
              )}
            </button>
            <button
              type="button"
              onClick={() => { setRenameName(savedQuoteName ?? ""); setRenameOpen(true); }}
              title="Rename quote"
              className="flex items-center px-1.5 text-gray-300 hover:text-gray-600 border-l border-gray-200 h-full transition-colors"
            >
              <Pencil size={10} />
            </button>
          </div>
        ) : (
          // New quote: show Save button
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={saving}
            title="Save current quote"
            className="h-8 px-3 flex items-center gap-1.5 text-[0.65rem] font-semibold text-gray-700 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Save size={12} />
            <span>Save</span>
            {hasUnsavedChanges && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#e8473f]" />
            )}
          </button>
        )}
      </div>
    </>
  );
}
