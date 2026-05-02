"use client";

import Image from "next/image";
import useThemeStore from "@/stores/theme-store";

interface BrandedPageLayoutProps {
  children: React.ReactNode;
  maxWidth?: string;
}

export default function BrandedPageLayout({
  children,
  maxWidth = "max-w-md",
}: BrandedPageLayoutProps) {
  const { theme } = useThemeStore();
  const isDark = theme === "dark";

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{
        backgroundColor: isDark ? "#1d1e21" : "#faf9fe",
        fontFamily: "'Poppins', sans-serif",
      }}
    >
      {/* Mini logo */}
      <div className="mb-8">
        <Image
          src={isDark ? "/unshortlink_logo_white.svg" : "/unshortlink_logo.svg"}
          alt="Unshortlink"
          width={140}
          height={32}
          priority
        />
      </div>

      {/* Content card */}
      <div
        className={`w-full ${maxWidth} p-8`}
        style={{
          backgroundColor: isDark
            ? "rgba(255,255,255,0.04)"
            : "rgba(255,255,255,0.9)",
          border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
        }}
      >
        {children}
      </div>
    </main>
  );
}
