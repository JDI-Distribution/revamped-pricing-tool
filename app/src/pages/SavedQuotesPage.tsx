import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Check, ChevronDown, ChevronRight, Copy, Link2, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import Navbar from "@/components/navbar/Navbar";
import { useProject } from "@/lib/ProjectContext";
import { AdditionalFeeRow, CoPackingProcess, CoPackingState, Column, MoqRow, PackagingLevel, ProjectFormData, ProjectType } from "@/lib/types";
import { BrandId, CustomerInfo } from "@/lib/generateQuotePDF";
import { computeDetailSections } from "@/lib/calculations";

const BASE = "https://jdi-pricing-tool-914416811.development.catalystserverless.com/server/quotes-api/quotes";
const CRM_STATUS_BASE = "https://jdi-pricing-tool-914416811.development.catalystserverless.com/server/quotes-api/crm/quote-status";

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
  crmQuoteId?: string;
  crmQuoteNumber?: string;
  archivedFromCrm?: boolean;
  archivedCrmQuoteId?: string;
  archivedCrmQuoteNumber?: string;
  archivedAt?: string;
  archivedReason?: string;
  customerApprovalStatus?: string;
  packagingLevels?: PackagingLevel[];
  projectType?: ProjectType;
  coPackingState?: CoPackingState;
  coPackingProcesses?: CoPackingProcess[];
  additionalFees?: AdditionalFeeRow[];
  quoteApproval?: {
    status?: string;
    decidedBy?: string;
    decidedByEmail?: string;
  };
  moqPpuInputs?: Record<number, string>;
  whatIfPpus?: Record<number, string>;
  createdBy?: string | { name?: string; email?: string };
  modifiedBy?: string | { name?: string; email?: string };
  savedBy?: string | { name?: string; email?: string };
}

type ToastState = { type: "success" | "error"; message: string } | null;
type SortMode = "" | "date-desc" | "date-asc" | "name-asc" | "name-desc";
type HoverPreview = { text: string; x: number; y: number } | null;

type DisplayRow = {
  q: QuoteListItem;
  detail: QuoteDetail | undefined;
  company: string;
  contactName: string;
  companyName: string;
  salesRep: string;
  product: string;
  revenue: number | null;
  ppu: number | null;
  createdBy: string;
  modifiedBy: string;
  status: string;
  quoteApprovalStatus: string;
};

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${m}/${day}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

