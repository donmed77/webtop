"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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

    return (
        <Card className="w-full max-w-md">
            <CardContent className="pt-8 pb-8 text-center">
                {/* Icon */}
                <div className="flex justify-center mb-4">
                    <div className={`h-16 w-16 rounded-full flex items-center justify-center ${isNotFound || isViewerLimit ? "bg-yellow-500/10" : "bg-primary/10"}`}>
                        {isNotFound || isViewerLimit ? (
                            <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                        ) : (
                            <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-2xl font-bold mb-2">{title}</h1>
                {subtitle && <p className="text-muted-foreground mb-4">{subtitle}</p>}

                {/* Rate limit info — only for non-viewers */}
                {!isViewerParam && rateLimit !== null ? (
                    <div className="mb-6">
                        <p className="text-muted-foreground mb-3">
                            You&apos;ve used <span className="font-semibold text-foreground">{rateLimit.used}</span> of{" "}
                            <span className="font-semibold text-foreground">{rateLimit.limit}</span> sessions today
                        </p>

                        {/* Progress bar */}
                        <div className="w-full bg-muted rounded-full h-2 mb-2">
                            <div
                                className={`h-2 rounded-full transition-all ${isLimited ? "bg-red-500" : rateLimit.remaining <= 2 ? "bg-yellow-500" : "bg-primary"
                                    }`}
                                style={{ width: `${Math.min(100, (rateLimit.used / rateLimit.limit) * 100)}%` }}
                            />
                        </div>

                        <p className="text-sm text-muted-foreground">
                            {isLimited
                                ? "You've reached your daily limit. Come back tomorrow!"
                                : `${rateLimit.remaining} session${rateLimit.remaining !== 1 ? "s" : ""} remaining today`}
                        </p>
                    </div>
                ) : (
                    <p className="text-muted-foreground mb-6">
                        {isViewerParam ? "The host's session has ended." : "Thanks for using Cloud Browser!"}
                    </p>
                )}

                {/* Start New Session button */}
                <Button
                    onClick={() => router.push("/")}
                    className="w-full mb-3 cursor-pointer"
                    disabled={isLimited}
                >
                    Start New Session
                </Button>

                {/* Feedback link */}
                <a
                    href="mailto:feedback@unshortlink.com?subject=Session Feedback"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    Share feedback
                </a>
            </CardContent>
        </Card>
    );
}

export default function SessionEndedPage() {
    return (
        <main className="min-h-screen bg-background flex items-center justify-center p-4">
            <Suspense fallback={
                <Card className="w-full max-w-md">
                    <CardContent className="pt-8 pb-8 text-center">
                        <div className="flex justify-center mb-4">
                            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold mb-2">Session Ended</h1>
                    </CardContent>
                </Card>
            }>
                <SessionEndedContent />
            </Suspense>
        </main>
    );
}
