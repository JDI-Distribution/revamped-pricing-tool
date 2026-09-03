import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Search } from "lucide-react";
import { useProject } from "@/lib/ProjectContext";

const API_BASE = "https://jdi-pricing-tool-914416811.development.catalystserverless.com/server/quotes-api";

interface CrmDealResult {
  dealId: string;
  dealName: string;
  stage: string;
  closingDate: string;
  accountName: string;
  contactId: string;
  contactName: string;
  ownerName: string;
}

function fmtDate(value: string) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

function stageClasses(stage: string) {
  const normalized = stage.toLowerCase();
  if (normalized.includes("closed") && normalized.includes("won")) return "border-green-200 bg-green-50 text-green-700";
  if (normalized.includes("closed") && normalized.includes("lost")) return "border-red-200 bg-red-50 text-red-700";
  if (normalized.includes("qualif")) return "border-purple-200 bg-purple-50 text-purple-700";
  if (normalized.includes("sample")) return "border-amber-200 bg-amber-50 text-amber-700";
  if (normalized.includes("review")) return "border-blue-200 bg-blue-50 text-blue-700";
  if (normalized.includes("quote")) return "border-cyan-200 bg-cyan-50 text-cyan-700";
  if (normalized.includes("invoice")) return "border-indigo-200 bg-indigo-50 text-indigo-700";
  if (normalized.includes("final")) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

export default function DealSearchInput() {
  const { customer, crmAccountId, setCrmAccountId, setCrmContactId } = useProject();
  const [deals, setDeals] = useState<CrmDealResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedDealName, setSelectedDealName] = useState("");
  const [error, setError] = useState("");
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    const updateRect = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setDropdownRect({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    };
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open]);

  useEffect(() => {
    setSelectedDealName("");
    setDeals([]);
    setError("");
  }, [customer.customer]);

  const fetchDeals = async () => {
    if (!crmAccountId && customer.customer.trim().length < 2) {
      setError("Select or type an account first.");
      setDeals([]);
      setOpen(true);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (crmAccountId) params.set("accountId", crmAccountId);
      if (customer.customer) params.set("accountName", customer.customer);
      const res = await fetch(`${API_BASE}/crm/search-deals?${params.toString()}`);
      const json = await res.json();
      const data: CrmDealResult[] = Array.isArray(json?.data) ? json.data : [];
      setDeals(data);
      setOpen(true);
      if (data.length === 0) setError("No recent deals found for this account.");
    } catch {
      setDeals([]);
      setError("Could not load CRM deals.");
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const selectDeal = (deal: CrmDealResult) => {
    setCrmAccountId(deal.dealId);
    if (deal.contactId) setCrmContactId(deal.contactId);
    setSelectedDealName(deal.dealName);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={fetchDeals}
        className="flex h-8 w-full items-center justify-between gap-2 rounded border border-orange-300 bg-orange-100/80 px-2.5 text-left text-xs text-zinc-950 transition hover:border-[#e8473f] focus:border-[#e8473f] focus:outline-none focus:ring-1 focus:ring-[#e8473f]"
      >
        <span className={`truncate ${selectedDealName ? "font-semibold" : "text-zinc-600"}`}>
          {selectedDealName || "Search recent CRM deals"}
        </span>
        {loading ? <Loader2 size={12} className="shrink-0 animate-spin text-zinc-600" /> : <Search size={12} className="shrink-0 text-zinc-600" />}
      </button>

      {open && dropdownRect && createPortal(
        <div
          className="fixed z-9999 overflow-hidden rounded border border-gray-200 bg-white shadow-lg"
          style={{
            top: dropdownRect.top,
            left: Math.min(dropdownRect.left, Math.max(8, window.innerWidth - Math.max(560, dropdownRect.width) - 16)),
            width: Math.min(Math.max(560, dropdownRect.width), window.innerWidth - 16),
          }}
        >
          <div className="grid grid-cols-[minmax(14rem,1fr)_9.5rem_7.5rem] gap-3 border-b border-gray-100 bg-gray-50 px-3 py-2 text-[0.58rem] font-bold uppercase tracking-wider text-zinc-500">
            <span>Deal Name</span>
            <span>Stage</span>
            <span className="text-right">Close Date</span>
          </div>
          {error ? (
            <div className="px-3 py-3 text-xs text-zinc-600">{error}</div>
          ) : deals.length === 0 ? (
            <div className="px-3 py-3 text-xs text-zinc-600">{loading ? "Loading deals..." : "Click to search recent deals."}</div>
          ) : (
            <div className="max-h-72 overflow-auto">
              {deals.map((deal) => (
                <button
                  type="button"
                  key={deal.dealId}
                  onMouseDown={(e) => { e.preventDefault(); selectDeal(deal); }}
                  className="grid w-full grid-cols-[minmax(14rem,1fr)_9.5rem_7.5rem] gap-3 border-b border-gray-50 px-3 py-2 text-left transition last:border-b-0 hover:bg-amber-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-zinc-950">{deal.dealName}</span>
                    <span className="block truncate text-[0.6rem] text-zinc-500">{deal.ownerName || deal.accountName || "CRM deal"}</span>
                  </span>
                  <span className="self-center">
                    <span className={`inline-flex max-w-full rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold ${stageClasses(deal.stage)}`}>
                      <span className="truncate">{deal.stage || "-"}</span>
                    </span>
                  </span>
                  <span className="flex min-w-0 items-center justify-end gap-2 self-center whitespace-nowrap text-right text-[0.65rem] text-zinc-600">
                    <span>{fmtDate(deal.closingDate) || "-"}</span>
                    {selectedDealName === deal.dealName && <Check size={12} className="shrink-0 text-green-600" />}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
