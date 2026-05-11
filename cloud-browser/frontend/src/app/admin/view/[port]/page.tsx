'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type PageStatus = 'loading' | 'valid' | 'expired' | 'error';
type StreamStatus = 'connecting' | 'streaming' | 'away' | 'connection_lost' | 'container_down' | 'ended';

const STATUS_CONFIG: Record<StreamStatus, { icon: string; label: string; color: string }> = {
    connecting: { icon: '📡', label: 'Connecting', color: '#9ca3af' },
    streaming: { icon: '🖥️', label: 'Connected', color: '#22c55e' },
    away: { icon: '⏸️', label: 'User Away', color: '#eab308' },
    connection_lost: { icon: '🔌', label: 'Connection Lost', color: '#ef4444' },
    container_down: { icon: '💀', label: 'Container Down', color: '#ef4444' },
    ended: { icon: '🔴', label: 'Ended', color: '#ef4444' },
};

export default function AdminViewerPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const port = params.port as string;
    const token = searchParams.get('t') || '';

    const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
    const [streamStatus, setStreamStatus] = useState<StreamStatus>('connecting');
    const [errorMsg, setErrorMsg] = useState('');
    const [expiresAt, setExpiresAt] = useState<Date | null>(null);
    const [timeRemaining, setTimeRemaining] = useState('--:--');
    const sessionIdRef = useRef<string>('');

    // Validate token on load
    useEffect(() => {
        if (!port || !token) {
            setPageStatus('error');
            setErrorMsg('Missing viewer token.');
            return;
        }

        fetch(`${API_URL}/api/session/viewer/validate?port=${port}&t=${encodeURIComponent(token)}`)
            .then(res => res.json())
            .then(data => {
                if (data.valid) {
                    setPageStatus('valid');
                    setExpiresAt(new Date(data.expiresAt));
                    sessionIdRef.current = data.sessionId;
                } else {
                    setPageStatus('expired');
                    setErrorMsg(data.reason || 'Session is no longer active.');
                }
            })
            .catch(() => {
                setPageStatus('error');
                setErrorMsg('Failed to connect to server.');
            });
    }, [port, token]);

    // Countdown timer — updates every second
    useEffect(() => {
        if (!expiresAt) return;
        const tick = () => {
            const diff = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
            const min = Math.floor(diff / 60);
            const sec = diff % 60;
            setTimeRemaining(`${min}:${sec.toString().padStart(2, '0')}`);
            if (diff <= 0) {
                setStreamStatus('ended');
            }
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [expiresAt]);

    // Poll backend every 3s to check if session is still active
    useEffect(() => {
        if (pageStatus !== 'valid') return;
        const interval = setInterval(() => {
            fetch(`${API_URL}/api/session/viewer/validate?port=${port}&t=${encodeURIComponent(token)}`)
                .then(res => res.json())
                .then(data => {
                    if (!data.valid) {
                        setStreamStatus('ended');
                    } else if (data.containerRunning === false) {
                        setStreamStatus('container_down');
                    } else if (data.userConnectionState === 'failed' || data.userConnectionState === 'disconnected') {
                        setStreamStatus('connection_lost');
                    } else if (data.userVisible === false) {
                        setStreamStatus('away');
                    } else {
                        // Restore if things are back to normal
                        setStreamStatus(prev => 
                            ['away', 'container_down', 'connection_lost'].includes(prev) ? 'streaming' : prev
                        );
                    }
                })
                .catch(() => { /* ignore network blips */ });
        }, 3000);
        return () => clearInterval(interval);
    }, [pageStatus, port, token]);

    // Listen for iframe postMessage events — ONLY for initial stream detection.
    // All other status transitions are driven by the backend poll (single source of truth).
    useEffect(() => {
        if (pageStatus !== 'valid') return;
        const handler = (e: MessageEvent) => {
            if (!e.data || typeof e.data !== 'object') return;
            if (e.data.type === 'streamStarted' ||
                (e.data.type === 'pipelineStatusUpdate' && e.data.video === true)) {
                setStreamStatus(prev => prev === 'connecting' ? 'streaming' : prev);
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [pageStatus]);

    // --- Loading state ---
    if (pageStatus === 'loading') {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <div style={styles.spinner} />
                    <p style={styles.text}>Connecting to session...</p>
                </div>
            </div>
        );
    }

    // --- Error / expired state ---
    if (pageStatus === 'expired' || pageStatus === 'error') {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <div style={styles.icon}>⏱️</div>
                    <h1 style={styles.title}>Session Unavailable</h1>
                    <p style={styles.text}>{errorMsg}</p>
                    <p style={styles.subtext}>The session may have ended or the link expired.</p>
                </div>
            </div>
        );
    }

    // --- Valid — render viewer ---
    const statusCfg = STATUS_CONFIG[streamStatus];

    return (
        <div style={styles.viewerContainer}>
            {/* Top bar */}
            <div className="viewer-topbar">
                <span className="viewer-badge">👁️ <span className="viewer-badge-text">Admin Viewer</span></span>

                <span className="viewer-sep">│</span>

                <span className="viewer-status" style={{ color: statusCfg.color }}>
                    {statusCfg.icon} {statusCfg.label}
                </span>

                <span className="viewer-sep">│</span>

                <span className="viewer-timer">⏱️ {timeRemaining}</span>

                <span className="viewer-readonly">🔒 <span className="viewer-readonly-text">Read-only</span></span>
            </div>

            {/* Viewer iframe */}
            <iframe
                src={`/browser/${port}/#shared`}
                style={styles.iframe}
                allow="autoplay"
            />

            {/* Click blocker overlay */}
            <div style={styles.clickBlocker} />

            {/* Session ended overlay */}
            {streamStatus === 'ended' && (
                <div style={styles.endedOverlay}>
                    <div style={styles.card}>
                        <div style={styles.icon}>🔴</div>
                        <h1 style={styles.title}>Session Ended</h1>
                        <p style={styles.text}>The user has disconnected or the session expired.</p>
                    </div>
                </div>
            )}
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0f',
        fontFamily: "'Inter', sans-serif",
    },
    card: {
        textAlign: 'center' as const,
        padding: '48px',
        borderRadius: '16px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        maxWidth: '400px',
    },
    spinner: {
        width: '40px',
        height: '40px',
        border: '3px solid rgba(255,255,255,0.1)',
        borderTop: '3px solid #7c3aed',
        borderRadius: '50%',
        margin: '0 auto 20px',
        animation: 'spin 1s linear infinite',
    },
    icon: {
        fontSize: '48px',
        marginBottom: '16px',
    },
    title: {
        color: '#fff',
        fontSize: '20px',
        fontWeight: 600,
        margin: '0 0 12px',
    },
    text: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: '14px',
        margin: '0 0 8px',
    },
    subtext: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: '12px',
        margin: 0,
    },
    viewerContainer: {
        position: 'fixed' as const,
        inset: 0,
        background: '#000',
        display: 'flex',
        flexDirection: 'column' as const,
    },
    iframe: {
        flex: 1,
        width: '100%',
        border: 'none',
        pointerEvents: 'none' as const,
    },
    clickBlocker: {
        position: 'absolute' as const,
        top: '40px',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 5,
        cursor: 'not-allowed',
    },
    endedOverlay: {
        position: 'absolute' as const,
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
    },
};
