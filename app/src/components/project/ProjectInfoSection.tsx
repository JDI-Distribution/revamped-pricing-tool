import { useProject } from "@/lib/ProjectContext";
import { BRANDS } from "@/lib/generateQuotePDF";
import { CustomerInfo } from "@/lib/generateQuotePDF";

const labelCls = "text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider mb-0.5 block";
const inputCls =
  "h-7 w-full px-2 text-xs text-gray-900 border border-amber-200 bg-amber-50/50 focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition placeholder:text-gray-300";

const FIELDS: [keyof CustomerInfo, string][] = [
  ["customer",    "Company"],
  ["customerId",  "Customer ID"],
  ["name",        "Contact Name"],
  ["phone",       "Phone"],
  ["email",       "Email"],
  ["salesRep",    "Sales Rep"],
  ["productName", "Product Name"],
];

export default function ProjectInfoSection() {
  const { customer, setCustomerField, selectedBrand, setSelectedBrand } = useProject();

  return (
    <div className="px-4 pt-4 pb-3">
      <div className="border border-gray-100 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2">
          <div className="w-1 h-3.5 rounded-full bg-[#e8473f] shrink-0" />
          <span className="text-[0.6rem] font-bold uppercase tracking-widest text-gray-400">Project Info</span>
        </div>

        <div className="p-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-0 items-start">
          {/* Left — Brand selector */}
          <div className="flex flex-col gap-1.5 pt-0.5">
            <span className={labelCls}>Brand</span>
            <div className="flex flex-col gap-1.5">
              {BRANDS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBrand(b.id)}
                  className={`h-6 px-3 text-[0.65rem] font-semibold rounded-full border transition-all whitespace-nowrap text-left ${
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

          {/* Right — Customer fields grid */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {FIELDS.map(([field, label]) => (
              <div key={field}>
                <label className={labelCls}>{label}</label>
                <input
                  type="text"
                  value={customer[field]}
                  onChange={(e) => setCustomerField(field, e.target.value)}
                  className={inputCls}
                />
              </div>
            ))}
            {/* Spacer to keep grid aligned when odd number of fields */}
            <div />
          </div>
        </div>

        {/* Project Overview — full width below grid */}
        <div className="px-4 pb-3">
          <label className={labelCls}>Project Overview (leave blank to auto-generate)</label>
          <textarea
            value={customer.projectOverview}
            onChange={(e) => setCustomerField("projectOverview", e.target.value)}
            rows={2}
            className="w-full px-2 py-1.5 text-xs text-gray-900 border border-amber-200 bg-amber-50/50 focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition placeholder:text-gray-300 resize-none"
            placeholder="Auto-generated from project data if left blank…"
          />
        </div>
      </div>
    </div>
  );
}
