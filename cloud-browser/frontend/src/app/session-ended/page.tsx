"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function SessionEndedContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const duration = searchParams.get("duration") || "300";
    const reason = searchParams.get("reason") || "ended";
    const rateLimited = searchParams.get("rateLimited") === "true";

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    return (
        <Card className="w-full max-w-md">
            <CardContent className="pt-8 pb-8 text-center">
                {/* Icon */}
                <div className="flex justify-center mb-4">
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                </div>

                {/* E1: Title */}
                <h1 className="text-2xl font-bold mb-2">Session Ended</h1>

                {/* E1: Duration */}
                <p className="text-muted-foreground mb-6">
                    You browsed for {formatDuration(parseInt(duration))}
                </p>

                {/* E4: Rate limit info if applicable */}
                {rateLimited && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-6">
                        <p className="text-sm text-yellow-600 dark:text-yellow-400">
                            You've reached your daily limit of 10 sessions.
                            Come back tomorrow for more!
                        </p>
                    </div>
                )}

                {/* E1: Start New Session button */}
                <Button
                    onClick={() => router.push("/")}
                    className="w-full mb-3 cursor-pointer"
                    disabled={rateLimited}
                >
                    Start New Session
                </Button>

                {/* E1: Feedback link */}
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
