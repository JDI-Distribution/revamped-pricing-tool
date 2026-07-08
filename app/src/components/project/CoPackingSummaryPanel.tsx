import { useProject } from "@/lib/ProjectContext";

const fmt  = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN = (n: number, dec = 0) => n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });

export default function CoPackingSummaryPanel() {
  const { coPackingResults, coPackingTotals } = useProject();
  const { totalOur, totalCustomer, margin } = coPackingTotals;

  const thCls = "text-[0.55rem] font-semibold text-zinc-600 uppercase tracking-widest text-right pb-2 px-2";
  const tdCls = "text-xs text-right px-2 py-1.5 text-zinc-800 tabular-nums";
  const tdLbl = "text-xs px-2 py-1.5 text-zinc-700";

  const marginColor =
    margin >= 35 ? "text-green-600" :
    margin >= 25 ? "text-amber-500" :
    "text-red-500";

  return (
    <div className="p-4 space-y-4">
      {/* Line items */}
      <div>
        <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-600 mb-2">Cost Breakdown</p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-[0.55rem] font-semibold text-zinc-600 uppercase tracking-widest pb-2 px-2">Line Item</th>
              <th className={thCls}>Qty</th>
              <th className={thCls}>Our Cost</th>
              <th className={thCls}>Price</th>
              <th className={thCls}>PPU</th>
            </tr>
          </thead>
          <tbody>
            {coPackingResults.map((r, i) => (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className={tdLbl}>
                  <p className="font-medium text-zinc-900">{r.label}</p>
                  {r.description && <p className="text-[0.6rem] text-zinc-600">{r.description}</p>}
                </td>
                <td className={tdCls}>{fmtN(r.deliveredQty)}</td>
                <td className={tdCls}>{fmt(r.ourCost)}</td>
                <td className={tdCls}>{fmt(r.customerPrice)}</td>
                <td className={tdCls}>{fmt(r.ppu)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 font-semibold">
              <td className="px-2 py-2 text-xs text-zinc-950">Total</td>
              <td />
              <td className="text-xs text-right px-2 py-2 tabular-nums text-zinc-800">{fmt(totalOur)}</td>
              <td className="text-xs text-right px-2 py-2 tabular-nums text-zinc-950">{fmt(totalCustomer)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Margin summary */}
      <div className="border border-gray-100 rounded-lg p-3 grid grid-cols-3 gap-3">
        <div className="text-center">
          <p className="text-[0.55rem] font-semibold text-zinc-600 uppercase tracking-widest mb-0.5">Our Cost</p>
          <p className="text-sm font-bold text-zinc-900">{fmt(totalOur)}</p>
        </div>
        <div className="text-center border-x border-gray-100">
          <p className="text-[0.55rem] font-semibold text-zinc-600 uppercase tracking-widest mb-0.5">Revenue</p>
          <p className="text-sm font-bold text-zinc-900">{fmt(totalCustomer)}</p>
        </div>
        <div className="text-center">
          <p className="text-[0.55rem] font-semibold text-zinc-600 uppercase tracking-widest mb-0.5">Margin</p>
          <p className={`text-sm font-bold ${marginColor}`}>{margin.toFixed(1)}%</p>
        </div>
      </div>
    </div>
  );
}
