import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight, ChevronLeft, FolderOpen, LogOut, Menu, X, UserCircle } from "lucide-react";
import logo from "@/assets/JDI_Distribution_Logo.png";
import MarginCalculator from "@/components/MarginCalculator";
import ConversionCalculator from "@/components/ConversionCalculator";
import NavbarSaveButton from "@/components/navbar/NavbarSaveButton";
import { useProject } from "@/lib/ProjectContext";
import { goToCatalystLogin, signOutOfCatalyst } from "@/lib/catalystAuth";

const navLinks = [
  { label: "Home",                  href: "/",                    drawer: null },
  { label: "Analytics",             href: "/analytics",           drawer: null },
  { label: "Margin Calculator",     href: "/margin-calculator",   drawer: "margin" as const },
  { label: "Conversion Calculator", href: "/conversion-calculator", drawer: "conversion" as const },
];

const linkCls = "text-sm text-zinc-700 hover:text-zinc-950 transition-colors pb-1 border-b-2 border-transparent hover:border-[#e8473f]";

export default function Navbar() {
  const { pathname } = useLocation();
  const isQuotePage  = pathname === "/quote";
  const isSavedPage  = pathname === "/saved-quotes";
  const [menuOpen,      setMenuOpen]      = useState(false);
  const [marginOpen,    setMarginOpen]    = useState(false);
  const [conversionOpen, setConversionOpen] = useState(false);
  const { currentUser, currentUserLoading } = useProject();

  const handleSignOut = async () => {
    const signedOut = await signOutOfCatalyst();
    if (!signedOut) window.location.href = "/app/";
  };

  const handleNavClick = (drawer: string | null, e: React.MouseEvent) => {
    if (drawer === "margin") {
      e.preventDefault();
      setMenuOpen(false);
      setMarginOpen(true);
    } else if (drawer === "conversion") {
      e.preventDefault();
      setMenuOpen(false);
      setConversionOpen(true);
    }
  };

  // Called when user applies a margin from the calculator
  const handleApplyMargin = (_moqRowId: number, _adjPPU: number) => {
    // The calculator is read-only for the main quote by default.
    // When the user clicks "Apply to Quote" we close the drawer - the
    // QuotePage's moqPpuInputs/moqMargins state would need to be lifted
    // to the context to fully wire this up; for now we just close.
    setMarginOpen(false);
  };

  return (
    <>
      <nav className="w-full bg-white border-b border-gray-100 sticky top-0 z-30">
        {/* -- Main bar -- */}
        <div className="px-4 md:px-6 py-3 flex items-center gap-4 md:gap-12">
          {/* Logo */}
          <Link to="/" onClick={() => setMenuOpen(false)}>
            <img src={logo} alt="JDI Distribution" style={{ height: 36 }} className="md:h-10" />
          </Link>

          {/* Desktop nav links */}
          <ul className="hidden md:flex items-center gap-8 lg:gap-12">
            {navLinks.map((link) => (
              <li key={link.href}>
                {link.drawer ? (
                  <button
                    type="button"
                    onClick={(e) => handleNavClick(link.drawer, e)}
                    className={`${linkCls} ${
                      (link.drawer === "margin" && marginOpen) || (link.drawer === "conversion" && conversionOpen)
                        ? "border-[#e8473f] text-zinc-950"
                        : ""
                    }`}
                  >
                    {link.label}
                  </button>
                ) : (
                  <Link
                    to={link.href}
                    className={`${linkCls} ${pathname === link.href ? "border-[#e8473f] text-zinc-950" : ""}`}
                  >
                    {link.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>

          {/* Desktop Saved Quotes */}
          <Link
            to="/saved-quotes"
            className={`hidden md:flex items-center gap-1.5 ${linkCls} ${isSavedPage ? "border-[#e8473f] text-zinc-950" : ""}`}
          >
            <FolderOpen size={14} />
            Saved Quotes
          </Link>

          {/* Desktop Save button */}
          <div className="hidden md:flex items-center">
            <NavbarSaveButton />
          </div>

          {/* Desktop Next / Back */}
          <div className="hidden md:flex ml-auto items-center gap-2">
            {currentUser?.authenticated ? (
              <div className="flex h-9 items-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50" title={currentUser.email}>
                <div className="flex items-center gap-2 px-2.5">
                  <UserCircle size={15} className="text-zinc-500" />
                  <div className="leading-tight">
                    <div className="text-[0.7rem] font-semibold text-zinc-800 max-w-36 truncate">{currentUser.name || currentUser.email}</div>
                    <div className="text-[0.58rem] text-zinc-500 max-w-36 truncate">{currentUser.email}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex h-full items-center gap-1 border-l border-gray-200 bg-white px-2 text-[0.65rem] font-semibold text-zinc-600 hover:bg-red-50 hover:text-red-600"
                  title="Sign out"
                >
                  <LogOut size={12} />
                  Sign out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={goToCatalystLogin}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 h-9 text-xs font-semibold text-zinc-700 hover:bg-gray-50"
              >
                <UserCircle size={15} />
                {currentUserLoading ? "Checking..." : "Sign in"}
              </button>
            )}
            {isQuotePage || isSavedPage ? (
              <Link
                to="/"
                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-zinc-800 text-sm font-medium px-5 h-9 rounded-lg transition-colors"
              >
                <ChevronLeft size={15} />
                Back to Pricing
              </Link>
            ) : (
              <Link
                to="/quote"
                className="flex items-center gap-2 bg-[#e8473f] hover:bg-[#d43f37] text-white text-sm font-medium px-5 h-9 rounded-lg transition-colors"
              >
                Next
                <ChevronRight size={15} />
              </Link>
            )}
          </div>

          {/* Mobile: Save + action + hamburger */}
          <div className="flex items-center gap-2 ml-auto md:hidden">
            {currentUser?.authenticated ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-zinc-700"
                title={`Sign out ${currentUser.name || currentUser.email}`}
              >
                <LogOut size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={goToCatalystLogin}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-zinc-700"
                aria-label="Sign in"
                title={currentUserLoading ? "Checking signed-in user" : "Sign in"}
              >
                <UserCircle size={18} />
              </button>
            )}
            {isQuotePage || isSavedPage ? (
              <Link
                to="/"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-1.5 bg-gray-100 text-zinc-800 text-xs font-medium px-3 h-9 min-w-11 justify-center rounded-lg transition-colors"
              >
                <ChevronLeft size={14} />
                Back
              </Link>
            ) : (
              <Link
                to="/quote"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-1.5 bg-[#e8473f] text-white text-xs font-medium px-3 h-9 min-w-11 justify-center rounded-lg transition-colors"
              >
                Next
                <ChevronRight size={14} />
              </Link>
            )}
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center justify-center w-11 h-11 text-zinc-700 hover:text-zinc-950 transition-colors"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* -- Mobile dropdown menu -- */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white shadow-lg">
            <ul className="flex flex-col py-2">
              {navLinks.map((link) => (
                <li key={link.href}>
                  {link.drawer ? (
                    <button
                      type="button"
                      onClick={(e) => { setMenuOpen(false); handleNavClick(link.drawer, e); }}
                      className={`w-full text-left flex items-center px-5 py-3.5 text-sm font-medium transition-colors ${
                        (link.drawer === "margin" && marginOpen) || (link.drawer === "conversion" && conversionOpen)
                          ? "text-[#e8473f] bg-red-50"
                          : "text-zinc-800 hover:bg-gray-50"
                      }`}
                    >
                      {link.label}
                    </button>
                  ) : (
                    <Link
                      to={link.href}
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center px-5 py-3.5 text-sm font-medium transition-colors ${
                        pathname === link.href ? "text-[#e8473f] bg-red-50" : "text-zinc-800 hover:bg-gray-50"
                      }`}
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
              <li>
                <Link
                  to="/saved-quotes"
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors ${
                    isSavedPage ? "text-[#e8473f] bg-red-50" : "text-zinc-800 hover:bg-gray-50"
                  }`}
                >
                  <FolderOpen size={15} />
                  Saved Quotes
                </Link>
              </li>
            </ul>
          </div>
        )}
      </nav>

      {/* Margin Calculator modal */}
      <MarginCalculator
        open={marginOpen}
        onClose={() => setMarginOpen(false)}
        onApply={handleApplyMargin}
      />

      {/* Conversion Calculator modal */}
      <ConversionCalculator
        open={conversionOpen}
        onClose={() => setConversionOpen(false)}
      />

    </>
  );
}
