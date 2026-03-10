"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { io, Socket } from "socket.io-client";

/**
 * Session Page — Simplified "gateway" that validates the session,
 * obtains the port + token via Socket.io, then redirects the browser
 * to the direct Selkies page (no iframe).
 *
 * The Selkies page has an injected toolbar (toolbar.js/toolbar.css)
 * that handles all in-session UI (timer, clipboard, recording, etc.).
 *
 * This page only stays visible for:
 *  1. Initial loading / connecting state
 *  2. taken_over state (session hijacked by another tab)
 *  3. ended state with pending recording download
 */

type SessionStatus = "connecting" | "active" | "error" | "not_found" | "taken_over" | "ended";

export default function SessionPage() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const sessionId = params.id as string;
    const isViewer = searchParams.get("viewer") === "true";
    const takenOver = searchParams.get("taken_over") === "true";

    const [status, setStatus] = useState<SessionStatus>(takenOver ? "taken_over" : "connecting");
    const socketRef = useRef<Socket | null>(null);
    const hasRedirected = useRef(false);

    const apiUrl = typeof window !== 'undefined' ? window.location.origin : '';

    // Check if session is still valid
    const checkSession = useCallback(async () => {
        try {
            const res = await fetch(`${apiUrl}/api/session/${sessionId}`);
            if (!res.ok) return null;
            return await res.json();
        } catch {
            return null;
        }
    }, [sessionId, apiUrl]);

    // Handle socket connection — get port + token, then redirect
    useEffect(() => {
        if (takenOver) return; // Don't connect if we're showing taken_over UI

        const connectSocket = async () => {
            const sessionData = await checkSession();
            if (!sessionData) {
                router.replace("/session-ended?reason=not_found");
                return;
            }

            const socket = io(apiUrl, {
                reconnection: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 1000,
            });
            socketRef.current = socket;

            socket.on("connect", () => {
                socket.emit("session:join", { sessionId, viewer: isViewer });
            });

            socket.on("session:joined", (data) => {
                if (hasRedirected.current) return;
                hasRedirected.current = true;

                // Store session info for controller
                if (!isViewer) {
                    localStorage.setItem(`session_${sessionId}`, JSON.stringify({
                        port: data.port,
                        sessionToken: data.sessionToken,
                        connectedAt: Date.now(),
                    }));
                }

                // Disconnect socket — toolbar.js will create its own connection
                socket.disconnect();

                // Redirect to direct Selkies page with session params
                const selkiesUrl = isViewer
                    ? `/browser/${data.port}/?sessionId=${sessionId}#shared`
                    : `/browser/${data.port}/?token=${data.sessionToken}&sessionId=${sessionId}`;

                window.location.href = selkiesUrl;
            });

            socket.on("session:error", (data) => {
                if (data?.viewerLimitReached) {
                    router.replace("/session-ended?reason=viewer_limit");
                } else {
                    router.replace("/session-ended?reason=not_found");
                }
            });

            socket.on("session:takeover", () => {
                if (!isViewer) localStorage.removeItem(`session_${sessionId}`);
                socket.disconnect();
                setStatus("taken_over");
            });

            socket.on("session:ended", () => {
                if (!isViewer) localStorage.removeItem(`session_${sessionId}`);
                if (isViewer) {
                    router.replace("/session-ended?reason=expired&viewer=true");
                } else {
                    router.replace(`/survey?sessionId=${sessionId}&reason=expired`);
                }
            });
        };

        connectSocket();

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, [sessionId, apiUrl, router, checkSession, isViewer, takenOver]);

    // --- Taken over state ---
    if (status === "taken_over") {
        return (
            <main className="min-h-[100dvh] bg-background flex items-center justify-center p-4">
                <div className="text-center max-w-md">
                    <div className="text-5xl mb-4">🔄</div>
                    <h2 className="text-xl font-semibold mb-2">Session Resumed Elsewhere</h2>
                    <p className="text-muted-foreground mb-6">
                        This session was resumed from another tab or device.
                    </p>
                    <div className="flex gap-3 justify-center">
                        <Button
                            variant="outline"
                            onClick={() => router.push("/")}
                            className="cursor-pointer"
                        >
                            Back to Home
                        </Button>
                        <Button
                            onClick={() => {
                                hasRedirected.current = false;
                                setStatus("connecting");
                                // Re-trigger effect by updating state
                                window.location.href = `/session/${sessionId}`;
                            }}
                            className="cursor-pointer"
                        >
                            Resume Here
                        </Button>
                    </div>
                </div>
            </main>
        );
    }

    // --- Loading / Connecting state ---
    return (
        <main className="min-h-[100dvh] bg-background flex items-center justify-center p-4">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                <p className="text-muted-foreground">Connecting to session...</p>
            </div>
        </main>
    );
}
