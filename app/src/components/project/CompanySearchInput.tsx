import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Search } from "lucide-react";
import { useProject } from "@/lib/ProjectContext";

const inputCls =
  "h-7 w-full pl-2 pr-6 text-xs text-zinc-950 border border-amber-200 bg-amber-50/50 focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition placeholder:text-zinc-500";

const API_BASE = "https://jdi-pricing-tool-914416811.development.catalystserverless.com/server/quotes-api";

interface CrmAccountResult {
  accountId: string;
  accountName: string;
  customerId: string;
  contactName: string;
  phone: string;
  email: string;
  contactId: string | null;
}

export default function CompanySearchInput() {
  const { customer, setCustomer, setCrmAccountId, setCrmContactId } = useProject();
  const [results, setResults] = useState<CrmAccountResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const r = el.getBoundingClientRect();
      setDropdownRect({ top: r.bottom + window.scrollY, left: r.left + window.scrollX, width: r.width });
    };
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open]);

  const handleChange = (value: string) => {
    setCustomer(prev => ({ ...prev, customer: value }));

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/crm/search-accounts?q=${encodeURIComponent(value)}`);
        const json = await res.json();
        const data: CrmAccountResult[] = json?.data ?? [];
        setResults(data);
        setOpen(data.length > 0);
        setHighlighted(0);
      } catch {
        setResults([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 400);
  };

  const selectResult = (r: CrmAccountResult) => {
    setCustomer(prev => ({
      ...prev,
      customer: r.accountName,
      customerId: r.customerId || prev.customerId,
      name: r.contactName || prev.name,
      phone: r.phone || prev.phone,
      email: r.email || prev.email,
    }));
    setCrmAccountId(r.accountId || "");
    setCrmContactId(r.contactId || "");
    setOpen(false);
    setResults([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[highlighted];
      if (r) selectResult(r);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={customer.customer}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder="Search or type company name…"
          className={inputCls}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none">
          {loading
            ? <Loader2 size={12} className="animate-spin" />
            : <Search size={12} />}
        </div>
      </div>
      {open && results.length > 0 && dropdownRect && createPortal(
        <div
          className="fixed z-9999 bg-white border border-gray-200 rounded shadow-lg max-h-56 overflow-auto"
          style={{ top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width }}
        >
          {results.map((r, i) => (
            <button
              type="button"
              key={r.accountId || i}
              onMouseDown={(e) => { e.preventDefault(); selectResult(r); }}
              onMouseEnter={() => setHighlighted(i)}
              className={`w-full text-left px-2 py-1.5 transition-colors ${
                i === highlighted ? "bg-amber-50" : "hover:bg-gray-50"
              }`}
            >
              <p className="text-xs font-semibold text-zinc-950 truncate">{r.accountName}</p>
              {(r.contactName || r.email) && (
                <p className="text-[0.6rem] text-zinc-600 truncate">
                  {[r.contactName, r.email].filter(Boolean).join(" · ")}
                </p>
              )}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
