import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useProject } from "@/lib/ProjectContext";
import { BRANDS } from "@/lib/generateQuotePDF";
import type { PackagingLevel } from "@/lib/types";
import CompanySearchInput from "./CompanySearchInput";
import DealSearchInput from "./DealSearchInput";

const labelCls = "text-[0.58rem] font-semibold text-zinc-600 uppercase tracking-wider mb-1 block";
const inputCls =
  "h-8 w-full px-2.5 text-xs text-zinc-950 border border-amber-200 bg-amber-50/50 rounded focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition placeholder:text-zinc-500";
const manualInputCls =
  "h-8 w-full px-2.5 text-xs text-zinc-950 border border-orange-300 bg-orange-100/80 rounded focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition placeholder:text-zinc-600";

function GroupDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mt-5 mb-3">
      <span className="text-[0.58rem] font-semibold text-zinc-600 uppercase tracking-widest whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

const formatWhole = (value: number) => Math.round(value).toLocaleString("en-US");

const formatWeeks = (daysText: string) => {
  const days = parseFloat(daysText || "0") || 0;
  if (days <= 0) return "";
  const weeks = days / 7;
  return Number.isInteger(weeks) ? String(weeks) : weeks.toFixed(1).replace(/\.0$/, "");
};

const levelLabel = (level?: PackagingLevel) => {
  const raw = (level?.pdfLabel || level?.customLevelName || level?.packagingLevel || level?.packagingType || "").trim();
  return raw || "finished units";
};

const levelTypeLabel = (level?: PackagingLevel) => {
  const raw = (level?.customTypeName || level?.packagingType || "").trim();
  return raw && raw !== "-- select type --" ? raw : "";
};

const levelQty = (level?: PackagingLevel) => {
  if (!level) return 0;
  return Number(level.cpoRequiredQty ?? level.units ?? 0) || 0;
};

