import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useProject } from "@/lib/ProjectContext";
import { RequiredToggle, useSectionRequired } from "@/lib/SectionRequiredContext";
import { BRANDS } from "@/lib/generateQuotePDF";
import CompanySearchInput from "./CompanySearchInput";

const labelCls = "text-[0.58rem] font-semibold text-gray-400 uppercase tracking-wider mb-1 block";
const inputCls =
  "h-8 w-full px-2.5 text-xs text-gray-900 border border-amber-200 bg-amber-50/50 rounded focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition placeholder:text-gray-300";

const PROJECT_TYPE_OPTS = [
  { val: "standard"  as const, label: "Standard"      },
  { val: "copacking" as const, label: "Co-Packing (Customer-Supplied)" },
];

function GroupDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mt-5 mb-3">
      <span className="text-[0.58rem] font-semibold text-gray-400 uppercase tracking-widest whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

export default function ProjectInfoSection() {
  const { customer, setCustomerField, selectedBrand, setSelectedBrand, projectType, setProjectType } = useProject();
  const [open, setOpen] = useState(true);
  const { notRequired } = useSectionRequired();
  const isNR = !!notRequired["section-project-info"];

  return (
    <div id="section-project-info" className="bg-white border border-gray-200 rounded-xl mx-4 md:mx-6 mt-4 mb-4 overflow-hidden max-w-4xl">
      <div className="px-5 pt-4 pb-5">

        {/* Section header */}
        <div className="flex items-center gap-2 mb-1">
          <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 group">
            <span className="text-sm font-bold text-gray-900 group-hover:text-[#e8473f] transition-colors">Project Info</span>
            {open && !isNR
              ? <ChevronUp size={13} className="text-gray-300 group-hover:text-[#e8473f] transition-colors shrink-0" />
              : <ChevronDown size={13} className="text-gray-300 group-hover:text-[#e8473f] transition-colors shrink-0" />}
          </button>
          <div className="ml-auto shrink-0"><RequiredToggle sectionId="section-project-info" /></div>
        </div>

        {open && !isNR && (
          <div className="max-w-4xl">
            {/* Project Type */}
            <div className="flex gap-5 mt-3 mb-1">
              {PROJECT_TYPE_OPTS.map(opt => (
                <label key={opt.val} className="flex items-center gap-2 cursor-pointer group">
                  <span className={`w-3.5 h-3.5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
                    projectType === opt.val
                      ? "border-[#e8473f] bg-[#e8473f]"
                      : "border-gray-300 group-hover:border-[#e8473f]/60"
                  }`}>
                    {projectType === opt.val && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  <button type="button" onClick={() => setProjectType(opt.val)}
                    className={`text-[0.7rem] text-left transition-colors ${projectType === opt.val ? "font-semibold text-gray-900" : "text-gray-500"}`}>
                    {opt.label}
                  </button>
                </label>
              ))}
            </div>

            {/* ── CUSTOMER INFO ── */}
            <GroupDivider label="Customer Info" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              <div>
                <label className={labelCls}>Company</label>
                <CompanySearchInput />
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

            {/* ── PRODUCT ── */}
            <GroupDivider label="Product" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              <div className="col-span-2">
                <label className={labelCls}>Product Name</label>
                <input type="text" value={customer.productName}
                  onChange={e => setCustomerField("productName", e.target.value)}
                  className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Product Category</label>
                <input type="text" value={customer.productCategory}
                  onChange={e => setCustomerField("productCategory", e.target.value)}
                  placeholder="e.g. Beverage, Snack, Supplement"
                  className={inputCls} />
              </div>
            </div>

            {/* ── SALES REPRESENTATIVE ── */}
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
                          : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
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
                  className={inputCls} />
              </div>
            </div>

            {/* Project Overview */}
            <div className="mt-4">
              <label className={labelCls}>Project Overview (leave blank to auto-generate)</label>
              <textarea
                value={customer.projectOverview}
                onChange={(e) => setCustomerField("projectOverview", e.target.value)}
                rows={2}
                className="w-full px-2.5 py-1.5 text-xs text-gray-900 border border-amber-200 bg-amber-50/50 rounded focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition placeholder:text-gray-300 resize-none"
                placeholder="Auto-generated from project data if left blank…"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
