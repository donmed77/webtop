"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@mui/material";
import { useRouter } from "next/navigation";
import notFoundAnimation from "@/assets/404.animation.json";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

export default function LocaleNotFound() {
  const router = useRouter();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{
        backgroundColor: "#1d1e21",
        fontFamily: "'Poppins', sans-serif",
      }}
    >
      <div className="w-full max-w-sm">
        <Lottie
          animationData={notFoundAnimation}
          style={{ width: "100%", height: "100%" }}
          loop
        />
      </div>

      <div className="flex flex-col gap-2 items-center justify-center mt-4">
        <h1 className="text-3xl font-bold text-white">Page Not Found</h1>
        <p className="text-center text-white/50 text-sm max-w-md">
          The page you are looking for might have been removed, had its name
          changed or is temporarily unavailable.
        </p>
      </div>

      <div className="flex items-center gap-3 mt-8">
        <Link href="mailto:contact@unshortlink.com">
          <Button
            variant="outlined"
            sx={{
              borderColor: "rgba(255,255,255,0.2)",
              color: "#fff",
              borderRadius: 0,
              padding: "10px 24px",
              textTransform: "none",
              fontFamily: "'Poppins', sans-serif",
              "&:hover": {
                borderColor: "rgba(255,255,255,0.4)",
                backgroundColor: "rgba(255,255,255,0.05)",
              },
            }}
          >
            Contact Us
          </Button>
        </Link>
        <Button
          variant="contained"
          onClick={() => router.push("/")}
          sx={{
            backgroundColor: "#a97dff",
            borderRadius: 0,
            padding: "10px 24px",
            textTransform: "none",
            fontFamily: "'Poppins', sans-serif",
            "&:hover": {
              backgroundColor: "#9060f0",
            },
          }}
        >
          Go Home
        </Button>
      </div>
    </div>
  );
}
