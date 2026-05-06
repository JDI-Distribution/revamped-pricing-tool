"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChevronRight, ChevronLeft } from "lucide-react";
import logo from "@/assets/JDI_Distribution_Logo.png";
import ManageQuotes from "@/components/quote/ManageQuotes";

const navLinks = [
  { label: "Home", href: "/" },
  { label: "Analytics", href: "/analytics" },
  { label: "Margin Calculator", href: "/margin-calculator" },
  { label: "Conversion Calculator", href: "/conversion-calculator" },
];

export default function Navbar() {
  const pathname = usePathname();
  const isQuotePage = pathname === "/quote";

  return (
    <nav className="w-full bg-white px-6 py-3 flex items-center gap-12">
      {/* Logo */}
      <Link href="/">
        <Image src={logo} alt="JDI Distribution" height={40} priority />
      </Link>

      {/* Nav Links */}
      <ul className="hidden md:flex items-center gap-12">
        {navLinks.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors pb-1 border-b-2 border-transparent hover:border-[#e8473f]"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>

      {/* Saved Quotes */}
      <ManageQuotes />

      {/* Next / Back navigation */}
      <div className="ml-auto">
        {isQuotePage ? (
          <Link
            href="/"
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-5 h-9 transition-colors"
          >
            <ChevronLeft size={15} />
            Back to Pricing
          </Link>
        ) : (
          <Link
            href="/quote"
            className="flex items-center gap-2 bg-[#e8473f] hover:bg-[#d43f37] text-white text-sm font-medium px-5 h-9 transition-colors"
          >
            Next
            <ChevronRight size={15} />
          </Link>
        )}
      </div>
    </nav>
  );
}