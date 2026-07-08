import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, RefreshCw, X, Check, AlertCircle, Pencil, Copy, ChevronDown, ChevronRight } from "lucide-react";
import Navbar from "@/components/navbar/Navbar";
import { useProject } from "@/lib/ProjectContext";
import { MoqRow, Column, ProjectFormData, PackagingLevel, ProjectType, CoPackingState, CoPackingProcess } from "@/lib/types";
import { CustomerInfo, BrandId } from "@/lib/generateQuotePDF";
import { computeDetailSections } from "@/lib/calculations";

const BASE = "https://jdi-pricing-tool-914416811.development.catalystserverless.com/server/quotes-api/quotes";

interface QuoteListItem {
  id: string;
  quote_name: string;
  created_at: string;
  modified_at: string;
}

interface QuoteDetail {
  moqRows: MoqRow[];
  columns: Column[];
  formData: ProjectFormData;
  customer?: CustomerInfo;
  selectedBrand?: BrandId;
  crmAccountId?: string;
  crmContactId?: string;
  packagingLevels?: PackagingLevel[];
  projectType?: ProjectType;
  coPackingState?: CoPackingState;
  coPackingProcesses?: CoPackingProcess[];
}

type ToastState = { type: "success" | "error"; message: string } | null;

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const y = d.getFullYear();
    return `${m}/${day}/${y}`;
  } catch { return iso; }
}

function fmtCurrency(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// Pull display fields from the stored quote_data blob
function parseQuoteData(raw: unknown): QuoteDetail | null {
  try {
    const d = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!d?.moqRows || !d?.columns || !d?.formData) return null;
    return d as QuoteDetail;
  } catch { return null; }
}

// Compute total customer revenue by running the pricing engine on saved data.
// Uses the first MOQ row's quantity as ppuDenominator (the "base" MOQ).
function estimateRevenue(detail: QuoteDetail | null | undefined): number | null {
  if (!detail?.columns || !detail?.moqRows || !detail?.formData) return null;
  try {
    const { summaryRows } = computeDetailSections(detail.columns, detail.moqRows, detail.formData);
    const total = summaryRows.reduce((s, r) => s + r.customerPrice, 0);
    return total > 0 ? total : null;
  } catch {
    return null;
  }
}

