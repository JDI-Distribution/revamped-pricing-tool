import { useProject } from "@/lib/ProjectContext";

const GRAMS_PER: Record<string, number> = { g: 1, kg: 1000, oz: 28.3495, lbs: 453.592, "fl oz": 29.5735, mL: 1, L: 1000, lb: 453.592, mg: 0.001 };

interface Props {
  style?: React.CSSProperties;
}

export default function CpoOutputsPanel({ style }: Props) {
  const { packagingLevels, formData } = useProject();

  const packagingRequiredQtys: number[] = [];
  for (let i = 0; i < packagingLevels.length; i++) {
    const lvl = packagingLevels[i];
    if (!lvl.unitsRefId) {
      packagingRequiredQtys.push(lvl.units);
    } else {
      const refIdx = packagingLevels.findIndex(l => l.id === lvl.unitsRefId);
      const refQty = refIdx >= 0 ? packagingRequiredQtys[refIdx] ?? 0 : 0;
      packagingRequiredQtys.push(lvl.units > 0 ? Math.ceil(refQty / lvl.units) : 0);
    }
  }

  const unitWeightG = (parseFloat(formData.unitWeight) || 0) * (GRAMS_PER[formData.unitWeightUnit ?? "g"] ?? 1);
  const indivIdx = packagingLevels.findIndex(l => l.packagingLevel === "Individual Units");
  const gramsBaseQty = indivIdx >= 0 ? (packagingRequiredQtys[indivIdx] ?? 0) : (packagingRequiredQtys[0] ?? 0);
  const totalGramsReq = gramsBaseQty * unitWeightG;
  const setupOur = parseFloat(formData.setupFeeOur) || 0;
  const leadDays = parseFloat(formData.leadTimeBufferDays) || 0;
  const fmtN = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const fmtD = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  const ROW = "flex items-start justify-between gap-2 py-2 border-b border-[#dde8f0] last:border-0";
  const LBL = "text-[0.7rem] text-[#4a6080] leading-tight";
  const VAL = "text-[0.75rem] font-bold text-gray-800 tabular-nums text-right shrink-0 ml-2";

  return (
    <div
      className="fixed z-10 w-52 bg-[#f0f4f8] border border-[#c8d8e8] rounded-xl p-4 shadow-sm overflow-y-auto max-h-[calc(100vh-80px)]"
      style={style}
    >
      <p className="text-[0.55rem] font-semibold text-[#4a6080] uppercase tracking-widest mb-3">Outputs</p>

      {packagingLevels.length > 0 && packagingLevels.map((lvl, i) => {
        const qty = packagingRequiredQtys[i] ?? 0;
        const name = lvl.customLevelName?.trim() || lvl.packagingLevel || `Level ${i + 1}`;
        return (
          <div key={lvl.id} className={ROW}>
            <span className={LBL}>Total Kit Units — {name}</span>
            <span className={VAL}>{qty > 0 ? fmtN(qty) : "—"}</span>
          </div>
        );
      })}

      <div className={ROW}>
        <span className={LBL}>Total Grams Req (g)</span>
        <span className={VAL}>{totalGramsReq > 0 ? fmtN(totalGramsReq) : "—"}</span>
      </div>
      <div className={ROW}>
        <span className={LBL}>Project / Line Setup + QA — Our Cost</span>
        <span className={VAL}>{setupOur > 0 ? fmtD(setupOur) : "—"}</span>
      </div>
      <div className={ROW}>
        <span className={LBL}>Lead Time — Days</span>
        <span className={VAL}>{leadDays > 0 ? fmtN(leadDays) : "—"}</span>
      </div>
      <div className={ROW}>
        <span className={LBL}>Lead Time — Weeks</span>
        <span className={VAL}>{leadDays > 0 ? (leadDays / 7).toFixed(1) : "—"}</span>
      </div>
    </div>
  );
}
