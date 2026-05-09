"use client";

import Image from "next/image";

interface BrandedPageLayoutProps {
  children: React.ReactNode;
  maxWidth?: string;
}

export default function BrandedPageLayout({
  children,
  maxWidth = "max-w-md",
}: BrandedPageLayoutProps) {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{
        backgroundColor: "#1d1e21",
        fontFamily: "'Poppins', sans-serif",
      }}
    >
      {/* Mini logo */}
      <div className="mb-8">
        <Image
          src="/unshortlink_logo_white.svg"
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
          backgroundColor: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {children}
      </div>
    </main>
  );
}