function fmtCurrency(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtCurrencyPrecise(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function parseAmount(value: unknown) {
  const n = Number(String(value ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function personName(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    const record = value as { name?: string; email?: string };
    return (record.name || record.email || "").trim();
  }
  return "";
}

function parseQuoteData(raw: unknown): QuoteDetail | null {
  try {
    const d = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!d?.moqRows || !d?.columns || !d?.formData) return null;
    return d as QuoteDetail;
  } catch {
    return null;
  }
}

function estimateRevenue(detail: QuoteDetail | null | undefined): number | null {
  if (!detail?.columns || !detail?.moqRows || !detail?.formData) return null;
  try {
    const { summaryRows } = computeDetailSections(detail.columns, detail.moqRows, detail.formData);
    const total = summaryRows.reduce((s, row) => s + row.customerPrice, 0);
    return total > 0 ? total : null;
  } catch {
    return null;
  }
}

function ppuDenominator(detail: QuoteDetail | null | undefined) {
  if (!detail) return 0;
  const firstMoq = detail.moqRows?.[0];
  return parseAmount(detail.formData?.ppuDenominator)
    || parseAmount(firstMoq?.individualUnits)
    || parseAmount(firstMoq?.moq);
}

function estimateAdjustedMetrics(detail: QuoteDetail | null | undefined, syncedRevenue: number | null | undefined) {
  const denominator = ppuDenominator(detail);
  const firstMoqId = detail?.moqRows?.[0]?.id ?? 0;
  const explicitPpu = parseAmount(detail?.whatIfPpus?.[firstMoqId] ?? detail?.whatIfPpus?.[0] ?? detail?.moqPpuInputs?.[firstMoqId] ?? detail?.moqPpuInputs?.[0]);
  const baseRevenue = syncedRevenue ?? estimateRevenue(detail);
  const revenue = explicitPpu > 0 && denominator > 0 ? explicitPpu * denominator : baseRevenue;
  const ppu = denominator > 0 && revenue !== null && revenue !== undefined ? revenue / denominator : explicitPpu > 0 ? explicitPpu : null;
  return { revenue: revenue ?? null, ppu };
}

function statusClasses(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("archived")) return "border-slate-300 bg-slate-100 text-slate-700";
  if (normalized.includes("approved")) return "border-green-200 bg-green-50 text-green-700";
  if (normalized.includes("rejected")) return "border-red-200 bg-red-50 text-red-700";
  if (normalized.includes("expired")) return "border-zinc-300 bg-zinc-100 text-zinc-700";
  if (normalized.includes("review")) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export default function SavedQuotesPage() {
  const navigate = useNavigate();
  const { loadQuoteState } = useProject();

  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [details, setDetails] = useState<Record<string, QuoteDetail>>({});
  const [crmRevenue, setCrmRevenue] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState<Record<string, boolean>>({});
  const [loadingQuote, setLoadingQuote] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [cloning, setCloning] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastState>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [collapsedCompanies, setCollapsedCompanies] = useState<Record<string, boolean>>({});
  const [hoverPreview, setHoverPreview] = useState<HoverPreview>(null);

  const [companyFilter, setCompanyFilter] = useState("");
  const [salesRepFilter, setSalesRepFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("date-desc");

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 3500);
  };

  const showQuoteNamePreview = (text: string, e: MouseEvent<HTMLElement>) => {
    setHoverPreview({ text, x: e.clientX, y: e.clientY });
  };

  const copyShareLink = async (id: string) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}#/?savedQuoteId=${encodeURIComponent(id)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("success", "Saved quote link copied");
    } catch {
      showToast("error", shareUrl);
    }
  };

  const syncCrmStatus = async (quote: QuoteListItem, detail: QuoteDetail) => {
    if (!detail.crmQuoteId || detail.archivedFromCrm) return;
    try {
      const res = await fetch(`${CRM_STATUS_BASE}?quoteId=${encodeURIComponent(detail.crmQuoteId)}`);
      if (res.status === 404) {
        const archived = {
          ...detail,
          archivedFromCrm: true,
          archivedCrmQuoteId: detail.crmQuoteId,
          archivedCrmQuoteNumber: detail.crmQuoteNumber,
          archivedAt: new Date().toISOString(),
          archivedReason: "CRM quote no longer exists",
          customerApprovalStatus: "Archived",
          crmQuoteId: "",
          crmQuoteNumber: detail.crmQuoteNumber ? `${detail.crmQuoteNumber} (archived)` : "",
        };
        setDetails((prev) => ({ ...prev, [quote.id]: archived }));
        await fetch(`${BASE}/${quote.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quote_data: JSON.stringify(archived) }),
        });
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      const nextStatus = String(data.customerApprovalStatus || "").trim();
      const nextRevenue = typeof data.revenue === "number" ? data.revenue : null;
      if (nextRevenue !== null) setCrmRevenue((prev) => ({ ...prev, [quote.id]: nextRevenue }));
      if (!nextStatus || nextStatus === detail.customerApprovalStatus) return;

      const synced = { ...detail, customerApprovalStatus: nextStatus };
      setDetails((prev) => ({ ...prev, [quote.id]: synced }));
      await fetch(`${BASE}/${quote.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_data: JSON.stringify(synced) }),
      });
    } catch {
      // CRM status is helpful metadata; don't block the saved quotes page if CRM is unavailable.
    }
  };

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await fetch(BASE);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: QuoteListItem[] = await res.json();
      const sorted = data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setQuotes(sorted);
      setSelected(new Set());
      await fetchAllDetails(sorted);
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

    await Promise.all(toFetch.map(async (q) => {
      try {
        const res = await fetch(`${BASE}/${q.id}`);
        if (!res.ok) return;
        const data = await res.json();
        const detail = parseQuoteData(data.quote_data);
        if (detail) {
          setDetails((prev) => ({ ...prev, [q.id]: detail }));
          void syncCrmStatus(q, detail);
        }
      } catch {
        // keep rendering the rest of the table
      } finally {
        setFetching((prev) => {
          const next = { ...prev };
          delete next[q.id];
          return next;
        });
      }
    }));
  };

  useEffect(() => { void fetchList(); }, []);

  const rows = useMemo<DisplayRow[]>(() => quotes.map((q) => {
    const detail = details[q.id];
    const metrics = estimateAdjustedMetrics(detail, crmRevenue[q.id]);
    const createdBy = personName(detail?.createdBy) || personName(detail?.savedBy);
    const modifiedBy = personName(detail?.modifiedBy) || personName(detail?.savedBy) || createdBy;
    return {
      q,
      detail,
      company: detail?.customer?.customer || "Unassigned",
      contactName: detail?.customer?.name || "",
      companyName: detail?.customer?.customer || "",
      salesRep: detail?.customer?.salesRep || "",
      product: detail?.customer?.productName || "",
      revenue: metrics.revenue,
      ppu: metrics.ppu,
      createdBy,
      modifiedBy,
      status: detail?.archivedFromCrm ? "Archived" : detail?.customerApprovalStatus || "In review",
      quoteApprovalStatus: detail?.quoteApproval?.status || "Draft",
    };
  }), [quotes, details, crmRevenue]);

  const companyOptions = useMemo(() => uniqueValues(rows.map((row) => row.company)), [rows]);
  const salesRepOptions = useMemo(() => uniqueValues(rows.map((row) => row.salesRep)), [rows]);
  const stageOptions = useMemo(() => uniqueValues(rows.map((row) => row.status)), [rows]);

  const filtered = useMemo(() => rows.filter((row) => {
    if (companyFilter && row.company !== companyFilter) return false;
    if (salesRepFilter && row.salesRep !== salesRepFilter) return false;
    if (stageFilter && row.status !== stageFilter) return false;
    return true;
  }), [rows, companyFilter, salesRepFilter, stageFilter]);

  const hasFilters = !!companyFilter || !!salesRepFilter || !!stageFilter;
  const filteredRevenue = filtered.reduce((sum, row) => sum + (row.revenue ?? 0), 0);

  const sortedFiltered = useMemo(() => {
    const sorted = [...filtered];
    if (!sortMode) return sorted;
    sorted.sort((a, b) => {
      if (sortMode === "name-asc") return a.q.quote_name.localeCompare(b.q.quote_name);
      if (sortMode === "name-desc") return b.q.quote_name.localeCompare(a.q.quote_name);
      const aTime = new Date(a.q.created_at || 0).getTime();
      const bTime = new Date(b.q.created_at || 0).getTime();
      return sortMode === "date-asc" ? aTime - bTime : bTime - aTime;
    });
    return sorted;
  }, [filtered, sortMode]);

  const grouped = useMemo(() => {
    if (sortMode) return [["__sorted__", sortedFiltered] as [string, DisplayRow[]]];
    const map = new Map<string, DisplayRow[]>();
    sortedFiltered.forEach((row) => {
      if (!map.has(row.company)) map.set(row.company, []);
      map.get(row.company)!.push(row);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [sortedFiltered, sortMode]);

  const clearFilters = () => {
    setCompanyFilter("");
    setSalesRepFilter("");
    setStageFilter("");
  };

  const handleLoad = async (id: string, name: string) => {
    setLoadingQuote(id);
    try {
      const res = await fetch(`${BASE}/${id}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      const state = parseQuoteData(data.quote_data);
      if (!state) throw new Error("Quote data is missing required fields");
      const restoreState = {
        moqRows: state.moqRows,
        columns: state.columns,
        formData: state.formData,
        customer: state.customer,
        selectedBrand: state.selectedBrand,
        packagingLevels: state.packagingLevels,
        projectType: state.projectType,
        coPackingState: state.coPackingState,
        coPackingProcesses: state.coPackingProcesses,
        additionalFees: state.additionalFees,
        crmAccountId: state.crmAccountId,
        crmContactId: state.crmContactId,
        crmQuoteId: state.crmQuoteId,
        crmQuoteNumber: state.crmQuoteNumber,
        quoteApproval: (state as any).quoteApproval,
        moqMargins: (state as any).moqMargins,
        moqPpuInputs: (state as any).moqPpuInputs,
        moqLastEdited: (state as any).moqLastEdited,
        whatIfPpus: (state as any).whatIfPpus,
        costPpuOverrides: (state as any).costPpuOverrides,
      };
      loadQuoteState(restoreState as any, id, name);
      showToast("success", `Loaded "${name}"`);
      navigate("/");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to load quote");
    } finally {
      setLoadingQuote(null);
    }
  };

  const deleteQuotes = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} quote${ids.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await Promise.all(ids.map(async (id) => {
        const res = await fetch(`${BASE}/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`Server error ${res.status}`);
      }));
      setQuotes((prev) => prev.filter((q) => !ids.includes(q.id)));
      setDetails((prev) => {
        const next = { ...prev };
        ids.forEach((id) => delete next[id]);
        return next;
      });
      setSelected(new Set());
      showToast("success", `Deleted ${ids.length} quote${ids.length !== 1 ? "s" : ""}`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to delete quotes");
    } finally {
      setDeleting(false);
    }
  };

  const handleClone = async (id: string, name: string) => {
    setCloning(id);
    try {
      const res = await fetch(`${BASE}/${id}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      const quoteData = typeof data.quote_data === "string" ? data.quote_data : JSON.stringify(data.quote_data);
      const existingNames = new Set(quotes.map((q) => q.quote_name.toLowerCase()));
      let cloneName = `${name} (Copy)`;
      let n = 2;
      while (existingNames.has(cloneName.toLowerCase())) {
        cloneName = `${name} (Copy ${n})`;
        n += 1;
      }
      const createRes = await fetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_name: cloneName, quote_data: quoteData }),
      });
      if (!createRes.ok) throw new Error(`Server error ${createRes.status}`);
      await fetchList();
      showToast("success", "Quote cloned");
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

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  const handleRename = async (id: string) => {
    const name = renameValue.trim();
    if (!name) return;
    const duplicate = quotes.find((q) => q.id !== id && q.quote_name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      showToast("error", `A quote named "${name}" already exists`);
      return;
    }
    setRenameSaving(true);
    try {
      const res = await fetch(`${BASE}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_name: name }),
      });
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

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const visibleIds = filtered.map((row) => row.q.id);
  const selectedVisibleCount = visibleIds.filter((id) => selected.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleCompanySelected = (companyRows: DisplayRow[]) => {
    const ids = companyRows.map((row) => row.q.id);
    const allCompanySelected = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allCompanySelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleCompanyCollapsed = (company: string) => {
    setCollapsedCompanies((prev) => ({ ...prev, [company]: !prev[company] }));
  };

  const visibleCompanies = grouped.map(([company]) => company);
  const collapseVisibleCompanies = () => {
    setCollapsedCompanies((prev) => ({
      ...prev,
      ...Object.fromEntries(visibleCompanies.map((company) => [company, true])),
    }));
  };
  const expandVisibleCompanies = () => {
    setCollapsedCompanies((prev) => ({
      ...prev,
      ...Object.fromEntries(visibleCompanies.map((company) => [company, false])),
    }));
  };

  const selectCls = "h-9 min-w-48 rounded border border-gray-200 bg-white px-2 text-xs text-zinc-800 focus:border-[#e8473f] focus:outline-none focus:ring-1 focus:ring-[#e8473f]";

  return (
    <main className="min-h-screen flex flex-col bg-white">
      <Navbar />

      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded px-4 py-3 text-xs font-semibold text-white shadow-lg ${toast.type === "success" ? "bg-green-600" : "bg-red-500"}`}>
          {toast.type === "success" ? <Check size={13} /> : <AlertCircle size={13} />}
          {toast.message}
        </div>
      )}

      <div className="flex-1 px-4 py-5 md:px-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-5 w-1 rounded-full bg-[#e8473f]" />
            <div>
              <h1 className="text-sm font-semibold text-zinc-950">Saved Quotes</h1>
              <p className="mt-0.5 text-[0.65rem] text-zinc-600">
                {loading ? "Loading..." : `${quotes.length} quote${quotes.length !== 1 ? "s" : ""} saved`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchList}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-gray-50 disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        <div className="mb-4 flex flex-col gap-3 rounded border border-gray-100 bg-gray-50 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-600">Company Name</span>
              <select className={selectCls} value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
                <option value="">All companies</option>
                {companyOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-600">Sales Rep</span>
              <select className={selectCls} value={salesRepFilter} onChange={(e) => setSalesRepFilter(e.target.value)}>
                <option value="">All reps</option>
                {salesRepOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-600">Customer Stage</span>
              <select className={selectCls} value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
                <option value="">All stages</option>
                {stageOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-600">Sort</span>
              <select className={selectCls} value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
                <option value="">Company grouped</option>
                <option value="date-desc">Date: newest first</option>
                <option value="date-asc">Date: oldest first</option>
                <option value="name-asc">Name: A to Z</option>
                <option value="name-desc">Name: Z to A</option>
              </select>
            </label>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-9 items-center gap-1 rounded border border-gray-200 bg-white px-3 text-[0.65rem] font-semibold text-zinc-600 transition hover:bg-gray-50"
              >
                <X size={11} /> Clear
              </button>
            )}
          </div>

          {hasFilters && (
            <div className="grid grid-cols-2 gap-2 rounded border border-blue-100 bg-blue-50 px-4 py-2 text-right">
              <div>
                <div className="text-[0.58rem] font-semibold uppercase tracking-wider text-blue-700">Total Revenue</div>
                <div className="text-sm font-bold text-zinc-950">{fmtCurrency(filteredRevenue)}</div>
              </div>
              <div>
                <div className="text-[0.58rem] font-semibold uppercase tracking-wider text-blue-700">Total Quotes</div>
                <div className="text-sm font-bold text-zinc-950">{filtered.length}</div>
              </div>
            </div>
          )}
        </div>

        {filtered.length > 0 && (
          <div className="mb-3 flex flex-col gap-2 rounded border border-gray-100 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[0.65rem] text-zinc-500">
                {sortMode ? "Sorted view lists all visible quotes together." : "Use each company header to select only that company."}
              </span>
              {!sortMode && <div className="inline-flex overflow-hidden rounded border border-gray-200 bg-white">
                <button
                  type="button"
                  onClick={expandVisibleCompanies}
                  className="h-8 px-3 text-[0.65rem] font-semibold text-zinc-600 hover:bg-gray-50"
                >
                  Expand All
                </button>
                <button
                  type="button"
                  onClick={collapseVisibleCompanies}
                  className="h-8 border-l border-gray-200 px-3 text-[0.65rem] font-semibold text-zinc-600 hover:bg-gray-50"
                >
                  Collapse All
                </button>
              </div>}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <label className="inline-flex h-8 items-center gap-2 rounded border border-gray-200 bg-white px-2.5 text-[0.65rem] font-semibold text-zinc-700">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(el) => { if (el) el.indeterminate = selectedVisibleCount > 0 && !allVisibleSelected; }}
                  onChange={toggleAllVisible}
                  className="h-3.5 w-3.5 accent-[#e8473f]"
                />
                Select all visible
              </label>
              <span className={`text-xs font-semibold ${selected.size > 0 ? "text-red-700" : "text-zinc-500"}`}>
                {selected.size} selected
              </span>
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={() => deleteQuotes([...selected])}
                  disabled={deleting}
                  className="inline-flex h-8 items-center gap-1 rounded bg-red-500 px-3 text-xs font-semibold text-white transition hover:bg-red-600 disabled:opacity-40"
                >
                  {deleting ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  Delete Selected
                </button>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <p className="py-16 text-center text-xs text-zinc-600">Loading quotes...</p>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-xs italic text-zinc-600">{hasFilters ? "No quotes match your filters." : "No saved quotes yet."}</p>
        ) : (
          <div className="space-y-4">
            {grouped.map(([company, groupRows]) => {
              const sortedView = !!sortMode;
              const collapsed = sortedView ? false : !!collapsedCompanies[company];
              const companyIds = groupRows.map((row) => row.q.id);
              const selectedCompanyCount = companyIds.filter((id) => selected.has(id)).length;
              const allCompanySelected = companyIds.length > 0 && selectedCompanyCount === companyIds.length;
              return (
              <section key={company} className="overflow-hidden rounded border border-gray-100">
                {!sortedView && <div className="border-l-4 border-[#e8473f] bg-gray-50 px-4 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => toggleCompanyCollapsed(company)}
                      className="flex min-w-0 items-center gap-2 text-left"
                      aria-expanded={!collapsed}
                    >
                      {collapsed ? <ChevronRight size={14} className="shrink-0 text-zinc-500" /> : <ChevronDown size={14} className="shrink-0 text-zinc-500" />}
                      <span className="truncate text-xs font-bold text-zinc-950">{company}</span>
                      <span className="shrink-0 text-[0.65rem] font-semibold text-zinc-500">
                        {groupRows.length} quote{groupRows.length !== 1 ? "s" : ""}
                      </span>
                    </button>
                    <label className="inline-flex shrink-0 items-center gap-2 rounded border border-gray-200 bg-white px-2.5 py-1.5 text-[0.65rem] font-semibold text-zinc-700">
                      <input
                        type="checkbox"
                        checked={allCompanySelected}
                        ref={(el) => { if (el) el.indeterminate = selectedCompanyCount > 0 && !allCompanySelected; }}
                        onChange={() => toggleCompanySelected(groupRows)}
                        className="h-3.5 w-3.5 accent-[#e8473f]"
                      />
                      Select company
                    </label>
                  </div>
                </div>}
                {!collapsed && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1780px] table-fixed border-collapse">
                    <colgroup>
                      <col className="w-[19rem]" />
                      <col className="w-[11rem]" />
                      <col className="w-[12rem]" />
                      <col className="w-[10rem]" />
                      <col className="w-[13rem]" />
                      <col className="w-[9rem]" />
                      <col className="w-[8rem]" />
                      <col className="w-[9rem]" />
                      <col className="w-[10rem]" />
                      <col className="w-[10rem]" />
                      <col className="w-[13rem]" />
                      <col className="w-[12rem]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-gray-200 bg-white">
                        <th className="px-4 py-2 text-left text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-600">
                          <div className="flex items-center gap-2">
                            Quote Name
                          </div>
                        </th>
                        <th className="px-4 py-2 text-left text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-600">Contact Name</th>
                        <th className="px-4 py-2 text-left text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-600">Company Name</th>
                        <th className="px-4 py-2 text-left text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-600">Sales Rep</th>
                        <th className="px-4 py-2 text-left text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-600">Product</th>
                        <th className="px-4 py-2 text-right text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-600">Revenue (adj.)</th>
                        <th className="px-4 py-2 text-right text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-600">PPU (adj.)</th>
                        <th className="px-4 py-2 text-left text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-600">Date Created</th>
                        <th className="px-4 py-2 text-left text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-600">Created By</th>
                        <th className="px-4 py-2 text-left text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-600">Modified By</th>
                        <th className="px-4 py-2 text-left text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-600">Customer Approval Status</th>
                        <th className="px-4 py-2 text-left text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-600">Quote Approval Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupRows.map((row, index) => {
                        const isFetching = !!fetching[row.q.id];
                        const isSelected = selected.has(row.q.id);
                        return (
                          <tr key={row.q.id} className={`border-b border-gray-50 transition hover:bg-[#e8473f]/5 ${index % 2 ? "bg-gray-50/40" : "bg-white"}`}>
                            <td className="px-4 py-3 text-xs text-zinc-950">
                              <div className="flex items-center gap-2">
                                <input type="checkbox" checked={isSelected} onChange={() => toggleSelected(row.q.id)} className="h-3.5 w-3.5 shrink-0 accent-[#e8473f]" />
                                {renamingId === row.q.id ? (
                                  <input
                                    autoFocus
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") void handleRename(row.q.id);
                                      if (e.key === "Escape") cancelRename();
                                    }}
                                    className="h-8 min-w-0 flex-1 rounded border border-[#e8473f] bg-white px-2 text-xs outline-none"
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleLoad(row.q.id, row.q.quote_name)}
                                    onMouseEnter={(e) => showQuoteNamePreview(row.q.quote_name, e)}
                                    onMouseMove={(e) => showQuoteNamePreview(row.q.quote_name, e)}
                                    onMouseLeave={() => setHoverPreview(null)}
                                    onFocus={() => setHoverPreview(null)}
                                    disabled={loadingQuote === row.q.id}
                                    className="min-w-0 flex-1 truncate text-left font-semibold hover:text-[#e8473f] disabled:opacity-60"
                                  >
                                    {loadingQuote === row.q.id ? "Loading..." : row.q.quote_name}
                                  </button>
                                )}
                                <div className="flex shrink-0 items-center gap-1">
                                  {renamingId === row.q.id ? (
                                    <>
                                      <button type="button" onClick={() => handleRename(row.q.id)} disabled={renameSaving} className="h-7 w-7 text-green-600 disabled:opacity-40">{renameSaving ? <RefreshCw size={12} className="animate-spin" /> : <Check size={13} />}</button>
                                      <button type="button" onClick={cancelRename} className="h-7 w-7 text-zinc-500"><X size={13} /></button>
                                    </>
                                  ) : (
                                    <>
                                      <button type="button" onClick={() => startRename(row.q.id, row.q.quote_name)} className="h-7 w-7 text-zinc-400 hover:text-zinc-700" title="Rename"><Pencil size={12} /></button>
                                      <button type="button" onClick={() => handleClone(row.q.id, row.q.quote_name)} disabled={cloning === row.q.id} className="h-7 w-7 text-zinc-400 hover:text-zinc-700 disabled:opacity-40" title="Clone">{cloning === row.q.id ? <RefreshCw size={12} className="animate-spin" /> : <Copy size={12} />}</button>
                                      <button type="button" onClick={() => copyShareLink(row.q.id)} className="h-7 w-7 text-zinc-400 hover:text-blue-600" title="Copy share link"><Link2 size={12} /></button>
                                      <button type="button" onClick={() => deleteQuotes([row.q.id])} disabled={deleting} className="h-7 w-7 text-zinc-400 hover:text-red-500 disabled:opacity-40" title="Delete"><Trash2 size={12} /></button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="truncate px-4 py-3 text-xs text-zinc-700">{isFetching ? "..." : row.contactName || "-"}</td>
                            <td className="truncate px-4 py-3 text-xs text-zinc-700">{isFetching ? "..." : row.companyName || "-"}</td>
                            <td className="truncate px-4 py-3 text-xs text-zinc-700">{isFetching ? "..." : row.salesRep || "-"}</td>
                            <td className="truncate px-4 py-3 text-xs text-zinc-700">{isFetching ? "..." : row.product || "-"}</td>
                            <td className="px-4 py-3 text-right text-xs tabular-nums text-zinc-800">{isFetching ? "..." : row.revenue !== null ? fmtCurrency(row.revenue) : "-"}</td>
                            <td className="px-4 py-3 text-right text-xs tabular-nums text-zinc-800">{isFetching ? "..." : row.ppu !== null ? fmtCurrencyPrecise(row.ppu) : "-"}</td>
                            <td className="px-4 py-3 text-xs text-zinc-600">{fmtDate(row.q.created_at)}</td>
                            <td className="truncate px-4 py-3 text-xs text-zinc-700">{isFetching ? "..." : row.createdBy || "-"}</td>
                            <td className="truncate px-4 py-3 text-xs text-zinc-700">{isFetching ? "..." : row.modifiedBy || "-"}</td>
                            <td className="px-4 py-3 text-xs">
                              <span className={`inline-flex min-w-24 justify-center rounded-full border px-2.5 py-1 text-[0.65rem] font-bold ${statusClasses(row.status)}`}>
                                {row.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              <span className={`inline-flex min-w-24 justify-center rounded-full border px-2.5 py-1 text-[0.65rem] font-bold ${statusClasses(row.quoteApprovalStatus)}`}>
                                {row.quoteApprovalStatus}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                )}
              </section>
            );})}
          </div>
        )}

        {!loading && quotes.length > 0 && (
          <p className="mt-3 text-[0.6rem] text-zinc-600">
            Showing {filtered.length} of {quotes.length} quote{quotes.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>
      {hoverPreview && (
        <div
          className="pointer-events-none fixed z-[100] max-w-sm rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 shadow-lg"
          style={{
            left: Math.min(hoverPreview.x + 14, window.innerWidth - 360),
            top: Math.min(hoverPreview.y + 14, window.innerHeight - 90),
          }}
        >
          {hoverPreview.text}
        </div>
      )}
    </main>
  );
}
