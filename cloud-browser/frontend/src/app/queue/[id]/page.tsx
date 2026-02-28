"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { io, Socket } from "socket.io-client";

type QueueStatus = "waiting" | "preparing" | "connecting" | "ready" | "error" | "rate_limited";

export default function QueuePage() {
    const router = useRouter();
    const params = useParams();
    const queueId = params.id as string;

    const [status, setStatus] = useState<QueueStatus>("waiting");
    const [position, setPosition] = useState(0);
    const [totalInQueue, setTotalInQueue] = useState(0);
    const [estimatedWait, setEstimatedWait] = useState(0);
    const countdownRef = useRef<NodeJS.Timeout | null>(null);

    // Local countdown: decrement estimatedWait every second between server pushes
    useEffect(() => {
        if (countdownRef.current) clearInterval(countdownRef.current);
        if (status === "waiting" && estimatedWait > 0) {
            countdownRef.current = setInterval(() => {
                setEstimatedWait(prev => Math.max(0, prev - 1));
            }, 1000);
        }
        return () => {
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, [status, estimatedWait > 0]); // Only restart when status changes or countdown starts/stops

    useEffect(() => {
        const apiUrl = typeof window !== 'undefined' ? window.location.origin : '';
        const socket: Socket = io(apiUrl);

        socket.on("connect", () => {
            socket.emit("queue:join", { queueId });
        });

        // If queue ticket is invalid/consumed, redirect home
        socket.on("queue:invalid", () => {
            router.replace("/");
        });

        socket.on("queue:joined", (data) => {
            setStatus(data.status || "waiting");
            setPosition(data.position);
            setTotalInQueue(data.totalInQueue);
            setEstimatedWait(data.estimatedWaitSeconds || 0);
        });

        socket.on("queue:status", (data) => {
            setStatus(data.status);
            setPosition(data.position);
            setTotalInQueue(data.totalInQueue);
            setEstimatedWait(data.estimatedWaitSeconds || 0);
        });

        socket.on("queue:ready", (data) => {
            setStatus("ready");
            // Auto-start session immediately (Q8) — replace to prevent back-button issues
            setTimeout(() => {
                router.replace(`/session/${data.sessionId}`);
            }, 300);
        });

        socket.on("queue:error", () => {
            router.replace("/");
        });

        return () => {
            socket.disconnect();
        };
    }, [queueId, router]);

    const handleLeaveQueue = async () => {
        try {
            const apiUrl = typeof window !== 'undefined' ? window.location.origin : '';
            await fetch(`${apiUrl}/api/queue/${queueId}`, {
                method: "DELETE",
            });
            router.replace("/");
        } catch (err) {
            console.error(err);
            router.replace("/");
        }
    };

    const formatWaitTime = (seconds: number): string => {
        if (seconds <= 0) return "Starting soon";
        if (seconds < 60) return `~${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `~${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Error state — queue:error redirects to home

    // E4: Rate limit reached — shown after queue processing
    if (status === "rate_limited") {
        return (
            <main className="min-h-screen bg-background flex items-center justify-center p-4">
                <Card className="w-full max-w-md">
                    <CardContent className="pt-6 text-center">
                        <div className="text-4xl mb-4">⏳</div>
                        <h2 className="text-xl font-semibold mb-2">Daily Limit Reached</h2>
                        <p className="text-muted-foreground mb-6">
                            You&apos;ve used all 10 sessions for today. Come back tomorrow for more browsing!
                        </p>
                        <Button onClick={() => router.push("/")} className="cursor-pointer">
                            Back to Home
                        </Button>
                    </CardContent>
                </Card>
            </main>
        );
    }

    // Get status text
    const getStatusText = () => {
        switch (status) {
            case "waiting":
                return "Waiting for available browser...";
            case "preparing":
                return "Preparing your environment...";
            case "connecting":
                return "Connecting to browser...";
            case "ready":
                return "Ready! Redirecting...";
            default:
                return "Loading...";
        }
    };

    // Q4: Minimal text only design
    return (
        <main className="min-h-screen bg-background flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardContent className="pt-8 pb-8">
                    {/* Spinner */}
                    <div className="flex justify-center mb-6">
                        {status !== "ready" ? (
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
                        ) : (
                            <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center">
                                <svg className="w-6 h-6 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                        )}
                    </div>

                    {/* Status text */}
                    <p className="text-center text-foreground mb-4">
                        {getStatusText()}
                    </p>

                    {/* Q2: Position and estimated wait (only when waiting) */}
                    {status === "waiting" && (
                        <div className="text-center text-muted-foreground text-sm space-y-1 mb-6">
                            {/* Position in queue */}
                            <p>You are #{position} of {totalInQueue}</p>
                            {/* Estimated wait time */}
                            <p>{formatWaitTime(estimatedWait)}</p>
                        </div>
                    )}

                    {/* Q2: Cancel button (only when waiting) */}
                    {status === "waiting" && (
                        <div className="text-center">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleLeaveQueue}
                                className="cursor-pointer"
                            >
                                Leave Queue
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </main>
    );
}
