import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";

export interface SidebarSection {
  id:      string;
  label:   string;
  visible: boolean;
}

interface Props {
  sections: SidebarSection[];
}

// Navbar height = py-3 (12px × 2) + md:h-10 logo (40px) = 64px = top-16
const NAVBAR_H = 64;

export default function SectionSidebar({ sections }: Props) {
  const [activeId,   setActiveId]   = useState<string>("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleSections = sections.filter(s => s.visible);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    const ids = visibleSections.map(s => s.id);
    const intersecting = new Set<string>();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            intersecting.add(entry.target.id);
          } else {
            intersecting.delete(entry.target.id);
          }
        });
        const active = ids.find(id => intersecting.has(id));
        if (active) setActiveId(active);
      },
      {
        root:       null,
        rootMargin: "-10% 0px -60% 0px",
        threshold:  0,
      }
    );

    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) observerRef.current!.observe(el);
    });

    return () => observerRef.current?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections.map(s => `${s.id}:${s.visible}`).join(",")]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) { setMobileOpen(false); return; }

    // Check if the element lives inside the right panel's own scroll container.
    // scrollIntoView only scrolls the nearest scrollable ancestor, and the right
    // panel is overflow:hidden at the outer level, so we must scroll it manually.
    const rightPanel = document.getElementById("right-panel-scroll");
    if (rightPanel && rightPanel.contains(el)) {
      // getBoundingClientRect gives viewport-relative positions; combining with
      // current scrollTop gives the true offset within the scroll container.
      const targetTop = el.getBoundingClientRect().top
                      - rightPanel.getBoundingClientRect().top
                      + rightPanel.scrollTop
                      - 8;
      rightPanel.scrollTo({ top: targetTop, behavior: "smooth" });
    } else {
      const targetTop = el.getBoundingClientRect().top + window.scrollY - NAVBAR_H - 8;
      window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    }

    setMobileOpen(false);
  };

  const navItems = (
    <nav className="flex flex-col gap-0.5 px-2 pt-1">
      {visibleSections.map(s => {
        const isActive = s.id === activeId;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => scrollTo(s.id)}
            className={`
              w-full text-left px-2.5 py-1.5 rounded-md text-[0.68rem] font-medium
              uppercase tracking-wider transition-all duration-100
              border-l-[3px]
              ${isActive
                ? "border-[#e8473f] text-[#e8473f] bg-red-50/60 font-semibold"
                : "border-transparent text-zinc-600 hover:text-zinc-800 hover:bg-gray-100/60"
              }
            `}
          >
            {s.label}
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* ── Desktop sidebar — fixed, starts below navbar (top-16 = 64px) ── */}
      <aside
        className="hidden lg:flex flex-col fixed left-0 bottom-0 w-42 bg-[#fafafa] border-r border-gray-200 z-30"
        style={{ top: NAVBAR_H }}
      >
        <div className="px-3 pt-3 pb-2">
          <span className="text-[0.58rem] font-bold uppercase tracking-[0.12em] text-zinc-500">Sections</span>
        </div>
        <div className="flex-1 overflow-y-auto pb-4 scrollbar-hide">
          {navItems}
        </div>
      </aside>

      {/* ── Mobile hamburger ── */}
      <div className="lg:hidden fixed bottom-5 left-4 z-40">
        <button
          type="button"
          onClick={() => setMobileOpen(o => !o)}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow-lg text-zinc-600 hover:text-[#e8473f] transition-colors"
        >
          {mobileOpen ? <X size={16} /> : <Menu size={16} />}
        </button>
      </div>

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-39 bg-black/30"
          onClick={() => setMobileOpen(false)}
        />
      )}
      {mobileOpen && (
        <aside
          className="lg:hidden fixed left-0 bottom-0 w-48 bg-white border-r border-gray-200 z-40 shadow-xl"
          style={{ top: NAVBAR_H }}
        >
          <div className="px-3 pt-3 pb-2">
            <span className="text-[0.58rem] font-bold uppercase tracking-[0.12em] text-zinc-500">Sections</span>
          </div>
          {navItems}
        </aside>
      )}
    </>
  );
}
