"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Session {
    id: string;
    port: string;
    url: string;
    clientIp: string;
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
    containers: Array<{ id: string; port: number; status: string }>;
}

interface Stats {
    activeSessions: number;
    queueLength: number;
    sessionsToday: number;
    sessionsThisWeek: number;
    peakConcurrent: number;
    avgDuration: number;
    avgDurationWeek: number;
    sessionDuration: number;
    poolSize: number;
    paused: boolean;
}

interface SessionLog {
    id: number;
    sessionId: string;
    url: string;
    clientIp: string;
    startedAt: string;
    endedAt: string | null;
    reason: string | null;
    duration: number | null;
}

interface RateLimitStat {
    ip: string;
    count: number;
    remaining: number;
}

type Tab = "overview" | "history" | "ratelimits" | "controls";

export default function AdminPage() {
    const [authenticated, setAuthenticated] = useState(false);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [authError, setAuthError] = useState("");

    const [sessions, setSessions] = useState<Session[]>([]);
    const [queue, setQueue] = useState<QueueEntry[]>([]);
    const [pool, setPool] = useState<PoolStatus | null>(null);
    const [stats, setStats] = useState<Stats | null>(null);
    const [history, setHistory] = useState<SessionLog[]>([]);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [rateLimits, setRateLimits] = useState<RateLimitStat[]>([]);
    const [limitedIps, setLimitedIps] = useState<string[]>([]);
    const [blockedIps, setBlockedIps] = useState<string[]>([]);
    const [whitelistedIps, setWhitelistedIps] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>("overview");
    const [searchQuery, setSearchQuery] = useState("");
    const [actionMsg, setActionMsg] = useState("");

    // Config form state
    const [newPoolSize, setNewPoolSize] = useState("");
    const [newDuration, setNewDuration] = useState("");

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

    const getAuthHeaders = () => ({
        Authorization: `Basic ${btoa(`${username}:${password}`)}`,
    });

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError("");
        setLoading(true);

        try {
            const res = await fetch(`${apiUrl}/api/admin/stats`, {
                headers: getAuthHeaders(),
            });

            if (res.ok) {
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
            const [sessionsRes, queueRes, poolRes, statsRes] = await Promise.all([
                fetch(`${apiUrl}/api/admin/sessions`, { headers: getAuthHeaders() }),
                fetch(`${apiUrl}/api/admin/queue`, { headers: getAuthHeaders() }),
                fetch(`${apiUrl}/api/admin/pool`, { headers: getAuthHeaders() }),
                fetch(`${apiUrl}/api/admin/stats`, { headers: getAuthHeaders() }),
            ]);

            if (sessionsRes.ok) setSessions(await sessionsRes.json());
            if (queueRes.ok) setQueue(await queueRes.json());
            if (poolRes.ok) setPool(await poolRes.json());
            if (statsRes.ok) setStats(await statsRes.json());
        } catch (err) {
            console.error("Failed to fetch data:", err);
        }
    };

    const fetchHistory = async (search?: string) => {
        try {
            const url = search
                ? `${apiUrl}/api/admin/history?limit=50&search=${encodeURIComponent(search)}`
                : `${apiUrl}/api/admin/history?limit=50`;
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
                setLimitedIps(data.limitedIps);
                setBlockedIps(data.blockedIps || []);
                setWhitelistedIps(data.whitelistedIps || []);
            }
        } catch (err) {
            console.error("Failed to fetch rate limits:", err);
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
        const interval = setInterval(fetchAll, 5000);
        return () => clearInterval(interval);
    }, [authenticated]);

    useEffect(() => {
        if (!authenticated) return;
        if (activeTab === "history") {
            fetchHistory(searchQuery);
        } else if (activeTab === "ratelimits") {
            fetchRateLimits();
        }
    }, [activeTab, authenticated]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchHistory(searchQuery);
    };

    const handleConfigSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const config: { poolSize?: number; sessionDuration?: number } = {};
        if (newPoolSize) config.poolSize = parseInt(newPoolSize, 10);
        if (newDuration) config.sessionDuration = parseInt(newDuration, 10);
        if (Object.keys(config).length > 0) {
            systemAction("config", config);
            setNewPoolSize("");
            setNewDuration("");
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
                    <Button variant="outline" onClick={() => setAuthenticated(false)} className="cursor-pointer">
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
                    {(["overview", "history", "ratelimits", "controls"] as Tab[]).map((tab) => (
                        <Button
                            key={tab}
                            variant={activeTab === tab ? "default" : "ghost"}
                            onClick={() => setActiveTab(tab)}
                            className="cursor-pointer capitalize"
                        >
                            {tab === "ratelimits" ? "Rate Limits" : tab}
                        </Button>
                    ))}
                </div>

                {/* ===== OVERVIEW TAB ===== */}
                {activeTab === "overview" && (
                    <>
                        {/* Stats Cards — DT5 */}
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

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="text-2xl font-bold">{stats?.avgDuration ? formatTime(stats.avgDuration) : "-"}</div>
                                    <p className="text-muted-foreground text-sm">Avg Duration (rolling)</p>
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
                                    <div className="text-2xl font-bold">{stats?.poolSize || 0}</div>
                                    <p className="text-muted-foreground text-sm">Pool Size</p>
                                </CardContent>
                            </Card>
                        </div>

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
                                                        <td className="p-2 font-mono text-xs">{session.clientIp}</td>
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
                                        {pool.containers.map((container) => (
                                            <div
                                                key={container.id}
                                                className={`p-4 rounded-lg border ${container.status === "warm"
                                                    ? "border-green-500 bg-green-500/10"
                                                    : container.status === "active"
                                                        ? "border-yellow-500 bg-yellow-500/10"
                                                        : "border-gray-500 bg-gray-500/10"
                                                    }`}
                                            >
                                                <div className="font-mono text-sm">{container.id.slice(0, 12)}...</div>
                                                <div className="text-sm text-muted-foreground">Port: {container.port}</div>
                                                <div className="mt-1">
                                                    <span
                                                        className={`text-xs px-2 py-1 rounded ${container.status === "warm"
                                                            ? "bg-green-500/20 text-green-400"
                                                            : "bg-yellow-500/20 text-yellow-400"
                                                            }`}
                                                    >
                                                        {container.status}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-muted-foreground text-sm">No containers</p>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}

                {/* ===== HISTORY TAB — D3 ===== */}
                {activeTab === "history" && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Session History ({historyTotal} total)</CardTitle>
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
                                                    <td className="p-2 font-mono text-xs">{log.clientIp}</td>
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
                                {rateLimits.length === 0 ? (
                                    <p className="text-muted-foreground text-sm">No session data today</p>
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
                                                {rateLimits.map((stat) => (
                                                    <tr key={stat.ip} className="border-b">
                                                        <td className="p-2 font-mono text-xs">{stat.ip}</td>
                                                        <td className="p-2">{stat.count}/10</td>
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
                                <div className="flex flex-wrap gap-3">
                                    {stats?.paused ? (
                                        <Button onClick={() => systemAction("resume")} className="cursor-pointer bg-green-600 hover:bg-green-700">
                                            ▶ Resume Sessions
                                        </Button>
                                    ) : (
                                        <Button onClick={() => systemAction("pause")} variant="destructive" className="cursor-pointer">
                                            ⏸ Pause Sessions
                                        </Button>
                                    )}
                                    <Button onClick={() => systemAction("drain-queue")} variant="outline" className="cursor-pointer">
                                        🗑 Drain Queue
                                    </Button>
                                    <Button onClick={() => systemAction("restart-pool")} variant="outline" className="cursor-pointer">
                                        🔄 Restart Pool
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Runtime Configuration */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Runtime Configuration</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleConfigSubmit} className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm text-muted-foreground block mb-1">
                                                Pool Size (current: {stats?.poolSize || "?"}, range: 1-20)
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="20"
                                                placeholder={`${stats?.poolSize || 3}`}
                                                value={newPoolSize}
                                                onChange={(e) => setNewPoolSize(e.target.value)}
                                                className="w-full px-3 py-2 border rounded-md bg-background"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm text-muted-foreground block mb-1">
                                                Session Duration (current: {stats?.sessionDuration ? formatTime(stats.sessionDuration) : "?"}, range: 60-1800s)
                                            </label>
                                            <input
                                                type="number"
                                                min="60"
                                                max="1800"
                                                placeholder={`${stats?.sessionDuration || 300}`}
                                                value={newDuration}
                                                onChange={(e) => setNewDuration(e.target.value)}
                                                className="w-full px-3 py-2 border rounded-md bg-background"
                                            />
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
            </div>
        </main>
    );
}
