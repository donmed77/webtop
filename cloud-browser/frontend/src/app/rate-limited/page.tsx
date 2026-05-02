"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@mui/material";
import BrandedPageLayout from "@/components/shared/BrandedPageLayout";

interface RateLimitInfo {
    used: number;
    remaining: number;
    limit: number;
}

export default function RateLimitedPage() {
    const router = useRouter();
    const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);

    const apiUrl = typeof window !== 'undefined' ? window.location.origin : '';

    useEffect(() => {
        fetch(`${apiUrl}/api/session/rate-limit/status`)
            .then((res) => res.json())
            .then((data) => setRateLimit(data))
            .catch(() => setRateLimit(null));
    }, [apiUrl]);

    return (
        <BrandedPageLayout>
            <div className="text-center">
                {/* Icon */}
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-5"
                    style={{ backgroundColor: "rgba(234,179,8,0.1)" }}>
                    <svg className="w-8 h-8" style={{ color: "#eab308" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                </div>

                {/* Title */}
                <h1 className="text-2xl font-bold mb-2 dark:text-white text-gray-900">Daily Limit Reached</h1>

                {/* Message */}
                <p className="dark:text-white/50 text-gray-500 mb-5 text-sm">
                    You&apos;ve used all your free sessions for today.
                </p>

                {/* Usage info */}
                {rateLimit !== null && (
                    <div className="mb-6">
                        <p className="dark:text-white/50 text-gray-500 mb-3 text-sm">
                            <span className="font-semibold dark:text-white text-gray-900">{rateLimit.used}</span> of{" "}
                            <span className="font-semibold dark:text-white text-gray-900">{rateLimit.limit}</span> sessions used today
                        </p>

                        {/* Progress bar */}
                        <div className="w-full rounded-full h-2 mb-4" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                            <div
                                className="h-2 rounded-full transition-all"
                                style={{
                                    width: `${Math.min(100, (rateLimit.used / rateLimit.limit) * 100)}%`,
                                    background: "linear-gradient(90deg, var(--color-primary-purple), var(--color-primary-purple-light))",
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* Upgrade CTA */}
                <a
                    href="mailto:upgrade@unshortlink.com?subject=I'd like more sessions"
                    className="block w-full"
                >
                    <Button
                        variant="contained"
                        fullWidth
                        className="!bg-[var(--color-primary-purple)] dark:!bg-[var(--color-primary-purple-light)] !text-white !rounded-xl !py-2.5 !text-sm !normal-case !font-medium !mb-3"
                        style={{ boxShadow: "none" }}
                    >
                        Get More Sessions
                    </Button>
                </a>

                {/* Back home */}
                <Button
                    onClick={() => router.push("/")}
                    variant="outlined"
                    fullWidth
                    className="dark:!text-white/60 !text-gray-500 dark:!border-white/10 !border-gray-200 !rounded-xl !py-2.5 !text-sm !normal-case !font-medium"
                    style={{ boxShadow: "none" }}
                >
                    Back to Home
                </Button>
            </div>
        </BrandedPageLayout>
    );
}
