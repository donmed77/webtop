"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { io, Socket } from "socket.io-client";
import fixWebmDuration from "fix-webm-duration";

type SessionStatus = "connecting" | "reconnecting" | "active" | "ended" | "error" | "not_found" | "taken_over";

export default function SessionPage() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const sessionId = params.id as string;
    const isViewer = searchParams.get("viewer") === "true";

    const [port, setPort] = useState<number | null>(null);
    const [timeRemaining, setTimeRemaining] = useState(300);
    const [status, setStatus] = useState<SessionStatus>("connecting");
    const [error, setError] = useState("");
    const hasNavigated = useRef(false);
    const [streamReady, setStreamReady] = useState(false);
    const [isToolbarMinimized, setIsToolbarMinimized] = useState(false);
    const [reconnectAttempts, setReconnectAttempts] = useState(0);
    const [latency, setLatency] = useState<number | null>(null);
    const latencyIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [viewerCount, setViewerCount] = useState(0);
    const [showShareToast, setShowShareToast] = useState(false);
    const [screenshotMode, setScreenshotMode] = useState(false);
    const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);
    const selectionOverlayRef = useRef<HTMLDivElement>(null);

    // Recording state
    type RecordingState = "idle" | "recording" | "paused" | "ready";
    const [recordingState, setRecordingState] = useState<RecordingState>("idle");
    const [recordingElapsed, setRecordingElapsed] = useState(0);
    const [recordingSize, setRecordingSize] = useState(0);
    const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
    const [showPrivacyToast, setShowPrivacyToast] = useState(false);
    const [hasShownToast, setHasShownToast] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordingStreamRef = useRef<MediaStream | null>(null);
    const recordingChunksRef = useRef<Blob[]>([]);
    const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
    const recordingStartTimeRef = useRef(0);
    const recordingPausedMsRef = useRef(0);
    const pauseStartRef = useRef(0);
    const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

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
                socket.emit("session:join", { sessionId, viewer: isViewer });
                setReconnectAttempts(0);
            });

            socket.on("session:joined", (data) => {
                setPort(data.port);
                setTimeRemaining(data.timeRemaining);
                setStatus("active");

                // Only store session info for controller (not viewer)
                if (!isViewer) {
                    localStorage.setItem(`session_${sessionId}`, JSON.stringify({
                        port: data.port,
                        connectedAt: Date.now(),
                    }));
                }
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
                if (!isViewer) localStorage.removeItem(`session_${sessionId}`);
                // Viewers just navigate away on session end
                if (isViewer) {
                    router.push("/session-ended");
                    return;
                }
                // If recording is active, stop it and let onstop handler finalize the blob
                // The ended UI will show download option
                stopRecorderGracefully();
                setStatus("ended");
            });

            // Viewer count updates (controller only)
            socket.on("session:viewer-count", (data) => {
                setViewerCount(data.count);
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
                socket.emit("session:join", { sessionId, viewer: isViewer });
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
            if (latencyIntervalRef.current) {
                clearInterval(latencyIntervalRef.current);
            }
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
            }
            if (mediaRecorderRef.current?.state === "recording") {
                mediaRecorderRef.current.stop();
            }
        };
    }, [sessionId, apiUrl, router, checkSession, isViewer]);

    // Fallback timeout: if stream detection fails, reveal after 15s
    useEffect(() => {
        if (status === "active" && !streamReady) {
            const fallbackTimer = setTimeout(() => {
                setStreamReady(true);
            }, 15000);
            return () => clearTimeout(fallbackTimer);
        }
    }, [status, streamReady]);

    // Hook into iframe console.log to detect "Stream started" + poll latency
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

            // Monkey-patch AudioContext so Selkies' private instance is accessible
            // Selkies creates AudioContext inside a closure — this intercepts construction
            if (iframeWindow && !iframeWindow.__audioCtxPatched) {
                const OrigAudioContext = iframeWindow.AudioContext || iframeWindow.webkitAudioContext;
                if (OrigAudioContext) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    iframeWindow.AudioContext = function (...args: any[]) {
                        const ctx = new OrigAudioContext(...args);
                        iframeWindow.__audioCtx = ctx;
                        // Also intercept createGain to capture the gain node
                        const origCreateGain = ctx.createGain.bind(ctx);
                        ctx.createGain = function () {
                            const gain = origCreateGain();
                            iframeWindow.__audioGain = gain;
                            return gain;
                        };
                        return ctx;
                    };
                    iframeWindow.AudioContext.prototype = OrigAudioContext.prototype;
                    iframeWindow.__audioCtxPatched = true;
                }
            }

            // Poll Selkies' network_stats for latency
            if (latencyIntervalRef.current) clearInterval(latencyIntervalRef.current);
            latencyIntervalRef.current = setInterval(() => {
                const ms = iframeWindow?.network_stats?.latency_ms;
                if (ms !== undefined && ms !== null) setLatency(Math.round(ms));
            }, 1000);
        } catch {
            // Cross-origin fallback — rely on the 15s timeout
        }
    };

    const handleEndSession = () => {
        if (isViewer || hasNavigated.current) return;
        hasNavigated.current = true;
        localStorage.removeItem(`session_${sessionId}`);
        // Fire and forget — don't block on container teardown
        fetch(`${apiUrl}/api/session/${sessionId}`, { method: "DELETE" }).catch(() => { });
        // If recording is active, stop it and show ended UI with download option
        const wasRecording = stopRecorderGracefully();
        if (wasRecording) {
            setStatus("ended");
        } else {
            router.push("/session-ended");
        }
    };

    const copyShareLink = () => {
        const url = `${window.location.origin}/session/${sessionId}?viewer=true`;
        navigator.clipboard.writeText(url).then(() => {
            setShowShareToast(true);
            setTimeout(() => setShowShareToast(false), 2000);
        }).catch(() => { });
    };

    // --- Screenshot functions ---
    const startScreenshotMode = () => setScreenshotMode(true);
    const cancelScreenshot = () => {
        setScreenshotMode(false);
        setSelectionStart(null);
        setSelectionEnd(null);
    };

    const handleScreenshotMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault(); // prevent text selection during drag
        const rect = e.currentTarget.getBoundingClientRect();
        setSelectionStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        setSelectionEnd(null);
    };

    const handleScreenshotMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!selectionStart) return;
        const rect = e.currentTarget.getBoundingClientRect();
        setSelectionEnd({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };

    const handleScreenshotMouseUp = () => {
        if (!selectionStart || !selectionEnd) {
            cancelScreenshot();
            return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const iframeWindow = iframeRef.current?.contentWindow as any;
        const videoCanvas = iframeWindow?.document?.getElementById("videoCanvas") as HTMLCanvasElement | null;
        const iframeEl = iframeRef.current;
        if (!videoCanvas || !iframeEl) {
            cancelScreenshot();
            return;
        }

        const iframeRect = iframeEl.getBoundingClientRect();
        const scaleX = videoCanvas.width / iframeRect.width;
        const scaleY = videoCanvas.height / iframeRect.height;

        // Normalize so x/y is always top-left
        const x = Math.min(selectionStart.x, selectionEnd.x);
        const y = Math.min(selectionStart.y, selectionEnd.y);
        const w = Math.abs(selectionEnd.x - selectionStart.x);
        const h = Math.abs(selectionEnd.y - selectionStart.y);

        // Minimum size guard
        if (w < 10 || h < 10) {
            cancelScreenshot();
            return;
        }

        const sx = Math.round(x * scaleX);
        const sy = Math.round(y * scaleY);
        const sw = Math.round(w * scaleX);
        const sh = Math.round(h * scaleY);

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = sw;
        tempCanvas.height = sh;
        const ctx = tempCanvas.getContext("2d");
        if (!ctx) {
            cancelScreenshot();
            return;
        }
        ctx.drawImage(videoCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
        new Audio("/sounds/shutter.mp3").play().catch(() => { });
        tempCanvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `screenshot-${sessionId.slice(0, 8)}-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.png`;
            a.click();
            URL.revokeObjectURL(url);
        }, "image/png");

        cancelScreenshot();
    };

    // ESC to cancel screenshot mode
    useEffect(() => {
        if (!screenshotMode) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") cancelScreenshot();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [screenshotMode]);

    // --- Recording functions ---
    const formatSize = (bytes: number) => {
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const startRecording = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const iframeWindow = iframeRef.current?.contentWindow as any;
        const canvas = iframeWindow?.document?.getElementById("videoCanvas") as HTMLCanvasElement | null;
        if (!canvas) return;

        // Try VP8+Opus (video+audio), then VP8-only, then plain webm
        const mimeTypes = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp8", "video/webm"];
        const mimeType = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || "video/webm";

        try {
            const stream = canvas.captureStream(60);

            // Try to capture audio from Selkies' AudioContext (exposed via monkey-patch)
            try {
                const audioCtx = iframeWindow?.__audioCtx;
                const gainNode = iframeWindow?.__audioGain;
                if (audioCtx && gainNode && audioCtx.state === "running") {
                    const dest = audioCtx.createMediaStreamDestination();
                    audioDestRef.current = dest;
                    gainNode.connect(dest);
                    dest.stream.getAudioTracks().forEach((track: MediaStreamTrack) => {
                        stream.addTrack(track);
                    });
                    console.log("[Recording] Audio capture attached");
                } else {
                    console.log("[Recording] No audio context available, recording video only");
                }
            } catch (audioErr) {
                console.log("[Recording] Audio capture failed, recording video only", audioErr);
            }

            recordingStreamRef.current = stream;
            const recorder = new MediaRecorder(stream, {
                mimeType,
                videoBitsPerSecond: 2_500_000,
            });

            recordingChunksRef.current = [];
            setRecordingSize(0);
            recordingStartTimeRef.current = Date.now();
            recordingPausedMsRef.current = 0;
            pauseStartRef.current = 0;

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    recordingChunksRef.current.push(e.data);
                    setRecordingSize(prev => prev + e.data.size);
                }
            };
            recorder.onstop = async () => {
                // Clean up audio destination node
                if (audioDestRef.current) {
                    try { audioDestRef.current.disconnect(); } catch { /* already disconnected */ }
                    audioDestRef.current = null;
                }
                // Stop all stream tracks
                recordingStreamRef.current?.getTracks().forEach(t => t.stop());
                recordingStreamRef.current = null;

                const rawBlob = new Blob(recordingChunksRef.current, { type: "video/webm" });
                // Calculate actual duration accounting for pauses
                const durationMs = Date.now() - recordingStartTimeRef.current - recordingPausedMsRef.current;
                const blob = await fixWebmDuration(rawBlob, durationMs, { logger: false });
                setRecordingBlob(blob);
                setRecordingSize(blob.size);
                setRecordingState("ready");
                if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
            };

            recorder.start(1000); // Collect data every second
            mediaRecorderRef.current = recorder;
            setRecordingState("recording");
            setRecordingElapsed(0);
            setRecordingBlob(null);

            // Elapsed time counter
            recordingTimerRef.current = setInterval(() => {
                setRecordingElapsed((prev) => prev + 1);
            }, 1000);

            // Show privacy toast once per session
            if (!hasShownToast) {
                setShowPrivacyToast(true);
                setHasShownToast(true);
                setTimeout(() => setShowPrivacyToast(false), 4000);
            }
        } catch {
            // Recording not supported
        }
    };

    const pauseRecording = () => {
        if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.pause();
            // Disable stream tracks to prevent frame buffering during pause
            recordingStreamRef.current?.getTracks().forEach(t => t.enabled = false);
            pauseStartRef.current = Date.now();
            setRecordingState("paused");
            if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        }
    };

    const resumeRecording = () => {
        if (mediaRecorderRef.current?.state === "paused") {
            // Accumulate paused duration
            recordingPausedMsRef.current += Date.now() - pauseStartRef.current;
            // Re-enable stream tracks before resuming
            recordingStreamRef.current?.getTracks().forEach(t => t.enabled = true);
            mediaRecorderRef.current.resume();
            setRecordingState("recording");
            recordingTimerRef.current = setInterval(() => {
                setRecordingElapsed((prev) => prev + 1);
            }, 1000);
        }
    };

    /** Stop the MediaRecorder gracefully, accumulating pause time. Returns true if recorder was active. */
    const stopRecorderGracefully = (): boolean => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return false;
        if (mediaRecorderRef.current.state === "paused" && pauseStartRef.current > 0) {
            recordingPausedMsRef.current += Date.now() - pauseStartRef.current;
        }
        recordingStreamRef.current?.getTracks().forEach(t => t.enabled = true);
        mediaRecorderRef.current.stop();
        return true;
    };

    const stopRecording = () => {
        stopRecorderGracefully();
    };

    const downloadRecording = () => {
        if (!recordingBlob) return;
        const url = URL.createObjectURL(recordingBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `session-${sessionId.slice(0, 8)}-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        // Reset to idle after download
        setRecordingState("idle");
        setRecordingBlob(null);
        setRecordingElapsed(0);
        setRecordingSize(0);
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
            socketRef.current.emit("session:join", { sessionId, viewer: isViewer });
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

    // Ended state — if recording was in progress, show download prompt before navigating
    if (status === "ended") {
        // No recording was active — go straight to the real session-ended page
        if (recordingState === "idle") {
            router.push("/session-ended");
            return null;
        }

        return (
            <main className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="text-center max-w-sm">
                    <p className="text-muted-foreground mb-1">Your session has ended.</p>
                    {recordingBlob ? (
                        <>
                            <p className="text-sm text-muted-foreground mb-4">
                                Your recording is ready — download it before leaving.
                            </p>
                            <Button
                                onClick={downloadRecording}
                                className="w-full mb-3 cursor-pointer"
                            >
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Download Recording ({formatSize(recordingSize)})
                            </Button>
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground mb-4">Finalizing your recording...</p>
                    )}
                    <button
                        onClick={() => router.push("/session-ended")}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                        {recordingBlob ? "Skip & continue →" : ""}
                    </button>
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
            {streamReady && !isToolbarMinimized && isViewer ? (
                /* Viewer toolbar: minimal — timer + latency + viewing label */
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
                    <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-full px-4 py-2 flex items-center gap-4 shadow-lg">
                        <span
                            className={`font-mono text-lg font-semibold ${getTimerColor()} ${isFlashing ? "animate-[flash_0.5s_ease-in-out_infinite]" : ""}`}
                        >
                            {formatTime(timeRemaining)}
                        </span>
                        <div className="w-px h-5 bg-white/20" />
                        <span className={`text-xs font-mono ${latency === null ? "text-white/40" : latency < 50 ? "text-green-400" : latency < 100 ? "text-yellow-400" : "text-red-400"}`}>
                            {latency !== null ? `${latency}ms` : "—ms"}
                        </span>
                        <div className="w-px h-5 bg-white/20" />
                        <span className="text-xs text-white/50 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            Viewing
                        </span>
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
            ) : streamReady && !isToolbarMinimized ? (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
                    <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-full px-4 py-2 flex items-center gap-4 shadow-lg">
                        {/* Timer */}
                        <span
                            className={`font-mono text-lg font-semibold ${getTimerColor()} ${isFlashing ? "animate-[flash_0.5s_ease-in-out_infinite]" : ""}`}
                        >
                            {formatTime(timeRemaining)}
                        </span>

                        {/* Latency */}
                        <div className="w-px h-5 bg-white/20" />
                        <span className={`text-xs font-mono ${latency === null ? "text-white/40" : latency < 50 ? "text-green-400" : latency < 100 ? "text-yellow-400" : "text-red-400"
                            }`}>
                            {latency !== null ? `${latency}ms` : "—ms"}
                        </span>

                        {/* Divider */}
                        <div className="w-px h-5 bg-white/20" />

                        {/* Record Button */}
                        {recordingState === "idle" && (
                            <button
                                onClick={startRecording}
                                className="flex items-center gap-1.5 text-white/70 hover:text-white transition-colors cursor-pointer"
                                title="Record session"
                            >
                                <div className="w-3 h-3 rounded-full border-2 border-current" />
                                <span className="text-xs">Record</span>
                            </button>
                        )}
                        {(recordingState === "recording" || recordingState === "paused") && (
                            <div className="flex items-center gap-2">
                                {/* Pause/Resume */}
                                <button
                                    onClick={recordingState === "recording" ? pauseRecording : resumeRecording}
                                    className="flex items-center gap-1 text-white/70 hover:text-white transition-colors cursor-pointer"
                                    title={recordingState === "recording" ? "Pause" : "Resume"}
                                >
                                    {recordingState === "recording" ? (
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                            <rect x="6" y="4" width="4" height="16" />
                                            <rect x="14" y="4" width="4" height="16" />
                                        </svg>
                                    ) : (
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                            <polygon points="5,3 19,12 5,21" />
                                        </svg>
                                    )}
                                </button>
                                {/* Recording indicator + time + size */}
                                <div className="flex items-center gap-1.5">
                                    <div className={`w-2.5 h-2.5 rounded-full ${recordingState === "recording" ? "bg-red-500 animate-pulse" : "bg-yellow-500"}`} />
                                    <span className="text-xs font-mono text-red-400">
                                        {formatTime(recordingElapsed)}
                                    </span>
                                    <span className="text-xs text-white/40">·</span>
                                    <span className="text-xs text-white/50 font-mono">
                                        {formatSize(recordingSize)}
                                    </span>
                                </div>
                                {/* Stop */}
                                <button
                                    onClick={stopRecording}
                                    className="flex items-center text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                                    title="Stop recording"
                                >
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                        <rect x="4" y="4" width="16" height="16" rx="2" />
                                    </svg>
                                </button>
                            </div>
                        )}
                        {recordingState === "ready" && (
                            <button
                                onClick={downloadRecording}
                                className="flex items-center gap-1.5 text-green-400 hover:text-green-300 transition-colors cursor-pointer"
                                title="Download recording"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                <span className="text-xs">{formatSize(recordingSize)}</span>
                            </button>
                        )}

                        <div className="w-px h-5 bg-white/20" />

                        {/* Screenshot Button */}
                        <button
                            onClick={startScreenshotMode}
                            className="flex items-center gap-1.5 text-white/70 hover:text-white transition-colors cursor-pointer"
                            title="Take area screenshot"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-xs">Screenshot</span>
                        </button>

                        <div className="w-px h-5 bg-white/20" />

                        {/* Share Button */}
                        <button
                            onClick={copyShareLink}
                            className="relative flex items-center gap-1.5 text-white/70 hover:text-white transition-colors cursor-pointer"
                            title="Copy viewer link"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                            </svg>
                            <span className="text-xs">Share</span>
                            {viewerCount > 0 && (
                                <span className="absolute -top-1.5 -right-2 bg-blue-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                    {viewerCount}
                                </span>
                            )}
                        </button>

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
                    {(recordingState === "recording" || recordingState === "paused") && (
                        <div className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-black/40 ${recordingState === "recording" ? "bg-red-500 animate-pulse" : "bg-yellow-500"}`} />
                    )}
                </button>
            ) : null}

            {/* Browser iframe — loads behind overlay when port is available */}
            {port && (
                <iframe
                    ref={iframeRef}
                    src={`/browser/${port}/${isViewer ? "#shared" : ""}`}
                    className="flex-1 w-full border-0"
                    allow="clipboard-read; clipboard-write; autoplay"
                    onLoad={handleIframeLoad}
                />
            )}

            {/* Screenshot selection overlay */}
            {screenshotMode && (
                <div
                    ref={selectionOverlayRef}
                    className="absolute inset-0 z-[60] cursor-crosshair select-none overflow-hidden"
                    style={{ top: iframeRef.current?.offsetTop || 0 }}
                    onMouseDown={handleScreenshotMouseDown}
                    onMouseMove={handleScreenshotMouseMove}
                    onMouseUp={handleScreenshotMouseUp}
                >
                    {/* Dimmed background */}
                    <div className="absolute inset-0 bg-black/40" />
                    {/* Instructions */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
                        <div className="bg-black/70 backdrop-blur-md border border-white/10 rounded-full px-4 py-2 flex items-center gap-3 shadow-lg">
                            <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-white/90 text-sm">Drag to select area</span>
                            <span className="text-white/40 text-xs">ESC to cancel</span>
                        </div>
                    </div>
                    {/* Selection rectangle */}
                    {selectionStart && selectionEnd && (() => {
                        const x = Math.min(selectionStart.x, selectionEnd.x);
                        const y = Math.min(selectionStart.y, selectionEnd.y);
                        const w = Math.abs(selectionEnd.x - selectionStart.x);
                        const h = Math.abs(selectionEnd.y - selectionStart.y);
                        return (
                            <>
                                {/* Clear window in the dim overlay */}
                                <div
                                    className="absolute bg-transparent border-2 border-white/80 border-dashed"
                                    style={{ left: x, top: y, width: w, height: h }}
                                />
                                {/* Re-dim everything except the selection using clip-path */}
                                <div
                                    className="absolute inset-0 bg-black/40"
                                    style={{
                                        clipPath: `polygon(0% 0%, 0% 100%, ${x}px 100%, ${x}px ${y}px, ${x + w}px ${y}px, ${x + w}px ${y + h}px, ${x}px ${y + h}px, ${x}px 100%, 100% 100%, 100% 0%)`,
                                    }}
                                />
                                {/* Dimension label */}
                                {w > 60 && h > 30 && (
                                    <div
                                        className="absolute text-xs text-white/70 bg-black/60 rounded px-1.5 py-0.5"
                                        style={{ left: x + w / 2 - 20, top: y + h + 4 }}
                                    >
                                        {Math.round(w)}×{Math.round(h)}
                                    </div>
                                )}
                            </>
                        );
                    })()}
                </div>
            )}

            {/* Share link copied toast */}
            {showShareToast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-[slideUp_0.3s_ease-out]">
                    <div className="bg-black/70 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg">
                        <span className="text-sm">🔗</span>
                        <p className="text-white/90 text-sm">Viewer link copied to clipboard!</p>
                    </div>
                </div>
            )}

            {/* Privacy toast notification */}
            {showPrivacyToast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-[slideUp_0.3s_ease-out]">
                    <div className="bg-black/70 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg">
                        <span className="text-sm">🔒</span>
                        <p className="text-white/90 text-sm">Recording is saved locally on your device only. We do not store any recordings.</p>
                    </div>
                </div>
            )}

            {/* Custom animations */}
            <style jsx>{`
                @keyframes flash {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translate(-50%, 20px); }
                    to { opacity: 1; transform: translate(-50%, 0); }
                }
            `}</style>
        </main>
    );
}
