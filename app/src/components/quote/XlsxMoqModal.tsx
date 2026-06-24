import { useState } from "react";
import { X, Download, TableProperties } from "lucide-react";
import { MoqPricingRow } from "@/lib/ProjectContext";

interface Props {
  moqResults:    MoqPricingRow[];
  defaultMoqId:  number;
  generating:    boolean;
  onConfirm:     (selected: MoqPricingRow) => void;
  onClose:       () => void;
}

const fmt    = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

export default function XlsxMoqModal({ moqResults, defaultMoqId, generating, onConfirm, onClose }: Props) {
  const [selectedId, setSelectedId] = useState<number>(defaultMoqId);

  const selected = moqResults.find((r) => r.moqRow.id === selectedId) ?? moqResults[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-[#e8473f] px-6 py-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-xl p-2.5">
              <TableProperties size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Select MOQ for Export</h2>
              <p className="text-[0.7rem] text-white/70 mt-0.5">Choose which MOQ to populate in the Excel template</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white transition-colors mt-0.5">
            <X size={18} />
          </button>
        </div>

        {/* MOQ table */}
        <div className="px-6 pt-5 pb-2">
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="py-2 px-3 text-left text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider w-6" />
                  <th className="py-2 px-3 text-left text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider">MOQ</th>
                  <th className="py-2 px-3 text-left text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider">Case Pack</th>
                  <th className="py-2 px-3 text-right text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider">Cost PPU</th>
                  <th className="py-2 px-3 text-right text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider">Customer PPU</th>
                  <th className="py-2 px-3 text-right text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider">Margin %</th>
                  <th className="py-2 px-3 text-right text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wider">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {moqResults.map((r) => {
                  const isSelected = r.moqRow.id === selectedId;
                  return (
                    <tr
                      key={r.moqRow.id}
                      onClick={() => setSelectedId(r.moqRow.id)}
                      className={`border-b border-gray-50 last:border-0 cursor-pointer transition-colors ${
                        isSelected ? "bg-[#e8473f]/8" : "hover:bg-gray-50/70"
                      }`}
                    >
                      {/* Radio indicator */}
                      <td className="py-3 px-3">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isSelected ? "border-[#e8473f]" : "border-gray-300"
                        }`}>
                          {isSelected && <div className="w-2 h-2 rounded-full bg-[#e8473f]" />}
                        </div>
                      </td>
                      <td className={`py-3 px-3 font-semibold ${isSelected ? "text-[#e8473f]" : "text-gray-900"}`}>
                        {r.moqRow.moq || "—"}
                      </td>
                      <td className="py-3 px-3 text-gray-600">{r.casePack}</td>
                      <td className="py-3 px-3 text-right text-gray-700">{r.ppuCost > 0 ? fmt(r.ppuCost) : "—"}</td>
                      <td className="py-3 px-3 text-right text-gray-700">{r.ppu > 0 ? fmt(r.ppu) : "—"}</td>
                      <td className="py-3 px-3 text-right text-gray-700">{r.marginPct > 0 ? fmtPct(r.marginPct) : "—"}</td>
                      <td className="py-3 px-3 text-right text-gray-700">{r.totalCustomerPrice > 0 ? fmt(r.totalCustomerPrice) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-5 flex gap-3">
          <button
type="button"             onClick={onClose}
            className="flex-1 h-11 text-sm font-medium text-gray-600 border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
type="button"             onClick={() => selected && onConfirm(selected)}
            disabled={generating || !selected}
            className="flex-1 h-11 text-sm font-bold text-white bg-[#e8473f] hover:bg-[#d43f37] disabled:opacity-40 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm shadow-[#e8473f]/30"
          >
            <Download size={15} />
            {generating ? "Generating…" : `Download Excel (${selected?.moqRow.moq ?? "—"} MOQ)`}
          </button>
        </div>

      </div>
    </div>
  );
}
