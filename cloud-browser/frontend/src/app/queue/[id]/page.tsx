"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@mui/material";
import { io, Socket } from "socket.io-client";
import BrandedPageLayout from "@/components/shared/BrandedPageLayout";

type QueueStatus = "waiting" | "preparing" | "connecting" | "ready" | "error" | "rate_limited";

export default function QueuePage() {
    const router = useRouter();
    const params = useParams();
    const queueId = params.id as string;

    const [status, setStatus] = useState<QueueStatus>("waiting");
    const [position, setPosition] = useState(0);
    const [totalInQueue, setTotalInQueue] = useState(0);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [joined, setJoined] = useState(false);

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
            setJoined(true);
        });

        socket.on("queue:status", (data) => {
            setStatus(data.status);
            setPosition(data.position);
            setTotalInQueue(data.totalInQueue);
        });

        socket.on("queue:ready", (data) => {
            setStatus("ready");
            setSessionId(data.sessionId);
            // Auto-start session immediately (Q8) — replace to prevent back-button issues
            setTimeout(() => {
                router.replace(`/session/${data.sessionId}`);
            }, 300);
        });

        socket.on("queue:error", () => {
            setStatus("error");
        });

        return () => {
            socket.disconnect();
        };
    }, [queueId, router]);

    const handleLeaveQueue = async () => {
        try {
            const apiUrl = typeof window !== 'undefined' ? window.location.origin : '';
            // If a session was already created, end it too
            if (sessionId) {
                await fetch(`${apiUrl}/api/session/${sessionId}`, { method: "DELETE" }).catch(() => {});
            }
            await fetch(`${apiUrl}/api/queue/${queueId}`, {
                method: "DELETE",
            });
            router.replace("/");
        } catch (err) {
            console.error(err);
            router.replace("/");
        }
    };

    // Queue wait message based on position and warm container availability
    const getQueueMessage = (): string => {
        if (position <= 1) {
            return "You\u2019re next \u2014 a browser will free up shortly";
        }
        if (position <= 3) {
            return "Almost there \u2014 a few people ahead of you";
        }
        return `There are ${position - 1} people ahead of you`;
    };

    // E4: Rate limit reached — shown after queue processing
    if (status === "rate_limited") {
        return (
            <BrandedPageLayout>
                <div className="text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-5"
                        style={{ backgroundColor: "rgba(234,179,8,0.1)" }}>
                        <svg className="w-8 h-8" style={{ color: "#eab308" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-semibold mb-2 dark:text-white text-gray-900">Daily Limit Reached</h2>
                    <p className="dark:text-white/50 text-gray-500 mb-6 text-sm">
                        You&apos;ve reached your daily session limit. Come back tomorrow for more browsing!
                    </p>
                    <Button
                        onClick={() => router.push("/")}
                        variant="contained"
                        className="!bg-[var(--color-primary-purple)] dark:!bg-[var(--color-primary-purple-light)] !text-white !rounded-none !px-8 !py-2.5 !text-sm !normal-case !font-medium"
                        style={{ boxShadow: "none" }}
                    >
                        Back to Home
                    </Button>
                </div>
            </BrandedPageLayout>
        );
    }

    // Error state — show message with retry option
    if (status === "error") {
        return (
            <BrandedPageLayout>
                <div className="text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-5"
                        style={{ backgroundColor: "rgba(239,68,68,0.1)" }}>
                        <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-semibold mb-2 dark:text-white text-gray-900">Something Went Wrong</h2>
                    <p className="dark:text-white/50 text-gray-500 mb-6 text-sm">
                        We couldn&apos;t create your session. Please try again.
                    </p>
                    <Button
                        onClick={() => router.push("/")}
                        variant="contained"
                        className="!bg-[var(--color-primary-purple)] dark:!bg-[var(--color-primary-purple-light)] !text-white !rounded-none !px-8 !py-2.5 !text-sm !normal-case !font-medium"
                        style={{ boxShadow: "none" }}
                    >
                        Try Again
                    </Button>
                </div>
            </BrandedPageLayout>
        );
    }

    // Get status text
    const getStatusText = () => {
        switch (status) {
            case "waiting":
                return "Waiting for available browser...";
            case "preparing":
                return "Preparing your browser...";
            case "connecting":
                return "Connecting...";
            case "ready":
                return "Ready! Redirecting...";
            default:
                return "Loading...";
        }
    };

    // Q4: Minimal text only design — branded
    return (
        <BrandedPageLayout>
            <div className="py-4">
                {/* Spinner */}
                <div className="flex justify-center mb-6">
                    {status !== "ready" ? (
                        <div
                            className="animate-spin rounded-full h-10 w-10 border-b-2"
                            style={{ borderColor: "var(--color-primary-purple-light)" }}
                        />
                    ) : (
                        <div
                            className="h-10 w-10 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: "var(--color-primary-purple)" }}
                        >
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                    )}
                </div>

                {/* Status text */}
                <p className="text-center dark:text-white text-gray-900 mb-2 font-medium">
                    {getStatusText()}
                </p>

                {/* Queue message (only when waiting AND server data received) */}
                {status === "waiting" && joined && (
                    <p className="text-center dark:text-white/50 text-gray-500 text-sm mb-6">
                        {getQueueMessage()}
                    </p>
                )}

                {/* Cancel button — visible in all non-ready states */}
                {status !== "ready" && (
                    <div className="text-center mt-4">
                        <Button
                            onClick={handleLeaveQueue}
                            variant="text"
                            className="!text-sm !normal-case dark:!text-white/40 !text-gray-400 hover:dark:!text-white/60 hover:!text-gray-600"
                        >
                            {status === "waiting" ? "Leave Queue" : "Cancel"}
                        </Button>
                    </div>
                )}
            </div>
        </BrandedPageLayout>
    );
}
