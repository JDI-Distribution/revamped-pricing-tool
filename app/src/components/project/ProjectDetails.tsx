

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Info, Plus, Trash2, ChevronDown, ChevronUp, Database, Download, Search, X } from "lucide-react";
import { MoqRow, ProjectFormData, TestingRow, PackagingLevel } from "@/lib/types";
import { useProject } from "@/lib/ProjectContext";
import CurrencyInput, { CurrencyInputType } from "@/components/ui/CurrencyInput";
import { uid } from "@/lib/uid";
import PalletToolPopover from "@/components/project/PalletToolPopover";
import FillRateOverridePopover from "@/components/project/FillRateOverridePopover";
import ConversionCalculator, { ConversionPrefill } from "@/components/ConversionCalculator";
import { defaultPackagingLevel } from "@/components/project/PackagingLevels";
import { RequiredToggle, useSectionRequired } from "@/lib/SectionRequiredContext";
import {
  createPackagingCostItem,
  deletePackagingCostItem,
  fetchPackagingCostAudit,
  fetchPackagingCostItems,
  loadPackagingCostAudit,
  loadPackagingCostItems,
  PackagingCostAuditEntry,
  PackagingCostItem,
  savePackagingCostAudit,
  savePackagingCostItems,
  updatePackagingCostItem,
} from "@/lib/packagingCostDatabase";

// Grams per display unit — for converting when the unit dropdown changes
const GRAMS_PER: Record<string, number> = { g: 1, kg: 1000, oz: 28.3495, lbs: 453.592, "fl oz": 29.5735, mL: 1, L: 1000, lb: 453.592, mg: 0.001, "metric ton": 1000000 };
const MANUFACTURING_MOQ_UNITS = ["g", "kg", "lb", "lbs", "oz", "metric ton"] as const;

const emptyMoqRow = (): MoqRow => ({
  id: uid(),
  moq: "",
  individualUnits: "",
  unitsPerInner: "",
  innersPerMaster: "",
});

/* ── Design tokens (module-level so they never change reference) ── */
const inputBase =
  "h-9 w-full px-3 border border-amber-200 text-xs text-zinc-950 placeholder:text-zinc-500 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition";
const inputKey        = `${inputBase} rounded-md`;
const inputWithPrefix = `${inputBase} rounded-r-md flex-1`;
const inputWithSuffix = `${inputBase} rounded-l-md flex-1`;
const autoReadout =
  "border-amber-200 bg-amber-50/70 text-zinc-800";
const manualBase =
  "border-orange-300 bg-orange-100/80 placeholder:text-zinc-600";
const manualInputKey =
  `h-9 w-full px-3 border text-xs text-zinc-950 ${manualBase} focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-md`;
const manualInputWithPrefix =
  `h-9 w-full px-3 border border-l-0 text-xs text-zinc-950 ${manualBase} focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-r-md flex-1`;
const manualInputWithSuffix =
  `h-9 w-full px-3 border border-r-0 text-xs text-zinc-950 ${manualBase} focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-l-md flex-1`;
const manualPrefixBadge =
  "text-[0.6rem] font-medium text-zinc-600 border border-r-0 border-orange-300 h-9 flex items-center px-2.5 bg-orange-100/70 shrink-0 rounded-l-md select-none";
const manualSuffixBadge =
  "text-[0.6rem] font-medium text-zinc-600 border border-l-0 border-orange-300 h-9 flex items-center px-2.5 bg-orange-100/70 shrink-0 rounded-r-md select-none";
const prefixBadge =
  "text-[0.6rem] font-medium text-zinc-600 border border-r-0 border-amber-200 h-9 flex items-center px-2.5 bg-amber-50/50 shrink-0 rounded-l-md select-none";
const suffixBadge =
  "text-[0.6rem] font-medium text-zinc-600 border border-l-0 border-amber-200 h-9 flex items-center px-2.5 bg-amber-50/50 shrink-0 rounded-r-md select-none";

function SetupMarginPopover({
  anchorRef,
  ourCost,
  marginPct,
  onMarginChange,
  onClose,
}: {
  anchorRef: { current: HTMLButtonElement | null };
  ourCost: number;
  marginPct: number;
  onMarginChange: (marginPct: number) => void;
  onClose: () => void;
}) {
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const sellingPrice = marginPct < 100 ? ourCost / (1 - marginPct / 100) : 0;
  const fmtD = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + window.scrollY + 6, left: rect.left + window.scrollX });
    }
  }, [anchorRef]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [anchorRef, onClose]);

  return createPortal(
    <div ref={popRef}
      style={{ position: "absolute", top: pos.top, left: pos.left, zIndex: 9999, width: 300 }}
      className="bg-white border border-gray-200 rounded-xl shadow-xl shadow-gray-200/80 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border-b border-amber-200">
        <span className="text-[0.65rem] font-bold text-amber-800 uppercase tracking-wider">Setup + QA Margin</span>
        <button type="button" onClick={onClose} className="text-zinc-600 hover:text-zinc-800 text-lg leading-none">×</button>
      </div>
      <div className="px-3 py-2 space-y-2 text-[0.65rem]">
        <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
          <span className="text-zinc-500">Our original cost</span>
          <span className="font-semibold text-zinc-900 tabular-nums">{ourCost > 0 ? fmtD(ourCost) : "—"}</span>
          <span className="text-zinc-500">Selling price</span>
          <span className="font-bold text-[#e8473f] tabular-nums">{sellingPrice > 0 ? fmtD(sellingPrice) : "—"}</span>
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <span className="text-zinc-600 shrink-0">Margin</span>
          <div className="flex items-center flex-1 min-w-0">
            <CurrencyInput
              type="rate"
              value={marginPct}
              min={0}
              max={95}
              onChange={onMarginChange}
              className="h-7 flex-1 min-w-0 px-2 border border-amber-200 border-r-0 text-[0.7rem] text-zinc-950 bg-amber-50/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/40 focus:border-[#e8473f] transition rounded-l"
            />
            <span className="h-7 flex items-center px-1.5 border border-amber-200 border-l-0 text-[0.58rem] text-zinc-600 bg-amber-50/60 rounded-r select-none shrink-0">%</span>
          </div>
        </div>
        <p className="text-[0.56rem] leading-snug text-zinc-500">
          Formula: our cost ÷ (1 - margin). Changing margin updates the Setup + QA Fee.
        </p>
      </div>
    </div>,
    document.body
  );
}



function SectionHeader({ title, open, onToggle, action, sectionId }: { title: string; open: boolean; onToggle: () => void; action?: React.ReactNode; sectionId?: string }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={onToggle} className="flex items-center gap-1.5 group min-w-0">
        <span className="text-sm font-bold text-zinc-950 group-hover:text-[#e8473f] transition-colors">{title}</span>
        {open
          ? <ChevronUp size={13} className="text-zinc-500 group-hover:text-[#e8473f] transition-colors shrink-0" />
          : <ChevronDown size={13} className="text-zinc-500 group-hover:text-[#e8473f] transition-colors shrink-0" />}
      </button>
      {action && <div className="shrink-0">{action}</div>}
      {sectionId && <div className="ml-auto shrink-0"><RequiredToggle sectionId={sectionId} /></div>}
    </div>
  );
}

/* ── SymInput lifted outside component so its identity is stable ── */
interface SymInputProps {
  field: Exclude<keyof ProjectFormData, "testingRows">;
  type: "text" | "number";
  sym: string;
  formData: ProjectFormData;
  setFormField: (field: keyof ProjectFormData, value: string) => void;
  fullWidth?: boolean;
  tone?: "auto" | "manual";
}
function SymInput({ field, type, sym, formData, setFormField, fullWidth, tone = "auto" }: SymInputProps) {
  const isPrefix = sym === "$";
  const rawVal   = formData[field] ?? "";
  const plainCls = tone === "manual" ? manualInputKey : inputKey;
  const prefixCls = tone === "manual" ? manualInputWithPrefix : inputWithPrefix;
  const suffixCls = tone === "manual" ? manualInputWithSuffix : inputWithSuffix;
  const leftBadge = tone === "manual" ? manualPrefixBadge : prefixBadge;
  const rightBadge = tone === "manual" ? manualSuffixBadge : suffixBadge;

  if (type === "number") {
    // Use CurrencyInput for all numeric fields
    const numVal: number = parseFloat(rawVal as string) || 0;
    const ciType: CurrencyInputType = sym === "$" ? "dollar" : sym === "%" ? "percent" : "integer";
    return (
      <div className={`flex items-center ${fullWidth ? "w-full" : "w-full sm:w-44 shrink-0"}`}>
      {sym && isPrefix && <span className={leftBadge}>{sym}</span>}
        <CurrencyInput
          type={ciType}
          value={numVal}
          onChange={(v) => setFormField(field, String(v))}
          className={!sym ? plainCls : isPrefix ? prefixCls : suffixCls}
        />
        {sym && !isPrefix && <span className={rightBadge}>{sym}</span>}
      </div>
    );
  }

  return (
    <div className={`flex items-center ${fullWidth ? "w-full" : "w-full sm:w-44 shrink-0"}`}>
      {sym && isPrefix  && <span className={prefixBadge}>{sym}</span>}
      <input
        type="text"
        value={rawVal}
        onChange={(e) => setFormField(field, e.target.value)}
        className={!sym ? plainCls : isPrefix ? prefixCls : suffixCls}
      />
      {sym && !isPrefix && <span className={rightBadge}>{sym}</span>}
    </div>
  );
}