export default function ProjectInfoSection() {
  const { customer, setCustomerField, selectedBrand, setSelectedBrand, packagingLevels, formData } = useProject();
  const [open, setOpen] = useState(true);
  const lastGeneratedOverview = useRef("");

  const generatedOverview = useMemo(() => {
    const firstLevel = packagingLevels[0];
    const sellableQty = levelQty(firstLevel) || (parseFloat(formData.ppuDenominator || "0") || 0);
    const qtyText = sellableQty > 0 ? formatWhole(sellableQty) : "TBD";
    const productName = (customer.productName || "Product").trim();
    const firstLabel = levelLabel(firstLevel);
    const firstType = levelTypeLabel(firstLevel);
    const unitSize = parseFloat(formData.unitWeight || "0") || 0;
    const unitSizeText = unitSize > 0 ? `${formData.unitWeight} ${formData.unitWeightUnit || "g"}` : "";

    const introParts = [
      `${qtyText} Units`,
      unitSizeText ? `${unitSizeText} per unit` : "",
      `${firstType || productName} packed into ${qtyText} ${firstLabel}`,
    ].filter(Boolean);

    const hierarchy = packagingLevels.slice(1)
      .map((level) => {
        const label = levelLabel(level);
        const perOuter = Number(level.perOuter || 0) || 0;
        const qty = levelQty(level);
        if (perOuter > 0) return `${formatWhole(perOuter)} ct ${label}`;
        if (qty > 0) return `${formatWhole(qty)} ${label}`;
        return label;
      })
      .filter(Boolean);

    const packout = hierarchy.length > 0
      ? `${qtyText} units would be packed out into ${hierarchy.join(", then ")}.`
      : "";
    const weeks = formatWeeks(formData.leadTimeBufferDays);
    const leadTime = weeks ? `Lead time is approx ${weeks} wks.` : "";

    return [
      `Project Overview: ${introParts.join(", ")}.`,
      packout,
      "Shipping/ freight not included.",
      leadTime,
    ].filter(Boolean).join(" ");
  }, [
    customer.productName,
    formData.leadTimeBufferDays,
    formData.ppuDenominator,
    formData.unitWeight,
    formData.unitWeightUnit,
    packagingLevels,
  ]);

  useEffect(() => {
    const current = (customer.projectOverview || "").trim();
    const previousGenerated = lastGeneratedOverview.current.trim();
    const shouldUseGenerated = !current || (previousGenerated && current === previousGenerated);

    if (generatedOverview && shouldUseGenerated && current !== generatedOverview.trim()) {
      setCustomerField("projectOverview", generatedOverview);
    }

    lastGeneratedOverview.current = generatedOverview;
  }, [customer.projectOverview, generatedOverview, setCustomerField]);

  return (
    <div id="section-project-info" className="bg-white border border-gray-200 rounded-xl mx-4 md:mx-6 mt-4 mb-4 overflow-hidden max-w-4xl">
      <div className="px-5 pt-4 pb-5">

        {/* Section header */}
        <div className="flex items-center gap-2 mb-1">
          <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 group">
            <span className="text-sm font-bold text-zinc-950 group-hover:text-[#e8473f] transition-colors">Project Info</span>
            {open
              ? <ChevronUp size={13} className="text-zinc-500 group-hover:text-[#e8473f] transition-colors shrink-0" />
              : <ChevronDown size={13} className="text-zinc-500 group-hover:text-[#e8473f] transition-colors shrink-0" />}
          </button>
        </div>

        {open && (
          <div className="max-w-4xl">
            {/* -- CUSTOMER INFO -- */}
            <GroupDivider label="Customer Info" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              <div className="col-span-2">
                <label className={labelCls}>Account Name</label>
                <CompanySearchInput />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Deal Search</label>
                <DealSearchInput />
              </div>
              <div>
                <label className={labelCls}>Customer ID</label>
                <input type="text" value={customer.customerId}
                  onChange={e => setCustomerField("customerId", e.target.value)}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Contact Name</label>
                <input type="text" value={customer.name}
                  onChange={e => setCustomerField("name", e.target.value)}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input type="text" value={customer.phone}
                  onChange={e => setCustomerField("phone", e.target.value)}
                  className={inputCls} />
              </div>
              <div className="col-span-2 sm:col-span-4">
                <label className={labelCls}>Email</label>
                <input type="text" value={customer.email}
                  onChange={e => setCustomerField("email", e.target.value)}
                  className={inputCls} />
              </div>
            </div>

            {/* -- PRODUCT -- */}
            <GroupDivider label="Product" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              <div className="col-span-2">
                <label className={labelCls}>Product Name</label>
                <input type="text" value={customer.productName}
                  onChange={e => setCustomerField("productName", e.target.value)}
                  className={manualInputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Product Category</label>
                <input type="text" value={customer.productCategory}
                  onChange={e => setCustomerField("productCategory", e.target.value)}
                  placeholder="e.g. Beverage, Snack, Supplement"
                  className={manualInputCls} />
              </div>
            </div>

            {/* -- SALES REPRESENTATIVE -- */}
            <GroupDivider label="Sales Representative" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              <div className="col-span-2">
                <label className={labelCls}>Brand</label>
                <div className="flex gap-2 flex-wrap mt-0.5">
                  {BRANDS.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedBrand(b.id)}
                      className={`h-7 px-3 text-[0.65rem] font-semibold rounded-full border transition-all whitespace-nowrap ${
                        selectedBrand === b.id
                          ? "text-white border-transparent shadow-sm"
                          : "bg-white text-zinc-600 border-gray-200 hover:border-gray-400"
                      }`}
                      style={selectedBrand === b.id ? { backgroundColor: b.accent, borderColor: b.accent } : {}}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Sales Rep</label>
                <input type="text" value={customer.salesRep}
                  onChange={e => setCustomerField("salesRep", e.target.value)}
                  className={manualInputCls} />
              </div>
            </div>

            {/* Project Overview */}
            <div className="mt-4">
              <div className="flex items-center justify-between gap-3 mb-1">
                <label className="text-[0.58rem] font-semibold text-zinc-600 uppercase tracking-wider block">
                  Project Overview (auto-generated; editable)
                </label>
                <button
                  type="button"
                  onClick={() => setCustomerField("projectOverview", generatedOverview)}
                  className="h-6 px-2 text-[0.6rem] font-semibold text-zinc-700 bg-white border border-gray-200 rounded hover:border-[#e8473f] hover:text-[#e8473f] transition"
                >
                  Reset to generated
                </button>
              </div>
              <textarea
                value={customer.projectOverview}
                onChange={(e) => setCustomerField("projectOverview", e.target.value)}
                rows={2}
                className="w-full px-2.5 py-1.5 text-xs text-zinc-950 border border-orange-300 bg-orange-100/80 rounded focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition placeholder:text-zinc-600 resize-none"
                placeholder="Auto-generated from project data..."
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
