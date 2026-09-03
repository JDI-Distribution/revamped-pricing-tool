import { useState, useEffect } from "react";
import { Copy, Sparkles, Search, Check, AlertCircle } from "lucide-react";
import { useProject } from "@/lib/ProjectContext";
import { MoqRow, Column, ProjectFormData } from "@/lib/types";
import { CustomerInfo, BrandId } from "@/lib/generateQuotePDF";

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
}

function parseQuoteData(raw: unknown): QuoteDetail | null {
  try {
    const d = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!d?.moqRows || !d?.columns || !d?.formData) return null;
    return d as QuoteDetail;
  } catch { return null; }
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const y = d.getFullYear();
    return `${m}/${day}/${y}`;
  } catch { return iso; }
}

export interface CrmParams {
  company:     string | null;
  contactName: string | null;
  email:       string | null;
  phone:       string | null;
  salesRep:    string | null;
  crmDealId:   string | null;
  crmContactId: string | null;
  customerId:  string | null;
}

interface CrmStartModalProps {
  crmParams: CrmParams;
  onComplete: () => void;
}

const cardCls = "flex-1 bg-white rounded-lg shadow-md border-2 border-gray-100 hover:border-amber-400 transition-colors p-6 flex flex-col items-center text-center cursor-pointer";

export default function CrmStartModal({ crmParams, onComplete }: CrmStartModalProps) {
  const { setCustomer, setCrmAccountId, setCrmContactId, loadQuoteState, clearSave, setQuoteApproval } = useProject();
  const [step, setStep] = useState<"start" | "browse">("start");
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cloneLoading, setCloneLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyCrmInfo = (prev: CustomerInfo): CustomerInfo => ({
    ...prev,
    ...(crmParams.company     && { customer: crmParams.company }),
    ...(crmParams.contactName && { name: crmParams.contactName }),
    ...(crmParams.email       && { email: crmParams.email }),
    ...(crmParams.phone       && { phone: crmParams.phone }),
    ...(crmParams.salesRep    && { salesRep: crmParams.salesRep }),
    ...(crmParams.customerId  && { customerId: crmParams.customerId }),
  });

  const fetchQuotes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(BASE);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: QuoteListItem[] = await res.json();
      const sorted = data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setQuotes(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quotes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step === "browse" && quotes.length === 0) fetchQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleStartFromScratch = () => {
    clearSave();
    setQuoteApproval({
      status: "Draft",
      decidedAt: "",
      decidedBy: "",
      decidedByEmail: "",
      decidedByCrmUserId: "",
    });
    setCustomer(applyCrmInfo);
    if (crmParams.crmDealId) setCrmAccountId(crmParams.crmDealId);
    if (crmParams.crmContactId) setCrmContactId(crmParams.crmContactId);
    onComplete();
  };

  const handleCloneAndContinue = async () => {
    if (!selectedId) return;
    setCloneLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/${selectedId}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      const detail = parseQuoteData(data.quote_data);
      if (!detail) throw new Error("Quote data is missing required fields");

      const mergedCustomer = applyCrmInfo(detail.customer ?? ({} as CustomerInfo));

      loadQuoteState({
        moqRows: [],
        columns: detail.columns,
        formData: detail.formData,
        customer: mergedCustomer,
        selectedBrand: detail.selectedBrand,
      });

      if (crmParams.crmDealId) setCrmAccountId(crmParams.crmDealId);
      if (crmParams.crmContactId) setCrmContactId(crmParams.crmContactId);

      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clone quote");
    } finally {
      setCloneLoading(false);
    }
  };

  const filteredQuotes = quotes.filter(q =>
    q.quote_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-4">
      {step === "start" && (
        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-8">
          <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-zinc-950">Start Your Quote</h2>
            <p className="text-xs text-zinc-600 mt-1">How would you like to begin?</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <button type="button" className={cardCls} onClick={() => setStep("browse")}>
              <Copy size={28} className="text-amber-500 mb-3" />
              <h3 className="text-sm font-semibold text-zinc-950 mb-1">Clone Existing Quote</h3>
              <p className="text-xs text-zinc-600 mb-4">Start from a saved quote and update the customer info</p>
              <span className="mt-auto h-8 px-4 flex items-center justify-center text-xs font-semibold text-white bg-[#e8473f] hover:bg-[#d43f37] rounded-lg transition-colors">
                Browse Saved Quotes
              </span>
            </button>
            <button type="button" className={cardCls} onClick={handleStartFromScratch}>
              <Sparkles size={28} className="text-amber-500 mb-3" />
              <h3 className="text-sm font-semibold text-zinc-950 mb-1">Start from Scratch</h3>
              <p className="text-xs text-zinc-600 mb-4">Begin a fresh quote with customer info pre-filled</p>
              <span className="mt-auto h-8 px-4 flex items-center justify-center text-xs font-semibold text-white bg-[#e8473f] hover:bg-[#d43f37] rounded-lg transition-colors">
                Create New Quote
              </span>
            </button>
          </div>
        </div>
      )}

      {step === "browse" && (
        <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 flex flex-col max-h-[80vh]">
          <h2 className="text-sm font-bold text-zinc-950 mb-1">Select a Quote to Clone</h2>
          <p className="text-xs text-zinc-600 mb-3">Choose a saved quote to use as a starting point</p>

          <div className="relative mb-3">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search quotes..."
              className="h-8 w-full pl-8 pr-2 text-xs border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition rounded"
            />
          </div>

          {error && (
            <div className="flex items-center gap-1.5 text-[0.65rem] text-red-500 mb-2">
              <AlertCircle size={12} /> {error}
            </div>
          )}

          <div className="flex-1 overflow-auto border border-gray-100 rounded divide-y divide-gray-100 mb-4 min-h-30">
            {loading ? (
              <p className="py-8 text-center text-xs text-zinc-600">Loading quotes...</p>
            ) : filteredQuotes.length === 0 ? (
              <p className="py-8 text-center text-xs text-zinc-600 italic">No quotes found</p>
            ) : filteredQuotes.map((q) => (
              <button
                type="button"
                key={q.id}
                onClick={() => setSelectedId(q.id)}
                className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                  selectedId === q.id ? "bg-amber-50" : "hover:bg-gray-50"
                }`}
              >
                <span className="text-xs font-medium text-zinc-950 truncate">{q.quote_name}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-[0.6rem] text-zinc-600">{fmtDate(q.created_at)}</span>
                  {selectedId === q.id && <Check size={13} className="text-[#e8473f]" />}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep("start")}
              className="h-9 px-4 text-xs font-semibold text-zinc-600 border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleCloneAndContinue}
              disabled={!selectedId || cloneLoading}
              className="flex-1 h-9 text-xs font-semibold text-white bg-[#e8473f] hover:bg-[#d43f37] disabled:opacity-40 rounded-lg transition-colors"
            >
              {cloneLoading ? "Cloning..." : "Clone & Continue"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
