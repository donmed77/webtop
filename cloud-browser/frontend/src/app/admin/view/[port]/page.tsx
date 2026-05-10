'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function AdminViewerPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const port = params.port as string;
    const token = searchParams.get('t') || '';

    const [status, setStatus] = useState<'loading' | 'valid' | 'expired' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (!port || !token) {
            setStatus('error');
            setErrorMsg('Missing viewer token.');
            return;
        }

        // Validate token against backend
        fetch(`${API_URL}/api/session/viewer/validate?port=${port}&t=${encodeURIComponent(token)}`)
            .then(res => res.json())
            .then(data => {
                if (data.valid) {
                    setStatus('valid');
                } else {
                    setStatus('expired');
                    setErrorMsg(data.reason || 'Session is no longer active.');
                }
            })
            .catch(() => {
                setStatus('error');
                setErrorMsg('Failed to connect to server.');
            });
    }, [port, token]);

    if (status === 'loading') {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <div style={styles.spinner} />
                    <p style={styles.text}>Connecting to session...</p>
                </div>
            </div>
        );
    }

    if (status === 'expired' || status === 'error') {
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

    // Valid — render the viewer iframe (read-only via pointer-events: none)
    const streamBase = typeof window !== 'undefined' ? window.location.origin : '';

    return (
        <div style={styles.viewerContainer}>
            {/* Minimal top bar */}
            <div style={styles.topBar}>
                <span style={styles.badge}>👁️ Admin Viewer</span>
                <span style={styles.portLabel}>Port {port}</span>
                <span style={styles.readOnly}>🔒 Read-only</span>
            </div>

            {/* Viewer iframe — pointer-events: none prevents ALL input */}
            <iframe
                src={`/browser/${port}/#shared`}
                style={styles.iframe}
                allow="autoplay"
                sandbox="allow-scripts allow-same-origin"
            />

            {/* Invisible overlay to block all clicks (extra safety on top of pointer-events:none) */}
            <div style={styles.clickBlocker} />
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
    topBar: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 16px',
        background: 'rgba(124, 58, 237, 0.15)',
        borderBottom: '1px solid rgba(124, 58, 237, 0.3)',
        zIndex: 10,
    },
    badge: {
        color: '#fff',
        fontSize: '13px',
        fontWeight: 600,
        fontFamily: "'Inter', sans-serif",
    },
    portLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: '12px',
        fontFamily: "'Inter', sans-serif",
    },
    readOnly: {
        marginLeft: 'auto',
        color: '#7c3aed',
        fontSize: '12px',
        fontWeight: 600,
        fontFamily: "'Inter', sans-serif",
    },
    iframe: {
        flex: 1,
        width: '100%',
        border: 'none',
        pointerEvents: 'none' as const,
    },
    clickBlocker: {
        position: 'absolute' as const,
        top: '40px', // below top bar
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 5,
        cursor: 'not-allowed',
    },
};
