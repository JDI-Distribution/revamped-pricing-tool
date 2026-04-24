import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import React from "react";
import { ProjectProvider } from "@/lib/ProjectContext";

const dmSans = DM_Sans ({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"]
});

export const metadata: Metadata = {
  title: "JDI Distribution",
  description: "Consumer products. Global brands."
};

export default function RootLayout ({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang = "en" className = {dmSans.variable}>
      <body className = "font-sans antialiased">
        <ProjectProvider>
          {children}
        </ProjectProvider>
      </body>
    </html>
  );
}