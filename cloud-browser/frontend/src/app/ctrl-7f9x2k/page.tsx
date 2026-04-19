"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Pause, Trash2, RefreshCw, XCircle, RotateCcw, Search } from "lucide-react";

// Loads attachment media with auth headers (img/video src can't send auth)
function AuthAttachment({ att, feedbackId, apiUrl, getAuthHeaders }: {
    att: { id: number; filename: string; mimeType: string; size: number };
    feedbackId: number;
    apiUrl: string;
    getAuthHeaders: () => Record<string, string>;
}) {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [lightbox, setLightbox] = useState(false);

    useEffect(() => {
        let revoked = false;
        fetch(`${apiUrl}/api/admin/feedback/${feedbackId}/attachments/${att.id}`, { headers: getAuthHeaders() })
            .then(r => r.blob())
            .then(blob => {
                if (!revoked) setBlobUrl(URL.createObjectURL(blob));
            })
            .catch(() => { });
        return () => { revoked = true; if (blobUrl) URL.revokeObjectURL(blobUrl); };
    }, [apiUrl, feedbackId, att.id]);

    useEffect(() => {
        if (!lightbox) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [lightbox]);

    const download = useCallback(() => {
        if (!blobUrl) return;
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = att.filename;
        a.click();
    }, [blobUrl, att.filename]);

    if (!blobUrl) return (
        <div className="w-32 h-24 rounded-lg border border-border bg-muted/30 animate-pulse flex items-center justify-center">
            <span className="text-[10px] text-muted-foreground">Loading...</span>
        </div>
    );

    return (
        <>
            <div className="relative group w-32">
                {att.mimeType.startsWith('image/') ? (
                    <img src={blobUrl} alt={att.filename} onClick={() => setLightbox(true)} className="w-32 h-24 rounded-lg object-cover border border-border hover:border-primary transition-colors cursor-pointer" />
                ) : (
                    <div onClick={() => setLightbox(true)} className="w-32 h-24 rounded-lg border border-border bg-black flex items-center justify-center cursor-pointer hover:border-primary transition-colors relative overflow-hidden">
                        <video src={blobUrl} className="w-full h-full object-cover opacity-60" />
                        <svg className="absolute w-8 h-8 text-white/80" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    </div>
                )}
                <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1">
                    <span className="truncate max-w-[80px]">{att.filename}</span>
                    <span className="shrink-0">({att.size >= 1048576 ? `${(att.size / 1048576).toFixed(1)}MB` : `${(att.size / 1024).toFixed(0)}KB`})</span>
                    <button onClick={download} className="shrink-0 cursor-pointer hover:text-white transition-colors" title="Download">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    </button>
                </div>
            </div>

            {/* Lightbox */}
            {lightbox && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8" onClick={() => setLightbox(false)}>
                    <div className="absolute top-4 right-4 flex items-center gap-3">
                        <button onClick={(e) => { e.stopPropagation(); download(); }} className="text-white/60 hover:text-white cursor-pointer transition-colors" title="Download">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        </button>
                        <button onClick={() => setLightbox(false)} className="text-white/60 hover:text-white cursor-pointer transition-colors" title="Close">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/40">{att.filename} · {att.size >= 1048576 ? `${(att.size / 1048576).toFixed(1)}MB` : `${(att.size / 1024).toFixed(0)}KB`}</div>
                    {att.mimeType.startsWith('image/') ? (
                        <img src={blobUrl} alt={att.filename} onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full rounded-lg object-contain shadow-2xl" />
                    ) : (
                        <video src={blobUrl} controls autoPlay onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full rounded-lg shadow-2xl" />
                    )}
                </div>
            )}
        </>
    );
}

function FlagIP({ ip, countryCode }: { ip: string; countryCode?: string | null }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            {countryCode ? (
                <img
                    src={`https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`}
                    srcSet={`https://flagcdn.com/w40/${countryCode.toLowerCase()}.png 1x, https://flagcdn.com/w80/${countryCode.toLowerCase()}.png 2x`}
                    alt={countryCode}
                    title={countryCode}
                    className="inline-block w-5 h-auto border border-white/20"
                    loading="lazy"
                />
            ) : null}
            <span className="font-mono text-xs">{ip}</span>
        </span>
    );
}

interface Session {
    id: string;
    port: string;
    url: string;
    clientIp: string;
    countryCode: string | null;
    startedAt: string;
    expiresAt: string;
    timeRemaining: number;
}

interface QueueEntry {
    id: string;
    url: string;
    position: number;
    createdAt: string;
}

interface PoolStatus {
    total: number;
    warm: number;
    active: number;
    containers: Array<{ id: string; port: number; status: string; disconnectedAt: number | null }>;
    metrics?: {
        totalAcquires: number;
        acquireFailures: number;
        poolHitRate: string;
        avgBootTimeMs: number;
        portsUsed: number;
        portsTotal: number;
    };
}

interface Stats {
    activeSessions: number;
    queueLength: number;
    sessionsToday: number;
    sessionsThisWeek: number;
    peakConcurrent: number;
    avgDurationToday: number | null;
    avgDurationWeek: number;
    sessionDuration: number;
    poolSize: number;
    maxContainers: number;
    maxSessions: number;
    initialWarm: number;
    poolStatus: PoolStatus;
    paused: boolean;
    rateLimitPerDay: number;
}

interface SessionLog {
    id: number;
    sessionId: string;
    url: string;
    clientIp: string;
    countryCode: string | null;
    startedAt: string;
    endedAt: string | null;
    reason: string | null;
    duration: number | null;
}

interface RateLimitStat {
    ip: string;
    countryCode: string | null;
    count: number;
    remaining: number;
}

interface FeedbackItem {
    id: number;
    sessionId: string | null;
    clientIp: string;
    countryCode: string | null;
    email: string | null;
    type: string;
    message: string;
    status: string;
    adminNote: string | null;
    createdAt: string;
    resolvedAt: string | null;
    attachments?: { id: number; filename: string; mimeType: string; size: number }[];
}

interface FeedbackStats {
    open: number;
    resolved: number;
    dismissed: number;
    total: number;
}

interface SurveyItem {
    id: number;
    sessionId: string;
    rating: number;
    tags: string[];
    comment: string | null;
    clientIp: string;
    countryCode: string | null;
    createdAt: string;
}

interface SurveyStats {
    totalResponses: number;
    averageRating: number;
    ratingDistribution: { [key: number]: number };
    tagFrequency: { [key: string]: number };
    dailyAverages: { date: string; average: number; count: number }[];
}

interface ServerHealth {
    cpu: { cores: number; model: string; percent: number; loadAvg: number[] };
    memory: { totalBytes: number; usedBytes: number; freeBytes: number; percent: number };
    disk: { total: number; used: number; available: number; percent: number };
    diskIO: { readMBps: number; writeMBps: number };
    network: { rxMBps: number; txMBps: number; rxTotalGB: number; txTotalGB: number };
    uptime: number;
    containers: Array<{ name: string; cpu: number; memMb: number; netRx: string; netTx: string }>;
}

type Tab = "overview" | "history" | "ratelimits" | "controls" | "feedback" | "surveys";

