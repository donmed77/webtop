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
            `}</style>
            {children}
        </>
    );
}
