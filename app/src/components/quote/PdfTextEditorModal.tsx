import { useState } from "react";
import { X, FileText } from "lucide-react";
import { CustomerInfo } from "@/lib/generateQuotePDF";

interface Props {
  initial: CustomerInfo;
  onConfirm: (overrides: CustomerInfo) => void;
  onClose: () => void;
}

const labelCls = "text-[0.58rem] font-semibold text-zinc-600 uppercase tracking-wider mb-1 block";
const inputCls =
  "h-8 w-full px-2.5 text-xs text-zinc-950 border border-amber-200 bg-amber-50/50 rounded focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition placeholder:text-zinc-500";

const SECTIONS = [
  {
    title: "Customer Info",
    fields: [
      { key: "customer",    label: "Company",       placeholder: "Company name" },
      { key: "customerId",  label: "Customer ID",   placeholder: "-" },
      { key: "name",        label: "Contact Name",  placeholder: "-" },
      { key: "phone",       label: "Phone",         placeholder: "-" },
      { key: "email",       label: "Email",         placeholder: "-" },
      { key: "salesRep",    label: "Sales Rep",     placeholder: "-" },
    ] as { key: keyof CustomerInfo; label: string; placeholder: string }[],
  },
  {
    title: "Product",
    fields: [
      { key: "productName",     label: "Product Name",     placeholder: "-" },
      { key: "productCategory", label: "Product Category", placeholder: "e.g. Beverage, Snack" },
    ] as { key: keyof CustomerInfo; label: string; placeholder: string }[],
  },
];

export default function PdfTextEditorModal({ initial, onConfirm, onClose }: Props) {
  const [draft, setDraft] = useState<CustomerInfo>({ ...initial });

  const set = (key: keyof CustomerInfo, val: string) =>
    setDraft(d => ({ ...d, [key]: val }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <FileText size={16} className="text-[#e8473f] shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-zinc-950">Edit PDF Text</p>
            <p className="text-[0.6rem] text-zinc-600 mt-0.5">Changes apply to this PDF only - project data is unchanged.</p>
          </div>
          <button type="button" onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-zinc-600 hover:bg-gray-100 hover:text-zinc-950 transition-colors shrink-0">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 space-y-5 flex-1" style={{ maxHeight: "70vh" }}>

          {SECTIONS.map(section => (
            <div key={section.title}>
              <p className="text-[0.58rem] font-semibold text-zinc-600 uppercase tracking-widest mb-2">{section.title}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {section.fields.map(f => (
                  <div key={f.key}>
                    <label className={labelCls}>{f.label}</label>
                    <input
                      type="text"
                      value={draft[f.key] as string}
                      onChange={e => set(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className={inputCls}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Project Overview - full width textarea */}
          <div>
            <p className="text-[0.58rem] font-semibold text-zinc-600 uppercase tracking-widest mb-2">Project Overview</p>
            <label className={labelCls}>Overview Text</label>
            <textarea
              value={draft.projectOverview}
              onChange={e => set("projectOverview", e.target.value)}
              rows={5}
              placeholder="Describe the project scope, requirements, or any notes for the customer..."
              className="w-full px-2.5 py-2 text-xs text-zinc-950 border border-amber-200 bg-amber-50/50 rounded focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-[#e8473f] transition placeholder:text-zinc-500 resize-y"
            />
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50/60">
          <button type="button" onClick={onClose}
            className="h-8 px-4 text-xs font-semibold text-zinc-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm(draft)}
            className="h-8 px-4 text-xs font-semibold text-white rounded-lg transition-colors"
            style={{ backgroundColor: "#e8473f" }}>
            Generate PDF
          </button>
        </div>

      </div>
    </div>
  );
}
