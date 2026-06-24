import { createContext, useContext, useState, ReactNode } from "react";

type RequiredState = Record<string, boolean>; // sectionId -> true means "not required"

interface SectionRequiredCtx {
  notRequired: RequiredState;
  toggle: (id: string) => void;
}

const Ctx = createContext<SectionRequiredCtx | null>(null);

export function SectionRequiredProvider({ children }: { children: ReactNode }) {
  const [notRequired, setNotRequired] = useState<RequiredState>({});
  const toggle = (id: string) =>
    setNotRequired(prev => ({ ...prev, [id]: !prev[id] }));
  return <Ctx.Provider value={{ notRequired, toggle }}>{children}</Ctx.Provider>;
}

export function useSectionRequired() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSectionRequired must be used inside SectionRequiredProvider");
  return ctx;
}

/** Drop-in toggle badge for section headers */
export function RequiredToggle({ sectionId }: { sectionId: string }) {
  const { notRequired, toggle } = useSectionRequired();
  const isNotRequired = !!notRequired[sectionId];
  return (
    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-[0.6rem] font-semibold ml-2 shrink-0">
      <button
        type="button"
        onClick={() => !isNotRequired || toggle(sectionId)}
        className={`px-3 py-1 transition-colors ${!isNotRequired ? "bg-gray-800 text-white" : "text-gray-400 hover:text-gray-600"}`}
      >
        Required
      </button>
      <button
        type="button"
        onClick={() => isNotRequired || toggle(sectionId)}
        className={`px-3 py-1 transition-colors ${isNotRequired ? "bg-gray-400 text-white" : "text-gray-400 hover:text-gray-600"}`}
      >
        Not Required
      </button>
    </div>
  );
}
