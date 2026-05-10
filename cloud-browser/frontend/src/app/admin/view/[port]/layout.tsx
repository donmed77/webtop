import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Admin Viewer — Unshortlink',
    robots: { index: false, follow: false },
};

export default function AdminViewerLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .viewer-topbar {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 8px 16px;
                    background: rgba(124, 58, 237, 0.15);
                    border-bottom: 1px solid rgba(124, 58, 237, 0.3);
                    z-index: 10;
                    font-family: 'Inter', sans-serif;
                    min-height: 36px;
                }
                .viewer-badge {
                    color: #fff;
                    font-size: 13px;
                    font-weight: 600;
                    white-space: nowrap;
                }
                .viewer-sep {
                    color: rgba(255,255,255,0.2);
                    font-size: 13px;
                }
                .viewer-status {
                    font-size: 12px;
                    font-weight: 600;
                    white-space: nowrap;
                }
                .viewer-timer {
                    color: rgba(255,255,255,0.7);
                    font-size: 12px;
                    font-family: 'Inter', monospace;
                    white-space: nowrap;
                }
                .viewer-readonly {
                    margin-left: auto;
                    color: #7c3aed;
                    font-size: 12px;
                    font-weight: 600;
                    white-space: nowrap;
                }
                /* Mobile: compact bar */
                @media (max-width: 480px) {
                    .viewer-topbar {
                        gap: 6px;
                        padding: 6px 10px;
                        min-height: 32px;
                    }
                    .viewer-badge {
                        font-size: 11px;
                    }
                    .viewer-sep {
                        display: none;
                    }
                    .viewer-status {
                        font-size: 11px;
                    }
                    .viewer-timer {
                        font-size: 11px;
                    }
                    .viewer-readonly-text {
                        display: none;
                    }
                }
            `}</style>
            {children}
        </>
    );
}
