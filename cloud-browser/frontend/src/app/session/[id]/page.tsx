"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { io, Socket } from "socket.io-client";

type SessionStatus = "connecting" | "reconnecting" | "active" | "ended" | "error" | "not_found" | "taken_over";

export default function SessionPage() {
    const router = useRouter();
    const params = useParams();
    const sessionId = params.id as string;

    const [port, setPort] = useState<number | null>(null);
    const [timeRemaining, setTimeRemaining] = useState(300);
    const [status, setStatus] = useState<SessionStatus>("connecting");
    const [error, setError] = useState("");
    const hasNavigated = useRef(false);
    const [streamReady, setStreamReady] = useState(false);
    const [isToolbarMinimized, setIsToolbarMinimized] = useState(false);
    const [reconnectAttempts, setReconnectAttempts] = useState(0);
    const socketRef = useRef<Socket | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

    // Check if session is still valid
    const checkSession = useCallback(async () => {
        try {
            const res = await fetch(`${apiUrl}/api/session/${sessionId}`);
            if (!res.ok) {
                return null;
            }
            return await res.json();
        } catch {
            return null;
        }
    }, [sessionId, apiUrl]);

    // Handle socket connection and reconnection
    useEffect(() => {
        let reconnectTimer: NodeJS.Timeout;

        const connectSocket = async () => {
            // First check if session exists
            const sessionData = await checkSession();
            if (!sessionData) {
                setStatus("not_found");
                setError("Session not found or has ended");
                return;
            }

            // Session exists, connect via WebSocket
            const socket = io(apiUrl, {
                reconnection: true,
                reconnectionAttempts: 8,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
            });

            socketRef.current = socket;

            socket.on("connect", () => {
                socket.emit("session:join", { sessionId });
                setReconnectAttempts(0);
            });

            socket.on("session:joined", (data) => {
                setPort(data.port);
                setTimeRemaining(data.timeRemaining);
                setStatus("active");

                // Store session info for reconnection
                localStorage.setItem(`session_${sessionId}`, JSON.stringify({
                    port: data.port,
                    connectedAt: Date.now(),
                }));
            });

            socket.on("session:timer", (data) => {
                setTimeRemaining(data.timeRemaining);
            });

            socket.on("session:warning", () => {
                // Timer flashing handled via CSS
            });

            socket.on("session:ended", () => {
                if (hasNavigated.current) return;
                hasNavigated.current = true;
                localStorage.removeItem(`session_${sessionId}`);
                router.push("/session-ended");
            });

            socket.on("session:error", (data) => {
                setError(data.error);
                setStatus("error");
            });

            // EC1: Another tab took over this session
            socket.on("session:takeover", () => {
                setStatus("taken_over");
            });

            socket.on("disconnect", (reason) => {
                if (reason === "io server disconnect") {
                    // Server disconnected us, session might have ended
                    setStatus("ended");
                } else {
                    // Connectivity issue, try to reconnect
                    setStatus("reconnecting");
                }
            });

            socket.on("reconnect_attempt", (attempt) => {
                setReconnectAttempts(attempt);
                setStatus("reconnecting");
            });

            socket.on("reconnect", () => {
                socket.emit("session:join", { sessionId });
            });

            socket.on("reconnect_failed", () => {
                setStatus("error");
                setError("Connection lost. Please refresh or start a new session.");
            });
        };

        connectSocket();

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, [sessionId, apiUrl, router, checkSession]);

    // Fallback timeout: if stream detection fails, reveal after 15s
    useEffect(() => {
        if (status === "active" && !streamReady) {
            const fallbackTimer = setTimeout(() => {
                setStreamReady(true);
            }, 15000);
            return () => clearTimeout(fallbackTimer);
        }
    }, [status, streamReady]);

    // Hook into iframe console.log to detect "Stream started"
    const handleIframeLoad = () => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const iframeWindow = iframeRef.current?.contentWindow as any;
            if (iframeWindow?.console) {
                const originalLog = iframeWindow.console.log;
                iframeWindow.console.log = function (...args: unknown[]) {
                    originalLog.apply(this, args);
                    const msg = args.join(" ");
                    if (msg.includes("Stream started")) {
                        // Brief delay to let the browser finish fullscreen layout
                        setTimeout(() => setStreamReady(true), 1500);
                    }
                };
            }
        } catch {
            // Cross-origin fallback — rely on the 15s timeout
        }
    };

    const handleEndSession = () => {
        if (hasNavigated.current) return;
        hasNavigated.current = true;
        localStorage.removeItem(`session_${sessionId}`);
        router.push("/session-ended");
        // Fire and forget — don't block navigation on container teardown
        fetch(`${apiUrl}/api/session/${sessionId}`, { method: "DELETE" }).catch(() => { });
    };

    const handleRetry = () => {
        setStatus("connecting");
        setError("");
        socketRef.current?.connect();
    };

    // EC1: Resume session from taken-over tab
    const handleResume = () => {
        setStreamReady(false);
        setStatus("connecting");
        if (socketRef.current?.connected) {
            socketRef.current.emit("session:join", { sessionId });
        } else {
            socketRef.current?.connect();
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const getTimerColor = () => {
        if (timeRemaining <= 30) return "text-red-500";
        if (timeRemaining <= 120) return "text-yellow-500";
        return "text-white";
    };

    const isFlashing = timeRemaining <= 10;

    // Show loading overlay (connecting or stream not ready yet)
    const showLoading = status === "connecting" || (status === "active" && !streamReady);

    // Reconnecting state
    if (status === "reconnecting") {
        return (
            <main className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500 mx-auto mb-4"></div>
                    <p className="text-yellow-500 mb-2">Connection lost. Reconnecting...</p>
                    <p className="text-muted-foreground text-sm">Attempt {reconnectAttempts}/5</p>
                </div>
            </main>
        );
    }

    // Session not found
    if (status === "not_found") {
        return (
            <main className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="text-center">
                    <p className="text-muted-foreground mb-4">This session has ended or doesn't exist</p>
                    <Button onClick={() => router.push("/")}>Start New Session</Button>
                </div>
            </main>
        );
    }

    // Error state
    if (status === "error") {
        return (
            <main className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="text-center">
                    <p className="text-destructive mb-4">{error}</p>
                    <div className="flex gap-2 justify-center">
                        <Button variant="outline" onClick={handleRetry}>Retry</Button>
                        <Button onClick={() => router.push("/")}>Back to Home</Button>
                    </div>
                </div>
            </main>
        );
    }

    // EC1: Taken over by another tab
    if (status === "taken_over") {
        return (
            <main className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="text-center">
                    <div className="text-4xl mb-4">🔄</div>
                    <h2 className="text-xl font-semibold mb-2">Session Opened in Another Tab</h2>
                    <p className="text-muted-foreground mb-6">This session is active in another tab.</p>
                    <Button onClick={handleResume} className="cursor-pointer">Resume Session Here</Button>
                </div>
            </main>
        );
    }

    // Ended state
    if (status === "ended") {
        return (
            <main className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="text-center">
                    <p className="text-muted-foreground mb-4">Session has ended</p>
                    <Button onClick={() => router.push("/")}>Start New Session</Button>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-background flex flex-col relative">
            {/* Loading overlay — stays until WebRTC stream is ready */}
            {showLoading && (
                <div className="absolute inset-0 z-40 bg-background flex items-center justify-center">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                        <p className="text-muted-foreground">Loading session...</p>
                    </div>
                </div>
            )}

            {/* Toolbar - only visible when stream is ready */}
            {streamReady && !isToolbarMinimized ? (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
                    <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-full px-4 py-2 flex items-center gap-4 shadow-lg">
                        {/* Timer */}
                        <span
                            className={`font-mono text-lg font-semibold ${getTimerColor()} ${isFlashing ? "animate-[flash_0.5s_ease-in-out_infinite]" : ""}`}
                        >
                            {formatTime(timeRemaining)}
                        </span>

                        {/* Divider */}
                        <div className="w-px h-5 bg-white/20" />

                        {/* End Session Button */}
                        <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 px-3 text-sm rounded-full cursor-pointer"
                            onClick={handleEndSession}
                        >
                            End Session
                        </Button>

                        <button
                            onClick={() => setIsToolbarMinimized(true)}
                            className="text-white/60 hover:text-white transition-colors cursor-pointer"
                            title="Minimize"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    </div>
                </div>
            ) : streamReady && isToolbarMinimized ? (
                /* Minimized: small icon in top-right corner */
                <button
                    onClick={() => setIsToolbarMinimized(false)}
                    className={`fixed top-4 right-4 z-50 bg-black/40 backdrop-blur-md border border-white/10 rounded-full w-12 h-12 flex items-center justify-center shadow-lg cursor-pointer ${getTimerColor()} ${isFlashing ? "animate-[flash_0.5s_ease-in-out_infinite]" : ""}`}
                    title="Show toolbar"
                >
                    <span className="font-mono text-sm font-semibold">{formatTime(timeRemaining)}</span>
                </button>
            ) : null}

            {/* Browser iframe — loads behind overlay when port is available */}
            {port && (
                <iframe
                    ref={iframeRef}
                    src={`/browser/${port}/`}
                    className="flex-1 w-full border-0"
                    allow="clipboard-read; clipboard-write"
                    onLoad={handleIframeLoad}
                />
            )}

            {/* Custom flash animation */}
            <style jsx>{`
                @keyframes flash {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }
            `}</style>
        </main>
    );
}
