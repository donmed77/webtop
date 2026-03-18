"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { io, Socket } from "socket.io-client";
import fixWebmDuration from "fix-webm-duration";

type SessionStatus = "connecting" | "reconnecting" | "active" | "ended" | "error" | "not_found" | "taken_over";

const RECONNECT_COUNTDOWN_SECONDS = 30;
const SVG_RADIUS = 36;
const SVG_CIRCUMFERENCE = 2 * Math.PI * SVG_RADIUS;

export default function SessionPage() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const sessionId = params.id as string;
    const isViewer = searchParams.get("viewer") === "true";

    const [port, setPort] = useState<number | null>(null);
    const [sessionToken, setSessionToken] = useState<string | null>(null);
    const [timeRemaining, setTimeRemaining] = useState(300);
    const [status, setStatus] = useState<SessionStatus>("connecting");
    const [error, setError] = useState("");
    const hasNavigated = useRef(false);
    const [streamReady, setStreamReady] = useState(false);
    const [isToolbarMinimized, setIsToolbarMinimized] = useState(false);
    const [toolbarMinPos, setToolbarMinPos] = useState({ right: 16, top: 16 });
    const [toolbarMinDragging, setToolbarMinDragging] = useState(false);
    const toolbarMinDragStart = useRef<{ x: number; y: number; right: number; top: number } | null>(null);
    const [reconnectCountdown, setReconnectCountdown] = useState<number | null>(null);
    const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [latency, setLatency] = useState<number | null>(null);
    const latencyIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [viewerCount, setViewerCount] = useState(0);
    const [showShareToast, setShowShareToast] = useState(false);
    const [showTakeoverToast, setShowTakeoverToast] = useState(false);
    const [screenshotMode, setScreenshotMode] = useState(false);
    const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);

    // Clipboard sync state
    const [clipboardText, setClipboardText] = useState("");
    const [clipboardOpen, setClipboardOpen] = useState(false);
    const [clipboardSynced, setClipboardSynced] = useState(false);
    const [clipboardFlash, setClipboardFlash] = useState(false);

    // Mobile keyboard state
    const [isTouchDevice, setIsTouchDevice] = useState(false);
    const [kbdPos, setKbdPos] = useState({ right: 40, bottom: 40 });
    const [kbdDragging, setKbdDragging] = useState(false);
    const kbdDragStart = useRef<{ x: number; y: number; right: number; bottom: number } | null>(null);

    // Feedback state
    const [feedbackOpen, setFeedbackOpen] = useState(false);
    const [feedbackType, setFeedbackType] = useState<"bug" | "suggestion" | "other">("bug");
    const [feedbackMessage, setFeedbackMessage] = useState("");
    const [feedbackEmail, setFeedbackEmail] = useState("");
    const [feedbackEmailError, setFeedbackEmailError] = useState("");
    const [feedbackSubmitError, setFeedbackSubmitError] = useState("");
    const [feedbackSending, setFeedbackSending] = useState(false);
    const [showFeedbackToast, setShowFeedbackToast] = useState(false);
    const [feedbackFiles, setFeedbackFiles] = useState<File[]>([]);
    const [feedbackFileError, setFeedbackFileError] = useState("");
    const [feedbackDragOver, setFeedbackDragOver] = useState(false);
    const feedbackFileInputRef = useRef<HTMLInputElement>(null);
    const MAX_FEEDBACK_FILES = 3;
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const ALLOWED_FILE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'];

    const handleFeedbackFiles = useCallback((incoming: File[]) => {
        setFeedbackFileError("");
        setFeedbackFiles(prev => {
            const slots = MAX_FEEDBACK_FILES - prev.length;
            if (slots <= 0) {
                setFeedbackFileError(`Max ${MAX_FEEDBACK_FILES} files`);
                setTimeout(() => setFeedbackFileError(""), 3000);
                return prev;
            }
            const accepted: File[] = [];
            for (const f of incoming) {
                if (!ALLOWED_FILE_TYPES.includes(f.type)) {
                    setFeedbackFileError("Unsupported format — use PNG, JPG, GIF, WebP, MP4, WebM");
                    setTimeout(() => setFeedbackFileError(""), 3000);
                    continue;
                }
                if (f.size > MAX_FILE_SIZE) {
                    setFeedbackFileError("File too large (max 10MB)");
                    setTimeout(() => setFeedbackFileError(""), 3000);
                    continue;
                }
                if (accepted.length < slots) accepted.push(f);
            }
            return [...prev, ...accepted];
        });
    }, []);

    // Mobile toolbar overflow menu
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // Audio state
    const [audioMuted, setAudioMuted] = useState(true);

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

    const shutterCtxRef = useRef<AudioContext | null>(null);
    const shutterBufferRef = useRef<AudioBuffer | null>(null);
    const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const scrollCountRef = useRef(0);

    // Listen for clipboard updates from the iframe (Cloud → Local)
    useEffect(() => {
        const handleMessage = (e: MessageEvent) => {
            if (e.data?.type === "clipboardContentUpdate" && typeof e.data.text === "string") {
                setClipboardText(e.data.text);
                setClipboardOpen(true);
                // Green flash animation for incoming remote clipboard
                setClipboardFlash(true);
                setClipboardSynced(true);
                setTimeout(() => setClipboardSynced(false), 1500);
                setTimeout(() => setClipboardFlash(false), 2000);
            }
        };
        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, []);

    // Send clipboard text to remote desktop (Local → Cloud)
    const syncClipboardToRemote = useCallback((text: string) => {
        if (text && iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
                { type: "clipboardUpdateFromUI", text },
                "*"
            );
            setClipboardSynced(true);
            setTimeout(() => setClipboardSynced(false), 1500);
        }
    }, []);

    // Detect touch device (3-layer approach: pointer:coarse, maxTouchPoints, ontouchstart)
    useEffect(() => {
        const check = () => {
            const isCoarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
            const hasTouchSmallScreen = (navigator.maxTouchPoints > 0 || "ontouchstart" in window) && window.innerWidth < 1400;
            setIsTouchDevice(isCoarsePointer || hasTouchSmallScreen);
        };
        check();
    }, []);

    // Toggle virtual keyboard (mobile only) — mirrors Selkies behavior
    const toggleVirtualKeyboard = useCallback(() => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const iframeDoc = (iframeRef.current?.contentWindow as any)?.document;
            if (!iframeDoc) return;

            const kbdInput = iframeDoc.getElementById("keyboard-input-assist") as HTMLInputElement | null;
            const overlayInput = iframeDoc.getElementById("overlayInput") as HTMLElement | null;

            if (!kbdInput) return;

            // If already focused, blur to dismiss keyboard
            if (iframeDoc.activeElement === kbdInput) {
                kbdInput.blur();
                kbdInput.setAttribute("aria-hidden", "true");
                return;
            }

            // Focus to pop keyboard
            kbdInput.removeAttribute("aria-hidden");
            kbdInput.value = "";
            kbdInput.focus();

            // Dismiss on overlay touch (like Selkies does)
            // Delay listener attachment so the current touch cycle doesn't immediately trigger it
            if (overlayInput) {
                setTimeout(() => {
                    overlayInput.addEventListener("touchstart", () => {
                        if (iframeDoc.activeElement === kbdInput) {
                            kbdInput.blur();
                            kbdInput.setAttribute("aria-hidden", "true");
                        }
                    }, { once: true, passive: true });
                }, 300);
            }
        } catch (e) {
            console.warn("Could not toggle virtual keyboard:", e);
        }
    }, []);

    const [uploadProgress, setUploadProgress] = useState(0);

    const submitFeedback = useCallback(async () => {
        if (!feedbackMessage.trim() || feedbackSending) return;

        // Validate email if provided
        if (feedbackEmail.trim()) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(feedbackEmail.trim())) {
                setFeedbackEmailError("Please enter a valid email address");
                return;
            }
        }
        setFeedbackEmailError("");
        setFeedbackSending(true);
        setUploadProgress(0);

        const formData = new FormData();
        formData.append('sessionId', sessionId);
        formData.append('type', feedbackType);
        formData.append('message', feedbackMessage.trim());
        if (feedbackEmail.trim()) formData.append('email', feedbackEmail.trim());
        for (const file of feedbackFiles) {
            formData.append('files', file);
        }

        try {
            const result = await new Promise<{ ok: boolean; data?: Record<string, unknown> }>((resolve) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', '/api/feedback');
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
                };
                xhr.onload = () => {
                    const data = (() => { try { return JSON.parse(xhr.responseText); } catch { return null; } })();
                    resolve({ ok: xhr.status >= 200 && xhr.status < 300, data });
                };
                xhr.onerror = () => resolve({ ok: false });
                xhr.send(formData);
            });

            if (result.ok) {
                setFeedbackMessage("");
                setFeedbackEmail("");
                setFeedbackFiles([]);
                setFeedbackSubmitError("");
                setFeedbackOpen(false);
                setShowFeedbackToast(true);
                setTimeout(() => setShowFeedbackToast(false), 3000);
            } else {
                const msg = Array.isArray(result.data?.message) ? (result.data.message as string[])[0] : ((result.data?.message as string) || "Failed to send feedback");
                setFeedbackSubmitError(msg);
            }
        } catch { setFeedbackSubmitError("Network error — try again"); }
        setUploadProgress(0);
        setFeedbackSending(false);
    }, [feedbackMessage, feedbackEmail, feedbackSending, feedbackType, feedbackFiles, sessionId]);

    // Preload + decode shutter sound into AudioBuffer for instant playback
    useEffect(() => {
        const ctx = new AudioContext();
        shutterCtxRef.current = ctx;
        fetch("/sounds/shutter.mp3")
            .then(r => r.arrayBuffer())
            .then(buf => ctx.decodeAudioData(buf))
            .then(decoded => { shutterBufferRef.current = decoded; })
            .catch(() => { });
        return () => { ctx.close().catch(() => { }); };
    }, []);

    const apiUrl = typeof window !== 'undefined' ? window.location.origin : '';

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

    const clearReconnectTimer = () => {
        setReconnectCountdown(null);
        if (reconnectTimerRef.current) {
            clearInterval(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
    };

    // Handle socket connection and reconnection
    useEffect(() => {

        const connectSocket = async () => {
            // First check if session exists
            const sessionData = await checkSession();

            if (!sessionData) {
                router.replace("/session-ended?reason=not_found");
                return;
            }

            // Session exists, connect via WebSocket
            const socket = io(apiUrl, {
                reconnection: true,
                reconnectionAttempts: 30,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 2000,
            });

            socketRef.current = socket;

            socket.on("connect", () => {
                socket.emit("session:join", { sessionId, viewer: isViewer });
                clearReconnectTimer();
            });

            socket.on("session:joined", (data) => {
                setPort(data.port);
                setSessionToken(data.sessionToken);
                setTimeRemaining(data.timeRemaining);
                setStatus("active");

                // Only store session info for controller (not viewer)
                if (!isViewer) {
                    localStorage.setItem(`session_${sessionId}`, JSON.stringify({
                        port: data.port,
                        sessionToken: data.sessionToken,
                        connectedAt: Date.now(),
                    }));
                }
            });

            socket.on("session:timer", (data) => {
                setTimeRemaining(data.timeRemaining);
            });

            // session:warning — timer flashing handled via CSS in render

            socket.on("session:ended", () => {
                if (hasNavigated.current) return;
                hasNavigated.current = true;
                if (!isViewer) localStorage.removeItem(`session_${sessionId}`);
                // Viewers just navigate away on session end
                if (isViewer) {
                    router.replace("/session-ended?reason=expired&viewer=true");
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
                if (data?.viewerLimitReached) {
                    router.replace("/session-ended?reason=viewer_limit");
                } else {
                    router.replace("/session-ended?reason=not_found");
                }
            });

            // EC1: Another tab took over this session
            socket.on("session:takeover", () => {
                // Stop recording — iframe will be unmounted, stream source dies
                stopRecorderGracefully();
                setRecordingState("idle");
                setRecordingBlob(null);
                setRecordingElapsed(0);
                setRecordingSize(0);
                // Clean up: disconnect socket and clear localStorage
                if (!isViewer) localStorage.removeItem(`session_${sessionId}`);
                socket.disconnect();
                setStatus("taken_over");
            });

            socket.on("disconnect", (reason) => {
                if (reason === "io server disconnect") {
                    // Server disconnected us — could be restart, try reconnecting
                    socket.connect();
                }
                // Start countdown for all disconnect types
                setStatus("reconnecting");

                // Clear any stale interval (but don't null the countdown)
                if (reconnectTimerRef.current) {
                    clearInterval(reconnectTimerRef.current);
                    reconnectTimerRef.current = null;
                }
                setReconnectCountdown(RECONNECT_COUNTDOWN_SECONDS);
                reconnectTimerRef.current = setInterval(() => {
                    setReconnectCountdown(prev => {
                        if (prev === null || prev <= 1) {
                            clearReconnectTimer();
                            return 0;
                        }
                        return prev - 1;
                    });
                }, 1000);
            });

            socket.on("reconnect", () => {
                clearReconnectTimer();
                socket.emit("session:join", { sessionId, viewer: isViewer });
            });
        };

        connectSocket();

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
            clearReconnectTimer();
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
            }, 5000);
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
            // Cross-origin fallback — rely on the postMessage listener or fallback timeout
        }
    };

    // Listen for postMessage from iframe sub_filter (reliable even on refresh)
    useEffect(() => {
        const handleStreamMessage = (e: MessageEvent) => {
            if (e.data?.type === "streamStarted") {
                setTimeout(() => setStreamReady(true), 1500);
            }
            if (e.data?.type === "audioState") {
                setAudioMuted(e.data.muted);
            }
        };
        window.addEventListener("message", handleStreamMessage);
        return () => window.removeEventListener("message", handleStreamMessage);
    }, []);

    // Toggle audio in the iframe via postMessage
    const toggleAudio = () => {
        iframeRef.current?.contentWindow?.postMessage({ type: "toggleAudio" }, "*");
        setAudioMuted(!audioMuted);
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
            router.replace(`/survey?sessionId=${sessionId}`);
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
        if (shutterCtxRef.current && shutterBufferRef.current) {
            const source = shutterCtxRef.current.createBufferSource();
            source.buffer = shutterBufferRef.current;
            source.connect(shutterCtxRef.current.destination);
            source.start();
        }
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

    // ESC to cancel screenshot mode or close panels
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (screenshotMode) cancelScreenshot();
                if (clipboardOpen) setClipboardOpen(false);
                if (feedbackOpen) setFeedbackOpen(false);
                if (mobileMenuOpen) setMobileMenuOpen(false);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [screenshotMode, clipboardOpen, feedbackOpen, mobileMenuOpen]);

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
                // Stop all stream tracks
                recordingStreamRef.current?.getTracks().forEach(t => t.stop());
                recordingStreamRef.current = null;

                const rawBlob = new Blob(recordingChunksRef.current, { type: "video/webm" });
                // Calculate actual duration accounting for pauses
                const durationMs = Date.now() - recordingStartTimeRef.current - recordingPausedMsRef.current;

                // Try to fix duration, with timeout and fallback to raw blob
                let blob = rawBlob;
                try {
                    const fixed = await Promise.race([
                        fixWebmDuration(rawBlob, durationMs, { logger: false }),
                        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
                    ]);
                    blob = fixed;
                } catch {
                    // fixWebmDuration failed or timed out — use raw blob
                }
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
        // Reconnect and reclaim primary
        const socket = io(apiUrl, {
            reconnection: true,
            reconnectionAttempts: 30,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 2000,
        });
        socketRef.current = socket;
        socket.on("connect", () => {
            socket.emit("session:join", { sessionId, viewer: isViewer });
        });
        socket.on("session:joined", (data) => {
            setPort(data.port);
            setSessionToken(data.sessionToken);
            setTimeRemaining(data.timeRemaining);
            setStatus("active");
            // Show toast indicating session was resumed
            setShowTakeoverToast(true);
            setTimeout(() => setShowTakeoverToast(false), 3000);
            if (!isViewer) {
                localStorage.setItem(`session_${sessionId}`, JSON.stringify({
                    port: data.port,
                    sessionToken: data.sessionToken,
                    connectedAt: Date.now(),
                }));
            }
        });
        socket.on("session:timer", (data) => {
            setTimeRemaining(data.timeRemaining);
        });
        socket.on("session:ended", () => {
            if (hasNavigated.current) return;
            hasNavigated.current = true;
            if (!isViewer) localStorage.removeItem(`session_${sessionId}`);
            router.replace(`/survey?sessionId=${sessionId}&reason=expired`);
        });
        socket.on("session:error", (data) => {
            if (data?.viewerLimitReached) {
                router.replace("/session-ended?reason=viewer_limit");
            } else {
                router.replace("/session-ended?reason=not_found");
            }
        });
        socket.on("session:takeover", () => {
            stopRecorderGracefully();
            setRecordingState("idle");
            setRecordingBlob(null);
            setRecordingElapsed(0);
            setRecordingSize(0);
            if (!isViewer) localStorage.removeItem(`session_${sessionId}`);
            socket.disconnect();
            setStatus("taken_over");
        });
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

    // Reconnect countdown — redirect when it hits 0
    useEffect(() => {
        if (reconnectCountdown === 0 && status === "reconnecting") {
            if (hasNavigated.current) return;
            hasNavigated.current = true;
            socketRef.current?.disconnect();
            if (!isViewer) localStorage.removeItem(`session_${sessionId}`);
            setPort(null); // unmount iframe so last frame doesn't show through
            router.replace(isViewer ? "/session-ended?reason=abandoned&viewer=true" : `/survey?sessionId=${sessionId}&reason=abandoned`);
        }
    }, [reconnectCountdown, status]);

    // Session not found — handled by redirect in connectSocket

    // Error state — handled by redirect in session:error handler


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
            router.replace(`/survey?sessionId=${sessionId}&reason=expired`);
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
                        onClick={() => router.replace(`/survey?sessionId=${sessionId}&reason=expired`)}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                        {recordingBlob ? "Skip & continue →" : ""}
                    </button>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-[100dvh] bg-background flex flex-col relative">
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
            {streamReady && !isToolbarMinimized && isViewer && (
                /* Viewer toolbar: minimal — timer + latency + viewing label */
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
                    <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-full px-4 py-2 flex items-center gap-4 shadow-lg">
                        <span
                            className={`font-mono text-lg font-semibold ${getTimerColor()} ${isFlashing ? "animate-[flash_0.5s_ease-in-out_infinite] will-change-[color]" : ""}`}
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
                            className="text-white/60 hover:text-white transition-colors cursor-pointer focus:outline-none"
                            title="Minimize"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
            {streamReady && !isToolbarMinimized && !isViewer && (
                <div className="absolute top-2 lg:top-4 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-16px)]">
                    <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-full px-2.5 lg:px-4 py-1.5 lg:py-2 flex items-center gap-1.5 lg:gap-4 shadow-lg">
                        {/* Timer */}
                        <span
                            className={`font-mono text-lg font-semibold tabular-nums min-w-[52px] text-center ${getTimerColor()} ${isFlashing ? "animate-[flash_0.5s_ease-in-out_infinite] will-change-[color]" : ""}`}
                        >
                            {formatTime(timeRemaining)}
                        </span>

                        {/* Latency */}
                        <div className="w-px h-5 bg-white/20" />
                        <span className={`text-xs font-mono tabular-nums min-w-[42px] text-right ${latency === null ? "text-white/40" : latency < 50 ? "text-green-400" : latency < 100 ? "text-yellow-400" : "text-red-400"
                            }`}>
                            {latency !== null ? `${latency}ms` : "—ms"}
                        </span>

                        {/* Mobile Audio Toggle */}
                        <div className="lg:hidden w-px h-5 bg-white/20" />
                        <button
                            onClick={toggleAudio}
                            className={`lg:hidden flex items-center justify-center w-7 h-7 rounded-full transition-colors cursor-pointer focus:outline-none ${audioMuted ? "text-white/40 hover:text-white" : "text-white/70 hover:text-white"}`}
                            title={audioMuted ? "Unmute audio" : "Mute audio"}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                {audioMuted ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                                ) : (
                                    <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728" /></>
                                )}
                            </svg>
                        </button>

                        {/* Divider */}
                        <div className="w-px h-5 bg-white/20" />

                        {/* Record Button */}
                        {recordingState === "idle" && (
                            <button
                                onClick={startRecording}
                                className="hidden lg:flex items-center gap-1.5 text-white/70 hover:text-white transition-colors cursor-pointer focus:outline-none"
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
                                    className="flex items-center gap-1 text-white/70 hover:text-white transition-colors cursor-pointer focus:outline-none"
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
                                <div className="flex items-center gap-1 lg:gap-1.5">
                                    <div className={`w-2.5 h-2.5 rounded-full ${recordingState === "recording" ? "bg-red-500 animate-pulse" : "bg-yellow-500"}`} />
                                    <span className="text-xs font-mono text-red-400 tabular-nums min-w-[40px]">
                                        {formatTime(recordingElapsed)}
                                    </span>
                                    <span className="text-xs text-white/40 hidden lg:inline">·</span>
                                    <span className="text-xs text-white/50 font-mono tabular-nums min-w-[48px] hidden lg:inline">
                                        {formatSize(recordingSize)}
                                    </span>
                                </div>
                                {/* Stop */}
                                <button
                                    onClick={stopRecording}
                                    className="flex items-center text-red-400 hover:text-red-300 transition-colors cursor-pointer focus:outline-none"
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
                                className="hidden lg:flex items-center gap-1.5 text-green-400 hover:text-green-300 transition-colors cursor-pointer focus:outline-none whitespace-nowrap"
                                title="Download recording"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                <span className="text-xs">Download ({formatSize(recordingSize)})</span>
                            </button>
                        )}

                        {/* === DESKTOP ONLY: secondary items === */}
                        <div className="hidden lg:contents">
                            <div className="w-px h-5 bg-white/20" />

                            {/* Screenshot Button */}
                            <button
                                onClick={startScreenshotMode}
                                className="flex items-center gap-1.5 text-white/70 hover:text-white transition-colors cursor-pointer focus:outline-none"
                                title="Take area screenshot"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span className="text-xs hidden lg:inline">Screenshot</span>
                            </button>

                            <div className="w-px h-5 bg-white/20" />

                            {/* Audio Toggle */}
                            <button
                                onClick={toggleAudio}
                                className={`flex items-center gap-1.5 transition-colors cursor-pointer focus:outline-none ${audioMuted ? "text-white/40 hover:text-white" : "text-white/70 hover:text-white"}`}
                                title={audioMuted ? "Unmute audio" : "Mute audio"}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                    {audioMuted ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                                    ) : (
                                        <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728" /></>
                                    )}
                                </svg>
                                <span className="text-xs hidden lg:inline">{audioMuted ? "Unmute" : "Mute"}</span>
                            </button>

                            <div className="w-px h-5 bg-white/20" />

                            {/* Clipboard Toggle + Dropdown */}
                            <div className="relative">
                                <button
                                    onClick={() => { setClipboardOpen(!clipboardOpen); setFeedbackOpen(false); }}
                                    className={`flex items-center gap-1.5 transition-colors cursor-pointer focus:outline-none ${clipboardSynced ? "text-green-400" : clipboardOpen ? "text-white" : "text-white/70 hover:text-white"
                                        }`}
                                    title="Toggle clipboard"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    <span className="text-xs hidden lg:inline">Clipboard</span>
                                </button>

                                {/* Clipboard panel — centered dropdown below button */}
                                {clipboardOpen && (
                                    <div className="absolute left-1/2 -translate-x-1/2 top-full mt-5 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-lg w-[260px] sm:w-[300px] overflow-hidden z-50" style={{ transition: 'border-color 0.5s ease' }}>
                                        <div className="px-3 py-1.5 border-b border-white/5 flex items-center justify-between">
                                            <span className={`text-[10px] font-medium uppercase tracking-wider transition-colors duration-500 ${clipboardFlash ? "text-green-400" : "text-white/30"
                                                }`}>
                                                {clipboardFlash ? "✓ Clipboard updated" : "Remote Clipboard"}
                                            </span>
                                        </div>
                                        <div className="p-2">
                                            <textarea
                                                value={clipboardText}
                                                onChange={(e) => setClipboardText(e.target.value)}
                                                onBlur={() => syncClipboardToRemote(clipboardText)}
                                                onPaste={(e) => {
                                                    const pasted = e.clipboardData.getData("text/plain");
                                                    if (pasted) {
                                                        e.preventDefault();
                                                        setClipboardText(pasted);
                                                        syncClipboardToRemote(pasted);
                                                    }
                                                }}
                                                placeholder="Paste here to send to remote desktop..."
                                                className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none resize-none transition-all duration-500 ${clipboardFlash
                                                    ? "border-green-400/50 text-green-300"
                                                    : "border-white/10 focus:border-white/20"
                                                    }`}
                                                rows={4}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="w-px h-5 bg-white/20" />

                            {/* Feedback Toggle + Dropdown */}
                            <div className="relative">
                                <button
                                    onClick={() => { setFeedbackOpen(!feedbackOpen); setClipboardOpen(false); }}
                                    className={`flex items-center gap-1.5 transition-colors cursor-pointer focus:outline-none ${feedbackOpen ? "text-white" : "text-white/70 hover:text-white"
                                        }`}
                                    title="Send feedback"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                    <span className="text-xs hidden lg:inline">Feedback</span>
                                </button>

                                {feedbackOpen && (
                                    <div className="absolute left-1/2 -translate-x-1/2 top-full mt-5 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-lg w-[260px] sm:w-[300px] overflow-hidden z-50">
                                        <div className="px-3 py-1.5 border-b border-white/5">
                                            <span className="text-[10px] font-medium uppercase tracking-wider text-white/30">Send Feedback</span>
                                        </div>
                                        <div className="p-3 space-y-3">
                                            {/* Email */}
                                            <div>
                                                <input
                                                    type="email"
                                                    value={feedbackEmail}
                                                    onChange={(e) => { setFeedbackEmail(e.target.value); setFeedbackEmailError(""); }}
                                                    placeholder="E-Mail (leave empty to comment anonymously)"
                                                    className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none ${feedbackEmailError ? "border-red-500/50 focus:border-red-500/70" : "border-white/10 focus:border-white/20"}`}
                                                />
                                                {feedbackEmailError && (
                                                    <p className="text-red-400 text-[10px] mt-1">{feedbackEmailError}</p>
                                                )}
                                            </div>
                                            {/* Type pills */}
                                            <div className="flex gap-1.5">
                                                {(["bug", "suggestion", "other"] as const).map((t) => (
                                                    <button
                                                        key={t}
                                                        onClick={() => setFeedbackType(t)}
                                                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer focus:outline-none border ${feedbackType === t
                                                            ? t === "bug" ? "bg-red-500/20 text-red-400 border-red-500/30"
                                                                : t === "suggestion" ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                                                                    : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                                                            : "bg-white/5 text-white/40 border-white/5 hover:bg-white/10"
                                                            }`}
                                                    >
                                                        {t === "bug" ? (
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.96l-6.93-12a2 2 0 00-3.5 0l-6.93 12A2 2 0 005.07 19z" /></svg>
                                                        ) : t === "suggestion" ? (
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                                                        ) : (
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                                        )}
                                                        {t === "bug" ? "Bug" : t === "suggestion" ? "Suggestion" : "Other"}
                                                    </button>
                                                ))}
                                            </div>
                                            {/* Message */}
                                            <div>
                                                <textarea
                                                    value={feedbackMessage}
                                                    onChange={(e) => { setFeedbackMessage(e.target.value.slice(0, 500)); setFeedbackSubmitError(""); }}
                                                    placeholder="Describe your feedback..."
                                                    className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none resize-none ${feedbackSubmitError ? "border-red-500/50 focus:border-red-500/70" : "border-white/10 focus:border-white/20"}`}
                                                    rows={4}
                                                />
                                                <div className="flex justify-between items-center mt-1">
                                                    <span className="text-[10px] text-red-400">{feedbackSubmitError}</span>
                                                    <span className={`text-[10px] ${feedbackMessage.length >= 450 ? feedbackMessage.length >= 500 ? "text-red-400" : "text-amber-400" : "text-white/20"}`}>
                                                        {feedbackMessage.length}/500
                                                    </span>
                                                </div>
                                            </div>
                                            {/* Send */}
                                            {/* File Attachments — Drop Zone */}
                                            <div>
                                                <input
                                                    ref={feedbackFileInputRef}
                                                    type="file"
                                                    accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm"
                                                    multiple
                                                    className="hidden"
                                                    onChange={(e) => { handleFeedbackFiles(Array.from(e.target.files || [])); e.target.value = ''; }}
                                                />
                                                {feedbackFiles.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                                        {feedbackFiles.map((file, i) => (
                                                            <div key={i} className="relative group">
                                                                {file.type.startsWith('image/') ? (
                                                                    <img src={URL.createObjectURL(file)} alt="" className="w-12 h-12 rounded-md object-cover border border-white/10" />
                                                                ) : (
                                                                    <div className="w-12 h-12 rounded-md border border-white/10 bg-white/5 flex items-center justify-center">
                                                                        <svg className="w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                                                    </div>
                                                                )}
                                                                <button onClick={() => setFeedbackFiles(prev => prev.filter((_, j) => j !== i))} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                                                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                                                </button>
                                                                <span className="absolute bottom-0 left-0 right-0 text-center text-[8px] text-white/50 bg-black/60 rounded-b-md truncate px-0.5">{file.size >= 1048576 ? `${(file.size / 1048576).toFixed(1)}MB` : `${(file.size / 1024).toFixed(0)}KB`}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {feedbackFiles.length < MAX_FEEDBACK_FILES && (
                                                    <div
                                                        onClick={() => feedbackFileInputRef.current?.click()}
                                                        onDragOver={(e) => { e.preventDefault(); setFeedbackDragOver(true); }}
                                                        onDragLeave={() => setFeedbackDragOver(false)}
                                                        onDrop={(e) => { e.preventDefault(); setFeedbackDragOver(false); handleFeedbackFiles(Array.from(e.dataTransfer.files)); }}
                                                        className={`mb-2 border border-dashed rounded-lg px-3 py-2.5 flex items-center justify-center gap-2 cursor-pointer transition-colors ${feedbackDragOver ? "border-blue-400/60 bg-blue-500/10" : "border-white/10 hover:border-white/20 bg-white/[0.02]"}`}
                                                    >
                                                        <svg className={`w-4 h-4 ${feedbackDragOver ? "text-blue-400" : "text-white/20"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                        <span className={`text-[10px] ${feedbackDragOver ? "text-blue-400" : "text-white/25"}`}>
                                                            {feedbackDragOver ? "Drop here" : `Drop or click · ${feedbackFiles.length}/${MAX_FEEDBACK_FILES}`}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            {feedbackFileError && (
                                                <p className="text-[10px] text-red-400 mb-1.5 -mt-1">{feedbackFileError}</p>
                                            )}
                                            <button
                                                onClick={submitFeedback}
                                                disabled={!feedbackMessage.trim() || feedbackSending}
                                                className={`relative w-full py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer focus:outline-none overflow-hidden ${feedbackMessage.trim()
                                                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30"
                                                    : "bg-white/5 text-white/20 border border-white/5"
                                                    }`}
                                            >
                                                {feedbackSending && uploadProgress > 0 && (
                                                    <div className="absolute inset-0 bg-blue-500/20 transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                                                )}
                                                <span className="relative">{feedbackSending ? (uploadProgress > 0 && uploadProgress < 100 ? `Uploading ${uploadProgress}%` : "Sending...") : "Send Feedback"}</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="w-px h-5 bg-white/20" />
                            <button
                                onClick={copyShareLink}
                                className="flex items-center gap-1.5 text-white/70 hover:text-white transition-colors cursor-pointer focus:outline-none"
                                title="Copy viewer link"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                </svg>
                                <span className="relative text-xs hidden lg:inline">
                                    Share
                                    {viewerCount > 0 && (
                                        <span className="absolute -top-1.5 -right-2.5 bg-blue-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                                            {viewerCount}
                                        </span>
                                    )}
                                </span>
                            </button>
                        </div>{/* end hidden lg:contents */}

                        {/* === MOBILE: overflow menu === */}
                        <div className="lg:hidden relative">
                            <button
                                onClick={() => { setMobileMenuOpen(!mobileMenuOpen); setClipboardOpen(false); setFeedbackOpen(false); }}
                                className={`flex items-center justify-center w-7 h-7 rounded-full transition-colors cursor-pointer focus:outline-none ${mobileMenuOpen ? "text-white bg-white/10" : "text-white/60 hover:text-white"}`}
                                title="More options"
                            >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <circle cx="12" cy="5" r="2" />
                                    <circle cx="12" cy="12" r="2" />
                                    <circle cx="12" cy="19" r="2" />
                                </svg>
                            </button>
                            {mobileMenuOpen && (
                                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-3 bg-[#1a1a1a]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-xl w-[220px] overflow-hidden z-50">
                                    {recordingState === "idle" && (
                                        <button onClick={() => { startRecording(); setMobileMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-white/70 hover:text-white hover:bg-white/5 transition-colors cursor-pointer focus:outline-none">
                                            <div className="w-3.5 h-3.5 rounded-full border-2 border-current flex-shrink-0" />
                                            <span className="text-xs">Record Session</span>
                                        </button>
                                    )}
                                    {recordingState === "ready" && (
                                        <button onClick={() => { downloadRecording(); setMobileMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-green-400 hover:bg-white/5 transition-colors cursor-pointer focus:outline-none">
                                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                            <span className="text-xs">Download ({formatSize(recordingSize)})</span>
                                        </button>
                                    )}
                                    <button onClick={() => { startScreenshotMode(); setMobileMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-white/70 hover:text-white hover:bg-white/5 transition-colors cursor-pointer focus:outline-none">
                                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        <span className="text-xs">Screenshot</span>
                                    </button>
                                    <button onClick={() => { setClipboardOpen(!clipboardOpen); setFeedbackOpen(false); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer focus:outline-none ${clipboardSynced ? "text-green-400" : "text-white/70 hover:text-white"}`}>
                                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                        <span className="text-xs">Clipboard</span>
                                    </button>
                                    <button onClick={() => { setFeedbackOpen(!feedbackOpen); setClipboardOpen(false); setMobileMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-white/70 hover:text-white hover:bg-white/5 transition-colors cursor-pointer focus:outline-none">
                                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                        <span className="text-xs">Feedback</span>
                                    </button>
                                    <button onClick={() => { copyShareLink(); setMobileMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-white/70 hover:text-white hover:bg-white/5 transition-colors cursor-pointer focus:outline-none">
                                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                                        <span className="text-xs">Share{viewerCount > 0 ? ` (${viewerCount})` : ""}</span>
                                    </button>

                                </div>
                            )}
                        </div>

                        <div className="w-px h-5 bg-white/20" />

                        {/* End Session Button */}
                        <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 px-2 lg:px-3 text-xs lg:text-sm rounded-full cursor-pointer"
                            onClick={handleEndSession}
                        >
                            <span className="lg:hidden">End</span>
                            <span className="hidden lg:inline">End Session</span>
                        </Button>

                        <button
                            onClick={() => setIsToolbarMinimized(true)}
                            className="text-white/60 hover:text-white transition-colors cursor-pointer focus:outline-none"
                            title="Minimize"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Click-outside backdrop for clipboard/feedback/mobile menu */}
            {streamReady && !isToolbarMinimized && !isViewer && (clipboardOpen || feedbackOpen || mobileMenuOpen) && (
                <div className="fixed inset-0 z-40" onClick={() => { setClipboardOpen(false); setFeedbackOpen(false); setMobileMenuOpen(false); }} />
            )}
            {/* Mobile clipboard panel */}
            {streamReady && !isToolbarMinimized && !isViewer && clipboardOpen && (
                <div className="lg:hidden fixed left-1/2 -translate-x-1/2 top-14 z-[55] w-[calc(100vw-32px)] max-w-[300px]">
                    <div className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-lg overflow-hidden" style={{ transition: 'border-color 0.5s ease' }}>
                        <div className="px-3 py-1.5 border-b border-white/5">
                            <span className={`text-[10px] font-medium uppercase tracking-wider transition-colors duration-500 ${clipboardFlash ? "text-green-400" : "text-white/30"}`}>
                                {clipboardFlash ? "✓ Clipboard updated" : "Remote Clipboard"}
                            </span>
                        </div>
                        <div className="p-2">
                            <textarea value={clipboardText} onChange={(e) => setClipboardText(e.target.value)} onBlur={() => syncClipboardToRemote(clipboardText)}
                                onPaste={(e) => { const p = e.clipboardData.getData("text/plain"); if (p) { e.preventDefault(); setClipboardText(p); syncClipboardToRemote(p); } }}
                                placeholder="Paste here to send to remote desktop..."
                                className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none resize-none transition-all duration-500 ${clipboardFlash ? "border-green-400/50 text-green-300" : "border-white/10 focus:border-white/20"}`}
                                rows={4} />
                        </div>
                    </div>
                </div>
            )}
            {/* Mobile feedback panel */}
            {streamReady && !isToolbarMinimized && !isViewer && feedbackOpen && (
                <div className="lg:hidden fixed left-1/2 -translate-x-1/2 top-14 z-[55] w-[calc(100vw-32px)] max-w-[300px]">
                    <div className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-lg overflow-hidden">
                        <div className="px-3 py-1.5 border-b border-white/5">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-white/30">Send Feedback</span>
                        </div>
                        <div className="p-3 space-y-3">
                            <input type="email" value={feedbackEmail} onChange={(e) => { setFeedbackEmail(e.target.value); setFeedbackEmailError(""); }}
                                placeholder="E-Mail (optional)" className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none ${feedbackEmailError ? "border-red-500/50" : "border-white/10 focus:border-white/20"}`} />
                            {feedbackEmailError && <p className="text-red-400 text-[10px] mt-1">{feedbackEmailError}</p>}
                            <div className="flex gap-1.5">
                                {(["bug", "suggestion", "other"] as const).map((t) => (
                                    <button key={t} onClick={() => setFeedbackType(t)} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer border ${feedbackType === t ? t === "bug" ? "bg-red-500/20 text-red-400 border-red-500/30" : t === "suggestion" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-blue-500/20 text-blue-400 border-blue-500/30" : "bg-white/5 text-white/40 border-white/5 hover:bg-white/10"}`}>
                                        {t === "bug" ? "Bug" : t === "suggestion" ? "Suggestion" : "Other"}
                                    </button>
                                ))}
                            </div>
                            <textarea value={feedbackMessage} onChange={(e) => { setFeedbackMessage(e.target.value.slice(0, 500)); setFeedbackSubmitError(""); }} placeholder="Describe your feedback..."
                                className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none resize-none ${feedbackSubmitError ? "border-red-500/50 focus:border-red-500/70" : "border-white/10 focus:border-white/20"}`} rows={3} />
                            {feedbackSubmitError && <p className="text-[10px] text-red-400">{feedbackSubmitError}</p>}
                            {/* File Attachments (mobile) — Drop Zone */}
                            {feedbackFiles.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {feedbackFiles.map((file, i) => (
                                        <div key={i} className="relative">
                                            {file.type.startsWith('image/') ? (
                                                <img src={URL.createObjectURL(file)} alt="" className="w-12 h-12 rounded-md object-cover border border-white/10" />
                                            ) : (
                                                <div className="w-12 h-12 rounded-md border border-white/10 bg-white/5 flex items-center justify-center">
                                                    <svg className="w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                                </div>
                                            )}
                                            <button onClick={() => setFeedbackFiles(prev => prev.filter((_, j) => j !== i))} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center cursor-pointer">
                                                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {feedbackFiles.length < MAX_FEEDBACK_FILES && (
                                <div
                                    onClick={() => feedbackFileInputRef.current?.click()}
                                    onDragOver={(e) => { e.preventDefault(); setFeedbackDragOver(true); }}
                                    onDragLeave={() => setFeedbackDragOver(false)}
                                    onDrop={(e) => { e.preventDefault(); setFeedbackDragOver(false); handleFeedbackFiles(Array.from(e.dataTransfer.files)); }}
                                    className={`border border-dashed rounded-lg px-3 py-2.5 flex items-center justify-center gap-2 cursor-pointer transition-colors ${feedbackDragOver ? "border-blue-400/60 bg-blue-500/10" : "border-white/10 hover:border-white/20 bg-white/[0.02]"}`}
                                >
                                    <svg className={`w-4 h-4 ${feedbackDragOver ? "text-blue-400" : "text-white/20"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    <span className={`text-[10px] ${feedbackDragOver ? "text-blue-400" : "text-white/25"}`}>
                                        {feedbackDragOver ? "Drop here" : `Drop or click · ${feedbackFiles.length}/${MAX_FEEDBACK_FILES}`}
                                    </span>
                                </div>
                            )}
                            {feedbackFileError && (
                                <p className="text-[10px] text-red-400 -mt-0.5">{feedbackFileError}</p>
                            )}
                            <button onClick={submitFeedback} disabled={!feedbackMessage.trim() || feedbackSending}
                                className={`relative w-full py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer overflow-hidden ${feedbackMessage.trim() ? "bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30" : "bg-white/5 text-white/20 border border-white/5"}`}>
                                {feedbackSending && uploadProgress > 0 && (
                                    <div className="absolute inset-0 bg-blue-500/20 transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                                )}
                                <span className="relative">{feedbackSending ? (uploadProgress > 0 && uploadProgress < 100 ? `Uploading ${uploadProgress}%` : "Sending...") : "Send Feedback"}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {streamReady && isToolbarMinimized && (
                /* Minimized: small draggable icon */
                <button
                    className={`fixed z-50 bg-black/40 backdrop-blur-md border border-white/10 rounded-full w-12 h-12 flex items-center justify-center shadow-lg cursor-pointer select-none ${getTimerColor()} ${isFlashing ? "animate-[flash_0.5s_ease-in-out_infinite] will-change-[color]" : ""}`}
                    style={{
                        right: `${toolbarMinPos.right}px`,
                        top: `${toolbarMinPos.top}px`,
                        touchAction: 'none',
                        WebkitTouchCallout: 'none',
                        WebkitUserSelect: 'none',
                    }}
                    title="Show toolbar"
                    onContextMenu={(e) => e.preventDefault()}
                    onClick={() => {
                        if (toolbarMinDragging) return;
                        setIsToolbarMinimized(false);
                    }}
                    onPointerDown={(e) => {
                        toolbarMinDragStart.current = {
                            x: e.clientX,
                            y: e.clientY,
                            right: toolbarMinPos.right,
                            top: toolbarMinPos.top,
                        };
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                        if (!toolbarMinDragStart.current) return;
                        const dx = toolbarMinDragStart.current.x - e.clientX;
                        const dy = e.clientY - toolbarMinDragStart.current.y;
                        if (!toolbarMinDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                            setToolbarMinDragging(true);
                        }
                        if (toolbarMinDragging || Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                            const newRight = Math.max(4, Math.min(window.innerWidth - 56, toolbarMinDragStart.current.right + dx));
                            const newTop = Math.max(4, Math.min(window.innerHeight - 56, toolbarMinDragStart.current.top + dy));
                            setToolbarMinPos({ right: newRight, top: newTop });
                        }
                    }}
                    onPointerUp={() => {
                        toolbarMinDragStart.current = null;
                        if (toolbarMinDragging) {
                            setTimeout(() => setToolbarMinDragging(false), 0);
                        }
                    }}
                    onPointerCancel={() => {
                        toolbarMinDragStart.current = null;
                        setToolbarMinDragging(false);
                    }}
                >
                    <span className="font-mono text-sm font-semibold">{formatTime(timeRemaining)}</span>
                    {(recordingState === "recording" || recordingState === "paused") && (
                        <div className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-black/40 ${recordingState === "recording" ? "bg-red-500 animate-pulse" : "bg-yellow-500"}`} />
                    )}
                    {viewerCount > 0 && (
                        <div className="absolute -bottom-0.5 -right-0.5 bg-blue-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center border-2 border-black/40">
                            {viewerCount}
                        </div>
                    )}
                </button>
            )}

            {/* Browser iframe — loads when port and auth token are available */}
            {port && sessionToken && (
                <iframe
                    ref={iframeRef}
                    src={isViewer ? `/browser/${port}/#shared` : `/browser/${port}/?token=${sessionToken}`}
                    className="flex-1 w-full border-0"
                    style={{ touchAction: "none" }}
                    allow="clipboard-read; clipboard-write; autoplay"
                    onLoad={handleIframeLoad}
                />
            )}

            {/* Floating Mobile Controls — draggable group (scroll ▲ / keyboard / scroll ▼) */}
            {isTouchDevice && streamReady && !isViewer && (
                <div
                    className="fixed z-50 flex flex-col items-center gap-1 select-none"
                    style={{
                        right: `${kbdPos.right}px`,
                        bottom: `${kbdPos.bottom}px`,
                        touchAction: 'none',
                        WebkitTouchCallout: 'none',
                        WebkitUserSelect: 'none',
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    onPointerDown={(e) => {
                        kbdDragStart.current = {
                            x: e.clientX,
                            y: e.clientY,
                            right: kbdPos.right,
                            bottom: kbdPos.bottom,
                        };
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                        if (!kbdDragStart.current) return;
                        const dx = kbdDragStart.current.x - e.clientX;
                        const dy = kbdDragStart.current.y - e.clientY;
                        if (!kbdDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                            setKbdDragging(true);
                        }
                        if (kbdDragging || Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                            const newRight = Math.max(4, Math.min(window.innerWidth - 56, kbdDragStart.current.right + dx));
                            const newBottom = Math.max(4, Math.min(window.innerHeight - 140, kbdDragStart.current.bottom + dy));
                            setKbdPos({ right: newRight, bottom: newBottom });
                        }
                    }}
                    onPointerUp={() => {
                        kbdDragStart.current = null;
                        if (kbdDragging) {
                            setTimeout(() => setKbdDragging(false), 0);
                        }
                    }}
                    onPointerCancel={() => {
                        kbdDragStart.current = null;
                        setKbdDragging(false);
                    }}
                >
                    {/* Scroll Up */}
                    <button
                        className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/60 active:text-white active:bg-black/60 shadow-lg transition-colors"
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            scrollCountRef.current = 0;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const wi = (iframeRef.current?.contentWindow as any)?.webrtcInput;
                            if (!wi?._triggerMouseWheel) return;
                            wi._triggerMouseWheel("up", 1);
                            scrollIntervalRef.current = setInterval(() => {
                                scrollCountRef.current++;
                                const mag = scrollCountRef.current > 10 ? 3 : scrollCountRef.current > 5 ? 2 : 1;
                                wi._triggerMouseWheel("up", mag);
                            }, 60);
                        }}
                        onPointerUp={() => { if (scrollIntervalRef.current) { clearInterval(scrollIntervalRef.current); scrollIntervalRef.current = null; } }}
                        onPointerCancel={() => { if (scrollIntervalRef.current) { clearInterval(scrollIntervalRef.current); scrollIntervalRef.current = null; } }}
                        onPointerLeave={() => { if (scrollIntervalRef.current) { clearInterval(scrollIntervalRef.current); scrollIntervalRef.current = null; } }}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="18 15 12 9 6 15" />
                        </svg>
                    </button>

                    {/* Keyboard Toggle */}
                    <button
                        className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/60 active:text-white active:bg-black/60 shadow-lg transition-colors"
                        onClick={(e) => {
                            if (kbdDragging) { e.preventDefault(); return; }
                            toggleVirtualKeyboard();
                        }}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <rect x="2" y="6" width="20" height="12" rx="2" strokeWidth={1.5} />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
                        </svg>
                    </button>

                    {/* Scroll Down */}
                    <button
                        className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/60 active:text-white active:bg-black/60 shadow-lg transition-colors"
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            scrollCountRef.current = 0;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const wi = (iframeRef.current?.contentWindow as any)?.webrtcInput;
                            if (!wi?._triggerMouseWheel) return;
                            wi._triggerMouseWheel("down", 1);
                            scrollIntervalRef.current = setInterval(() => {
                                scrollCountRef.current++;
                                const mag = scrollCountRef.current > 10 ? 3 : scrollCountRef.current > 5 ? 2 : 1;
                                wi._triggerMouseWheel("down", mag);
                            }, 60);
                        }}
                        onPointerUp={() => { if (scrollIntervalRef.current) { clearInterval(scrollIntervalRef.current); scrollIntervalRef.current = null; } }}
                        onPointerCancel={() => { if (scrollIntervalRef.current) { clearInterval(scrollIntervalRef.current); scrollIntervalRef.current = null; } }}
                        onPointerLeave={() => { if (scrollIntervalRef.current) { clearInterval(scrollIntervalRef.current); scrollIntervalRef.current = null; } }}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>
                </div>
            )}
            {/* Screenshot selection overlay */}
            {screenshotMode && (
                <div
                    className="absolute inset-0 z-[60] cursor-crosshair select-none overflow-hidden"
                    style={{ top: iframeRef.current?.offsetTop || 0, touchAction: 'none' }}
                    onMouseDown={handleScreenshotMouseDown}
                    onMouseMove={handleScreenshotMouseMove}
                    onMouseUp={handleScreenshotMouseUp}
                    onTouchStart={(e) => { const t = e.touches[0]; handleScreenshotMouseDown({ clientX: t.clientX, clientY: t.clientY, currentTarget: e.currentTarget } as any); }}
                    onTouchMove={(e) => { const t = e.touches[0]; handleScreenshotMouseMove({ clientX: t.clientX, clientY: t.clientY, currentTarget: e.currentTarget } as any); }}
                    onTouchEnd={() => handleScreenshotMouseUp()}
                >
                    {/* Dim overlay — uses clip-path to cut out the selection area at full opacity */}
                    {selectionStart && selectionEnd ? (() => {
                        const x = Math.min(selectionStart.x, selectionEnd.x);
                        const y = Math.min(selectionStart.y, selectionEnd.y);
                        const w = Math.abs(selectionEnd.x - selectionStart.x);
                        const h = Math.abs(selectionEnd.y - selectionStart.y);
                        return (
                            <>
                                <div
                                    className="absolute inset-0 bg-black/50"
                                    style={{
                                        clipPath: `polygon(0% 0%, 0% 100%, ${x}px 100%, ${x}px ${y}px, ${x + w}px ${y}px, ${x + w}px ${y + h}px, ${x}px ${y + h}px, ${x}px 100%, 100% 100%, 100% 0%)`,
                                    }}
                                />
                                {/* Selection border */}
                                <div
                                    className="absolute border-2 border-white/80 border-dashed"
                                    style={{ left: x, top: y, width: w, height: h }}
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
                    })() : (
                        /* No selection yet — full dim + instructions */
                        <div className="absolute inset-0 bg-black/50" />
                    )}
                    {/* Instructions — always visible */}
                    <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-10 max-w-[calc(100vw-32px)]">
                        <div className="bg-black/70 backdrop-blur-md border border-white/10 rounded-full px-3 sm:px-4 py-2 flex items-center gap-2 sm:gap-3 shadow-lg">
                            <svg className="w-4 h-4 text-white/70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-white/90 text-xs sm:text-sm whitespace-nowrap">Drag to select area</span>
                            <span className="text-white/40 text-xs hidden sm:inline">ESC to cancel</span>
                            <button
                                onClick={(e) => { e.stopPropagation(); setScreenshotMode(false); setSelectionStart(null); setSelectionEnd(null); }}
                                className="sm:hidden text-white/40 hover:text-white text-xs cursor-pointer whitespace-nowrap"
                            >
                                ✕ Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reconnection countdown overlay — stream stays visible behind */}
            {status === "reconnecting" && reconnectCountdown !== null && (
                <div className="absolute inset-0 z-[55] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="text-center">
                        {/* Circular countdown */}
                        <div className="relative w-20 h-20 mx-auto mb-4">
                            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                                <circle cx="40" cy="40" r="36" fill="none" stroke="white" strokeOpacity="0.1" strokeWidth="4" />
                                <circle
                                    cx="40" cy="40" r="36" fill="none"
                                    stroke="#eab308" strokeWidth="4" strokeLinecap="round"
                                    strokeDasharray={`${SVG_CIRCUMFERENCE}`}
                                    strokeDashoffset={`${SVG_CIRCUMFERENCE * (1 - reconnectCountdown / RECONNECT_COUNTDOWN_SECONDS)}`}
                                    className="transition-[stroke-dashoffset] duration-1000 ease-linear"
                                />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-yellow-500">
                                {reconnectCountdown}
                            </span>
                        </div>
                        <p className="text-yellow-500 font-medium mb-1">Connection lost</p>
                        <p className="text-white/50 text-sm">Reconnecting...</p>
                    </div>
                </div>
            )}

            {/* Share link copied toast */}
            {showShareToast && (
                <div className="fixed bottom-4 sm:bottom-6 left-1/2 z-50 w-auto max-w-[calc(100vw-32px)] animate-[slideUp_0.3s_ease-out_forwards]" style={{ transform: 'translate(-50%, 0)' }}>
                    <div className="bg-black/70 backdrop-blur-md border border-white/10 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3 shadow-lg">
                        <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                        <p className="text-white/90 text-xs sm:text-sm whitespace-nowrap">Viewer link copied to clipboard!</p>
                    </div>
                </div>
            )}

            {/* Feedback sent toast */}
            {showFeedbackToast && (
                <div className="fixed bottom-4 sm:bottom-6 left-1/2 z-50 w-auto max-w-[calc(100vw-32px)] animate-[slideUp_0.3s_ease-out_forwards]" style={{ transform: 'translate(-50%, 0)' }}>
                    <div className="bg-black/70 backdrop-blur-md border border-white/10 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3 shadow-lg">
                        <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <p className="text-white/90 text-xs sm:text-sm whitespace-nowrap">Thanks for your feedback!</p>
                    </div>
                </div>
            )}

            {/* Session resumed from another tab toast */}
            {showTakeoverToast && (
                <div className="fixed bottom-4 sm:bottom-6 left-1/2 z-50 w-auto max-w-[calc(100vw-32px)] animate-[slideUp_0.3s_ease-out_forwards]" style={{ transform: 'translate(-50%, 0)' }}>
                    <div className="bg-black/70 backdrop-blur-md border border-white/10 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3 shadow-lg">
                        <svg className="w-4 h-4 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        <p className="text-white/90 text-xs sm:text-sm whitespace-nowrap">Session resumed from another tab</p>
                    </div>
                </div>
            )}

            {/* Privacy toast notification */}
            {showPrivacyToast && (
                <div className="fixed bottom-4 sm:bottom-6 left-1/2 z-50 w-auto max-w-[calc(100vw-32px)] animate-[slideUp_0.3s_ease-out_forwards]" style={{ transform: 'translate(-50%, 0)' }}>
                    <div className="bg-black/70 backdrop-blur-md border border-white/10 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3 shadow-lg">
                        <svg className="w-4 h-4 text-white/70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        <p className="text-white/90 text-xs sm:text-sm whitespace-nowrap"><span className="sm:hidden">Saved locally only</span><span className="hidden sm:inline">Recording is saved locally on your device only. We do not store any recordings.</span></p>
                    </div>
                </div>
            )}

            {/* Custom animations */}
            <style jsx>{`
                @keyframes flash {
                    0%, 100% { color: #ef4444; }
                    50% { color: #7f1d1d; }
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translate(-50%, 20px); }
                    to { opacity: 1; transform: translate(-50%, 0); }
                }
            `}</style>
        </main>
    );
}