export default function SavedQuotesPage() {
  const navigate = useNavigate();
  const { loadQuoteState } = useProject();

  const [quotes,   setQuotes]   = useState<QuoteListItem[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [details,  setDetails]  = useState<Record<string, QuoteDetail>>({});
  const [fetching, setFetching] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const [loading1, setLoading1] = useState<string | null>(null);
  const [cloning,  setCloning]  = useState<string | null>(null);
  const [toast,    setToast]    = useState<ToastState>(null);
  // Inline rename
  const [renamingId,   setRenamingId]   = useState<string | null>(null);
  const [renameValue,  setRenameValue]  = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  // Filters
  const [fName,    setFName]    = useState("");
  const [fCustomer,setFCustomer]= useState("");
  const [fCompany, setFCompany] = useState("");
  const [fMinRev,  setFMinRev]  = useState("");
  const [fMaxRev,  setFMaxRev]  = useState("");

  // Per-deal-group collapse state (default expanded)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await fetch(BASE);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: QuoteListItem[] = await res.json();
      const sorted = data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setQuotes(sorted);
      // Fetch all quote details in parallel for the table columns
      fetchAllDetails(sorted);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to load quotes");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllDetails = async (list: QuoteListItem[]) => {
    const toFetch = list.filter((q) => !details[q.id]);
    if (toFetch.length === 0) return;
    setFetching((prev) => {
      const next = { ...prev };
      toFetch.forEach((q) => { next[q.id] = true; });
      return next;
    });
    await Promise.all(
      toFetch.map(async (q) => {
        try {
          const res = await fetch(`${BASE}/${q.id}`);
          if (!res.ok) return;
          const data = await res.json();
          const detail = parseQuoteData(data.quote_data);
          if (detail) {
            setDetails((prev) => ({ ...prev, [q.id]: detail }));
          }
        } catch { /* skip */ }
        setFetching((prev) => { const n = { ...prev }; delete n[q.id]; return n; });
      })
    );
  };

  useEffect(() => { fetchList(); }, []);

  const handleLoad = async (id: string, name: string) => {
    setLoading1(id);
    try {
      const res = await fetch(`${BASE}/${id}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      const state = parseQuoteData(data.quote_data);
      if (!state) throw new Error("Quote data is missing required fields");
      loadQuoteState({ moqRows: state.moqRows, columns: state.columns, formData: state.formData, customer: state.customer, selectedBrand: state.selectedBrand, packagingLevels: state.packagingLevels, projectType: state.projectType, coPackingState: state.coPackingState, coPackingProcesses: state.coPackingProcesses, crmAccountId: state.crmAccountId, crmContactId: state.crmContactId }, id, name);
      showToast("success", `Loaded "${name}"`);
      navigate("/");
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
      setDetails((prev) => { const n = { ...prev }; delete n[id]; return n; });
      showToast("success", `Deleted "${name}"`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to delete quote");
    } finally {
      setDeleting(null);
    }
  };

  const handleClone = async (id: string, name: string) => {
    setCloning(id);
    try {
      const res = await fetch(`${BASE}/${id}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      const quoteData = typeof data.quote_data === "string" ? data.quote_data : JSON.stringify(data.quote_data);

      // Find an available "(Copy)" / "(Copy N)" name
      const existingNames = new Set(quotes.map((q) => q.quote_name.toLowerCase()));
      let cloneName = `${name} (Copy)`;
      let n = 2;
      while (existingNames.has(cloneName.toLowerCase())) {
        cloneName = `${name} (Copy ${n})`;
        n++;
      }

      const createRes = await fetch(BASE, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ quote_name: cloneName, quote_data: quoteData }),
      });
      if (!createRes.ok) throw new Error(`Server error ${createRes.status}`);

      await fetchList();
      showToast("success", "Quote cloned successfully");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to clone quote");
    } finally {
      setCloning(null);
    }
  };

  const startRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const cancelRename = () => { setRenamingId(null); setRenameValue(""); };

  const handleRename = async (id: string) => {
    const name = renameValue.trim();
    if (!name) return;
    // Client-side duplicate check
    const dup = quotes.find((q) => q.id !== id && q.quote_name.toLowerCase() === name.toLowerCase());
    if (dup) { showToast("error", `A quote named "${name}" already exists`); return; }
    setRenameSaving(true);
    try {
      const res = await fetch(`${BASE}/${id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ quote_name: name }),
      });
      if (res.status === 409) {
        const body = await res.json();
        showToast("error", body.error ?? "Name already taken");
        return;
      }
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setQuotes((prev) => prev.map((q) => q.id === id ? { ...q, quote_name: name } : q));
      cancelRename();
      showToast("success", "Quote renamed");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Rename failed");
    } finally {
      setRenameSaving(false);
    }
  };

  const clearFilters = () => {
    setFName(""); setFCustomer(""); setFCompany(""); setFMinRev(""); setFMaxRev("");
  };
  const hasFilters = fName || fCustomer || fCompany || fMinRev || fMaxRev;

  // Build display rows
  const rows = quotes.map((q) => {
    const d = details[q.id];
    const company     = d?.customer?.customer ?? "";
    const contactName = d?.customer?.name ?? "";
    const product     = d?.customer?.productName ?? "";
    const revenue: number | null = d ? estimateRevenue(d) : null;
    return { q, company, contactName, product, revenue };
  });

  // Apply filters
  const filtered = rows.filter(({ q, company, contactName, revenue }) => {
    if (fName    && !q.quote_name.toLowerCase().includes(fName.toLowerCase()))      return false;
    if (fCustomer&& !contactName.toLowerCase().includes(fCustomer.toLowerCase()))   return false;
    if (fCompany && !company.toLowerCase().includes(fCompany.toLowerCase()))        return false;
    if (fMinRev && revenue !== null && revenue < parseFloat(fMinRev)) return false;
    if (fMaxRev && revenue !== null && revenue > parseFloat(fMaxRev)) return false;
    return true;
  });

  // Group filtered rows by CRM deal id (crmAccountId)
  type Row = typeof filtered[number];
  const dealGroups = new Map<string, Row[]>();
  filtered.forEach((row) => {
    const dealId = details[row.q.id]?.crmAccountId || "";
    const key = dealId || "unlinked";
    if (!dealGroups.has(key)) dealGroups.set(key, []);
    dealGroups.get(key)!.push(row);
  });

  // Order: linked deals first (by earliest date desc), unlinked last
  const linkedKeys = [...dealGroups.keys()].filter((k) => k !== "unlinked");
  const groupOrder = [...linkedKeys, ...(dealGroups.has("unlinked") ? ["unlinked"] : [])];

  const toggleGroup = (key: string) => setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  const inputCls = "h-7 px-2 text-xs border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition placeholder:text-zinc-500";

  return (
    <main className="min-h-screen flex flex-col bg-white">
      <Navbar />

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded shadow-lg text-xs font-semibold text-white ${
          toast.type === "success" ? "bg-green-600" : "bg-red-500"
        }`}>
          {toast.type === "success" ? <Check size={13} /> : <AlertCircle size={13} />}
          {toast.message}
        </div>
      )}

      <div className="flex-1 px-4 md:px-6 py-4 md:py-6">

        {/* Page header */}
        <div className="flex items-center justify-between mb-4 md:mb-5">
          <div className="flex items-center gap-3">
            <div className="w-1 h-5 rounded-full bg-[#e8473f] shrink-0" />
            <div>
              <h1 className="text-sm font-semibold text-zinc-950 tracking-tight leading-none">Saved Quotes</h1>
              <p className="text-[0.65rem] text-zinc-600 mt-0.5">
                {loading ? "Loadingâ€¦" : `${quotes.length} quote${quotes.length !== 1 ? "s" : ""} saved`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchList}
            disabled={loading}
            className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-zinc-600 text-xs font-medium px-3 min-h-11 rounded-lg transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Filter bar â€” stacks to 2-col grid on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:items-center gap-2 flex-wrap mb-4 p-3 bg-gray-50 border border-gray-100 rounded-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider whitespace-nowrap w-20 shrink-0">Quote Name</span>
            <input
              type="text" value={fName} onChange={(e) => setFName(e.target.value)}
              placeholder="Searchâ€¦" className={`${inputCls} flex-1`}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider whitespace-nowrap w-20 shrink-0">Customer</span>
            <input
              type="text" value={fCustomer} onChange={(e) => setFCustomer(e.target.value)}
              placeholder="Searchâ€¦" className={`${inputCls} flex-1`}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider whitespace-nowrap w-20 shrink-0">Company</span>
            <input
              type="text" value={fCompany} onChange={(e) => setFCompany(e.target.value)}
              placeholder="Searchâ€¦" className={`${inputCls} flex-1`}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider whitespace-nowrap w-20 shrink-0">Revenue</span>
            <input
              type="number" value={fMinRev} onChange={(e) => setFMinRev(e.target.value)}
              placeholder="Min $" className={`${inputCls} flex-1`}
            />
            <span className="text-[0.6rem] text-zinc-500">â€“</span>
            <input
              type="number" value={fMaxRev} onChange={(e) => setFMaxRev(e.target.value)}
              placeholder="Max $" className={`${inputCls} flex-1`}
            />
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 min-h-11 px-3 text-[0.65rem] font-semibold text-zinc-600 hover:text-zinc-800 border border-gray-200 bg-white hover:bg-gray-50 transition-colors sm:col-span-2 lg:col-span-1 justify-center sm:justify-start"
            >
              <X size={11} /> Clear filters
            </button>
          )}
        </div>

        {/* Loading / empty states */}
        {loading ? (
          <p className="py-16 text-center text-xs text-zinc-600">Loading quotesâ€¦</p>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-xs text-zinc-600 italic">
            {hasFilters ? "No quotes match your filters." : "No saved quotes yet."}
          </p>
        ) : (
          <div className="space-y-3">
            {groupOrder.map((key) => {
              const groupRows = dealGroups.get(key)!;
              const isUnlinked = key === "unlinked";
              const collapsed = !!collapsedGroups[key];

              // Header info from the first quote in the group
              const first = groupRows[0];
              const firstDetail = details[first.q.id];
              const accountName = firstDetail?.customer?.customer || first.company || "Unknown Account";
              const earliestDate = groupRows.reduce((min, r) => {
                const t = new Date(r.q.created_at).getTime();
                return t < min ? t : min;
              }, new Date(first.q.created_at).getTime());

              return (
                <div key={key} className="border border-gray-100 rounded-sm overflow-hidden">
                  {/* Group header */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(key)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left border-l-4 border-[#e8473f] transition-colors ${
                      isUnlinked ? "bg-gray-100" : "bg-gray-50 hover:bg-gray-100"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {collapsed ? <ChevronRight size={14} className="text-zinc-600 shrink-0" /> : <ChevronDown size={14} className="text-zinc-600 shrink-0" />}
                      {isUnlinked ? (
                        <span className="text-xs font-semibold text-zinc-600 italic truncate">Unlinked Quotes</span>
                      ) : (
                        <span className="text-xs text-zinc-800 truncate">
                          <span className="font-bold text-zinc-950">{key}</span>
                          <span className="text-zinc-500 mx-1.5">â€”</span>
                          <span className="font-medium">{accountName}</span>
                          <span className="text-zinc-500 mx-1.5">â€”</span>
                          <span className="text-zinc-600">{fmtDate(new Date(earliestDate).toISOString())}</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[0.6rem] font-semibold text-zinc-600 whitespace-nowrap shrink-0">
                      {groupRows.length} quote{groupRows.length !== 1 ? "s" : ""}
                    </span>
                  </button>

                  {/* Group body */}
                  <div className={`grid transition-all duration-200 ease-in-out ${collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
                    <div className="overflow-hidden">
                      {/* Mobile: card list */}
                      <div className="md:hidden space-y-2 p-2">
                        {groupRows.map(({ q, company, contactName, product }, i) => {
                          const isFetching = !!fetching[q.id];
                          return (
                            <div key={q.id} className={`border border-gray-100 rounded-sm p-4 ${i % 2 === 1 ? "bg-gray-50/40" : "bg-white"}`}>
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <p className="text-sm font-semibold text-zinc-950 leading-tight">{q.quote_name}</p>
                                <p className="text-[0.65rem] text-zinc-600 whitespace-nowrap shrink-0">{fmtDate(q.created_at)}</p>
                              </div>
                              {(contactName || company || product) && (
                                <div className="space-y-0.5 mb-3">
                                  {contactName && <p className="text-xs text-zinc-700">{isFetching ? "â€¦" : contactName}</p>}
                                  {company    && <p className="text-xs text-zinc-600">{isFetching ? "â€¦" : company}</p>}
                                  {product    && <p className="text-xs text-zinc-600 italic">{isFetching ? "â€¦" : product}</p>}
                                </div>
                              )}
                              <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                                <button
                                  type="button"
                                  onClick={() => handleLoad(q.id, q.quote_name)}
                                  disabled={loading1 === q.id}
                                  className="flex-1 min-h-11 text-xs font-semibold text-white bg-[#e8473f] hover:bg-[#d43f37] disabled:opacity-50 rounded-lg transition-colors"
                                >
                                  {loading1 === q.id ? "Loadingâ€¦" : "Load Quote"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleClone(q.id, q.quote_name)}
                                  disabled={cloning === q.id}
                                  className="min-h-11 w-11 flex items-center justify-center text-zinc-500 hover:text-zinc-700 disabled:opacity-40 transition-colors border border-gray-200"
                                  title="Clone this quote"
                                >
                                  {cloning === q.id ? <RefreshCw size={13} className="animate-spin" /> : <Copy size={14} />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(q.id, q.quote_name)}
                                  disabled={deleting === q.id}
                                  className="min-h-11 w-11 flex items-center justify-center text-zinc-500 hover:text-red-500 disabled:opacity-40 transition-colors border border-gray-200"
                                  title="Delete"
                                >
                                  {deleting === q.id ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={14} />}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop: table */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                              <th className="py-2 px-4 text-left text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Quote Name</th>
                              <th className="py-2 px-4 text-left text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Contact Name</th>
                              <th className="py-2 px-4 text-left text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Product</th>
                              <th className="py-2 px-4 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Revenue</th>
                              <th className="py-2 px-4 text-left text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Date Saved</th>
                              <th className="py-2 px-4 text-right text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groupRows.map(({ q, contactName, product, revenue }, i) => {
                              const isFetching = !!fetching[q.id];
                              return (
                                <tr key={q.id} className={`border-b border-gray-50 hover:bg-[#e8473f]/5 transition-colors ${i % 2 === 1 ? "bg-gray-50/40" : "bg-white"}`}>
                                  <td className="py-3 px-4 text-xs font-medium text-zinc-950">
                                    {renamingId === q.id ? (
                                      <input
                                        autoFocus
                                        type="text"
                                        value={renameValue}
                                        onChange={(e) => setRenameValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") handleRename(q.id);
                                          if (e.key === "Escape") cancelRename();
                                        }}
                                        className="w-full h-7 px-2 text-xs border border-[#e8473f] rounded focus:outline-none bg-white"
                                      />
                                    ) : q.quote_name}
                                  </td>
                                  <td className="py-3 px-4 text-xs text-zinc-700">
                                    {isFetching ? <span className="text-zinc-500">â€¦</span> : (contactName || <span className="text-zinc-500">â€”</span>)}
                                  </td>
                                  <td className="py-3 px-4 text-xs text-zinc-700">
                                    {isFetching ? <span className="text-zinc-500">â€¦</span> : (product || <span className="text-zinc-500">â€”</span>)}
                                  </td>
                                  <td className="py-3 px-4 text-xs text-right text-zinc-700">
                                    {isFetching ? <span className="text-zinc-500">â€¦</span> : revenue !== null ? fmtCurrency(revenue) : <span className="text-zinc-500">â€”</span>}
                                  </td>
                                  <td className="py-3 px-4 text-xs text-zinc-600">{fmtDate(q.created_at)}</td>
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-1.5 justify-end">
                                      {renamingId === q.id ? (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => handleRename(q.id)}
                                            disabled={renameSaving || !renameValue.trim()}
                                            className="h-7 w-7 flex items-center justify-center text-green-600 hover:text-green-700 disabled:opacity-40 transition-colors"
                                            title="Save name"
                                          >
                                            {renameSaving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={13} />}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={cancelRename}
                                            className="h-7 w-7 flex items-center justify-center text-zinc-600 hover:text-zinc-700 transition-colors"
                                            title="Cancel"
                                          >
                                            <X size={13} />
                                          </button>
                                        </>
                                      ) : (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => handleLoad(q.id, q.quote_name)}
                                            disabled={loading1 === q.id}
                                            className="h-7 px-3 text-[0.65rem] font-semibold text-white bg-[#e8473f] hover:bg-[#d43f37] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                                          >
                                            {loading1 === q.id ? "Loadingâ€¦" : "Load"}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => startRename(q.id, q.quote_name)}
                                            className="h-7 w-7 flex items-center justify-center text-zinc-500 hover:text-zinc-700 transition-colors"
                                            title="Rename"
                                          >
                                            <Pencil size={12} />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleClone(q.id, q.quote_name)}
                                            disabled={cloning === q.id}
                                            className="h-7 w-7 flex items-center justify-center text-zinc-500 hover:text-zinc-700 disabled:opacity-40 transition-colors"
                                            title="Clone this quote"
                                          >
                                            {cloning === q.id ? <RefreshCw size={11} className="animate-spin" /> : <Copy size={12} />}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleDelete(q.id, q.quote_name)}
                                            disabled={deleting === q.id}
                                            className="h-7 w-7 flex items-center justify-center text-zinc-500 hover:text-red-500 disabled:opacity-40 transition-colors"
                                            title="Delete"
                                          >
                                            {deleting === q.id ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={12} />}
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer count */}
        {!loading && quotes.length > 0 && (
          <p className="mt-3 text-[0.6rem] text-zinc-600">
            Showing {filtered.length} of {quotes.length} quote{quotes.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </main>
  );
}
