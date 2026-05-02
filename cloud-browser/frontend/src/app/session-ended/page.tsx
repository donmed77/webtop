"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@mui/material";
import BrandedPageLayout from "@/components/shared/BrandedPageLayout";

interface RateLimitInfo {
    used: number;
    remaining: number;
    limit: number;
}

function SessionEndedContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const reason = searchParams.get("reason"); // "not_found" | "expired" | "viewer_limit" | null
    const isViewerParam = searchParams.get("viewer") === "true";
    const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);

    const apiUrl = typeof window !== 'undefined' ? window.location.origin : '';

    useEffect(() => {
        // Don't fetch rate limit for viewers — they didn't consume a session
        if (isViewerParam) return;
        fetch(`${apiUrl}/api/session/rate-limit/status`)
            .then((res) => res.json())
            .then((data) => setRateLimit(data))
            .catch(() => {
                setRateLimit(null);
            });
    }, [apiUrl, isViewerParam]);

    const isLimited = rateLimit !== null && rateLimit.remaining <= 0;

    // Contextual title and subtitle based on reason
    const isNotFound = reason === "not_found";
    const isExpired = reason === "expired";
    const isAbandoned = reason === "abandoned";
    const isViewerLimit = reason === "viewer_limit";
    const title = isViewerLimit ? "Viewer Limit Reached" : isNotFound ? "Session Not Available" : "Session Ended";
    const subtitle = isViewerLimit
        ? "This session already has a viewer. Only 1 viewer is allowed at a time."
        : isNotFound
            ? "This session has expired or doesn't exist."
            : isAbandoned
                ? "Connection was lost and could not be restored."
                : isExpired
                    ? isViewerParam
                        ? "The session you were viewing has ended."
                        : "Your session time has expired."
                    : null;

    const isWarning = isNotFound || isViewerLimit;

    return (
        <div className="text-center">
            {/* Icon */}
            <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-5"
                style={{
                    backgroundColor: isWarning
                        ? "rgba(234,179,8,0.1)"
                        : "rgba(132,55,254,0.1)",
                }}
            >
                {isWarning ? (
                    <svg className="w-8 h-8" style={{ color: "#eab308" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                ) : (
                    <svg className="w-8 h-8" style={{ color: "var(--color-primary-purple-light)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                )}
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold mb-2 dark:text-white text-gray-900">{title}</h1>
            {subtitle && <p className="dark:text-white/50 text-gray-500 mb-5 text-sm">{subtitle}</p>}

            {/* Rate limit info — only for non-viewers */}
            {!isViewerParam && rateLimit !== null ? (
                <div className="mb-6">
                    <p className="dark:text-white/50 text-gray-500 mb-3 text-sm">
                        You&apos;ve used <span className="font-semibold dark:text-white text-gray-900">{rateLimit.used}</span> of{" "}
                        <span className="font-semibold dark:text-white text-gray-900">{rateLimit.limit}</span> sessions today
                    </p>

                    {/* Progress bar */}
                    <div className="w-full rounded-full h-2 mb-2" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                        <div
                            className="h-2 rounded-full transition-all"
                            style={{
                                width: `${Math.min(100, (rateLimit.used / rateLimit.limit) * 100)}%`,
                                background: isLimited
                                    ? "#ef4444"
                                    : rateLimit.remaining <= 2
                                        ? "#eab308"
                                        : "linear-gradient(90deg, var(--color-primary-purple), var(--color-primary-purple-light))",
                            }}
                        />
                    </div>

                    <p className="text-sm dark:text-white/40 text-gray-400">
                        {isLimited
                            ? "You've reached your daily limit. Come back tomorrow!"
                            : `${rateLimit.remaining} session${rateLimit.remaining !== 1 ? "s" : ""} remaining today`}
                    </p>
                </div>
            ) : (
                <p className="dark:text-white/50 text-gray-500 mb-6 text-sm">
                    {isViewerParam ? "The host's session has ended." : "Thanks for using Cloud Browser!"}
                </p>
            )}

            {/* Start New Session button */}
            <Button
                onClick={() => router.push("/")}
                variant="contained"
                fullWidth
                disabled={isLimited}
                className="!bg-[var(--color-primary-purple)] dark:!bg-[var(--color-primary-purple-light)] !text-white !rounded-xl !py-2.5 !text-sm !normal-case !font-medium !mb-3 disabled:!opacity-40"
                style={{ boxShadow: "none" }}
            >
                Start New Session
            </Button>

            {/* Feedback link */}
            <a
                href="mailto:feedback@unshortlink.com?subject=Session Feedback"
                className="text-sm dark:text-white/30 text-gray-400 dark:hover:text-white/50 hover:text-gray-600 transition-colors"
            >
                Share feedback
            </a>
        </div>
    );
}

export default function SessionEndedPage() {
    return (
        <BrandedPageLayout>
            <Suspense fallback={
                <div className="text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-5"
                        style={{ backgroundColor: "rgba(132,55,254,0.1)" }}>
                        <svg className="w-8 h-8" style={{ color: "var(--color-primary-purple-light)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold mb-2 dark:text-white text-gray-900">Session Ended</h1>
                </div>
            }>
                <SessionEndedContent />
            </Suspense>
        </BrandedPageLayout>
    );
}