function PackagingCostDatabaseModal({
  items,
  setItems,
  audit,
  setAudit,
  onClose,
}: {
  items: PackagingCostItem[];
  setItems: React.Dispatch<React.SetStateAction<PackagingCostItem[]>>;
  audit: PackagingCostAuditEntry[];
  setAudit: React.Dispatch<React.SetStateAction<PackagingCostAuditEntry[]>>;
  onClose: () => void;
}) {
  const [showAudit, setShowAudit] = useState(false);
  const syncAuditFromServer = () => {
    fetchPackagingCostAudit()
      .then(next => {
        setAudit(next);
        savePackagingCostAudit(next);
      })
      .catch(() => {});
  };
  const recordAudit = (action: string, itemName: string) => {
    const now = new Date();
    const next = [{
      id: String(uid()),
      action,
      itemName,
      at: now.toISOString(),
      user: "Current user",
      details: itemName,
    }, ...audit].slice(0, 100);
    setAudit(next);
    savePackagingCostAudit(next);
  };
  const updateItem = (id: string, patch: Partial<PackagingCostItem>) => {
    setItems(prev => {
      const next = prev.map(item => item.id === id ? { ...item, ...patch } : item);
      savePackagingCostItems(next);
      return next;
    });
  };
  const syncItem = (id: string) => {
    const item = items.find(row => row.id === id);
    if (!item) return;
    updatePackagingCostItem(item)
      .then(saved => {
        setItems(prev => {
          const next = prev.map(row => row.id === id ? saved : row);
          savePackagingCostItems(next);
          return next;
        });
        syncAuditFromServer();
      })
      .catch(() => {});
  };
  const addRow = () => {
    const item: PackagingCostItem = {
      id: String(uid()),
      category: "Packaging",
      itemName: "New item",
      description: "",
      moq: "",
      landedCostEa: 0,
      intakePackoutConfig: "",
    };
    setItems(prev => {
      const next = [item, ...prev];
      savePackagingCostItems(next);
      return next;
    });
    recordAudit("Added row", item.itemName);
    createPackagingCostItem(item)
      .then(saved => {
        setItems(prev => {
          const next = prev.map(row => row.id === item.id ? saved : row);
          savePackagingCostItems(next);
          return next;
        });
        syncAuditFromServer();
      })
      .catch(() => {});
  };
  const deleteRow = (id: string) => {
    const item = items.find(row => row.id === id);
    setItems(prev => {
      const next = prev.filter(row => row.id !== id);
      savePackagingCostItems(next);
      return next;
    });
    if (item) recordAudit("Deleted row", item.itemName);
    if (item) {
      deletePackagingCostItem(item)
        .then(syncAuditFromServer)
        .catch(() => {});
    }
  };
  const exportCsv = () => {
    const headers = ["Category", "Item name", "Description", "MOQ", "Landed cost/ea", "Intake packout config"];
    const esc = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [headers.map(esc).join(","), ...items.map(item => [
      item.category,
      item.itemName,
      item.description,
      item.moq,
      item.landedCostEa,
      item.intakePackoutConfig,
    ].map(esc).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "packaging_cost_database.csv";
    a.click();
    URL.revokeObjectURL(url);
    recordAudit("Exported database", `${items.length} rows`);
  };
  const sheetCell = "border border-gray-200 p-0 bg-white";
  const sheetInput = "h-7 w-full px-2 text-[0.72rem] text-zinc-900 bg-transparent border-0 rounded-none focus:outline-none focus:bg-amber-50 focus:ring-1 focus:ring-[#e8473f]/30";
  const sheetHead = "px-2 py-1.5 text-left text-[0.58rem] uppercase tracking-wider text-zinc-600 border border-gray-300 bg-[#EDEAE0]";

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-5">
      <div className="w-full max-w-6xl max-h-[86vh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="h-12 px-4 border-b border-gray-200 flex items-center gap-3 shrink-0">
          <Database size={15} className="text-blue-700" />
          <div>
            <p className="text-sm font-bold text-zinc-950">Packaging Cost Database</p>
            <p className="text-[0.6rem] text-zinc-600">{items.length} items available for packaging level selection</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={addRow} className="h-8 px-3 rounded-md border border-[#e8473f]/40 text-[#e8473f] hover:bg-red-50 text-xs font-semibold flex items-center gap-1.5">
              <Plus size={12} /> Add Row
            </button>
            <button type="button" onClick={() => setShowAudit(open => !open)} className="h-8 px-3 rounded-md border border-gray-200 text-zinc-700 hover:border-blue-300 hover:text-blue-700 text-xs font-semibold">
              Audit Log
            </button>
            <button type="button" onClick={exportCsv} className="h-8 px-3 rounded-md border border-gray-200 text-zinc-700 hover:border-blue-300 hover:text-blue-700 text-xs font-semibold flex items-center gap-1.5">
              <Download size={12} /> Export
            </button>
            <button type="button" onClick={onClose} className="h-8 w-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-zinc-500">
              <X size={15} />
            </button>
          </div>
        </div>
        <div className="overflow-auto bg-white">
          <table className="w-full min-w-[920px] border-collapse text-xs">
            <thead className="sticky top-0 z-10">
              <tr>
                {["Category", "Item name", "Description", "MOQ", "Landed cost/ea", "Intake packout config", ""].map(label => (
                  <th key={label} className={sheetHead}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="hover:bg-blue-50/30">
                  <td className={sheetCell}><input value={item.category} onChange={e => updateItem(item.id, { category: e.target.value })} onBlur={() => syncItem(item.id)} className={sheetInput} /></td>
                  <td className={sheetCell}><input value={item.itemName} onChange={e => updateItem(item.id, { itemName: e.target.value })} onBlur={() => syncItem(item.id)} className={`${sheetInput} font-semibold`} /></td>
                  <td className={sheetCell}><input value={item.description} onChange={e => updateItem(item.id, { description: e.target.value })} onBlur={() => syncItem(item.id)} className={sheetInput} /></td>
                  <td className={sheetCell}><input value={item.moq} onChange={e => updateItem(item.id, { moq: e.target.value })} onBlur={() => syncItem(item.id)} className={sheetInput} /></td>
                  <td className={sheetCell}><div onBlur={() => syncItem(item.id)}><CurrencyInput type="dollar" value={item.landedCostEa} onChange={v => updateItem(item.id, { landedCostEa: v })} className={`${sheetInput} text-right tabular-nums`} /></div></td>
                  <td className={sheetCell}><input value={item.intakePackoutConfig} onChange={e => updateItem(item.id, { intakePackoutConfig: e.target.value })} onBlur={() => syncItem(item.id)} className={sheetInput} /></td>
                  <td className="border border-gray-200 p-0 text-center bg-white w-10">
                    <button type="button" onClick={() => deleteRow(item.id)} className="h-7 w-full inline-flex items-center justify-center text-red-500 hover:bg-red-50">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {showAudit && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6 pointer-events-none">
          <div className="w-full max-w-4xl max-h-[60vh] bg-white rounded-xl border border-gray-200 shadow-2xl overflow-hidden flex flex-col pointer-events-auto">
            <div className="h-11 px-4 border-b border-gray-200 flex items-center gap-3 shrink-0">
              <p className="text-sm font-bold text-zinc-950">Audit Log</p>
              <button type="button" onClick={() => setShowAudit(false)} className="ml-auto h-8 w-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-zinc-500">
                <X size={15} />
              </button>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[760px] border-collapse text-xs">
                <thead className="sticky top-0 z-10">
                  <tr>
                    {["Timestamp", "Date", "User", "Action", "Details"].map(label => (
                      <th key={label} className={sheetHead}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {audit.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-5 text-center text-zinc-500 italic border border-gray-200">No audit events yet.</td></tr>
                  ) : audit.map(entry => {
                    const parsedDate = new Date(entry.at);
                    const validDate = !Number.isNaN(parsedDate.getTime());
                    return (
                      <tr key={entry.id}>
                        <td className="border border-gray-200 px-2 py-1.5 tabular-nums">{validDate ? parsedDate.toLocaleTimeString() : entry.at}</td>
                        <td className="border border-gray-200 px-2 py-1.5 tabular-nums">{validDate ? parsedDate.toLocaleDateString() : "-"}</td>
                        <td className="border border-gray-200 px-2 py-1.5">{entry.user || "Current user"}</td>
                        <td className="border border-gray-200 px-2 py-1.5 font-semibold">{entry.action}</td>
                        <td className="border border-gray-200 px-2 py-1.5">{entry.details || entry.itemName}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function PackagingItemPicker({
  items,
  value,
  onSelect,
}: {
  items: PackagingCostItem[];
  value: string;
  onSelect: (item: PackagingCostItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 720 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        wrapRef.current &&
        !wrapRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(760, window.innerWidth - 32);
      const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
      setMenuPos({ top: rect.bottom + 4, left, width });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);
  const q = query.trim().toLowerCase();
  const packagingItems = items.filter(item => item.category.trim().toLowerCase() === "packaging");
  const filtered = packagingItems
    .filter(item => !q || [item.itemName, item.description, item.category].some(value => value.toLowerCase().includes(q)))
    .slice(0, 60);
  const selected = packagingItems.find(item => item.itemName === value || item.id === value);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(open => !open)}
        className="h-8 w-full px-2 border border-orange-300 text-[0.65rem] text-zinc-900 bg-orange-100/80 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/30 focus:border-[#e8473f] transition rounded text-left flex items-center justify-between gap-2"
      >
        <span className="truncate">{selected?.itemName || value || "Select item..."}</span>
        <ChevronDown size={12} className="shrink-0 text-zinc-600" />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden"
          style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
        >
          <div className="p-2 border-b border-gray-100 flex items-center gap-1.5">
            <Search size={12} className="text-zinc-500" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
              placeholder="Search item, description, category..."
              className="h-7 flex-1 px-2 text-xs border border-amber-200 bg-amber-50/70 rounded focus:outline-none focus:ring-1 focus:ring-[#e8473f]/30"
            />
          </div>
          <div className="grid grid-cols-[1.2fr_0.7fr_1.4fr] gap-2 px-2 py-1.5 bg-gray-50 text-[0.55rem] font-bold uppercase tracking-wider text-zinc-600 border-b border-gray-100">
            <span>Item</span>
            <span className="text-right">Landed cost/ea</span>
            <span>Description</span>
          </div>
          <div className="max-h-[28rem] overflow-auto">
            {filtered.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => { onSelect(item); setOpen(false); setQuery(""); }}
                className="w-full grid grid-cols-[1.2fr_0.7fr_1.4fr] gap-2 px-2 py-2 text-left text-[0.65rem] hover:bg-amber-50 border-b border-gray-50"
              >
                <span className="font-semibold text-zinc-900 truncate">{item.itemName}</span>
                <span className="text-right tabular-nums text-zinc-800">${item.landedCostEa.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                <span className="text-zinc-600 truncate">{item.description || "-"}</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-4 text-xs text-zinc-500 italic">No matching items.</div>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

interface Props {
  formData: ProjectFormData;
  setFormField: (field: keyof ProjectFormData, value: string) => void;
}

export default function ProjectDetails({
  formData,
  setFormField,
}: Props) {
  const [bufferUnit, setBufferUnit] = useState<"days" | "weeks">("days");
  const [convOpen,        setConvOpen]        = useState(false);
  const [convPrefill,     setConvPrefill]     = useState<ConversionPrefill | undefined>();
  const [cpoOpen,         setCpoOpen]         = useState(true);
  const [mfgMoqOpen,      setMfgMoqOpen]      = useState(false);
  const [rawMatOpen,      setRawMatOpen]      = useState(true);
  const [invHandlingOpen, setInvHandlingOpen] = useState(true);
  const [palletCalcOpen,  setPalletCalcOpen]  = useState(false);
  const [setupMarginOpen, setSetupMarginOpen] = useState(false);
  const [setupMarginPct,  setSetupMarginPct]  = useState(60);
  const [manualPpuDenominator, setManualPpuDenominator] = useState(false);
  const [packagingDbOpen, setPackagingDbOpen] = useState(false);
  const [packagingCostItems, setPackagingCostItems] = useState<PackagingCostItem[]>(() => loadPackagingCostItems());
  const [packagingCostAudit, setPackagingCostAudit] = useState<PackagingCostAuditEntry[]>(() => loadPackagingCostAudit());
  const setupMarginBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastAutoIntakePallets = useRef<string | null>(null);
  const lastAutoMfgNetFillG = useRef<string | null>(null);
  const [testingOpen,     setTestingOpen]     = useState(true);
  const { setTestingRows, packagingLevels, setPackagingLevels } = useProject();
  const { notRequired } = useSectionRequired();

  const UNIT_OPTS = ["g", "kg", "oz", "lbs", "fl oz", "mL", "L"] as const;

  useEffect(() => {
    let active = true;
    fetchPackagingCostItems()
      .then(items => {
        if (!active || items.length === 0) return;
        setPackagingCostItems(items);
        savePackagingCostItems(items);
      })
      .catch(() => {});
    fetchPackagingCostAudit()
      .then(entries => {
        if (!active) return;
        setPackagingCostAudit(entries);
        savePackagingCostAudit(entries);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // When the unit dropdown changes, auto-convert the current value to the new unit
  const handleUnitWeightUnitChange = (newUnit: string) => {
    const currentVal  = parseFloat(formData.unitWeight) || 0;
    const currentUnit = formData.unitWeightUnit ?? "g";
    if (currentVal > 0 && currentUnit !== newUnit) {
      const grams    = currentVal * (GRAMS_PER[currentUnit] ?? 1);
      const newVal   = grams / (GRAMS_PER[newUnit] ?? 1);
      // Round to 4 sig figs for display
      const rounded  = parseFloat(newVal.toPrecision(4));
      setFormField("unitWeight", String(rounded));
    }
    setFormField("unitWeightUnit", newUnit);
  };

  const openConverter = () => {
    setConvPrefill({ value: formData.unitWeight ?? "", unit: formData.unitWeightUnit ?? "g" });
    setConvOpen(true);
  };

  const handleSetupMarginChange = (marginPct: number) => {
    setSetupMarginPct(marginPct);
    const ourCost = parseFloat(formData.setupFeeOur) || 0;
    if (ourCost > 0 && marginPct < 100) {
      const sellingPrice = ourCost / (1 - marginPct / 100);
      setFormField("setupFeeCustomer", String(Number(sellingPrice.toFixed(2))));
    }
  };

  const manufacturerQty = parseFloat(formData.manufacturingMoqQty ?? "") || 0;
  const manufacturerUom = formData.manufacturingMoqUom ?? "kg";
  const autoNetFillG = (parseFloat(formData.unitWeight) || 0) * (GRAMS_PER[formData.unitWeightUnit ?? "g"] ?? 1);
  const autoNetFillGStr = autoNetFillG > 0 ? String(Number(autoNetFillG.toFixed(4))) : "";
  const finishedNetFillG = parseFloat(formData.manufacturingMoqNetFillG ?? "") || 0;
  const reservePct = parseFloat(formData.manufacturingMoqReservePct ?? "") || 0;
  const reserveUnits = parseFloat(formData.manufacturingMoqReserveUnits ?? "") || 0;
  const roundingIncrement = Math.max(1, parseFloat(formData.manufacturingMoqRoundingIncrement ?? "") || 1);
  const roundingMode = formData.manufacturingMoqRoundingMode ?? "down";
  const totalManufacturerGrams = manufacturerQty * (GRAMS_PER[manufacturerUom] ?? 1);
  const theoreticalFinishedUnits = finishedNetFillG > 0 ? totalManufacturerGrams / finishedNetFillG : 0;
  const reserveAdjustedUnits = Math.max(0, theoreticalFinishedUnits * (1 - reservePct / 100) - reserveUnits);
  const recommendedCustomerMoq = reserveAdjustedUnits > 0
    ? roundingMode === "up"
      ? Math.ceil(reserveAdjustedUnits / roundingIncrement) * roundingIncrement
      : roundingMode === "nearest"
        ? Math.round(reserveAdjustedUnits / roundingIncrement) * roundingIncrement
        : Math.floor(reserveAdjustedUnits / roundingIncrement) * roundingIncrement
    : 0;
  const applyMfgMoqToPpu = formData.manufacturingMoqApplyToPpu === "true";
  const fmtInt = (n: number) => n > 0 ? Math.round(n).toLocaleString("en-US") : "—";
  const fmtDec = (n: number) => n > 0 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—";
  const applyManufacturingMoq = () => {
    if (recommendedCustomerMoq > 0) {
      setManualPpuDenominator(true);
      setFormField("ppuDenominator", String(Math.round(recommendedCustomerMoq)));
    }
  };

  useEffect(() => {
    if (manualPpuDenominator && applyMfgMoqToPpu && recommendedCustomerMoq > 0) {
      const next = String(Math.round(recommendedCustomerMoq));
      if (formData.ppuDenominator !== next) setFormField("ppuDenominator", next);
    }
  }, [manualPpuDenominator, applyMfgMoqToPpu, recommendedCustomerMoq, formData.ppuDenominator, setFormField]);

  useEffect(() => {
    const current = formData.manufacturingMoqNetFillG ?? "";
    const isUntouched = current === "" || current === lastAutoMfgNetFillG.current;
    if (autoNetFillGStr && isUntouched && current !== autoNetFillGStr) {
      setFormField("manufacturingMoqNetFillG" as keyof ProjectFormData, autoNetFillGStr);
    }
    if (autoNetFillGStr) lastAutoMfgNetFillG.current = autoNetFillGStr;
  }, [autoNetFillGStr]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Design tokens ─────────────────────────────────────────── */
  const card       = "bg-white border border-gray-200 rounded-xl overflow-hidden flex-1 min-w-0 max-w-4xl";
  const sectionRow = "flex gap-5 items-start px-4 md:px-6 mb-4";
  const outPanel    = "w-56 shrink-0 sticky top-14 bg-[#EFF6FF] border border-blue-200 rounded-xl overflow-hidden shadow-sm shadow-blue-100";
  const outTitle    = "px-3 py-2.5 text-[0.55rem] font-semibold text-blue-700 uppercase tracking-widest border-b border-blue-200 bg-blue-100/60";
  const outRow      = "flex items-start justify-between gap-3 px-3 py-2.5 border-b border-blue-100 last:border-0";
  const outLbl      = "text-[0.68rem] text-zinc-600 leading-tight";
  const outVal      = "text-[0.72rem] font-semibold text-zinc-900 tabular-nums text-right shrink-0 ml-2";
  const outCostSep  = "px-3 py-1.5 text-[0.52rem] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 border-b border-blue-200";
  const outCxVal    = "text-[0.72rem] font-bold text-[#e8473f] tabular-nums text-right shrink-0 ml-2";
  const outPairOurVal = "text-[0.72rem] font-semibold text-zinc-800 tabular-nums";
  const outPairCxVal  = "text-[0.72rem] font-bold text-[#e8473f] tabular-nums";
  const outputCostPair = (our: number, cx: number) => (
    <div className="grid grid-cols-2 gap-3 px-3 py-2.5 border-b border-blue-100">
      <div className="min-w-0">
        <p className={`${outLbl} mb-1`}>Our Cost</p>
        <p className={outPairOurVal}>{fv(our, fmtD)}</p>
      </div>
      <div className="min-w-0 text-right">
        <p className={`${outLbl} mb-1`}>Selling Price</p>
        <p className={outPairCxVal}>{fv(cx, fmtD)}</p>
      </div>
    </div>
  );
  const marginBadge = (our: number, cx: number) => {
    if (cx <= 0 || our <= 0) return null;
    const pct = ((cx - our) / cx) * 100;
    const cls = pct >= 50 ? "bg-green-50 border-green-200 text-green-700" : pct >= 30 ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-red-50 border-red-200 text-red-600";
    return (
      <div className="px-3 pb-2.5">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[0.65rem] font-bold tabular-nums ${cls}`}>
          <span className="text-[0.5rem] font-semibold opacity-70">MARGIN</span>
          {pct.toFixed(1)}%
        </span>
      </div>
    );
  };

  /* ── Packaging Level helpers ──────────────────────────────── */
  const addPackagingLevel = () => {
    setPackagingLevels(prev => [...prev, defaultPackagingLevel()]);
  };
  const removePackagingLevel = (id: string) => {
    setPackagingLevels(prev => prev.filter(l => l.id !== id));
  };
  const updatePackagingLevel = (id: string, patch: { units?: number; costPerUnit?: number; customLevelName?: string; unitsRefId?: string | undefined; packagingCostItemId?: string }) => {
    setPackagingLevels(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
    if (!manualPpuDenominator && id === packagingLevels[0]?.id && patch.units !== undefined && patch.units > 0) {
      setFormField("ppuDenominator", String(patch.units));
    }
  };

  // Compute required qty for each level in order.
  // Level with no UOM ref: requiredQty = its own units (it is the base count).
  // Level with UOM ref: requiredQty = ceil(referencedLevel.requiredQty / thisLevel.units).
  const packagingRequiredQtys: number[] = (() => {
    const qtys: number[] = [];
    for (let i = 0; i < packagingLevels.length; i++) {
      const lvl = packagingLevels[i];
      if (!lvl.unitsRefId) {
        qtys.push(lvl.units);
      } else {
        const refIdx = packagingLevels.findIndex(l => l.id === lvl.unitsRefId);
        const refQty = refIdx >= 0 ? qtys[refIdx] ?? 0 : 0;
        qtys.push(lvl.units > 0 ? Math.ceil(refQty / lvl.units) : 0);
      }
    }
    return qtys;
  })();

  // Keep the PPU denominator synced while it is still using the auto-filled value.
  const firstLvlQtyForSeed = packagingRequiredQtys[0] ?? 0;
  useEffect(() => {
    if (manualPpuDenominator || firstLvlQtyForSeed <= 0) return;
    const next = String(firstLvlQtyForSeed);
    if (formData.ppuDenominator !== next) setFormField("ppuDenominator", next);
  }, [manualPpuDenominator, firstLvlQtyForSeed, formData.ppuDenominator, setFormField]);

  // Stable dep key: serialised CPO-relevant fields — triggers sync only when CPO data actually changes.
  const _cpoSyncKey = packagingLevels
    .map(l => `${l.id}:${l.customLevelName}:${l.units}:${l.unitsRefId ?? ""}`)
    .join("|");

  // ONE-WAY SYNC: CPO → Packaging Config
  // Whenever CPO level names or Required Qtys change, mirror into the shared PackagingLevel objects.
  // Only touches `packagingType` (name) and `cpoRequiredQty` — never fills rate, wage rate, etc.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Re-compute required qtys inside the effect to get fresh values
    const qtys: number[] = [];
    for (let i = 0; i < packagingLevels.length; i++) {
      const lvl = packagingLevels[i];
      if (!lvl.unitsRefId) {
        qtys.push(lvl.units);
      } else {
        const refIdx = packagingLevels.findIndex(l => l.id === lvl.unitsRefId);
        const refQty = refIdx >= 0 ? qtys[refIdx] ?? 0 : 0;
        qtys.push(lvl.units > 0 ? Math.ceil(refQty / lvl.units) : 0);
      }
    }
    console.log("[_cpoSyncKey effect] firing, levels:", JSON.stringify(packagingLevels.map(l => ({ id: l.id, customLevelName: l.customLevelName, packagingType: l.packagingType }))));
    setPackagingLevels(prev =>
      prev.map((lvl, i) => {
        const cpoName = lvl.customLevelName.trim() || `Level ${i + 1}`;
        const reqQty  = qtys[i] ?? 0;
        if (lvl.packagingType === cpoName && lvl.cpoRequiredQty === reqQty) return lvl;
        return { ...lvl, packagingType: cpoName, cpoRequiredQty: reqQty };
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_cpoSyncKey]);

  // ── Shared output panel helpers ───────────────────────────────────────────
  const unitWeightG = (parseFloat(formData.unitWeight) || 0) * (GRAMS_PER[formData.unitWeightUnit ?? "g"] ?? 1);
  const indivIdx    = 0;
  const baseQty     = indivIdx >= 0 ? (packagingRequiredQtys[indivIdx] ?? 0) : (packagingRequiredQtys[0] ?? 0);
  const fmtN  = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const fmtN3 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
  const fmtD  = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const fv    = (n: number, fmt: (n: number) => string) => n > 0 ? fmt(n) : "—";

  // ── # Intake Pallets — auto-calculated from raw material weight ÷ pallet weight ──
  const intakeOveragePct   = parseFloat(formData.materialOverage as string) || 0;
  const intakeReqGrams     = Math.ceil(baseQty * (1 + intakeOveragePct / 100)) * unitWeightG;
  const intakeReqLbs       = intakeReqGrams / 453.592;
  const WEIGHT_TO_LBS: Record<string, number> = { lbs: 1, kg: 2.20462, g: 0.00220462, oz: 0.0625, t: 2204.62 };
  const intakePalletWtRaw  = parseFloat((formData as any).intakePalletWeightValue) || 1200;
  const intakePalletWtUom  = (formData as any).intakePalletWeightUom ?? "lbs";
  const intakePalletWtLbs  = intakePalletWtRaw * (WEIGHT_TO_LBS[intakePalletWtUom] ?? 1);
  const autoIntakePallets  = intakePalletWtLbs > 0 ? Math.ceil(intakeReqLbs / intakePalletWtLbs) : 0;
  const autoIntakePalletsStr = autoIntakePallets > 0 ? String(autoIntakePallets) : "";

  // Keep # Intake Pallets synced to the live calculation unless the user has
  // typed a value that diverges from the last auto-computed one. On first run
  // (ref is null — fresh mount or legacy saved value), treat it as untouched too,
  // so stale/pre-existing values get reconciled with the live calc.
  useEffect(() => {
    const current = formData.numIntakePallets ?? "";
    const isUntouched = current === "" || lastAutoIntakePallets.current === null || current === lastAutoIntakePallets.current;
    if (isUntouched && current !== autoIntakePalletsStr) {
      setFormField("numIntakePallets", autoIntakePalletsStr);
    }
    lastAutoIntakePallets.current = autoIntakePalletsStr;
  }, [autoIntakePalletsStr]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
    <div className="pt-4">

      {/* ── Customer Project Overview ────────────────────────────── */}
      <div className={sectionRow}>
      <div id="section-cpo" className={card}>
        <div className="px-5 pt-4 pb-1">
          <SectionHeader title="Customer Project Overview" open={cpoOpen} onToggle={() => setCpoOpen(o => !o)} sectionId="section-cpo" />
        </div>
      {cpoOpen && !notRequired["section-cpo"] && (
        <div className="px-5 pb-5">
          <div className="divide-y divide-gray-100">

            {/* ── shared row token: label col fixed 180px, input col fills rest ── */}

            {/* Setup + QA Fee */}
            <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs text-zinc-700 whitespace-nowrap">Setup + QA Fee</span>
                <button type="button"
                  ref={setupMarginBtnRef}
                  onClick={() => setSetupMarginOpen(o => !o)}
                  title="Show setup margin"
                  className="h-4 w-4 inline-flex items-center justify-center rounded-full border border-amber-400 text-amber-700 hover:bg-amber-100 transition-colors shrink-0">
                  <Info size={10} />
                </button>
              </div>
              <div className="flex items-center w-40">
                <span className={manualPrefixBadge}>$</span>
                <CurrencyInput type="dollar" value={parseFloat(formData.setupFeeCustomer) || 0}
                  onChange={v => setFormField("setupFeeCustomer", String(v))}
                  className={manualInputWithPrefix} />
              </div>
            </div>

            {/* Project Management Fee */}
            <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
              <span className="text-xs text-zinc-700">Project Management Fee</span>
              <div className="flex items-center w-40">
                <span className={manualPrefixBadge}>$</span>
                <CurrencyInput type="dollar" value={parseFloat((formData as any).projectManagementFee) || 0}
                  onChange={v => setFormField("projectManagementFee" as keyof typeof formData, String(v))}
                  className={manualInputWithPrefix} />
              </div>
            </div>

            {/* Unit Size / ea */}
            <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs text-zinc-700 whitespace-nowrap">Unit Size / ea</span>
                <button type="button" onClick={openConverter} className="text-[0.6rem] font-semibold text-[#e8473f] hover:text-[#c73d36] transition-colors shrink-0">
                  Converter →
                </button>
              </div>
              <div className="flex items-center">
                <input
                  type="number"
                  value={formData.unitWeight ?? ""}
                  onChange={(e) => setFormField("unitWeight", e.target.value)}
                  className="w-32 h-9 px-3 border border-orange-300 text-xs text-zinc-950 bg-orange-100/80 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-l-md"
                />
                <select
                  value={formData.unitWeightUnit ?? "g"}
                  onChange={(e) => handleUnitWeightUnitChange(e.target.value)}
                  className="text-[0.6rem] font-medium text-zinc-600 border border-l-0 border-orange-300 h-9 px-1.5 bg-orange-100/70 shrink-0 rounded-r-md focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition cursor-pointer"
                >
                  {UNIT_OPTS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Packaging Structure table */}
            <div className="pt-3 pb-2">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-[0.6rem] font-semibold uppercase tracking-widest text-zinc-600">Packaging Structure</p>
                <button
                  type="button"
                  onClick={() => setPackagingDbOpen(true)}
                  className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 text-[0.65rem] font-semibold text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-colors"
                >
                  <Database size={12} /> Packaging Cost Database
                </button>
              </div>
              <p className="text-[0.65rem] text-zinc-600 mb-3">
                Define every packaging level this project moves through, from individual unit up to shipper. This sets the shape of the whole quote — labor rates and markups for each level are configured later in <strong className="font-semibold text-zinc-800">Packaging Line Setup</strong>.
              </p>
              {/* Legend */}
              <div className="flex items-center gap-4 mb-3">
                <span className="flex items-center gap-1.5 text-[0.6rem] text-zinc-600">
                  <span className="w-3 h-3 rounded-sm border border-amber-200 bg-amber-50/80 inline-block" />
                  Default / Auto
                </span>
                <span className="flex items-center gap-1.5 text-[0.6rem] text-zinc-600">
                  <span className="w-3 h-3 rounded-sm border border-orange-300 bg-orange-100/80 inline-block" />
                  Manual input
                </span>
              </div>

              <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#EDEAE0]">
                      <th className="text-left text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider px-3 py-2.5 border-b-2 border-r border-gray-300 w-[22%]">Level</th>
                      <th className="text-left text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider px-3 py-2.5 border-b-2 border-r border-gray-300">Units</th>
                      <th className="text-left text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider px-3 py-2.5 border-b-2 border-r border-gray-300">UOM</th>
                      <th className="text-left text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider px-3 py-2.5 border-b-2 border-r border-gray-300">Required Qty</th>
                      <th className="text-left text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-wider px-3 py-2.5 border-b-2 border-r border-gray-300">Packaging Cost / Unit</th>
                      <th className="border-b-2 border-gray-300 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {packagingLevels.map((lvl, idx) => {
                      const priorNamed  = packagingLevels.slice(0, idx).filter(l => l.customLevelName.trim());
                      const requiredQty = packagingRequiredQtys[idx] ?? 0;
                      return (
                        <tr key={lvl.id} className="border-b border-gray-200 last:border-b-0">
                          {/* Level name */}
                          <td className="border-r border-gray-200 p-2">
                            <PackagingItemPicker
                              items={packagingCostItems}
                              value={lvl.packagingCostItemId || lvl.customLevelName}
                              onSelect={item => updatePackagingLevel(lvl.id, {
                                customLevelName: item.itemName,
                                costPerUnit: item.landedCostEa,
                                packagingCostItemId: item.id,
                              })}
                            />
                          </td>
                          {/* # of Units */}
                          <td className="border-r border-gray-200 p-2">
                            <CurrencyInput
                              type="integer"
                              value={lvl.units}
                              onChange={v => updatePackagingLevel(lvl.id, { units: v })}
                              className="h-8 w-full px-2 border border-orange-300 text-xs text-zinc-950 bg-orange-100/80 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/30 focus:border-[#e8473f] transition rounded tabular-nums"
                            />
                          </td>
                          {/* UOM */}
                          <td className="border-r border-gray-200 p-2 w-32">
                            <select
                              value={lvl.unitsRefId ?? ""}
                              onChange={e => updatePackagingLevel(lvl.id, { unitsRefId: e.target.value || undefined })}
                              className="h-8 w-full px-1.5 border border-orange-300 text-xs text-zinc-800 bg-orange-100/80 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/30 focus:border-[#e8473f] transition rounded cursor-pointer"
                            >
                              <option value="">units</option>
                              {priorNamed.map(pl => (
                                <option key={pl.id} value={pl.id}>{pl.customLevelName}</option>
                              ))}
                            </select>
                          </td>
                          {/* Required Qty — calculated */}
                          <td className="border-r border-gray-200 p-2">
                            <div className={`h-8 flex items-center px-2 border rounded text-xs font-semibold tabular-nums ${autoReadout}`}>
                              {requiredQty > 0 ? requiredQty.toLocaleString() : <span className="text-zinc-500 font-normal">—</span>}
                            </div>
                          </td>
                          {/* Cost / Unit */}
                          <td className="border-r border-gray-200 p-2">
                            <div className="flex items-center h-8 border border-amber-200 bg-amber-50/70 rounded overflow-hidden">
                              <span className="text-[0.6rem] text-zinc-600 px-2 select-none border-r border-amber-200 h-full flex items-center bg-amber-50/60">$</span>
                              <input
                                type="text"
                                readOnly
                                value={lvl.costPerUnit > 0 ? lvl.costPerUnit.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : ""}
                                className="flex-1 h-full px-2 text-xs text-zinc-950 bg-transparent focus:outline-none tabular-nums cursor-default"
                              />
                            </div>
                          </td>
                          {/* Remove */}
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => removePackagingLevel(lvl.id)}
                              className="w-6 h-6 flex items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all text-sm font-bold leading-none mx-auto"
                              title="Remove packaging level"
                            >×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Add Packaging Level */}
                <div className="border-t border-dashed border-[#e8473f]/40 bg-red-50/20 px-3 py-2">
                  <button
                    type="button"
                    onClick={addPackagingLevel}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[0.68rem] font-semibold text-[#e8473f] border border-[#e8473f]/40 rounded-md hover:bg-red-50 hover:border-[#e8473f]/70 transition-colors"
                  >
                    <Plus size={11} strokeWidth={2.5} />Add Packaging Level
                  </button>
                </div>
              </div>
            </div>

            {/* PPU Denominator */}
            <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
              <span className="text-xs text-zinc-700">PPU Denominator</span>
              <div className="flex items-center gap-2">
                <div className="w-40">
                  {manualPpuDenominator ? (
                    <CurrencyInput
                      type="integer"
                      value={parseFloat(formData.ppuDenominator) || 0}
                      onChange={v => setFormField("ppuDenominator", String(v))}
                      className={manualInputKey}
                    />
                  ) : (
                    <input
                      type="text"
                      readOnly
                      value={firstLvlQtyForSeed > 0 ? Math.round(firstLvlQtyForSeed).toLocaleString("en-US") : ""}
                      className={`${inputKey} ${autoReadout} cursor-default`}
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextManual = !manualPpuDenominator;
                    setManualPpuDenominator(nextManual);
                    if (!nextManual) setFormField("manufacturingMoqApplyToPpu" as keyof ProjectFormData, "false");
                  }}
                  className={`h-8 px-2.5 rounded-md border text-[0.65rem] font-semibold transition-colors ${
                    manualPpuDenominator
                      ? "border-orange-300 bg-orange-100/80 text-orange-700 hover:bg-orange-100"
                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  {manualPpuDenominator ? "Use Auto" : "Use Manual"}
                </button>
              </div>
            </div>

            {/* Lead Time Buffer */}
            <div id="section-lead-time" className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
              <span className="text-xs text-zinc-700">Lead Time Buffer</span>
              <div className="flex items-center h-9 border border-orange-300 bg-orange-100/80 rounded-md overflow-hidden w-40">
                <input
                  type="number"
                  value={
                    bufferUnit === "weeks"
                      ? formData.leadTimeBufferDays ? (parseFloat(formData.leadTimeBufferDays) / 5).toFixed(1) : ""
                      : formData.leadTimeBufferDays
                  }
                  onChange={(e) => {
                    const raw = parseFloat(e.target.value);
                    if (isNaN(raw)) { setFormField("leadTimeBufferDays", ""); return; }
                    setFormField("leadTimeBufferDays", bufferUnit === "weeks" ? String(Math.round(raw * 5)) : String(raw));
                  }}
                  placeholder="0"
                  step={bufferUnit === "weeks" ? "0.5" : "1"}
                  className="w-16 h-full px-2 text-xs text-right bg-transparent border-r border-orange-300 focus:outline-none focus:ring-1 focus:ring-[#e8473f] font-medium"
                />
                {(["days", "weeks"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setBufferUnit(u)}
                    className={`h-9 px-2 text-[0.6rem] font-semibold transition-colors border-r border-amber-200 last:border-r-0 shrink-0 ${
                      bufferUnit === u ? "bg-[#e8473f] text-white" : "bg-amber-50/50 text-zinc-600 hover:text-zinc-800"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

          </div>{/* end inputs divide-y */}
        </div>
      )}
      </div>{/* end CPO card */}

      {/* CPO outputs panel */}
      {cpoOpen && !notRequired["section-cpo"] && <div className={outPanel}>
        <div className={outTitle}>Project Overview Outputs</div>
        {packagingLevels.map((lvl, i) => {
          const qty  = packagingRequiredQtys[i] ?? 0;
          const name = lvl.customLevelName?.trim() || lvl.packagingLevel || `Level ${i + 1}`;
          return (
            <div key={lvl.id} className={outRow}>
              <span className={outLbl}>{name} — Units</span>
              <span className={outVal}>{fv(qty, fmtN)}</span>
            </div>
          );
        })}
        <div className={outRow}>
          <span className={outLbl}>Total Grams Req (g)</span>
          <span className={outVal}>{fv(baseQty * unitWeightG, fmtN)}</span>
        </div>
        <div className={outRow}>
          <span className={outLbl}>Lead Time — Days</span>
          <span className={outVal}>{fv(parseFloat(formData.leadTimeBufferDays) || 0, fmtN)}</span>
        </div>
        <div className={outRow}>
          <span className={outLbl}>Lead Time — Weeks</span>
          <span className={outVal}>{(parseFloat(formData.leadTimeBufferDays) || 0) > 0 ? ((parseFloat(formData.leadTimeBufferDays) || 0) / 7).toFixed(1) : "—"}</span>
        </div>
        <div className={outCostSep}>Setup + QA Costs</div>
        {outputCostPair(parseFloat(formData.setupFeeOur) || 0, parseFloat(formData.setupFeeCustomer) || 0)}
        {parseFloat((formData as any).projectManagementFee) > 0 && (
          <div className={outRow}>
            <span className={outLbl}>Project Mgmt Fee</span>
            <span className={outCxVal}>{fmtD(parseFloat((formData as any).projectManagementFee))}</span>
          </div>
        )}
        {marginBadge(parseFloat(formData.setupFeeOur) || 0, parseFloat(formData.setupFeeCustomer) || 0)}
      </div>}
      </div>{/* end section-row CPO */}

      {/* ── Manufacturing MOQ Conversion ────────────────────────────── */}
      <div className={sectionRow}>
      <div id="section-manufacturing-moq" className={card}>
        <div className="px-5 pt-4 pb-1">
          <SectionHeader title="Manufacturing MOQ Conversion" open={mfgMoqOpen} onToggle={() => setMfgMoqOpen(o => !o)} sectionId="section-manufacturing-moq" />
        </div>
        {mfgMoqOpen && !notRequired["section-manufacturing-moq"] && (
          <div className="px-5 pb-5">
            <div className="divide-y divide-gray-100">
              <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
                <span className="text-xs text-zinc-700">Manufacturer MOQ</span>
                <div className="flex items-center w-full sm:w-64">
                  <CurrencyInput
                    type="rate"
                    value={manufacturerQty}
                    onChange={v => setFormField("manufacturingMoqQty" as keyof ProjectFormData, String(v))}
                    className="h-9 flex-1 min-w-0 px-3 border border-amber-200 border-r-0 text-xs text-zinc-950 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-l-md"
                  />
                  <select
                    value={manufacturerUom}
                    onChange={e => setFormField("manufacturingMoqUom" as keyof ProjectFormData, e.target.value)}
                    className="text-[0.6rem] font-medium text-zinc-600 border border-amber-200 h-9 px-1.5 bg-amber-50/50 shrink-0 rounded-r-md focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition cursor-pointer"
                  >
                    {MANUFACTURING_MOQ_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
                <span className="text-xs text-zinc-700">Net Fill Weight</span>
                <div className="flex items-center w-40">
                  <CurrencyInput
                    type="rate"
                    value={finishedNetFillG}
                    onChange={v => setFormField("manufacturingMoqNetFillG" as keyof ProjectFormData, String(v))}
                    className={inputWithSuffix}
                  />
                  <span className={suffixBadge}>g</span>
                </div>
              </div>

              <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
                <span className="text-xs text-zinc-700">Reserve / Yield</span>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center w-32">
                    <CurrencyInput
                      type="percent"
                      value={reservePct}
                      onChange={v => setFormField("manufacturingMoqReservePct" as keyof ProjectFormData, String(v))}
                      className={inputWithSuffix}
                    />
                    <span className={suffixBadge}>%</span>
                  </div>
                  <div className="flex items-center w-36">
                    <CurrencyInput
                      type="integer"
                      value={reserveUnits}
                      onChange={v => setFormField("manufacturingMoqReserveUnits" as keyof ProjectFormData, String(v))}
                      className={inputWithSuffix}
                    />
                    <span className={suffixBadge}>units</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
                <span className="text-xs text-zinc-700">Rounding</span>
                <div className="flex items-center gap-2">
                  <select
                    value={roundingMode}
                    onChange={e => setFormField("manufacturingMoqRoundingMode" as keyof ProjectFormData, e.target.value)}
                    className="h-9 px-2 border border-amber-200 text-xs text-zinc-800 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-md cursor-pointer"
                  >
                    <option value="down">Down</option>
                    <option value="nearest">Nearest</option>
                    <option value="up">Up</option>
                  </select>
                  <div className="flex items-center w-36">
                    <CurrencyInput
                      type="integer"
                      value={roundingIncrement}
                      onChange={v => setFormField("manufacturingMoqRoundingIncrement" as keyof ProjectFormData, String(v))}
                      className={inputWithSuffix}
                    />
                    <span className={suffixBadge}>units</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 py-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={applyMfgMoqToPpu}
                    onChange={e => {
                      const checked = e.target.checked;
                      setFormField("manufacturingMoqApplyToPpu" as keyof ProjectFormData, checked ? "true" : "false");
                      if (checked) setManualPpuDenominator(true);
                    }}
                    className="accent-[#e8473f] w-3.5 h-3.5"
                  />
                  <span className="text-xs text-zinc-800">Use for PPU Denominator</span>
                </label>
                <button
                  type="button"
                  onClick={applyManufacturingMoq}
                  disabled={recommendedCustomerMoq <= 0}
                  className="h-8 px-3 text-[0.65rem] font-semibold text-[#e8473f] border border-[#e8473f]/40 rounded-md hover:bg-red-50 hover:border-[#e8473f]/70 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                  Apply MOQ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {mfgMoqOpen && !notRequired["section-manufacturing-moq"] && <div className={outPanel}>
        <div className={outTitle}>MOQ Conversion Outputs</div>
        <div className={outRow}><span className={outLbl}>Total Grams Required</span><span className={outVal}>{fmtDec(totalManufacturerGrams)}</span></div>
        <div className={outRow}><span className={outLbl}>Theoretical Units</span><span className={outVal}>{fmtInt(theoreticalFinishedUnits)}</span></div>
        <div className={outRow}><span className={outLbl}>Reserve Adjusted Units</span><span className={outVal}>{fmtInt(reserveAdjustedUnits)}</span></div>
        <div className={outRow}><span className={outLbl}>Recommended MOQ</span><span className={outVal}>{fmtInt(recommendedCustomerMoq)}</span></div>
        <div className={outRow}><span className={outLbl}>PPU Denominator</span><span className={outCxVal}>{fmtInt(parseFloat(formData.ppuDenominator) || 0)}</span></div>
      </div>}
      </div>

      {/* ── Raw Material ── */}
      <div className={sectionRow}><div id="section-raw-materials" className={card}>
        <div className="px-5 pt-4 pb-5">
        <SectionHeader title="Raw Material" open={rawMatOpen} onToggle={() => setRawMatOpen(o => !o)} sectionId="section-raw-materials" />

        {rawMatOpen && !notRequired["section-raw-materials"] && (
          <div className="mt-4">
              {/* Raw Material Provider */}
              <div className="flex items-center gap-4 py-1.5 mb-3 border-b border-gray-200">
                {(["customer", "us"] as const).map(opt => (
                  <label key={opt} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="rawMaterialProvider"
                      value={opt}
                      checked={(formData.rawMaterialProvider || "customer") === opt}
                      onChange={() => setFormField("rawMaterialProvider", opt)}
                      className="accent-[#e8473f] w-3.5 h-3.5"
                    />
                    <span className="text-xs text-zinc-800">
                      {opt === "customer" ? "Customer provides raw material" : "We source raw material"}
                    </span>
                  </label>
                ))}
              </div>

              {/* Group 1 */}
              <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5 mb-3 border-b border-gray-200">
                <span className="text-xs text-zinc-700">Overage Rate</span>
                <SymInput field="materialOverage" type="number" sym="%" formData={formData} setFormField={setFormField} />
              </div>

              {/* Group 2 — disabled when customer provides material */}
              {(() => {
                const customerProvides = (formData.rawMaterialProvider || "customer") === "customer";
                return (
                  <div className={customerProvides ? "opacity-40 pointer-events-none select-none" : ""}>
                    <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
                      <span className="text-xs text-zinc-700">Cost / Gram</span>
                      <SymInput field="costPerGram" type="number" sym="$" formData={formData} setFormField={setFormField} />
                    </div>
                    <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
                      <span className="text-xs text-zinc-700">Leftover Inv. Cost</span>
                      <SymInput field="leftOverInventoryCost" type="number" sym="$" formData={formData} setFormField={setFormField} />
                    </div>
                    <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5 mb-3 border-b border-gray-200">
                      <span className="text-xs text-zinc-700">Leftover Absorb</span>
                      <SymInput field="leftOverInventoryAbsorb" type="number" sym="%" formData={formData} setFormField={setFormField} />
                    </div>
                  </div>
                );
              })()}

              {/* Group 3 */}
              <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
                <span className="text-xs text-zinc-700">Raw Matl Markup</span>
                <SymInput field="rawMaterialMarkup" type="number" sym="%" formData={formData} setFormField={setFormField} />
              </div>
          </div>
        )}
        </div>{/* end inner padding */}
      </div>

      {/* Raw Material outputs panel */}
      {rawMatOpen && !notRequired["section-raw-materials"] && (() => {
        const customerProvides = (formData.rawMaterialProvider || "customer") === "customer";
        const overagePct     = parseFloat(formData.materialOverage as string) || 0;
        const reqGrams       = Math.ceil(baseQty * (1 + overagePct / 100)) * unitWeightG;
        const reqOz          = reqGrams / 28.3495;
        const reqLbs         = reqGrams / 453.592;
        const cpg            = customerProvides ? 0 : (parseFloat(formData.costPerGram as string) || 0);
        const rawMatMarkup   = parseFloat(formData.rawMaterialMarkup as string) || 0;
        const rawMatOur      = reqGrams * cpg;
        const rawMatCustomer = rawMatOur * (1 + rawMatMarkup / 100);
        return (
          <div className={outPanel}>
            <div className={outTitle}>Raw Material Outputs</div>
            <div className={outRow}><span className={outLbl}>Materials — Req (g)</span><span className={outVal}>{fv(reqGrams, fmtN3)}</span></div>
            <div className={outRow}><span className={outLbl}>Materials — Req (oz)</span><span className={outVal}>{fv(reqOz, fmtN3)}</span></div>
            <div className={outRow}><span className={outLbl}>Materials — Req (lbs)</span><span className={outVal}>{fv(reqLbs, fmtN3)}</span></div>
            <div className={outRow}><span className={outLbl}>Cost per gram</span><span className={outVal}>{fv(cpg, fmtD)}</span></div>
            <div className={outCostSep}>Material Costs</div>
            {outputCostPair(rawMatOur, rawMatCustomer)}
            {marginBadge(rawMatOur, rawMatCustomer)}
          </div>
        );
      })()}
      </div>{/* end section-row Raw Material */}

      {/* ── Inventory Handling ── */}
      <div className={sectionRow}><div id="section-inventory-handling" className={card}>
        <div className="px-5 pt-4 pb-5">
        <SectionHeader title="Inventory Handling" open={invHandlingOpen} onToggle={() => setInvHandlingOpen(o => !o)} sectionId="section-inventory-handling" />

        {invHandlingOpen && !notRequired["section-inventory-handling"] && (
          <div className="mt-4">
            {/* Intake Pallet Weight */}
            <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
              <span className="text-xs text-zinc-700">Intake Pallet Weight</span>
              <div className="flex items-center w-full sm:w-44">
                <input
                  type="number"
                  value={(formData as any).intakePalletWeightValue ?? ""}
                  onChange={e => setFormField("intakePalletWeightValue" as keyof typeof formData, e.target.value)}
                  placeholder="1200"
                  className="flex-1 min-w-0 h-9 px-3 border border-amber-200 text-xs text-zinc-950 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-l-md"
                />
                <select
                  value={(formData as any).intakePalletWeightUom ?? "lbs"}
                  onChange={e => setFormField("intakePalletWeightUom" as keyof typeof formData, e.target.value)}
                  className="text-[0.6rem] font-medium text-zinc-600 border border-l-0 border-amber-200 h-9 px-1.5 bg-amber-50/50 shrink-0 rounded-r-md focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition cursor-pointer"
                >
                  {["lbs", "kg", "g", "oz", "t"].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            {/* # Intake Pallets — auto-calculated default, still editable, with collapsible calc table */}
            <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
              <span className="text-xs text-zinc-700"># Intake Pallets</span>
              <div className="flex items-center gap-2">
                <SymInput
                  field="numIntakePallets"
                  type="number"
                  sym=""
                  formData={formData}
                  setFormField={setFormField}
                />
                <button
                  type="button"
                  onClick={() => setPalletCalcOpen(o => !o)}
                  className="flex items-center gap-1 text-[0.65rem] font-medium text-zinc-600 hover:text-[#e8473f] transition-colors shrink-0"
                >
                  {palletCalcOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  How is this calculated?
                </button>
              </div>
            </div>
            {palletCalcOpen && (
              <div className="ml-50 mb-2 border border-gray-200 rounded-md overflow-hidden max-w-sm">
                {/* Formula header */}
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-[0.62rem] text-zinc-600 font-mono">
                  ⌈ Raw Material (lbs) ÷ Pallet Weight (lbs) ⌉
                </div>
                <table className="w-full text-[0.7rem]">
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="px-2.5 py-1.5 text-zinc-600 font-mono text-[0.6rem]">Raw Material (lbs)</td>
                      <td className="px-2.5 py-1.5 text-right text-zinc-900 font-medium tabular-nums">{fmtN(intakeReqLbs)} lbs</td>
                    </tr>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <td className="px-2.5 py-1.5 text-zinc-600 font-mono text-[0.6rem]">÷ Pallet Weight (lbs)</td>
                      <td className="px-2.5 py-1.5 text-right text-zinc-900 font-medium tabular-nums">{fmtN(intakePalletWtLbs)} lbs</td>
                    </tr>
                    <tr className="border-b border-gray-100 bg-amber-50/40">
                      <td className="px-2.5 py-1.5 text-zinc-600 font-mono text-[0.6rem]">= {intakePalletWtLbs > 0 ? `${fmtN(intakeReqLbs)} ÷ ${fmtN(intakePalletWtLbs)}` : "—"}</td>
                      <td className="px-2.5 py-1.5 text-right text-zinc-700 tabular-nums">{intakePalletWtLbs > 0 ? (intakeReqLbs / intakePalletWtLbs).toFixed(2) : "—"}</td>
                    </tr>
                    <tr>
                      <td className="px-2.5 py-1.5 text-zinc-800 font-semibold">⌈ result ⌉ = # Pallets</td>
                      <td className="px-2.5 py-1.5 text-right text-zinc-950 font-bold tabular-nums">{autoIntakePallets > 0 ? fmtN(autoIntakePallets) : "—"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
              <span className="text-xs text-zinc-700">Inventory Handling Fee</span>
              <SymInput field="inventoryHandlingFee" type="number" sym="$" formData={formData} setFormField={setFormField} />
            </div>
            <div className="grid grid-cols-[180px_1fr] items-center gap-5 py-1.5">
              <span className="text-xs text-zinc-700">Intake Fee Markup</span>
              <SymInput field="intakeFeeMarkup" type="number" sym="%" formData={formData} setFormField={setFormField} />
            </div>
          </div>
        )}
        </div>{/* end inner padding */}
      </div>

      {/* Inventory Handling outputs panel */}
      {invHandlingOpen && !notRequired["section-inventory-handling"] && (() => {
        const numIntakePallets  = parseFloat(formData.numIntakePallets as string) || autoIntakePallets;
        const invHandlingFee    = parseFloat((formData as any).inventoryHandlingFee as string) || 0;
        const intakeMarkup      = parseFloat(formData.intakeFeeMarkup as string) || 0;
        const totalOur          = numIntakePallets * invHandlingFee;
        const totalCustomer     = totalOur * (1 + intakeMarkup / 100);
        return (
          <div className={outPanel}>
            <div className={outTitle}>Inventory Handling Outputs</div>
            <div className={outRow}><span className={outLbl}># Intake Pallets</span><span className={outVal}>{numIntakePallets > 0 ? fmtN(numIntakePallets) : "—"}</span></div>
            <div className={outRow}><span className={outLbl}>Inventory Handling Fee</span><span className={outVal}>{fv(invHandlingFee, fmtD)}</span></div>
            <div className={outRow}><span className={outLbl}>Handling Fee Total</span><span className={outVal}>{fv(totalOur, fmtD)}</span></div>
            <div className={outCostSep}>Handling Costs</div>
            {outputCostPair(totalOur, totalCustomer)}
            {marginBadge(totalOur, totalCustomer)}
          </div>
        );
      })()}
      </div>{/* end section-row Inventory Handling */}

      {/* ── Testing ─────────────────────────────────────────────── */}
      {(() => {
        const TEST_TYPES = [
          "FSQ, Administration, and Testing Documents - Raw Material",
          "FSQ, Administration, and Testing Documents - Finished Goods",
          "Custom",
        ];
        const rows: TestingRow[] = formData.testingRows ?? [];
        const testingMarkup  = parseFloat(formData.testingMarkup || "0") || 0;
        const defaultSkus    = parseFloat(formData.numSkus || "1") || 1;
        const totalOur  = rows.reduce((sum, r) => sum + (r.cost ?? 0) * (r.numSkus ?? defaultSkus), 0);
        const totalCx   = totalOur * (1 + testingMarkup / 100);

        const addRow = () => {
          const newRow: TestingRow = { id: String(uid()), testType: "", customTestName: "", cost: 0, numSkus: defaultSkus };
          setTestingRows([...rows, newRow]);
        };
        const removeRow = (id: string) => {
          setTestingRows(rows.filter(r => r.id !== id));
        };
        const updateRow = (id: string, patch: Partial<TestingRow>) => {
          setTestingRows(rows.map(r => r.id === id ? { ...r, ...patch } : r));
        };

        return (
          <div className={sectionRow}>
          <div id="section-testing" className={card}>
            <div className="px-5 pt-4 pb-5">
            <SectionHeader
              title="Testing"
              open={testingOpen}
              onToggle={() => setTestingOpen(o => !o)}
              sectionId="section-testing"
            />
            {testingOpen && !notRequired["section-testing"] && (true ? (
              <div className="mt-4">
                <table className="w-full border-collapse mb-2">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-[0.55rem] font-semibold text-zinc-600 uppercase tracking-widest pb-1.5 pr-3">Test Type</th>
                      <th className="text-right text-[0.55rem] font-semibold text-zinc-600 uppercase tracking-widest pb-1.5 w-20"># SKUs</th>
                      <th className="text-right text-[0.55rem] font-semibold text-zinc-600 uppercase tracking-widest pb-1.5 w-28 pl-3">Cost / test</th>
                      <th className="w-6" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => {
                      const rowSkus = row.numSkus ?? defaultSkus;
                      return (
                        <tr key={row.id} className="border-b border-gray-50">
                          <td className="py-1.5 pr-3">
                            <div className="flex items-center gap-2">
                              <select
                                value={row.testType}
                                onChange={e => updateRow(row.id, { testType: e.target.value, customTestName: "" })}
                                className={`h-8 px-2 border border-amber-200 text-xs text-zinc-950 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-md ${row.testType === "Custom" ? "w-28 shrink-0" : "flex-1"}`}
                              >
                                <option value="" disabled>— select test type —</option>
                                {TEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                              {row.testType === "Custom" && (
                                <input
                                  type="text"
                                  value={row.customTestName}
                                  onChange={e => updateRow(row.id, { customTestName: e.target.value })}
                                  placeholder="Custom test name"
                                  className="flex-1 min-w-0 h-8 px-2 border border-amber-200 text-xs text-zinc-950 placeholder:text-zinc-500 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-[#e8473f]/20 focus:border-[#e8473f] transition rounded-md"
                                />
                              )}
                            </div>
                          </td>
                          <td className="py-1.5 pl-3">
                            <CurrencyInput type="integer" value={rowSkus}
                              onChange={v => updateRow(row.id, { numSkus: v })}
                              className="h-8 w-full px-2 text-xs text-right border border-amber-200 bg-amber-50/50 rounded-md focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition" />
                          </td>
                          <td className="py-1.5 pl-3">
                            <div className="flex items-center justify-end">
                              <span className={prefixBadge}>$</span>
                              <CurrencyInput type="dollar" value={row.cost}
                                onChange={v => updateRow(row.id, { cost: v })}
                                className={inputWithPrefix + " w-24"} />
                            </div>
                          </td>
                          <td className="py-1.5 pl-2">
                            <button type="button" onClick={() => removeRow(row.id)}
                              className="text-zinc-500 hover:text-red-400 text-base leading-none transition-colors" title="Remove">×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button type="button" onClick={addRow}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[0.68rem] font-semibold text-[#e8473f] border border-[#e8473f]/40 rounded-md hover:bg-red-50 hover:border-[#e8473f]/70 transition-colors mb-4">
                  <Plus size={11} strokeWidth={2.5} />Add Test
                </button>
                <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                  <span className="text-[0.65rem] text-zinc-600">Markup on total testing cost:</span>
                  <div className="flex items-center w-28">
                    <CurrencyInput type="percent" value={testingMarkup}
                      onChange={v => setFormField("testingMarkup", String(v))} className={inputWithSuffix} />
                    <span className={suffixBadge}>%</span>
                  </div>
                  {totalOur > 0 && (
                    <span className="text-[0.6rem] text-zinc-600 ml-auto">
                      Our cost: <span className="font-semibold text-zinc-700">${totalOur.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      {" · "}Customer: <span className="font-semibold text-zinc-700">${totalCx.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </span>
                  )}
                </div>
              </div>
            ) : null)}
            </div>{/* end inner padding */}
          </div>

          {/* Testing outputs panel */}
          {testingOpen && !notRequired["section-testing"] && <div className={outPanel}>
            <div className={outTitle}>Testing Outputs</div>
            <div className={outRow}><span className={outLbl}>Markup</span><span className={outVal}>{testingMarkup > 0 ? `${testingMarkup}%` : "—"}</span></div>
            <div className={outCostSep}>Testing Costs</div>
            {outputCostPair(totalOur, totalCx)}
            {marginBadge(totalOur, totalCx)}
          </div>}
          </div>
        );
      })()}

      {null /* Blending section removed */}

    </div>

    {setupMarginOpen && (
      <SetupMarginPopover
        anchorRef={{ current: setupMarginBtnRef.current }}
        ourCost={parseFloat(formData.setupFeeOur) || 0}
        marginPct={setupMarginPct}
        onMarginChange={handleSetupMarginChange}
        onClose={() => setSetupMarginOpen(false)}
      />
    )}

    {/* Conversion Calculator — opened from Unit Size field */}
    <ConversionCalculator
      open={convOpen}
      onClose={() => setConvOpen(false)}
      prefill={convPrefill}
    />
    {packagingDbOpen && (
      <PackagingCostDatabaseModal
        items={packagingCostItems}
        setItems={setPackagingCostItems}
        audit={packagingCostAudit}
        setAudit={setPackagingCostAudit}
        onClose={() => setPackagingDbOpen(false)}
      />
    )}
    </>
  );
}

// ── MoqSection — standalone, rendered last in Home after Palletization ────────
export function MoqSection({
  moqRows,
  setMoqRows,
  formData,
  packagingLevels,
  moqPpuInputs,
  setMoqPpuInputs,
  moqMargins,
  setMoqMargins,
  moqLastEdited: _moqLastEdited,
  setMoqLastEdited,
}: {
  moqRows:        MoqRow[];
  setMoqRows:     React.Dispatch<React.SetStateAction<MoqRow[]>>;
  formData:       ProjectFormData;
  packagingLevels: PackagingLevel[];
  moqPpuInputs:   Record<number, string>;
  setMoqPpuInputs: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  moqMargins:     Record<number, string>;
  setMoqMargins:  React.Dispatch<React.SetStateAction<Record<number, string>>>;
  moqLastEdited:  Record<number, "margin" | "ppu">;
  setMoqLastEdited: React.Dispatch<React.SetStateAction<Record<number, "margin" | "ppu">>>;
}) {
  const [moqOpen,         setMoqOpen]         = useState(true);
  const [palletToolRowId, setPalletToolRowId] = useState<number | null>(null);
  const [fillRateRowId,   setFillRateRowId]   = useState<number | null>(null);
  const { moqErrors, effectiveColumns, allMoqResults, perMoqSummaryRows } = useProject();
  const { notRequired } = useSectionRequired();

  // Derive case pack suggestion from the first packaging level with a perOuter set
  const suggestedCasePack = (() => {
    const inner = packagingLevels.find(l => l.perOuter > 0 && l.packagingLevel !== "Individual Units" && l.packagingLevel !== "Final Kit Units");
    const master = packagingLevels.find(l => l.packagingLevel === "Shipper / Outer" || l.packagingLevel === "Master" || (l !== inner && l.perOuter > 0 && inner && packagingLevels.indexOf(l) > packagingLevels.indexOf(inner)));
    return { unitsPerInner: inner?.perOuter ?? 0, innersPerMaster: master?.perOuter ?? 0 };
  })();

  // Auto-seed first row from ppuDenominator when rows are empty and section is required
  useEffect(() => {
    if (notRequired["section-moq"]) return;
    if (moqRows.length === 0) {
      const denom = parseFloat(formData.ppuDenominator) || 0;
      const row = emptyMoqRow();
      if (denom > 0) {
        row.individualUnits = String(denom);
        row.moq = String(denom);
      }
      if (suggestedCasePack.unitsPerInner > 0) row.unitsPerInner = String(suggestedCasePack.unitsPerInner);
      if (suggestedCasePack.innersPerMaster > 0) row.innersPerMaster = String(suggestedCasePack.innersPerMaster);
      setMoqRows([row]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notRequired["section-moq"]]);

  const addRowBtn = "flex items-center gap-1 text-[0.6rem] font-semibold text-[#e8473f] hover:text-[#c73d36] uppercase tracking-wider transition-colors";
  const inp = "h-8 w-full px-2 border border-amber-200 text-xs text-zinc-950 placeholder:text-zinc-500 bg-amber-50/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/30 focus:border-[#e8473f] transition rounded-md";
  const inpRo = "h-8 w-full px-2 border border-amber-200 text-xs font-semibold text-zinc-800 bg-amber-50/70 rounded-md select-none tabular-nums";
  const colHead = "text-[0.6rem] font-semibold text-zinc-600 uppercase tracking-widest";

  const removeMoqRow = (id: number) => setMoqRows(prev => prev.filter(r => r.id !== id));
  const updateMoqRow = (id: number, field: keyof MoqRow, value: string) =>
    setMoqRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  const addMoqRow = () => {
    const row = emptyMoqRow();
    if (suggestedCasePack.unitsPerInner > 0) row.unitsPerInner = String(suggestedCasePack.unitsPerInner);
    if (suggestedCasePack.innersPerMaster > 0) row.innersPerMaster = String(suggestedCasePack.innersPerMaster);
    setMoqRows(prev => [...prev, row]);
  };

  // PPU / Margin two-way handlers
  const handlePpuChange = (rowId: number, rawPpu: string) => {
    setMoqPpuInputs(p => ({ ...p, [rowId]: rawPpu }));
    setMoqLastEdited(p => ({ ...p, [rowId]: "ppu" }));
    const moqResult = allMoqResults.find(r => r.moqRow.id === rowId);
    if (!moqResult) return;
    const ppu = parseFloat(rawPpu);
    if (!isNaN(ppu) && ppu > 0 && moqResult.ppuCost > 0) {
      const margin = ((ppu - moqResult.ppuCost) / ppu) * 100;
      setMoqMargins(p => ({ ...p, [rowId]: margin.toFixed(2) }));
    }
  };

  const handleMarginChange = (rowId: number, rawMargin: string) => {
    setMoqMargins(p => ({ ...p, [rowId]: rawMargin }));
    setMoqLastEdited(p => ({ ...p, [rowId]: "margin" }));
    const moqResult = allMoqResults.find(r => r.moqRow.id === rowId);
    if (!moqResult) return;
    const margin = parseFloat(rawMargin);
    if (!isNaN(margin) && margin < 100 && moqResult.ppuCost > 0) {
      const ppu = moqResult.ppuCost / (1 - margin / 100);
      setMoqPpuInputs(p => ({ ...p, [rowId]: ppu.toFixed(4) }));
    }
  };

  const fmtCurrency = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="mx-4 md:mx-6 mb-4 max-w-4xl">
      <div id="section-moq" className="border border-gray-200 rounded-xl overflow-hidden">

        {/* Header */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-3 border-b border-gray-100">
          <button type="button" onClick={() => setMoqOpen(o => !o)}
            className="flex items-center gap-1.5 group">
            <span className="text-sm font-bold text-zinc-950 group-hover:text-[#e8473f] transition-colors">MOQ + Case Pack Configuration</span>
            {moqOpen && !notRequired["section-moq"]
              ? <ChevronUp size={13} className="text-zinc-500 group-hover:text-[#e8473f] transition-colors shrink-0" />
              : <ChevronDown size={13} className="text-zinc-500 group-hover:text-[#e8473f] transition-colors shrink-0" />}
          </button>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {moqOpen && !notRequired["section-moq"] && (
              <button type="button" onClick={addMoqRow} className={addRowBtn}>
                <Plus size={10} strokeWidth={2.5} />Add MOQ Option
              </button>
            )}
            <RequiredToggle sectionId="section-moq" />
          </div>
        </div>

        {moqOpen && !notRequired["section-moq"] && (
          <div className="px-4 py-4">
            {/* Column headers */}
            <div className="grid gap-2 pb-2 border-b border-gray-100 mb-3" style={{ gridTemplateColumns: "1fr 1.4fr 1fr 1fr 1.1fr auto" }}>
              {["MOQ Units", "Case Pack Config", "PPU", "Margin %", "Revenue", ""].map(h => (
                <span key={h} className={colHead}>{h}</span>
              ))}
            </div>

            <div className="space-y-3">
              {moqRows.map((row, rowIndex) => {
                const qty       = parseFloat(row.individualUnits) || 0;
                const innerPack = parseFloat(row.unitsPerInner)   || 0;
                const masterPack = parseFloat(row.innersPerMaster) || 0;
                const innerCount = innerPack > 0 && qty > 0 ? Math.ceil(qty / innerPack) : 0;
                const masterCount = masterPack > 0 && innerCount > 0 ? Math.ceil(innerCount / masterPack) : 0;
                const rowErr    = moqErrors.find(e => e.rowId === row.id);
                const hasRateOverrides = row.fillRateOverrides &&
                  Object.values(row.fillRateOverrides).some(v => v !== "");

                const moqResult = allMoqResults.find(r => r.moqRow.id === row.id);
                const naturalPpu = moqResult?.ppu ?? 0;
                const naturalPpuCost = moqResult?.ppuCost ?? 0;

                // Effective PPU: use user's input if set; else fall back to natural PPU
                const ppuInputStr = moqPpuInputs[row.id] ?? "";
                const marginInputStr = moqMargins[row.id] ?? "";

                // Display values
                const displayPpu: string = ppuInputStr !== "" ? ppuInputStr : naturalPpu > 0 ? naturalPpu.toFixed(4) : "";
                const displayMargin: string = marginInputStr !== "" ? marginInputStr : moqResult ? moqResult.marginPct.toFixed(2) : "";

                const effectivePpu = ppuInputStr !== "" ? parseFloat(ppuInputStr) : naturalPpu;
                const revenue = effectivePpu > 0 && qty > 0 ? effectivePpu * qty : null;

                const moqSRows   = perMoqSummaryRows.get(row.id) ?? [];
                const palletSRow = moqSRows.find(r => r.label === "Pallets & Fees");
                const outFee     = parseFloat(formData.outboundFee) || 0;
                const autoPallets = (palletSRow && outFee > 0) ? Math.round(palletSRow.ourCosts / outFee) : null;

                const GRAMS_PER_DISP: Record<string, number> = { g: 1, oz: 28.3495, lb: 453.592, kg: 1000, mg: 0.001 };
                const unitWeightG = (parseFloat(formData.unitWeight) || 0) * (GRAMS_PER_DISP[formData.unitWeightUnit ?? "g"] ?? 1);
                const derivedCostPerGram = (moqResult && qty > 0 && unitWeightG > 0)
                  ? moqResult.totalOurCost / (qty * unitWeightG) : null;

                const isFirst = rowIndex === 0;

                return (
                  <div key={row.id} className={`rounded-lg border ${isFirst ? "border-amber-300 bg-amber-50/30" : "border-gray-200 bg-white"}`}>
                    {/* Row label */}
                    <div className="px-3 pt-2 pb-1 flex items-center gap-2">
                      <span className={`text-[0.55rem] font-bold uppercase tracking-widest ${isFirst ? "text-amber-600" : "text-zinc-600"}`}>
                        {isFirst ? "Base MOQ" : `MOQ Option ${rowIndex + 1}`}
                      </span>
                      {moqResult && naturalPpuCost > 0 && (
                        <span className="text-[0.55rem] text-zinc-600">
                          Cost PPU: <span className="font-semibold text-zinc-700">{fmtCurrency(naturalPpuCost)}</span>
                        </span>
                      )}
                    </div>

                    {/* Main 5-column input row */}
                    <div className="px-3 pb-2 grid gap-2 items-center" style={{ gridTemplateColumns: "1fr 1.4fr 1fr 1fr 1.1fr auto" }}>

                      {/* MOQ Units */}
                      <CurrencyInput type="integer"
                        value={qty}
                        onChange={v => {
                          const s = String(v);
                          setMoqRows(prev => prev.map(r => r.id === row.id ? { ...r, individualUnits: s, moq: s } : r));
                        }}
                        placeholder="0" className={inp} />

                      {/* Case Pack Config — unitsPerInner / innersPerMaster stacked */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <div className="flex items-center flex-1 min-w-0">
                            <span className="h-8 px-1.5 flex items-center border border-r-0 border-amber-200 bg-amber-50/60 text-[0.58rem] text-zinc-600 rounded-l-md shrink-0 select-none whitespace-nowrap">/inn</span>
                            <CurrencyInput type="integer"
                              value={innerPack}
                              onChange={v => updateMoqRow(row.id, "unitsPerInner", String(v))}
                              placeholder={suggestedCasePack.unitsPerInner > 0 ? String(suggestedCasePack.unitsPerInner) : "0"}
                              className={`h-8 flex-1 min-w-0 px-2 border border-amber-200 border-l-0 text-xs text-zinc-950 placeholder:text-zinc-600 bg-amber-50/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/30 focus:border-[#e8473f] transition rounded-r-md ${rowErr?.unitsPerInner ? "border-red-400 bg-red-50" : ""}`} />
                          </div>
                          <span className="text-[0.6rem] text-zinc-600 shrink-0">×</span>
                          <div className="flex items-center flex-1 min-w-0">
                            <span className="h-8 px-1.5 flex items-center border border-r-0 border-amber-200 bg-amber-50/60 text-[0.58rem] text-zinc-600 rounded-l-md shrink-0 select-none whitespace-nowrap">/mst</span>
                            <CurrencyInput type="integer"
                              value={masterPack}
                              onChange={v => updateMoqRow(row.id, "innersPerMaster", String(v))}
                              placeholder={suggestedCasePack.innersPerMaster > 0 ? String(suggestedCasePack.innersPerMaster) : "0"}
                              className={`h-8 flex-1 min-w-0 px-2 border border-amber-200 border-l-0 text-xs text-zinc-950 placeholder:text-zinc-600 bg-amber-50/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/30 focus:border-[#e8473f] transition rounded-r-md ${rowErr?.innersPerMaster ? "border-red-400 bg-red-50" : ""}`} />
                          </div>
                        </div>
                        {(innerCount > 0 || masterCount > 0) && (
                          <p className="text-[0.58rem] text-zinc-600 leading-tight">
                            {innerCount > 0 && <>{innerCount} inners{masterCount > 0 ? ` · ${masterCount} masters` : ""}</>}
                          </p>
                        )}
                        {rowErr?.unitsPerInner   && <p className="text-[0.58rem] text-red-500">{rowErr.unitsPerInner}</p>}
                        {rowErr?.innersPerMaster && <p className="text-[0.58rem] text-red-500">{rowErr.innersPerMaster}</p>}
                      </div>

                      {/* PPU — editable, 2-way with margin */}
                      <div className="flex items-center">
                        <span className="h-8 px-2 flex items-center border border-r-0 border-amber-200 bg-amber-50/60 text-[0.65rem] text-zinc-600 rounded-l-md shrink-0 select-none">$</span>
                        <input
                          type="number" step="0.0001" min={0}
                          value={displayPpu}
                          onChange={e => handlePpuChange(row.id, e.target.value)}
                          placeholder={naturalPpu > 0 ? naturalPpu.toFixed(4) : "0.0000"}
                          className="h-8 flex-1 min-w-0 px-2 border border-amber-200 border-l-0 text-xs text-zinc-950 placeholder:text-zinc-500 bg-amber-50/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/30 focus:border-[#e8473f] transition rounded-r-md tabular-nums"
                        />
                      </div>

                      {/* Margin % — editable, 2-way with PPU */}
                      <div className="flex items-center">
                        <input
                          type="number" step="0.01" min={0} max={99.99}
                          value={displayMargin}
                          onChange={e => handleMarginChange(row.id, e.target.value)}
                          placeholder={moqResult ? moqResult.marginPct.toFixed(2) : "0.00"}
                          className="h-8 flex-1 min-w-0 px-2 border border-amber-200 border-r-0 text-xs text-zinc-950 placeholder:text-zinc-500 bg-amber-50/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/30 focus:border-[#e8473f] transition rounded-l-md tabular-nums"
                        />
                        <span className="h-8 px-2 flex items-center border border-l-0 border-amber-200 bg-amber-50/60 text-[0.65rem] text-zinc-600 rounded-r-md shrink-0 select-none">%</span>
                      </div>

                      {/* Revenue — read-only */}
                      <div className={inpRo + " flex items-center justify-end"}>
                        {revenue != null ? (
                          <span className="text-[#e8473f]">{fmtCurrency(revenue)}</span>
                        ) : (
                          <span className="text-zinc-500 font-normal text-[0.65rem]">—</span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => setPalletToolRowId(row.id)}
                          title="Pallet calculator"
                          className="text-zinc-500 hover:text-amber-500 transition-colors p-0.5">
                          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
                            <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                            <text x="8" y="11" textAnchor="middle" fontSize="8" fontWeight="bold">🧮</text>
                          </svg>
                        </button>
                        <button type="button" onClick={() => setFillRateRowId(row.id)}
                          title={hasRateOverrides ? "Custom fill rates active" : "Fill rate overrides"}
                          className={`transition-colors p-0.5 ${hasRateOverrides ? "text-[#e8473f]" : "text-zinc-500 hover:text-[#e8473f]"}`}>
                          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
                            <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                            <circle cx="8" cy="8" r="2" fill="currentColor"/>
                            <line x1="8" y1="1" x2="8" y2="4" stroke="currentColor" strokeWidth="1.5"/>
                            <line x1="8" y1="12" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5"/>
                            <line x1="1" y1="8" x2="4" y2="8" stroke="currentColor" strokeWidth="1.5"/>
                            <line x1="12" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5"/>
                          </svg>
                        </button>
                        {moqRows.length > 1 && (
                          <button type="button" onClick={() => removeMoqRow(row.id)}
                            className="text-zinc-500 hover:text-red-400 transition-colors p-0.5"><Trash2 size={12} /></button>
                        )}
                      </div>
                    </div>

                    {/* Secondary row — cost/gram override + pallet override */}
                    <div className="px-3 pb-2.5 flex items-center gap-4 border-t border-gray-100/60 pt-1.5">
                      <span className="text-[0.55rem] text-zinc-600 uppercase tracking-widest shrink-0">Overrides</span>
                      {/* Pallets */}
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-[0.6rem] text-zinc-600 shrink-0">Pallets:</span>
                        <input type="text" inputMode="numeric"
                          value={row.pallets ?? ""}
                          onChange={e => updateMoqRow(row.id, "pallets", e.target.value)}
                          placeholder={autoPallets !== null ? String(autoPallets) : "auto"}
                          className="h-6 w-16 px-1.5 border border-amber-200 text-[0.7rem] text-zinc-950 placeholder:text-zinc-600 bg-amber-50/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/30 transition rounded-md" />
                        {hasRateOverrides && <span className="text-[0.58rem] text-[#e8473f] font-medium shrink-0">⚙ custom rates</span>}
                      </div>
                      {/* Cost/gram */}
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-[0.6rem] text-zinc-600 shrink-0">Cost/g:</span>
                        <input type="text" inputMode="decimal"
                          value={row.costPerGram ?? ""}
                          onChange={e => updateMoqRow(row.id, "costPerGram", e.target.value)}
                          placeholder={derivedCostPerGram !== null ? derivedCostPerGram.toFixed(4) : "0.0000"}
                          className="h-6 w-24 px-1.5 border border-amber-200 text-[0.7rem] text-zinc-950 placeholder:text-zinc-600 bg-amber-50/70 focus:outline-none focus:ring-1 focus:ring-[#e8473f]/30 transition rounded-md font-mono" />
                        {row.costPerGram !== undefined && row.costPerGram !== "" && (
                          <button type="button" onClick={() => updateMoqRow(row.id, "costPerGram", "")}
                            title="Reset to derived" className="text-[0.6rem] text-zinc-500 hover:text-[#e8473f] transition-colors">↺</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {palletToolRowId !== null && (() => {
          const row = moqRows.find(r => r.id === palletToolRowId);
          return row ? (
            <PalletToolPopover row={row} formData={formData} columns={effectiveColumns}
              onUse={pallets => { updateMoqRow(row.id, "pallets", String(pallets)); setPalletToolRowId(null); }}
              onClose={() => setPalletToolRowId(null)} />
          ) : null;
        })()}

        {fillRateRowId !== null && (() => {
          const row = moqRows.find(r => r.id === fillRateRowId);
          return row ? (
            <FillRateOverridePopover row={row} columns={effectiveColumns}
              onSave={overrides => {
                setMoqRows(prev => prev.map(r => r.id === row.id ? { ...r, fillRateOverrides: overrides } : r));
                setFillRateRowId(null);
              }}
              onClose={() => setFillRateRowId(null)} />
          ) : null;
        })()}

      </div>
    </div>
  );
}
