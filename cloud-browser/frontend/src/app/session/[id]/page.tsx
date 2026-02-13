"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { io, Socket } from "socket.io-client";

type SessionStatus = "connecting" | "reconnecting" | "active" | "ended" | "error" | "not_found" | "taken_over";

/**
 * Patch WebM blob header with the correct duration so the file is seekable.
 * Chrome's MediaRecorder omits the Duration element entirely — this finds the
 * Info section (0x1549A966), inserts a Duration element, and adjusts sizes.
 */
async function fixWebmDuration(blob: Blob, durationMs: number): Promise<Blob> {
    try {
        const headerSize = Math.min(blob.size, 4096);
        const buf = await blob.slice(0, headerSize).arrayBuffer();
        const bytes = new Uint8Array(buf);

        // Find Info element (ID: 0x15 0x49 0xA9 0x66)
        let infoPos = -1;
        for (let i = 0; i < bytes.length - 4; i++) {
            if (bytes[i] === 0x15 && bytes[i + 1] === 0x49 && bytes[i + 2] === 0xA9 && bytes[i + 3] === 0x66) {
                infoPos = i;
                break;
            }
        }
        if (infoPos === -1) return blob;

        // Read Info section VINT size
        const sizeStart = infoPos + 4;
        const firstByte = bytes[sizeStart];
        let vintLen = 0;
        for (let bit = 7; bit >= 0; bit--) {
            if (firstByte & (1 << bit)) { vintLen = 8 - bit; break; }
        }
        if (vintLen === 0) return blob;

        // Decode current Info size
        let infoSize = firstByte & ((1 << (8 - vintLen)) - 1);
        for (let j = 1; j < vintLen; j++) {
            infoSize = (infoSize * 256) + bytes[sizeStart + j];
        }

        const infoDataStart = sizeStart + vintLen;
        const infoEnd = infoDataStart + infoSize;

        // Build Duration element: ID (2) + size VINT (1) + float64 (8) = 11 bytes
        const durationElement = new Uint8Array(11);
        durationElement[0] = 0x44; // Duration ID
        durationElement[1] = 0x89;
        durationElement[2] = 0x88; // VINT size = 8
        const dv = new DataView(durationElement.buffer);
        dv.setFloat64(3, durationMs, false);

        // Encode new Info size (original + 11)
        const newInfoSize = infoSize + 11;
        const newSizeBytes = new Uint8Array(vintLen);
        let remaining = newInfoSize;
        for (let j = vintLen - 1; j >= 0; j--) {
            newSizeBytes[j] = remaining & 0xFF;
            remaining = Math.floor(remaining / 256);
        }
        newSizeBytes[0] |= (1 << (8 - vintLen)); // Set VINT marker bit

        // Assemble: [before Info size] + [new size] + [Info content] + [Duration] + [rest of file]
        const beforeSize = buf.slice(0, sizeStart);
        const infoContent = buf.slice(infoDataStart, infoEnd);
        const afterInfo = blob.slice(infoEnd);

        return new Blob([beforeSize, newSizeBytes, infoContent, durationElement, afterInfo], { type: blob.type });
    } catch {
        return blob; // If anything fails, return original
    }
}

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
    const [latency, setLatency] = useState<number | null>(null);
    const latencyIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

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
                // Auto-stop recording before navigating away
                if (mediaRecorderRef.current?.state === "recording") {
                    mediaRecorderRef.current.stop();
                }
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
        if (hasNavigated.current) return;
        hasNavigated.current = true;
        // Auto-stop recording before navigating away
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
        }
        localStorage.removeItem(`session_${sessionId}`);
        router.push("/session-ended");
        // Fire and forget — don't block navigation on container teardown
        fetch(`${apiUrl}/api/session/${sessionId}`, { method: "DELETE" }).catch(() => { });
    };

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

        // Try VP8 first (best compatibility with canvas capture), fallback to plain webm
        const mimeTypes = ["video/webm;codecs=vp8", "video/webm"];
        const mimeType = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || "video/webm";

        try {
            const stream = canvas.captureStream(60);
            recordingStreamRef.current = stream;
            const recorder = new MediaRecorder(stream, {
                mimeType,
                videoBitsPerSecond: 5_000_000,
            });

            recordingChunksRef.current = [];
            setRecordingSize(0);

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    recordingChunksRef.current.push(e.data);
                    setRecordingSize(prev => prev + e.data.size);
                }
            };
            recorder.onstop = async () => {
                const rawBlob = new Blob(recordingChunksRef.current, { type: "video/webm" });
                const elapsed = recordingElapsed;
                const blob = await fixWebmDuration(rawBlob, elapsed * 1000);
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
            setRecordingState("paused");
            if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        }
    };

    const resumeRecording = () => {
        if (mediaRecorderRef.current?.state === "paused") {
            // Re-enable stream tracks before resuming
            recordingStreamRef.current?.getTracks().forEach(t => t.enabled = true);
            mediaRecorderRef.current.resume();
            setRecordingState("recording");
            recordingTimerRef.current = setInterval(() => {
                setRecordingElapsed((prev) => prev + 1);
            }, 1000);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            // Re-enable tracks if paused so the final data flush works
            recordingStreamRef.current?.getTracks().forEach(t => t.enabled = true);
            mediaRecorderRef.current.stop();
        }
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