export default function AdminPage() {
    const [authenticated, setAuthenticated] = useState(false);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [authError, setAuthError] = useState("");
    const [restoring, setRestoring] = useState(true); // true while checking sessionStorage
    const [dataLoading, setDataLoading] = useState(true); // true until first fetchAll completes

    const [sessions, setSessions] = useState<Session[]>([]);
    const [queue, setQueue] = useState<QueueEntry[]>([]);
    const [pool, setPool] = useState<PoolStatus | null>(null);
    const [stats, setStats] = useState<Stats | null>(null);
    const [history, setHistory] = useState<SessionLog[]>([]);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [rateLimits, setRateLimits] = useState<RateLimitStat[]>([]);
    const [dailyLimit, setDailyLimit] = useState<number>(10);
    const [limitedIps, setLimitedIps] = useState<string[]>([]);
    const [blockedIps, setBlockedIps] = useState<string[]>([]);
    const [whitelistedIps, setWhitelistedIps] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>("overview");
    const [searchQuery, setSearchQuery] = useState("");
    const [rateLimitSearch, setRateLimitSearch] = useState("");
    const [actionMsg, setActionMsg] = useState("");

    // Feedback state
    const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
    const [feedbackStats, setFeedbackStats] = useState<FeedbackStats | null>(null);
    const [feedbackFilter, setFeedbackFilter] = useState<string>("all");
    const [expandedFeedback, setExpandedFeedback] = useState<number | null>(null);

    // Survey state
    const [surveyList, setSurveyList] = useState<SurveyItem[]>([]);
    const [expandedSurveyId, setExpandedSurveyId] = useState<number | null>(null);
    const [surveyStats, setSurveyStats] = useState<SurveyStats | null>(null);

    // Server health state
    const [serverHealth, setServerHealth] = useState<ServerHealth | null>(null);

    // Config form state — track which sliders the user has touched
    const [newPoolSize, setNewPoolSize] = useState("");
    const [newDuration, setNewDuration] = useState("");
    const [newRateLimit, setNewRateLimit] = useState("");
    const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());

    const markDirty = (field: string) => {
        setDirtyFields(prev => new Set(prev).add(field));
    };

    const apiUrl = typeof window !== 'undefined' ? window.location.origin : '';

    const getAuthHeaders = () => ({
        Authorization: `Basic ${btoa(`${username}:${password}`)}`,
    });

    // Restore session from sessionStorage on mount
    useEffect(() => {
        const saved = sessionStorage.getItem("admin_creds");
        if (!saved) {
            setRestoring(false);
            setDataLoading(false);
            return;
        }
        try {
            const { u, p } = JSON.parse(saved);
            const authHeader = { Authorization: `Basic ${btoa(`${u}:${p}`)}` };
            // Validate credentials and pre-fetch all data in parallel
            Promise.all([
                fetch(`${apiUrl}/api/admin/stats`, { headers: authHeader }),
                fetch(`${apiUrl}/api/admin/sessions`, { headers: authHeader }),
                fetch(`${apiUrl}/api/admin/queue`, { headers: authHeader }),
                fetch(`${apiUrl}/api/admin/pool`, { headers: authHeader }),
                fetch(`${apiUrl}/api/admin/feedback/stats`, { headers: authHeader }),
                fetch(`${apiUrl}/api/admin/server-health`, { headers: authHeader }),
            ]).then(async ([statsRes, sessionsRes, queueRes, poolRes, fbStatsRes, healthRes]) => {
                if (statsRes.ok) {
                    setUsername(u);
                    setPassword(p);
                    setAuthenticated(true);
                    // Pre-populate data from the same request batch
                    setStats(await statsRes.json());
                    if (sessionsRes.ok) setSessions(await sessionsRes.json());
                    if (queueRes.ok) setQueue(await queueRes.json());
                    if (poolRes.ok) setPool(await poolRes.json());
                    if (fbStatsRes.ok) setFeedbackStats(await fbStatsRes.json());
                    if (healthRes.ok) setServerHealth(await healthRes.json());
                } else {
                    sessionStorage.removeItem("admin_creds");
                }
            }).catch(() => {
                sessionStorage.removeItem("admin_creds");
            }).finally(() => {
                setRestoring(false);
                setDataLoading(false);
            });
        } catch {
            sessionStorage.removeItem("admin_creds");
            setRestoring(false);
            setDataLoading(false);
        }
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError("");
        setLoading(true);

        try {
            const res = await fetch(`${apiUrl}/api/admin/stats`, {
                headers: getAuthHeaders(),
            });

            if (res.ok) {
                // Persist credentials so page refresh doesn't log out
                sessionStorage.setItem("admin_creds", JSON.stringify({ u: username, p: password }));
                setAuthenticated(true);
                fetchAll();
            } else {
                setAuthError("Invalid credentials");
            }
        } catch {
            setAuthError("Connection failed");
        } finally {
            setLoading(false);
        }
    };

    const fetchAll = async () => {
        try {
            const [sessionsRes, queueRes, poolRes, statsRes, fbStatsRes, healthRes] = await Promise.all([
                fetch(`${apiUrl}/api/admin/sessions`, { headers: getAuthHeaders() }),
                fetch(`${apiUrl}/api/admin/queue`, { headers: getAuthHeaders() }),
                fetch(`${apiUrl}/api/admin/pool`, { headers: getAuthHeaders() }),
                fetch(`${apiUrl}/api/admin/stats`, { headers: getAuthHeaders() }),
                fetch(`${apiUrl}/api/admin/feedback/stats`, { headers: getAuthHeaders() }),
                fetch(`${apiUrl}/api/admin/server-health`, { headers: getAuthHeaders() }),
            ]);

            if (sessionsRes.ok) setSessions(await sessionsRes.json());
            if (queueRes.ok) setQueue(await queueRes.json());
            if (poolRes.ok) setPool(await poolRes.json());
            if (statsRes.ok) setStats(await statsRes.json());
            if (fbStatsRes.ok) setFeedbackStats(await fbStatsRes.json());
            if (healthRes.ok) setServerHealth(await healthRes.json());
        } catch (err) {
            console.error("Failed to fetch data:", err);
        } finally {
            setDataLoading(false);
        }
    };

    const fetchHistory = async (search?: string) => {
        try {
            const url = search
                ? `${apiUrl}/api/admin/history?days=7&search=${encodeURIComponent(search)}`
                : `${apiUrl}/api/admin/history?days=7`;
            const res = await fetch(url, { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setHistory(data.logs);
                setHistoryTotal(data.total);
            }
        } catch (err) {
            console.error("Failed to fetch history:", err);
        }
    };

    const fetchRateLimits = async () => {
        try {
            const res = await fetch(`${apiUrl}/api/admin/rate-limits`, { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setRateLimits(data.stats);
                setDailyLimit(data.dailyLimit || 10);
                setLimitedIps(data.limitedIps);
                setBlockedIps(data.blockedIps || []);
                setWhitelistedIps(data.whitelistedIps || []);
            }
        } catch (err) {
            console.error("Failed to fetch rate limits:", err);
        }
    };

    const fetchFeedback = async (filterOverride?: string) => {
        const filter = filterOverride ?? feedbackFilter;
        try {
            const statusParam = filter !== "all" ? `?status=${filter}` : "";
            const [listRes, statsRes] = await Promise.all([
                fetch(`${apiUrl}/api/admin/feedback${statusParam}`, { headers: getAuthHeaders() }),
                fetch(`${apiUrl}/api/admin/feedback/stats`, { headers: getAuthHeaders() }),
            ]);
            if (listRes.ok) {
                const data = await listRes.json();
                setFeedbackList(data.feedback);
            }
            if (statsRes.ok) {
                setFeedbackStats(await statsRes.json());
            }
        } catch (err) {
            console.error("Failed to fetch feedback:", err);
        }
    };

    const feedbackAction = async (id: number, action: "resolve" | "dismiss" | "reopen" | "delete") => {
        try {
            if (action === "delete") {
                await fetch(`${apiUrl}/api/admin/feedback/${id}`, {
                    method: "DELETE",
                    headers: getAuthHeaders(),
                });
            } else {
                const statusMap = { resolve: "resolved", dismiss: "dismissed", reopen: "open" };
                await fetch(`${apiUrl}/api/admin/feedback/${id}`, {
                    method: "PATCH",
                    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                    body: JSON.stringify({ status: statusMap[action] }),
                });
            }
            fetchFeedback();
        } catch (err) {
            console.error(`Failed to ${action} feedback:`, err);
        }
    };

    const killSession = async (sessionId: string) => {
        try {
            await fetch(`${apiUrl}/api/admin/sessions/${sessionId}`, {
                method: "DELETE",
                headers: getAuthHeaders(),
            });
            fetchAll();
        } catch (err) {
            console.error("Failed to kill session:", err);
        }
    };

    // DT2: IP Management actions
    const ipAction = async (action: string, ip: string) => {
        try {
            const res = await fetch(`${apiUrl}/api/admin/ip/${action}/${encodeURIComponent(ip)}`, {
                method: "POST",
                headers: getAuthHeaders(),
            });
            if (res.ok) {
                const data = await res.json();
                showAction(data.message);
                fetchRateLimits();
            }
        } catch (err) {
            console.error(`Failed to ${action} IP:`, err);
        }
    };

    // DT3: System control actions
    const systemAction = async (action: string, body?: object) => {
        try {
            const res = await fetch(`${apiUrl}/api/admin/${action}`, {
                method: "POST",
                headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                body: body ? JSON.stringify(body) : undefined,
            });
            if (res.ok) {
                const data = await res.json();
                showAction(`${action}: ${JSON.stringify(data.changes || data)}`);
                fetchAll();
            }
        } catch (err) {
            console.error(`Failed: ${action}`, err);
        }
    };

    const showAction = (msg: string) => {
        setActionMsg(msg);
        setTimeout(() => setActionMsg(""), 3000);
    };

    useEffect(() => {
        if (!authenticated) return;
        // Pause auto-refresh while user is editing sliders to prevent re-render flicker
        if (dirtyFields.size > 0) return;
        fetchAll(); // Fetch immediately, don't wait for first interval tick
        const interval = setInterval(fetchAll, 3000);
        return () => clearInterval(interval);
    }, [authenticated, dirtyFields.size]);

    useEffect(() => {
        if (!authenticated) return;
        if (activeTab === "history") {
            fetchHistory(searchQuery);
        } else if (activeTab === "ratelimits") {
            fetchRateLimits();
        } else if (activeTab === "feedback") {
            fetchFeedback();
        } else if (activeTab === "surveys") {
            fetchSurveys();
        }
    }, [activeTab, authenticated, feedbackFilter]);

    // Auto-refresh feedback list when tab is active
    useEffect(() => {
        if (!authenticated || activeTab !== "feedback") return;
        const interval = setInterval(() => fetchFeedback(), 5000);
        return () => clearInterval(interval);
    }, [authenticated, activeTab, feedbackFilter]);

    const fetchSurveys = async () => {
        try {
            const [listRes, statsRes] = await Promise.all([
                fetch(`${apiUrl}/api/admin/surveys`, { headers: getAuthHeaders() }),
                fetch(`${apiUrl}/api/admin/surveys/stats`, { headers: getAuthHeaders() }),
            ]);
            if (listRes.ok) {
                const data = await listRes.json();
                setSurveyList(data.surveys);
            }
            if (statsRes.ok) setSurveyStats(await statsRes.json());
        } catch (err) {
            console.error("Failed to fetch surveys:", err);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchHistory(searchQuery);
    };

    const handleConfigSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const config: { maxSessions?: number; sessionDuration?: number; rateLimitPerDay?: number } = {};
        if (dirtyFields.has('maxSessions') && newPoolSize) {
            config.maxSessions = parseInt(newPoolSize, 10);
        }
        if (dirtyFields.has('duration') && newDuration) {
            config.sessionDuration = parseInt(newDuration, 10) * 60; // minutes → seconds
        }
        if (dirtyFields.has('rateLimit') && newRateLimit) {
            config.rateLimitPerDay = parseInt(newRateLimit, 10);
        }
        if (Object.keys(config).length > 0) {
            await systemAction("config", config);
            // Delay clearing dirty state so the next fetchAll (inside systemAction)
            // picks up the new server values before sliders fall back to stats
            setTimeout(() => {
                setNewPoolSize("");
                setNewDuration("");
                setNewRateLimit("");
                setDirtyFields(new Set());
            }, 500);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleTimeString();
    };

    const formatFullDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString();
    };

    if (restoring) {
        return (
            <main className="min-h-screen bg-background flex items-center justify-center p-4">
                <p className="text-muted-foreground text-sm">Loading...</p>
            </main>
        );
    }

    if (!authenticated) {
        return (
            <main className="min-h-screen bg-background flex items-center justify-center p-4">
                <Card className="w-full max-w-sm">
                    <CardHeader>
                        <CardTitle className="text-center">Admin Login</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <input
                                type="text"
                                placeholder="Username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-3 py-2 border rounded-md bg-background"
                            />
                            <input
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-3 py-2 border rounded-md bg-background"
                            />
                            {authError && (
                                <p className="text-destructive text-sm text-center">{authError}</p>
                            )}
                            <Button type="submit" className="w-full cursor-pointer" disabled={loading}>
                                {loading ? "Logging in..." : "Login"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-background p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold">Cloud Browser Admin</h1>
                        {stats?.paused && (
                            <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-xs font-semibold">
                                PAUSED
                            </span>
                        )}
                    </div>
                    <Button variant="outline" onClick={() => { sessionStorage.removeItem("admin_creds"); setAuthenticated(false); }} className="cursor-pointer">
                        Logout
                    </Button>
                </div>

                {/* Action feedback */}
                {actionMsg && (
                    <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-2 rounded-md text-sm">
                        ✅ {actionMsg}
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-2 border-b pb-2">
                    {(["overview", "history", "ratelimits", "feedback", "surveys", "controls"] as Tab[]).map((tab) => (
                        <Button
                            key={tab}
                            variant={activeTab === tab ? "default" : "ghost"}
                            onClick={() => setActiveTab(tab)}
                            className="cursor-pointer capitalize relative"
                        >
                            {tab === "ratelimits" ? "Rate Limits" : tab}
                            {tab === "feedback" && feedbackStats && feedbackStats.open > 0 && (
                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                    {feedbackStats.open}
                                </span>
                            )}
                        </Button>
                    ))}
                </div>

                {/* ===== OVERVIEW TAB ===== */}
                {activeTab === "overview" && (
                    <>
                        {/* Stats Cards — DT5 */}
                        {dataLoading && !stats ? (
                            <div className="space-y-4 animate-pulse">
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                    {Array.from({ length: 6 }).map((_, i) => (
                                        <Card key={i}>
                                            <CardContent className="pt-6">
                                                <div className="h-8 w-16 bg-muted/40 rounded mb-2" />
                                                <div className="h-4 w-24 bg-muted/30 rounded" />
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {Array.from({ length: 3 }).map((_, i) => (
                                        <Card key={i}>
                                            <CardContent className="pt-6">
                                                <div className="h-8 w-20 bg-muted/40 rounded mb-2" />
                                                <div className="h-4 w-28 bg-muted/30 rounded" />
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                                <Card>
                                    <CardHeader><div className="h-6 w-40 bg-muted/40 rounded" /></CardHeader>
                                    <CardContent><div className="h-4 w-32 bg-muted/30 rounded" /></CardContent>
                                </Card>
                            </div>
                        ) : (
                        <>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="text-2xl font-bold">{stats?.activeSessions || 0}</div>
                                    <p className="text-muted-foreground text-sm">Active Sessions</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="text-2xl font-bold">{stats?.queueLength || 0}</div>
                                    <p className="text-muted-foreground text-sm">In Queue</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="text-2xl font-bold">{pool?.warm || 0}/{pool?.total || 0}</div>
                                    <p className="text-muted-foreground text-sm">Warm Containers</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="text-2xl font-bold">{stats?.sessionsToday || 0}</div>
                                    <p className="text-muted-foreground text-sm">Sessions Today</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="text-2xl font-bold">{stats?.sessionsThisWeek || 0}</div>
                                    <p className="text-muted-foreground text-sm">Sessions This Week</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="text-2xl font-bold">{stats?.peakConcurrent || 0}</div>
                                    <p className="text-muted-foreground text-sm">Peak Concurrent</p>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="text-2xl font-bold">{stats?.avgDurationToday ? formatTime(stats.avgDurationToday) : "-"}</div>
                                    <p className="text-muted-foreground text-sm">Avg Duration (Today)</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="text-2xl font-bold">{stats?.sessionDuration ? formatTime(stats.sessionDuration) : "-"}</div>
                                    <p className="text-muted-foreground text-sm">Max Session Duration</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="text-2xl font-bold">{stats?.maxSessions || stats?.initialWarm || 0}</div>
                                    <p className="text-muted-foreground text-sm">Max Sessions</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="text-2xl font-bold text-primary">{pool?.metrics?.poolHitRate || "-"}</div>
                                    <p className="text-muted-foreground text-sm">Pool Hit Rate</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="text-2xl font-bold">{pool?.metrics?.avgBootTimeMs && pool.metrics.avgBootTimeMs > 0 ? `${(pool.metrics.avgBootTimeMs / 1000).toFixed(1)}s` : "—"}</div>
                                    <p className="text-muted-foreground text-sm">Avg Boot Time</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="text-2xl font-bold">{pool?.metrics?.totalAcquires ?? 0}</div>
                                    <p className="text-muted-foreground text-sm">Total Acquires</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="text-2xl font-bold">{pool?.metrics ? `${pool.metrics.portsUsed}/${pool.metrics.portsTotal}` : "-"}</div>
                                    <p className="text-muted-foreground text-sm">Ports Used</p>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Server Health */}
                        {serverHealth && (
                            <Card>
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base">Server Health</CardTitle>
                                        <span className="text-xs text-muted-foreground font-mono">
                                            {serverHealth.cpu.model.replace(/\s+/g, ' ').slice(0, 40)} · {serverHealth.cpu.cores} cores · up {Math.floor(serverHealth.uptime / 86400)}d {Math.floor((serverHealth.uptime % 86400) / 3600)}h
                                        </span>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
                                        {/* CPU */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">CPU</span>
                                                <span className="font-mono font-medium">{serverHealth.cpu.percent}%</span>
                                            </div>
                                            <div className="h-2.5 bg-muted/30 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-500 ${
                                                        serverHealth.cpu.percent > 80 ? 'bg-red-500' :
                                                        serverHealth.cpu.percent > 60 ? 'bg-yellow-500' :
                                                        'bg-emerald-500'
                                                    }`}
                                                    style={{ width: `${Math.min(serverHealth.cpu.percent, 100)}%` }}
                                                />
                                            </div>
                                            <div className="text-[11px] text-muted-foreground font-mono">
                                                Load: {serverHealth.cpu.loadAvg.join(' / ')}
                                            </div>
                                        </div>

                                        {/* RAM */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">RAM</span>
                                                <span className="font-mono font-medium">
                                                    {(serverHealth.memory.usedBytes / 1073741824).toFixed(1)} / {(serverHealth.memory.totalBytes / 1073741824).toFixed(0)} GB
                                                </span>
                                            </div>
                                            <div className="h-2.5 bg-muted/30 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-500 ${
                                                        serverHealth.memory.percent > 85 ? 'bg-red-500' :
                                                        serverHealth.memory.percent > 70 ? 'bg-yellow-500' :
                                                        'bg-blue-500'
                                                    }`}
                                                    style={{ width: `${Math.min(serverHealth.memory.percent, 100)}%` }}
                                                />
                                            </div>
                                            <div className="text-[11px] text-muted-foreground font-mono">
                                                {serverHealth.memory.percent}% used · {(serverHealth.memory.freeBytes / 1073741824).toFixed(1)} GB free
                                            </div>
                                        </div>

                                        {/* Disk */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Disk</span>
                                                <span className="font-mono font-medium">
                                                    {(serverHealth.disk.used / 1073741824).toFixed(0)} / {(serverHealth.disk.total / 1073741824).toFixed(0)} GB
                                                </span>
                                            </div>
                                            <div className="h-2.5 bg-muted/30 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-500 ${
                                                        serverHealth.disk.percent > 90 ? 'bg-red-500' :
                                                        serverHealth.disk.percent > 75 ? 'bg-yellow-500' :
                                                        'bg-purple-500'
                                                    }`}
                                                    style={{ width: `${Math.min(serverHealth.disk.percent, 100)}%` }}
                                                />
                                            </div>
                                            <div className="text-[11px] text-muted-foreground font-mono">
                                                {serverHealth.disk.percent}% used · {(serverHealth.disk.available / 1073741824).toFixed(0)} GB free
                                            </div>
                                        </div>

                                        {/* Disk I/O */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Disk I/O</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-1.5">
                                                    <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                                                    <span className="font-mono text-sm font-medium">{serverHealth.diskIO.readMBps}</span>
                                                    <span className="text-[10px] text-muted-foreground">MB/s</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <svg className="w-3 h-3 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                                                    <span className="font-mono text-sm font-medium">{serverHealth.diskIO.writeMBps}</span>
                                                    <span className="text-[10px] text-muted-foreground">MB/s</span>
                                                </div>
                                            </div>
                                            <div className="text-[11px] text-muted-foreground font-mono">
                                                Read / Write
                                            </div>
                                        </div>

                                        {/* Network */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Network</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-1.5">
                                                    <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                                                    <span className="font-mono text-sm font-medium">{serverHealth.network.rxMBps}</span>
                                                    <span className="text-[10px] text-muted-foreground">MB/s</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <svg className="w-3 h-3 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                                                    <span className="font-mono text-sm font-medium">{serverHealth.network.txMBps}</span>
                                                    <span className="text-[10px] text-muted-foreground">MB/s</span>
                                                </div>
                                            </div>
                                            <div className="text-[11px] text-muted-foreground font-mono">
                                                ↓ {serverHealth.network.rxTotalGB} GB · ↑ {serverHealth.network.txTotalGB} GB total
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Active Sessions — D2 */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Active Sessions ({sessions.length})</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {sessions.length === 0 ? (
                                    <p className="text-muted-foreground text-sm">No active sessions</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b">
                                                    <th className="text-left p-2">Session ID</th>
                                                    <th className="text-left p-2">Port</th>
                                                    <th className="text-left p-2">URL</th>
                                                    <th className="text-left p-2">Client IP</th>
                                                    <th className="text-left p-2">Started</th>
                                                    <th className="text-left p-2">Time Left</th>
                                                    <th className="text-left p-2">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sessions.map((session) => (
                                                    <tr key={session.id} className="border-b">
                                                        <td className="p-2 font-mono text-xs">{session.id.slice(0, 8)}...</td>
                                                        <td className="p-2">{session.port}</td>
                                                        <td className="p-2 max-w-xs truncate">{session.url}</td>
                                                        <td className="p-2"><FlagIP ip={session.clientIp} countryCode={session.countryCode} /></td>
                                                        <td className="p-2">{formatDate(session.startedAt)}</td>
                                                        <td className="p-2 font-mono">{formatTime(session.timeRemaining)}</td>
                                                        <td className="p-2">
                                                            <div className="flex gap-2">
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => window.open(`/browser/${session.port}/`, "_blank")}
                                                                    className="cursor-pointer"
                                                                >
                                                                    View
                                                                </Button>
                                                                <Button
                                                                    variant="destructive"
                                                                    size="sm"
                                                                    onClick={() => killSession(session.id)}
                                                                    className="cursor-pointer"
                                                                >
                                                                    Kill
                                                                </Button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Queue */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Queue ({queue.length})</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {queue.length === 0 ? (
                                    <p className="text-muted-foreground text-sm">Queue is empty</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b">
                                                    <th className="text-left p-2">Position</th>
                                                    <th className="text-left p-2">Queue ID</th>
                                                    <th className="text-left p-2">URL</th>
                                                    <th className="text-left p-2">Waiting Since</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {queue.map((entry) => (
                                                    <tr key={entry.id} className="border-b">
                                                        <td className="p-2">#{entry.position}</td>
                                                        <td className="p-2 font-mono text-xs">{entry.id.slice(0, 8)}...</td>
                                                        <td className="p-2 max-w-xs truncate">{entry.url}</td>
                                                        <td className="p-2">{formatDate(entry.createdAt)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Container Pool — D4 */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Container Pool</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {pool?.containers && pool.containers.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {pool.containers.map((container) => {
                                            // Match container with health stats by name prefix
                                            const healthStat = serverHealth?.containers.find(
                                                c => container.id.startsWith(c.name.replace('session-', ''))
                                                  || c.name === `session-${container.id.slice(0, 8)}`
                                            );
                                            return (
                                            <div
                                                key={container.id}
                                                className={`p-4 rounded-lg border ${container.status === "warm"
                                                    ? "border-green-500 bg-green-500/10"
                                                    : container.status === "reconnecting"
                                                        ? "border-orange-500 bg-orange-500/10 animate-pulse"
                                                        : container.status === "active"
                                                            ? "border-blue-500 bg-blue-500/10"
                                                            : "border-gray-500 bg-gray-500/10"
                                                    }`}
                                            >
                                                <div className="font-mono text-sm">{container.id.slice(0, 12)}...</div>
                                                <div className="text-sm text-muted-foreground">Port: {container.port}</div>
                                                <div className="mt-1 flex items-center gap-2">
                                                    <span
                                                        className={`text-xs px-2 py-1 rounded ${container.status === "warm"
                                                            ? "bg-green-500/20 text-green-400"
                                                            : container.status === "reconnecting"
                                                                ? "bg-orange-500/20 text-orange-400"
                                                                : container.status === "active"
                                                                    ? "bg-blue-500/20 text-blue-400"
                                                                    : "bg-gray-500/20 text-gray-400"
                                                            }`}
                                                    >
                                                        {container.status}
                                                    </span>
                                                    {container.status === "reconnecting" && container.disconnectedAt && (
                                                        <span className="text-xs text-orange-400 font-mono">
                                                            {Math.max(0, 30 - Math.floor((Date.now() - container.disconnectedAt) / 1000))}s
                                                        </span>
                                                    )}
                                                </div>
                                                {/* Per-container resource metrics */}
                                                {healthStat && (
                                                    <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap gap-2">
                                                        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                                                            CPU {healthStat.cpu}%
                                                        </span>
                                                        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                                                            RAM {healthStat.memMb >= 1024 ? `${(healthStat.memMb / 1024).toFixed(1)}G` : `${healthStat.memMb}M`}
                                                        </span>
                                                        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
                                                            ↓{healthStat.netRx} ↑{healthStat.netTx}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-muted-foreground text-sm">No containers</p>
                                )}

                            </CardContent>
                        </Card>
                        </>
                        )}
                    </>
                )}

                {/* ===== HISTORY TAB — D3 ===== */}
                {activeTab === "history" && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Session History — Last 7 Days ({historyTotal} sessions)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSearch} className="flex gap-2 mb-4">
                                <input
                                    type="text"
                                    placeholder="Search by URL or IP..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="flex-1 px-3 py-2 border rounded-md bg-background"
                                />
                                <Button type="submit" className="cursor-pointer">Search</Button>
                            </form>

                            {history.length === 0 ? (
                                <p className="text-muted-foreground text-sm">No session history</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b">
                                                <th className="text-left p-2">Session ID</th>
                                                <th className="text-left p-2">URL</th>
                                                <th className="text-left p-2">Client IP</th>
                                                <th className="text-left p-2">Started</th>
                                                <th className="text-left p-2">Duration</th>
                                                <th className="text-left p-2">Reason</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.map((log) => (
                                                <tr key={log.id} className="border-b">
                                                    <td className="p-2 font-mono text-xs">{log.sessionId.slice(0, 8)}...</td>
                                                    <td className="p-2 max-w-xs truncate">{log.url}</td>
                                                    <td className="p-2">
                                                        <FlagIP ip={log.clientIp} countryCode={log.countryCode} />
                                                    </td>
                                                    <td className="p-2">{formatFullDate(log.startedAt)}</td>
                                                    <td className="p-2">{log.duration ? formatTime(log.duration) : "-"}</td>
                                                    <td className="p-2">
                                                        <span className={`text-xs px-2 py-1 rounded ${log.reason === "expired" ? "bg-yellow-500/20 text-yellow-400" :
                                                            log.reason === "user_ended" ? "bg-green-500/20 text-green-400" :
                                                                log.reason === "admin_killed" ? "bg-red-500/20 text-red-400" :
                                                                    "bg-gray-500/20 text-gray-400"
                                                            }`}>
                                                            {log.reason || "active"}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* ===== RATE LIMITS TAB — D5 + DT2 ===== */}
                {activeTab === "ratelimits" && (
                    <>
                        {/* Blocked IPs */}
                        {blockedIps.length > 0 && (
                            <Card className="border-red-500/50">
                                <CardHeader>
                                    <CardTitle className="text-red-400">Blocked IPs ({blockedIps.length})</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex flex-wrap gap-2">
                                        {blockedIps.map((ip) => (
                                            <div key={ip} className="flex items-center gap-2 px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm font-mono">
                                                {ip}
                                                <button onClick={() => ipAction("unblock", ip)} className="hover:text-white cursor-pointer">×</button>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Whitelisted IPs */}
                        {whitelistedIps.length > 0 && (
                            <Card className="border-green-500/50">
                                <CardHeader>
                                    <CardTitle className="text-green-400">Whitelisted IPs ({whitelistedIps.length})</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex flex-wrap gap-2">
                                        {whitelistedIps.map((ip) => (
                                            <div key={ip} className="flex items-center gap-2 px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-mono">
                                                {ip}
                                                <button onClick={() => ipAction("unwhitelist", ip)} className="hover:text-white cursor-pointer">×</button>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Rate Limited IPs */}
                        {limitedIps.length > 0 && (
                            <Card className="border-yellow-500/50">
                                <CardHeader>
                                    <CardTitle className="text-yellow-400">Rate Limited IPs ({limitedIps.length})</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex flex-wrap gap-2">
                                        {limitedIps.map((ip) => (
                                            <span key={ip} className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-sm font-mono">
                                                {ip}
                                            </span>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* All IPs */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Session Usage by IP (Today)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex gap-2 mb-4">
                                    <input
                                        type="text"
                                        placeholder="Filter by IP address..."
                                        value={rateLimitSearch}
                                        onChange={(e) => setRateLimitSearch(e.target.value)}
                                        className="flex-1 px-3 py-2 border rounded-md bg-background"
                                    />
                                    {rateLimitSearch && (
                                        <Button variant="outline" onClick={() => setRateLimitSearch("")} className="cursor-pointer">Clear</Button>
                                    )}
                                </div>
                                {(rateLimitSearch ? rateLimits.filter(s => s.ip.includes(rateLimitSearch)) : rateLimits).length === 0 ? (
                                    <p className="text-muted-foreground text-sm">{rateLimitSearch ? "No IPs match your filter" : "No session data today"}</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b">
                                                    <th className="text-left p-2">IP Address</th>
                                                    <th className="text-left p-2">Sessions Used</th>
                                                    <th className="text-left p-2">Remaining</th>
                                                    <th className="text-left p-2">Status</th>
                                                    <th className="text-left p-2">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(rateLimitSearch ? rateLimits.filter(s => s.ip.includes(rateLimitSearch)) : rateLimits).map((stat) => (
                                                    <tr key={stat.ip} className="border-b">
                                                        <td className="p-2"><FlagIP ip={stat.ip} countryCode={stat.countryCode} /></td>
                                                        <td className="p-2">{stat.count}/{dailyLimit}</td>
                                                        <td className="p-2">{stat.remaining}</td>
                                                        <td className="p-2">
                                                            <span className={`text-xs px-2 py-1 rounded ${stat.remaining === 0 ? "bg-red-500/20 text-red-400" :
                                                                stat.remaining <= 3 ? "bg-yellow-500/20 text-yellow-400" :
                                                                    "bg-green-500/20 text-green-400"
                                                                }`}>
                                                                {stat.remaining === 0 ? "Limited" : stat.remaining <= 3 ? "Low" : "OK"}
                                                            </span>
                                                        </td>
                                                        <td className="p-2">
                                                            <div className="flex gap-1">
                                                                <Button size="sm" variant="outline" onClick={() => ipAction("block", stat.ip)} className="cursor-pointer text-xs">Block</Button>
                                                                <Button size="sm" variant="outline" onClick={() => ipAction("whitelist", stat.ip)} className="cursor-pointer text-xs">Whitelist</Button>
                                                                <Button size="sm" variant="outline" onClick={() => ipAction("clear-limit", stat.ip)} className="cursor-pointer text-xs">Clear</Button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}

                {/* ===== CONTROLS TAB — DT3 ===== */}
                {activeTab === "controls" && (
                    <>
                        {/* Session Controls */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Session Controls</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {/* Pause / Resume */}
                                    {stats?.paused ? (
                                        <button
                                            onClick={() => systemAction("resume")}
                                            className="flex items-center gap-3 p-4 rounded-lg border border-green-500/30 bg-green-500/10 hover:bg-green-500/20 transition-colors cursor-pointer text-left"
                                        >
                                            <div className="p-2 rounded-md bg-green-500/20">
                                                <Play className="w-5 h-5 text-green-400" />
                                            </div>
                                            <div>
                                                <div className="font-medium text-green-400">Resume Sessions</div>
                                                <div className="text-xs text-muted-foreground">Accept new session requests</div>
                                            </div>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => systemAction("pause")}
                                            className="flex items-center gap-3 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors cursor-pointer text-left"
                                        >
                                            <div className="p-2 rounded-md bg-yellow-500/20">
                                                <Pause className="w-5 h-5 text-yellow-400" />
                                            </div>
                                            <div>
                                                <div className="font-medium text-yellow-400">Pause Sessions</div>
                                                <div className="text-xs text-muted-foreground">Stop accepting new requests</div>
                                            </div>
                                        </button>
                                    )}

                                    {/* Drain Queue */}
                                    <button
                                        onClick={() => systemAction("drain-queue")}
                                        className="flex items-center gap-3 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer text-left"
                                    >
                                        <div className="p-2 rounded-md bg-muted">
                                            <Trash2 className="w-5 h-5 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <div className="font-medium">Drain Queue</div>
                                            <div className="text-xs text-muted-foreground">Clear all pending requests</div>
                                        </div>
                                    </button>

                                    {/* Restart Pool */}
                                    <button
                                        onClick={() => systemAction("restart-pool")}
                                        className="flex items-center gap-3 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer text-left"
                                    >
                                        <div className="p-2 rounded-md bg-muted">
                                            <RefreshCw className="w-5 h-5 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <div className="font-medium">Restart Pool</div>
                                            <div className="text-xs text-muted-foreground">Recycle warm containers</div>
                                        </div>
                                    </button>

                                    {/* Kill All Sessions */}
                                    <button
                                        onClick={() => {
                                            if (confirm("Kill ALL active sessions? This will immediately terminate every user's session.")) {
                                                systemAction("kill-all-sessions");
                                            }
                                        }}
                                        className="flex items-center gap-3 p-4 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-colors cursor-pointer text-left"
                                    >
                                        <div className="p-2 rounded-md bg-red-500/20">
                                            <XCircle className="w-5 h-5 text-red-400" />
                                        </div>
                                        <div>
                                            <div className="font-medium text-red-400">Kill All Sessions</div>
                                            <div className="text-xs text-muted-foreground">Terminate all active users</div>
                                        </div>
                                    </button>

                                    {/* Reset All Rate Limits */}
                                    <button
                                        onClick={() => {
                                            if (confirm("Reset ALL rate limits? Every IP's daily counter will be cleared.")) {
                                                systemAction("clear-all-rate-limits");
                                            }
                                        }}
                                        className="flex items-center gap-3 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer text-left"
                                    >
                                        <div className="p-2 rounded-md bg-muted">
                                            <RotateCcw className="w-5 h-5 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <div className="font-medium">Reset All Rate Limits</div>
                                            <div className="text-xs text-muted-foreground">Clear every IP&apos;s daily counter</div>
                                        </div>
                                    </button>

                                    {/* Cleanup Orphans */}
                                    <button
                                        onClick={() => {
                                            if (confirm("Scan for and terminate orphaned containers that aren't tracked by any active session?")) {
                                                systemAction("cleanup-orphans");
                                            }
                                        }}
                                        className="flex items-center gap-3 p-4 rounded-lg border border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 transition-colors cursor-pointer text-left"
                                    >
                                        <div className="p-2 rounded-md bg-orange-500/20">
                                            <Search className="w-5 h-5 text-orange-400" />
                                        </div>
                                        <div>
                                            <div className="font-medium text-orange-400">Cleanup Orphans</div>
                                            <div className="text-xs text-muted-foreground">Find & kill stale containers</div>
                                        </div>
                                    </button>

                                    {/* Reset Dashboard */}
                                    <button
                                        onClick={() => {
                                            if (confirm("RESET ALL DASHBOARD DATA?\n\nThis will permanently delete:\n• All session history\n• All daily stats & peaks\n• All rate limit counters\n\nThis action cannot be undone.")) {
                                                systemAction("reset-dashboard");
                                            }
                                        }}
                                        className="flex items-center gap-3 p-4 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-colors cursor-pointer text-left"
                                    >
                                        <div className="p-2 rounded-md bg-red-500/20">
                                            <Trash2 className="w-5 h-5 text-red-400" />
                                        </div>
                                        <div>
                                            <div className="font-medium text-red-400">Reset Dashboard</div>
                                            <div className="text-xs text-muted-foreground">Clear all history & stats</div>
                                        </div>
                                    </button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Runtime Configuration */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Runtime Configuration</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleConfigSubmit} className="space-y-6">
                                    <div className="space-y-5">
                                        {/* Max Sessions Slider */}
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-sm font-medium">Max Sessions</label>
                                                <span className="text-sm font-mono px-2 py-0.5 rounded bg-muted">
                                                    {dirtyFields.has('maxSessions') ? newPoolSize : (stats?.maxSessions || stats?.initialWarm || 3)}
                                                </span>
                                            </div>
                                            <input
                                                type="range"
                                                min="1"
                                                max="50"
                                                value={dirtyFields.has('maxSessions') ? newPoolSize : (stats?.maxSessions || stats?.initialWarm || 3)}
                                                onChange={(e) => { setNewPoolSize(e.target.value); markDirty('maxSessions'); }}
                                                className="w-full"
                                            />
                                            <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                                <span>1</span>
                                                <span className="text-muted-foreground/60">Current: {stats?.maxSessions || stats?.initialWarm || "?"}</span>
                                                <span>50</span>
                                            </div>
                                        </div>

                                        {/* Session Duration Slider (minutes) */}
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-sm font-medium">Session Duration</label>
                                                <span className="text-sm font-mono px-2 py-0.5 rounded bg-muted">
                                                    {dirtyFields.has('duration') ? newDuration : (stats?.sessionDuration ? Math.round(stats.sessionDuration / 60) : 5)} min
                                                </span>
                                            </div>
                                            <input
                                                type="range"
                                                min="1"
                                                max="60"
                                                value={dirtyFields.has('duration') ? newDuration : (stats?.sessionDuration ? Math.round(stats.sessionDuration / 60) : 5)}
                                                onChange={(e) => { setNewDuration(e.target.value); markDirty('duration'); }}
                                                className="w-full"
                                            />
                                            <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                                <span>1 min</span>
                                                <span className="text-muted-foreground/60">Current: {stats?.sessionDuration ? formatTime(stats.sessionDuration) : "?"}</span>
                                                <span>60 min</span>
                                            </div>
                                        </div>

                                        {/* Rate Limit Slider */}
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-sm font-medium">Rate Limit</label>
                                                <span className="text-sm font-mono px-2 py-0.5 rounded bg-muted">
                                                    {dirtyFields.has('rateLimit') ? newRateLimit : (stats?.rateLimitPerDay || 10)} /day
                                                </span>
                                            </div>
                                            <input
                                                type="range"
                                                min="1"
                                                max="100"
                                                value={dirtyFields.has('rateLimit') ? newRateLimit : (stats?.rateLimitPerDay || 10)}
                                                onChange={(e) => { setNewRateLimit(e.target.value); markDirty('rateLimit'); }}
                                                className="w-full"
                                            />
                                            <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                                <span>1</span>
                                                <span className="text-muted-foreground/60">Current: {stats?.rateLimitPerDay || "?"} /day</span>
                                                <span>100</span>
                                            </div>
                                        </div>
                                    </div>
                                    <Button type="submit" className="cursor-pointer">
                                        Apply Changes
                                    </Button>
                                </form>
                            </CardContent>
                        </Card>
                    </>
                )}

                {/* ===== FEEDBACK TAB ===== */}
                {activeTab === "feedback" && (
                    <>
                        {/* Filter bar */}
                        <div className="flex gap-4 items-center">
                            <div className="flex gap-2">
                                {(["all", "open", "resolved", "dismissed"] as const).map((f) => (
                                    <Button
                                        key={f}
                                        size="sm"
                                        variant={feedbackFilter === f ? "default" : "outline"}
                                        onClick={() => setFeedbackFilter(f)}
                                        className="cursor-pointer capitalize text-xs"
                                    >
                                        {f}
                                        {f !== "all" && feedbackStats && (
                                            <span className="ml-1 opacity-60">
                                                ({feedbackStats[f as keyof FeedbackStats] || 0})
                                            </span>
                                        )}
                                    </Button>
                                ))}
                            </div>
                            <span className="text-muted-foreground text-sm ml-auto">
                                {feedbackStats?.total || 0} total tickets
                            </span>
                        </div>

                        <Card>
                            <CardContent className="pt-4">
                                {feedbackList.length === 0 ? (
                                    <p className="text-muted-foreground text-sm text-center py-8">No feedback tickets</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm table-fixed">
                                            <thead>
                                                <tr className="border-b">
                                                    <th className="text-left p-2 w-10">#</th>
                                                    <th className="text-left p-2 w-24">Type</th>
                                                    <th className="text-left p-2 w-24">Status</th>
                                                    <th className="text-left p-2">Message</th>
                                                    <th className="text-left p-2 w-40">Contact</th>
                                                    <th className="text-left p-2 w-36">Date</th>
                                                    <th className="text-left p-2 w-44">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {feedbackList.map((fb) => (
                                                    <>
                                                        <tr
                                                            key={fb.id}
                                                            className={`border-b cursor-pointer hover:bg-muted/30 transition-colors ${fb.status === "open" ? "bg-blue-500/5" : ""}`}
                                                            onClick={() => setExpandedFeedback(expandedFeedback === fb.id ? null : fb.id)}
                                                        >
                                                            <td className="p-2 font-mono text-xs text-muted-foreground">{fb.id}</td>
                                                            <td className="p-2">
                                                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${fb.type === "bug" ? "bg-red-500/20 text-red-400" :
                                                                    fb.type === "suggestion" ? "bg-amber-500/20 text-amber-400" :
                                                                        "bg-blue-500/20 text-blue-400"
                                                                    }`}>
                                                                    {fb.type === "bug" ? (
                                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.96l-6.93-12a2 2 0 00-3.5 0l-6.93 12A2 2 0 005.07 19z" /></svg>
                                                                    ) : fb.type === "suggestion" ? (
                                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                                                                    ) : (
                                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                                                    )}
                                                                    {fb.type}
                                                                </span>
                                                            </td>
                                                            <td className="p-2">
                                                                <span className={`text-xs px-2 py-0.5 rounded-full ${fb.status === "open" ? "bg-blue-500/20 text-blue-400" :
                                                                    fb.status === "resolved" ? "bg-green-500/20 text-green-400" :
                                                                        "bg-gray-500/20 text-gray-400"
                                                                    }`}>
                                                                    {fb.status}
                                                                </span>
                                                            </td>
                                                            <td className="p-2 max-w-xs">
                                                                <div className="flex items-center gap-1.5">
                                                                    <p className="truncate break-all">{fb.message}</p>
                                                                    {fb.attachments && fb.attachments.length > 0 && (
                                                                        <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400" title={`${fb.attachments.length} attachment(s)`}>
                                                                            📎 {fb.attachments.length}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="p-2 text-xs text-muted-foreground">
                                                                {fb.email ? (
                                                                    <span className="inline-flex items-center gap-1">
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(fb.email!); showAction("Email copied to clipboard"); }}
                                                                            className="cursor-pointer text-muted-foreground hover:text-white transition-colors"
                                                                            title="Copy email"
                                                                        >
                                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" strokeWidth={2} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                                                                        </button>
                                                                        <span className="text-blue-400 truncate">{fb.email}</span>
                                                                    </span>
                                                                ) : (
                                                                    <span className="italic">anonymous</span>
                                                                )}
                                                            </td>
                                                            <td className="p-2 text-xs text-muted-foreground">{formatFullDate(fb.createdAt)}</td>
                                                            <td className="p-2" onClick={(e) => e.stopPropagation()}>
                                                                <div className="flex gap-1">
                                                                    {fb.status === "open" && (
                                                                        <>
                                                                            <Button size="sm" variant="outline" onClick={() => feedbackAction(fb.id, "resolve")} className="cursor-pointer text-xs h-7 text-green-400" title="Resolve">
                                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                                            </Button>
                                                                            <Button size="sm" variant="outline" onClick={() => feedbackAction(fb.id, "dismiss")} className="cursor-pointer text-xs h-7" title="Dismiss">
                                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" /></svg>
                                                                            </Button>
                                                                        </>
                                                                    )}
                                                                    {fb.status !== "open" && (
                                                                        <Button size="sm" variant="outline" onClick={() => feedbackAction(fb.id, "reopen")} className="cursor-pointer text-xs h-7 text-blue-400" title="Reopen">
                                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" /></svg>
                                                                        </Button>
                                                                    )}
                                                                    <Button size="sm" variant="destructive" onClick={() => {
                                                                        const hasFiles = fb.attachments && fb.attachments.length > 0;
                                                                        const msg = hasFiles
                                                                            ? `Delete this feedback and its ${fb.attachments!.length} attached file(s)? This cannot be undone.`
                                                                            : "Delete this feedback? This cannot be undone.";
                                                                        if (confirm(msg)) feedbackAction(fb.id, "delete");
                                                                    }} className="cursor-pointer text-xs h-7" title="Delete">
                                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                                    </Button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                        {expandedFeedback === fb.id && (
                                                            <tr key={`${fb.id}-detail`} className="border-b bg-muted/20">
                                                                <td colSpan={7} className="p-4">
                                                                    <div className="space-y-3">
                                                                        <div>
                                                                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Full Message</span>
                                                                            <p className="text-sm whitespace-pre-wrap break-all mt-1">{fb.message}</p>
                                                                        </div>
                                                                        <div className="flex gap-6 text-xs text-muted-foreground">
                                                                            <span>IP: <FlagIP ip={fb.clientIp} countryCode={fb.countryCode} /></span>
                                                                            {fb.sessionId && <span>Session: <span className="font-mono">{fb.sessionId.slice(0, 8)}...</span></span>}
                                                                            {fb.resolvedAt && <span>Resolved: {formatFullDate(fb.resolvedAt)}</span>}
                                                                        </div>
                                                                        {fb.adminNote && (
                                                                            <div className="text-xs bg-muted/50 p-2 rounded">
                                                                                <span className="font-medium">Admin note:</span> {fb.adminNote}
                                                                            </div>
                                                                        )}
                                                                        {fb.attachments && fb.attachments.length > 0 && (
                                                                            <div>
                                                                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Attachments ({fb.attachments.length})</span>
                                                                                <div className="flex flex-wrap gap-3 mt-2">
                                                                                    {fb.attachments.map((att: { id: number; filename: string; mimeType: string; size: number }) => (
                                                                                        <AuthAttachment key={att.id} att={att} feedbackId={fb.id} apiUrl={apiUrl} getAuthHeaders={getAuthHeaders} />
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}

                {/* ===== SURVEYS TAB ===== */}
                {activeTab === "surveys" && (
                    <>
                        {/* Stats Cards */}
                        {surveyStats && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <Card>
                                    <CardContent className="pt-4 pb-3 text-center">
                                        <p className="text-3xl font-bold">{surveyStats.averageRating}</p>
                                        <div className="flex justify-center gap-0.5 my-1">
                                            {[1, 2, 3, 4, 5].map(s => (
                                                <svg key={s} className={`w-4 h-4 ${s <= Math.round(surveyStats.averageRating) ? "text-amber-400" : "text-muted-foreground/20"}`} fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                                </svg>
                                            ))}
                                        </div>
                                        <p className="text-xs text-muted-foreground">Avg Rating</p>
                                        {surveyStats.dailyAverages.length > 1 && (() => {
                                            const data = surveyStats.dailyAverages;
                                            const w = 100, h = 24, pad = 2;
                                            const min = Math.min(...data.map(d => d.average)) - 0.3;
                                            const max = Math.max(...data.map(d => d.average)) + 0.3;
                                            const range = max - min || 1;
                                            const points = data.map((d, i) => {
                                                const x = pad + (i / (data.length - 1)) * (w - pad * 2);
                                                const y = h - pad - ((d.average - min) / range) * (h - pad * 2);
                                                return `${x},${y}`;
                                            }).join(' ');
                                            const areaPoints = `${pad},${h} ${points} ${w - pad},${h}`;
                                            return (
                                                <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-6 mt-2" preserveAspectRatio="none">
                                                    <defs>
                                                        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="0%" stopColor="rgb(251,191,36)" stopOpacity="0.3" />
                                                            <stop offset="100%" stopColor="rgb(251,191,36)" stopOpacity="0" />
                                                        </linearGradient>
                                                    </defs>
                                                    <polygon points={areaPoints} fill="url(#sparkFill)" />
                                                    <polyline points={points} fill="none" stroke="rgb(251,191,36)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            );
                                        })()}
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-4 pb-4 text-center">
                                        <p className="text-3xl font-bold">{surveyStats.totalResponses}</p>
                                        <p className="text-xs text-muted-foreground mt-1">Total Responses</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-4 pb-4 text-center">
                                        <p className="text-3xl font-bold text-green-500">
                                            {surveyStats.ratingDistribution[5] + surveyStats.ratingDistribution[4] + surveyStats.ratingDistribution[3]}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">Positive (3-5★)</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-4 pb-4 text-center">
                                        <p className="text-3xl font-bold text-red-500">
                                            {surveyStats.ratingDistribution[2] + surveyStats.ratingDistribution[1]}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">Negative (1-2★)</p>
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {/* Rating Distribution & Tag Frequency */}
                        {surveyStats && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Rating Distribution */}
                                <Card>
                                    <CardContent className="pt-4 pb-4">
                                        <h3 className="text-sm font-semibold mb-3">Rating Distribution</h3>
                                        <div className="space-y-2">
                                            {[5, 4, 3, 2, 1].map(star => {
                                                const count = surveyStats.ratingDistribution[star] || 0;
                                                const pct = surveyStats.totalResponses > 0 ? (count / surveyStats.totalResponses) * 100 : 0;
                                                return (
                                                    <div key={star} className="flex items-center gap-2 text-xs">
                                                        <span className="w-4 text-right text-muted-foreground">{star}★</span>
                                                        <div className="flex-1 bg-muted rounded-full h-2.5">
                                                            <div
                                                                className={`h-2.5 rounded-full transition-all ${star >= 4 ? "bg-green-500" : star === 3 ? "bg-amber-500" : "bg-red-500"}`}
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                        <span className="w-6 text-right text-muted-foreground">{count}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Tag Frequency */}
                                <Card>
                                    <CardContent className="pt-4 pb-4">
                                        <h3 className="text-sm font-semibold mb-3">Tag Frequency</h3>
                                        {Object.keys(surveyStats.tagFrequency).length === 0 ? (
                                            <p className="text-xs text-muted-foreground text-center py-4">No tag data yet</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {Object.entries(surveyStats.tagFrequency)
                                                    .sort(([, a], [, b]) => b - a)
                                                    .map(([tag, count]) => {
                                                        const maxCount = Math.max(...Object.values(surveyStats.tagFrequency));
                                                        const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                                                        const labels: Record<string, string> = {
                                                            fast: "Fast & smooth", great_quality: "Great quality", stable: "Stable & reliable",
                                                            easy: "Easy to use", everything_great: "Everything great!",
                                                            slow: "Slow performance", poor_quality: "Poor quality", unstable: "Unstable / crashes",
                                                            hard_to_use: "Hard to use", other_issue: "Other issue",
                                                            speed: "Speed", quality: "Quality", stability: "Stability",
                                                            ease_of_use: "Easy to use", great: "Great!",
                                                        };
                                                        const icons: Record<string, string> = {
                                                            fast: "M13 10V3L4 14h7v7l9-11h-7z",
                                                            great_quality: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
                                                            stable: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
                                                            easy: "M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
                                                            everything_great: "M5 13l4 4L19 7",
                                                            slow: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
                                                            poor_quality: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636",
                                                            unstable: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
                                                            hard_to_use: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01",
                                                            other_issue: "M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z",
                                                            speed: "M13 10V3L4 14h7v7l9-11h-7z",
                                                            quality: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
                                                            stability: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
                                                            ease_of_use: "M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
                                                            great: "M5 13l4 4L19 7",
                                                        };
                                                        return (
                                                            <div key={tag} className="flex items-center gap-2 text-xs">
                                                                <span className="w-28 flex items-center gap-1.5 truncate text-muted-foreground">
                                                                    {icons[tag] && (
                                                                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icons[tag]} />
                                                                        </svg>
                                                                    )}
                                                                    <span className="truncate">{labels[tag] || tag}</span>
                                                                </span>
                                                                <div className="flex-1 bg-muted rounded-full h-2.5">
                                                                    <div className="h-2.5 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                                                                </div>
                                                                <span className="w-6 text-right text-muted-foreground">{count}</span>
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        )}



                        {/* Recent Responses */}
                        <Card>
                            <CardContent className="pt-4 pb-4">
                                <h3 className="text-sm font-semibold mb-3">Recent Responses ({surveyList.length})</h3>
                                {surveyList.length === 0 ? (
                                    <p className="text-muted-foreground text-sm text-center py-8">No survey responses yet</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm table-fixed">
                                            <thead>
                                                <tr className="border-b">
                                                    <th className="text-left p-2 w-40">Date</th>
                                                    <th className="text-left p-2 w-24">Rating</th>
                                                    <th className="text-left p-2 w-28">Tags</th>
                                                    <th className="text-left p-2">Comment</th>
                                                    <th className="text-left p-2 w-20">Session</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {surveyList.map((s) => (
                                                    <>
                                                        <tr key={s.id} className="border-b cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setExpandedSurveyId(expandedSurveyId === s.id ? null : s.id)}>
                                                            <td className="p-2 whitespace-nowrap">{new Date(s.createdAt).toLocaleString()}</td>
                                                            <td className="p-2">
                                                                <span className="flex gap-0.5">
                                                                    {[1, 2, 3, 4, 5].map(star => (
                                                                        <svg key={star} className={`w-3 h-3 ${star <= s.rating ? "text-amber-400" : "text-muted-foreground/20"}`} fill="currentColor" viewBox="0 0 24 24">
                                                                            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                                                        </svg>
                                                                    ))}
                                                                </span>
                                                            </td>
                                                            <td className="p-2">
                                                                <div className="flex flex-wrap gap-1">
                                                                    {s.tags.map(t => {
                                                                        const icons: Record<string, string> = {
                                                                            fast: "M13 10V3L4 14h7v7l9-11h-7z",
                                                                            great_quality: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
                                                                            stable: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
                                                                            easy: "M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
                                                                            everything_great: "M5 13l4 4L19 7",
                                                                            slow: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
                                                                            poor_quality: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636",
                                                                            unstable: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
                                                                            hard_to_use: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01",
                                                                            other_issue: "M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z",
                                                                            speed: "M13 10V3L4 14h7v7l9-11h-7z",
                                                                            quality: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
                                                                            stability: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
                                                                            ease_of_use: "M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
                                                                            great: "M5 13l4 4L19 7",
                                                                        };
                                                                        const tagLabels: Record<string, string> = {
                                                                            fast: "Fast & smooth", great_quality: "Great quality", stable: "Stable & reliable",
                                                                            easy: "Easy to use", everything_great: "Everything great!",
                                                                            slow: "Slow performance", poor_quality: "Poor quality", unstable: "Unstable / crashes",
                                                                            hard_to_use: "Hard to use", other_issue: "Other issue",
                                                                        };
                                                                        return (
                                                                            <span key={t} className="bg-muted px-1.5 py-0.5 rounded text-[10px] inline-flex items-center" title={tagLabels[t] || t}>
                                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icons[t] || "M5 13l4 4L19 7"} />
                                                                                </svg>
                                                                            </span>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </td>
                                                            <td className="p-2 max-w-[200px] truncate text-muted-foreground">{s.comment || "—"}</td>
                                                            <td className="p-2 text-muted-foreground font-mono text-[10px]">{s.sessionId.slice(0, 8)}...</td>
                                                        </tr>
                                                        {expandedSurveyId === s.id && (
                                                            <tr key={`${s.id}-detail`} className="border-b bg-muted/10">
                                                                <td colSpan={5} className="p-3">
                                                                    <div className="flex flex-col gap-2 text-xs">
                                                                        <div>
                                                                            <span className="text-muted-foreground font-medium">Comment: </span>
                                                                            <span>{s.comment || "No comment"}</span>
                                                                        </div>
                                                                        {s.tags.length > 0 && (
                                                                            <div className="flex items-start gap-1.5">
                                                                                <span className="text-muted-foreground font-medium shrink-0 mt-0.5">Tags: </span>
                                                                                <div className="flex flex-wrap gap-1.5">
                                                                                    {s.tags.map(t => {
                                                                                        const tagLabels: Record<string, string> = {
                                                                                            fast: "Fast & smooth", great_quality: "Great quality", stable: "Stable & reliable",
                                                                                            easy: "Easy to use", everything_great: "Everything great!",
                                                                                            slow: "Slow performance", poor_quality: "Poor quality", unstable: "Unstable / crashes",
                                                                                            hard_to_use: "Hard to use", other_issue: "Other issue",
                                                                                            speed: "Speed", quality: "Quality", stability: "Stability",
                                                                                            ease_of_use: "Easy to use", great: "Great!",
                                                                                        };
                                                                                        const icons: Record<string, string> = {
                                                                                            fast: "M13 10V3L4 14h7v7l9-11h-7z",
                                                                                            great_quality: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
                                                                                            stable: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
                                                                                            easy: "M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
                                                                                            everything_great: "M5 13l4 4L19 7",
                                                                                            slow: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
                                                                                            poor_quality: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636",
                                                                                            unstable: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
                                                                                            hard_to_use: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01",
                                                                                            other_issue: "M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z",
                                                                                            speed: "M13 10V3L4 14h7v7l9-11h-7z",
                                                                                            quality: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
                                                                                            stability: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
                                                                                            ease_of_use: "M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
                                                                                            great: "M5 13l4 4L19 7",
                                                                                        };
                                                                                        return (
                                                                                            <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                                                                                {icons[t] && (
                                                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icons[t]} />
                                                                                                    </svg>
                                                                                                )}
                                                                                                {tagLabels[t] || t}
                                                                                            </span>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                        <div>
                                                                            <span className="text-muted-foreground font-medium">Session: </span>
                                                                            <span className="font-mono">{s.sessionId}</span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-muted-foreground font-medium">IP: </span>
                                                                            <FlagIP ip={s.clientIp} countryCode={s.countryCode} />
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </main>
    );
}
