import { useState, useEffect, useRef } from "react";
import { X, Download, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { QuotePreview, CustomerInfo } from "@/lib/generateQuotePDF";

interface Props {
  previews:         QuotePreview[];
  onClose:          () => void;
  onRegenerate?:    (overrides: CustomerInfo, idx: number) => Promise<void>;
  initialCustomer?: CustomerInfo;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const inp  = "w-full h-7 px-2 text-xs text-zinc-950 bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition placeholder:text-zinc-500";
const ta   = "w-full px-2 py-1.5 text-xs text-zinc-950 bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition placeholder:text-zinc-500 resize-none";
const lbl  = "block text-[0.58rem] font-semibold text-zinc-600 uppercase tracking-wider mb-0.5";
const inpR = "w-full h-7 px-2 text-xs text-zinc-950 bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition text-right placeholder:text-zinc-500";

// ── PDF zones: yStart/yEnd in mm on A4 (297mm tall) → right-panel section ────
const PDF_H = 297;
const ZONES = [
  { y0: 10,  y1: 62,  id: "sec-contact"  },
  { y0: 62,  y1: 100, id: "sec-customer"  },
  { y0: 100, y1: 130, id: "sec-product"   },
  { y0: 130, y1: 175, id: "sec-leadtime"  },
  { y0: 175, y1: 198, id: "sec-overview"  },
  { y0: 198, y1: 297, id: "sec-pricing"   },
];

function SecHead({ id, label, active }: { id: string; label: string; active: boolean }) {
  return (
    <div id={id} className={`flex items-center gap-2 mb-2.5 scroll-mt-2 ${active ? "text-teal-700" : "text-teal-600"}`}>
      <span className="text-[0.58rem] font-bold uppercase tracking-widest whitespace-nowrap">{label}</span>
      <div className={`flex-1 h-px ${active ? "bg-teal-400" : "bg-teal-100"}`} />
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className={lbl}>{label}</label>{children}</div>;
}

// ── Pricing row state ─────────────────────────────────────────────────────────
interface PricingRow { desc: string; qty: string; ppu: string; total: string; }
type LtRow = { label: string; value: string };

export default function PdfPreviewModal({ previews, onClose, onRegenerate, initialCustomer }: Props) {
  const [index,        setIndex]        = useState(0);
  const [draft,        setDraft]        = useState<CustomerInfo | null>(null);
  const [ltRows,       setLtRows]       = useState<LtRow[]>([]);
  const [prRows,       setPrRows]       = useState<PricingRow[]>([]);
  const [regenerating, setRegenerating] = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [activeZone,   setActiveZone]   = useState<string | null>(null);
  const clickCapRef = useRef<HTMLDivElement>(null);

  const current = previews[index];
  const ltSnap  = current?.leadTimeTable;
  const prSnap  = current?.pricingTable;

  // Seed edit state whenever the current preview changes (including on first open)
  useEffect(() => {
    const customer = initialCustomer ?? { customer: "", customerId: "", name: "", phone: "", email: "", salesRep: "", productName: "", productCategory: "", projectOverview: "" };
    setDraft({ ...customer });
    setLtRows(ltSnap?.body.map(row => ({
      label: row.cells[0]?.raw ?? "",
      value: row.cells[1]?.raw ?? "",
    })) ?? [
      { label: "Estimated Lead Time (in weeks)",      value: "" },
      { label: "Estimated Start Date (week of)",      value: "" },
      { label: "Estimated Ship Ready Date (week of)", value: "" },
    ]);
    const bodyRows = prSnap?.body ?? [];
    const editableRows = bodyRows.slice(0, bodyRows.length - 1);
    setPrRows(editableRows.map(row => ({
      desc:  row.cells[0]?.raw ?? "",
      qty:   row.cells[1]?.raw ?? "",
      ppu:   row.cells[2]?.raw ?? "",
      total: row.cells[3]?.raw ?? "",
    })));
    setSaved(false);
  }, [index, previews]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    setTimeout(() => previews.forEach(p => URL.revokeObjectURL(p.blobUrl)), 60_000);
  }, [previews]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const setDraftField = (key: keyof CustomerInfo, val: string) =>
    setDraft(d => d ? { ...d, [key]: val } : d);

  const setLt = (i: number, field: keyof LtRow, val: string) =>
    setLtRows(rows => rows.map((r, ri) => ri === i ? { ...r, [field]: val } : r));

  // Parse currency/number strings like "$1,495.00" or "6,600" → number
  const parseNum = (s: string) => parseFloat(s.replace(/[$,]/g, "")) || 0;

  // Format helpers matching generateQuotePDF.ts
  const fmtMoney = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPPU = (n: number) =>
    Math.abs(n) < 1
      ? n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 })
      : fmtMoney(n);
  const fmtQty = (n: number) => Math.round(n).toLocaleString("en-US");

  const setPr = (i: number, field: keyof PricingRow, val: string) => {
    setPrRows(rows => rows.map((r, ri) => {
      if (ri !== i) return r;
      const updated = { ...r, [field]: val };
      const qty   = parseNum(updated.qty);
      const ppu   = parseNum(updated.ppu);
      const total = parseNum(updated.total);
      if (field === "qty" && ppu > 0)   return { ...updated, total: fmtMoney(qty * ppu) };
      if (field === "ppu" && qty > 0)   return { ...updated, total: fmtMoney(qty * ppu) };
      if (field === "total" && qty > 0) return { ...updated, ppu: fmtPPU(total / qty) };
      return updated;
    }));
    void fmtQty; // used below in JSX
  };

  // Grand total of all line items (sum of Total column)
  const grandTotal = prRows.reduce((s, r) => s + parseNum(r.total), 0);

  const handleApply = async () => {
    if (!draft || !onRegenerate) return;
    setRegenerating(true);
    try {
      // Append a sentinel TOTALS override row so the PDF's TOTALS row reflects edits
      const totalsOverride = [null, null, null, fmtMoney(grandTotal)];
      const payload: CustomerInfo = {
        ...draft,
        ltOverrides:       ltRows.map(r => r.value),
        lineItemOverrides: [...prRows.map(r => [r.desc, r.qty, r.ppu, r.total]), totalsOverride],
      };
      await onRegenerate(payload, index);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setRegenerating(false);
    }
  };

  const triggerDownload = (p: QuotePreview) => {
    const a = document.createElement("a");
    a.href = p.blobUrl; a.download = p.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const jumpTo = (zoneId: string) => {
    setActiveZone(zoneId);
    document.getElementById(zoneId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => {
      document.getElementById(zoneId)?.querySelector<HTMLElement>("input,textarea")?.focus();
    }, 320);
    setTimeout(() => setActiveZone(null), 1800);
  };

  // ── Top bar ───────────────────────────────────────────────────────────────────
  const topBar = (
    <div className="shrink-0 h-12 bg-white border-b border-gray-100 flex items-center px-4 gap-3 shadow-sm z-10">
      <button type="button" onClick={onClose}
        className="w-7 h-7 flex items-center justify-center rounded-full text-zinc-600 hover:bg-gray-100 transition-colors shrink-0">
        <X size={15} />
      </button>

      {/* MOQ tabs */}
      {previews.length > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
          {previews.map((p, i) => (
            <button key={p.filename} type="button" onClick={() => setIndex(i)}
              className={`shrink-0 h-7 px-3 text-[0.65rem] font-semibold rounded-full transition-colors whitespace-nowrap ${
                i === index ? "bg-[#e8473f] text-white" : "bg-gray-100 text-zinc-600 hover:bg-gray-200"
              }`}>
              MOQ {p.moqLabel} · {p.packLabel}pk
            </button>
          ))}
        </div>
      )}
      {previews.length === 1 && (
        <span className="text-xs font-semibold text-zinc-900 flex-1 min-w-0 truncate">
          Edit Quote <span className="font-normal text-zinc-600 text-[0.62rem]">— click a section strip on the PDF to jump to it</span>
        </span>
      )}

      <div className="ml-auto flex items-center gap-2 shrink-0">
        {previews.length > 1 && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setIndex(i => Math.max(0, i - 1))} disabled={index === 0}
              className="w-6 h-6 flex items-center justify-center border border-gray-200 rounded-md text-zinc-600 hover:border-[#e8473f] hover:text-[#e8473f] disabled:opacity-30 transition-colors">
              <ChevronLeft size={12} />
            </button>
            <span className="text-[0.65rem] text-zinc-600 w-10 text-center">{index + 1} / {previews.length}</span>
            <button type="button" onClick={() => setIndex(i => Math.min(previews.length - 1, i + 1))} disabled={index === previews.length - 1}
              className="w-6 h-6 flex items-center justify-center border border-gray-200 rounded-md text-zinc-600 hover:border-[#e8473f] hover:text-[#e8473f] disabled:opacity-30 transition-colors">
              <ChevronRight size={12} />
            </button>
          </div>
        )}
        {onRegenerate && (
          <button type="button" onClick={handleApply} disabled={regenerating}
            className={`flex items-center gap-1.5 h-7 px-3 text-[0.65rem] font-semibold rounded-lg transition-colors disabled:opacity-40 ${
              saved ? "bg-teal-500 text-white" : "border border-teal-500 text-teal-600 hover:bg-teal-50"
            }`}>
            {saved ? <><Check size={11} /> Applied!</> : regenerating ? "Regenerating…" : "Apply & Preview"}
          </button>
        )}
        <button type="button" onClick={() => triggerDownload(current)}
          className="flex items-center gap-1.5 h-7 px-3 text-[0.65rem] font-semibold bg-[#e8473f] hover:bg-[#d43f37] text-white rounded-lg transition-colors">
          <Download size={11} /> Download
        </button>
        {previews.length > 1 && (
          <button type="button" onClick={() => previews.forEach(p => triggerDownload(p))}
            className="flex items-center gap-1.5 h-7 px-3 text-[0.65rem] font-semibold border border-gray-200 rounded-lg text-zinc-800 hover:border-[#e8473f] hover:text-[#e8473f] transition-colors">
            All {previews.length}
          </button>
        )}
      </div>
    </div>
  );

  if (!draft) return null;

  // ── Always open in edit+preview mode ──────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm">
      {topBar}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left: edit panel (50%) ── */}
        <div className="flex-1 bg-white border-r border-gray-100 flex flex-col overflow-hidden" style={{ minWidth: 0 }}>

          <div className="px-4 py-3 border-b border-gray-100 bg-teal-600 shrink-0">
            <p className="text-xs font-bold text-white">Quote Details</p>
            <p className="text-[0.58rem] text-teal-200 mt-0.5">Click the teal strip on the PDF → jumps to section · Apply to regenerate</p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

            {/* CONTACT */}
            <div>
              <SecHead id="sec-contact" label="Contact" active={activeZone === "sec-contact"} />
              <F label="Sales Rep">
                <input className={inp} value={draft.salesRep} onChange={e => setDraftField("salesRep", e.target.value)} placeholder="Your name" />
              </F>
            </div>

            {/* CUSTOMER */}
            <div>
              <SecHead id="sec-customer" label="Customer" active={activeZone === "sec-customer"} />
              <div className="space-y-2">
                <F label="Account Name"><input className={inp} value={draft.customer} onChange={e => setDraftField("customer", e.target.value)} /></F>
                <F label="Customer ID"><input className={inp} value={draft.customerId} onChange={e => setDraftField("customerId", e.target.value)} /></F>
                <F label="Contact Name"><input className={inp} value={draft.name} onChange={e => setDraftField("name", e.target.value)} /></F>
                <F label="Phone"><input className={inp} value={draft.phone} onChange={e => setDraftField("phone", e.target.value)} /></F>
                <F label="Email"><input className={inp} value={draft.email} onChange={e => setDraftField("email", e.target.value)} /></F>
              </div>
            </div>

            {/* PRODUCT */}
            <div>
              <SecHead id="sec-product" label="Product" active={activeZone === "sec-product"} />
              <div className="space-y-2">
                <F label="Product Name"><input className={inp} value={draft.productName} onChange={e => setDraftField("productName", e.target.value)} /></F>
                <F label="Product Category"><input className={inp} value={draft.productCategory} onChange={e => setDraftField("productCategory", e.target.value)} /></F>
              </div>
            </div>

            {/* LEAD TIME TABLE */}
            <div>
              <SecHead id="sec-leadtime" label="Lead Time Table" active={activeZone === "sec-leadtime"} />
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="grid grid-cols-[1fr_auto] bg-gray-50 border-b border-gray-200 px-2 py-1">
                  <span className="text-[0.58rem] font-bold text-zinc-600 uppercase tracking-wider">Description</span>
                  <span className="text-[0.58rem] font-bold text-zinc-600 uppercase tracking-wider text-right w-24">Value</span>
                </div>
                {ltRows.map((row, i) => (
                  <div key={i} className={`grid grid-cols-[1fr_auto] gap-1.5 px-2 py-1.5 ${i % 2 === 1 ? "bg-gray-50/60" : ""} ${i < ltRows.length - 1 ? "border-b border-gray-100" : ""}`}>
                    <input className={inp} value={row.label} onChange={e => setLt(i, "label", e.target.value)} title="Row label" />
                    <input className={`${inpR} w-24`} value={row.value} onChange={e => setLt(i, "value", e.target.value)} title="Value" />
                  </div>
                ))}
              </div>
            </div>

            {/* OVERVIEW */}
            <div>
              <SecHead id="sec-overview" label="Project Overview" active={activeZone === "sec-overview"} />
              <F label="Overview text">
                <textarea className={ta} rows={4} value={draft.projectOverview}
                  onChange={e => setDraftField("projectOverview", e.target.value)}
                  placeholder="Project scope, requirements, or notes…" />
              </F>
            </div>

            {/* PRICING TABLE */}
            <div>
              <SecHead id="sec-pricing" label="Pricing Line Items" active={activeZone === "sec-pricing"} />
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Header */}
                <div className="grid gap-1 px-2 py-1 bg-gray-800" style={{ gridTemplateColumns: "1fr 72px 80px 84px" }}>
                  {["Description", "Qty", "PPU", "Total"].map(h => (
                    <span key={h} className="text-[0.55rem] font-bold text-zinc-500 uppercase tracking-wider last:text-right">{h}</span>
                  ))}
                </div>
                {prRows.map((row, i) => (
                  <div key={i} className={`grid gap-1 px-2 py-1.5 ${i % 2 === 1 ? "bg-gray-50/60" : ""} ${i < prRows.length - 1 ? "border-b border-gray-100" : ""}`}
                    style={{ gridTemplateColumns: "1fr 72px 80px 84px" }}>
                    <textarea className={`${ta} min-h-7`} rows={2} value={row.desc}
                      onChange={e => setPr(i, "desc", e.target.value)} title="Description" />
                    <input className={inpR} value={row.qty}   onChange={e => setPr(i, "qty",   e.target.value)} title="Delivered Qty" />
                    <input className={inpR} value={row.ppu}   onChange={e => setPr(i, "ppu",   e.target.value)} title="PPU" />
                    <input className={inpR} value={row.total} onChange={e => setPr(i, "total", e.target.value)} title="Total" />
                  </div>
                ))}
                {prRows.length === 0 && (
                  <p className="text-[0.6rem] text-zinc-500 italic px-3 py-2">No rows — generate a quote first.</p>
                )}
                {/* Auto-computed TOTALS row */}
                {prRows.length > 0 && (
                  <div className="grid gap-1 px-2 py-1.5 bg-gray-100 border-t-2 border-gray-300"
                    style={{ gridTemplateColumns: "1fr 72px 80px 84px" }}>
                    <span className="text-[0.65rem] font-bold text-zinc-800 self-center">TOTALS</span>
                    <span className="text-[0.65rem] font-bold text-zinc-800 text-right self-center" />
                    <span className="text-[0.65rem] font-bold text-zinc-800 text-right self-center" />
                    <span className="text-[0.65rem] font-bold text-zinc-800 text-right self-center">{fmtMoney(grandTotal)}</span>
                  </div>
                )}
              </div>
              <p className="text-[0.55rem] text-amber-500 mt-1.5">⚠ Editing Qty/PPU/Total auto-recalculates the other fields. Values are display-only overrides for the PDF.</p>
            </div>

          </div>

          {/* Footer */}
          <div className="shrink-0 px-4 py-3.5 border-t border-gray-100 bg-gray-50">
            <button type="button" onClick={handleApply} disabled={regenerating || !onRegenerate}
              className={`w-full h-9 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 ${
                saved ? "bg-teal-500 text-white" : "bg-teal-600 hover:bg-teal-700 text-white shadow-sm"
              }`}>
              {saved ? <><Check size={13} /> PDF Updated!</> : regenerating ? "Regenerating…" : "Apply & Regenerate PDF"}
            </button>
            <p className="text-[0.55rem] text-zinc-600 text-center mt-1.5">PDF on the right refreshes after applying</p>
          </div>
        </div>

        {/* ── Right: scrollable PDF + clickable zone overlay ── */}
        <div className="flex-1 bg-gray-200 overflow-auto">
          <div className="flex justify-center p-6 min-h-full">
            <div className="relative bg-white shadow-2xl" style={{ width: "min(660px,100%)", aspectRatio: "1/1.414", flexShrink: 0 }}>

              {/* PDF — fully interactive (scrollable) */}
              <iframe key={current.blobUrl} src={current.blobUrl}
                className="absolute inset-0 w-full h-full border-0" />

              {/* Section jump strips — prominent left-edge tabs */}
              <div ref={clickCapRef} className="absolute inset-0 pointer-events-none">
                {ZONES.map(z => {
                  const isActive = activeZone === z.id;
                  return (
                    <button
                      key={z.id}
                      type="button"
                      onClick={() => jumpTo(z.id)}
                      style={{
                        position: "absolute",
                        left: 0, width: 28,
                        top: `${(z.y0 / PDF_H) * 100}%`,
                        height: `${((z.y1 - z.y0) / PDF_H) * 100}%`,
                        pointerEvents: "auto",
                      }}
                      className={`flex items-center justify-center transition-all border-r-2 ${
                        isActive
                          ? "bg-teal-500 border-teal-300"
                          : "bg-teal-700/60 border-teal-500/40 hover:bg-teal-600/80"
                      }`}
                      title={`Jump to ${z.id.replace("sec-", "")}`}
                    >
                      <span style={{ writingMode: "vertical-rl", fontSize: 8, color: "white", fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}>
                        {z.id.replace("sec-", "")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
