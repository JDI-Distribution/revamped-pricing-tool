import { useEffect, useRef, useState } from "react";
import { useProject } from "@/lib/ProjectContext";

const GRAMS_PER: Record<string, number> = {
  g: 1, kg: 1000, oz: 28.3495, lbs: 453.592, lb: 453.592,
  "fl oz": 29.5735, mL: 1, L: 1000, mg: 0.001,
};

interface OutputRow { label: string; value: string }

function Panel({ title, rows }: { title: string; rows: OutputRow[] }) {
  const ROW = "flex items-start justify-between gap-3 py-2 border-b border-[#dde8f0] last:border-0";
  const LBL = "text-[0.7rem] text-[#4a6080] leading-tight";
  const VAL = "text-[0.72rem] font-bold text-zinc-900 tabular-nums text-right shrink-0 ml-2";
  return (
    <>
      <p className="text-[0.55rem] font-semibold text-[#4a6080] uppercase tracking-widest mb-3">{title}</p>
      {rows.map(r => (
        <div key={r.label} className={ROW}>
          <span className={LBL}>{r.label}</span>
          <span className={VAL}>{r.value}</span>
        </div>
      ))}
    </>
  );
}

interface Props {
  style?: React.CSSProperties;
}

export default function SectionOutputsPanel({ style }: Props) {
  const { packagingLevels, formData } = useProject();
  const [activeSection, setActiveSection] = useState<string>("section-project-info");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const sectionIds = [
      "section-project-info",
      "section-cpo",
      "section-raw-materials",
      "section-testing",
      "section-blending",
      "section-packaging",
      "section-processes",
      "section-palletization",
      "section-moq",
    ];

    const ratios: Record<string, number> = {};

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => { ratios[e.target.id] = e.intersectionRatio; });
        const best = Object.entries(ratios).sort((a, b) => b[1] - a[1])[0];
        if (best && best[1] > 0) setActiveSection(best[0]);
      },
      { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
    );

    sectionIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) observerRef.current!.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, []);

  // ── Shared formatters ──────────────────────────────────────────────────────
  const fmtN  = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const fmtN3 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
  const fmtD  = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const v     = (n: number, fmt: (n: number) => string) => n > 0 ? fmt(n) : "—";

  // ── CPO packaging required qtys ───────────────────────────────────────────
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
  const baseQty  = indivIdx >= 0 ? (packagingRequiredQtys[indivIdx] ?? 0) : (packagingRequiredQtys[0] ?? 0);

  // ── Section output definitions ─────────────────────────────────────────────
  function getCpoRows(): OutputRow[] {
    const setupOur = parseFloat(formData.setupFeeOur) || 0;
    const leadDays = parseFloat(formData.leadTimeBufferDays) || 0;
    const totalGramsReq = baseQty * unitWeightG;
    return [
      ...packagingLevels.map((lvl, i) => ({
        label: `Total Kit Units — ${lvl.customLevelName?.trim() || lvl.packagingLevel || `Level ${i + 1}`}`,
        value: v(packagingRequiredQtys[i] ?? 0, fmtN),
      })),
      { label: "Total Grams Req (g)", value: v(totalGramsReq, fmtN) },
      { label: "Project / Line Setup + QA — Our Cost", value: v(setupOur, fmtD) },
      { label: "Lead Time — Days", value: v(leadDays, fmtN) },
      { label: "Lead Time — Weeks", value: leadDays > 0 ? (leadDays / 7).toFixed(1) : "—" },
    ];
  }

  function getRawMatRows(): OutputRow[] {
    const overagePct = parseFloat(formData.materialOverage as string) || 0;
    const reqGrams = Math.ceil(baseQty * (1 + overagePct / 100)) * unitWeightG;
    const reqOz    = reqGrams / 28.3495;
    const reqLbs   = reqGrams / 453.592;
    const productSKUs        = parseFloat(formData.numSkus as string) || 0;
    const numberOfPallets    = parseFloat(formData.numPallets as string) || 0;
    const intakeFeePerPallet = parseFloat(formData.intakeFee as string) || 0;
    const testingFeePerSku   = (formData.testingRows ?? []).reduce((s, r) => s + (r.cost ?? 0), 0);
    const costPerGramVal     = parseFloat(formData.costPerGram as string) || 0;
    const totalWeightG       = baseQty * unitWeightG;
    return [
      { label: "Materials — Req (g)",             value: v(reqGrams,           fmtN3) },
      { label: "Materials — Req (oz)",             value: v(reqOz,              fmtN3) },
      { label: "Materials — Req (lbs)",            value: v(reqLbs,             fmtN3) },
      { label: "Materials — # of SKUs",            value: v(productSKUs,        fmtN)  },
      { label: "Materials — # of Pallets",         value: v(numberOfPallets,    fmtN)  },
      { label: "Materials — Intake fee / pallet",  value: v(intakeFeePerPallet, fmtD)  },
      { label: "Materials — Testing fee / sku",    value: v(testingFeePerSku,   fmtD)  },
      { label: "Materials — Cost per gram",        value: v(costPerGramVal,     fmtD)  },
      { label: "Materials — Total Weight (g)",     value: v(totalWeightG,       fmtN3) },
    ];
  }

  function getTestingRows(): OutputRow[] {
    const numSkus       = parseFloat(formData.numSkus || "0") || 0;
    const testingMarkup = parseFloat(formData.testingMarkup || "0") || 0;
    const rows          = formData.testingRows ?? [];
    const totalPerSku   = rows.reduce((s, r) => s + (r.cost ?? 0), 0);
    const totalOur      = totalPerSku * numSkus;
    const totalCx       = totalOur * (1 + testingMarkup / 100);
    return [
      { label: "# of SKUs",            value: v(numSkus,      fmtN) },
      { label: "Testing — Cost / SKU", value: v(totalPerSku,  fmtD) },
      { label: "Testing — Our Total",  value: v(totalOur,     fmtD) },
      { label: "Testing — Markup",     value: testingMarkup > 0 ? `${testingMarkup}%` : "—" },
      { label: "Testing — Cx Total",   value: v(totalCx,      fmtD) },
    ];
  }

  // ── Select content based on active section ─────────────────────────────────
  let title = "Outputs";
  let rows: OutputRow[] = [];

  if (activeSection === "section-cpo") {
    title = "CPO Outputs";
    rows  = getCpoRows();
  } else if (activeSection === "section-raw-materials") {
    title = "Raw Material Outputs";
    rows  = getRawMatRows();
  } else if (activeSection === "section-testing") {
    title = "Testing Outputs";
    rows  = getTestingRows();
  } else if (activeSection === "section-project-info") {
    title = "CPO Outputs";
    rows  = getCpoRows();
  } else {
    title = "CPO Outputs";
    rows  = getCpoRows();
  }

  if (rows.length === 0) return null;

  return (
    <div
      className="fixed z-10 w-52 bg-[#f0f4f8] border border-[#c8d8e8] rounded-xl p-4 shadow-sm overflow-y-auto max-h-[calc(100vh-80px)]"
      style={style}
    >
      <Panel title={title} rows={rows} />
    </div>
  );
}
