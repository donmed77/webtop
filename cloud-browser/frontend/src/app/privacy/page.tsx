import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Privacy Policy - Cloud Browser",
    description: "Privacy Policy for the Cloud Browser service",
};

export default function PrivacyPage() {
    return (
        <main className="min-h-screen bg-background py-12 px-4">
            <div className="max-w-3xl mx-auto prose prose-invert">
                <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>

                <p className="text-muted-foreground mb-6">
                    Last updated: February 7, 2026
                </p>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">1. Overview</h2>
                    <p className="text-muted-foreground">
                        Cloud Browser ("we", "our", "us") is committed to protecting your privacy.
                        This policy explains what data we collect and how we use it.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">2. Data We Collect</h2>
                    <p className="text-muted-foreground mb-4">We collect minimal data necessary for service operation:</p>
                    <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                        <li><strong>Initial URL:</strong> The URL you enter when starting a session</li>
                        <li><strong>Anonymized IP:</strong> Your IP address with the last octet masked (e.g., 192.168.1.x)</li>
                        <li><strong>Session metadata:</strong> Start time, duration, and session ID</li>
                        <li><strong>Rate limit data:</strong> Session count per IP for enforcing daily limits</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">3. Data We Do NOT Collect</h2>
                    <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                        <li>URLs visited during your session (only the initial URL)</li>
                        <li>Form data, passwords, or personal information entered in the browser</li>
                        <li>Cookies or browsing history from your session</li>
                        <li>Screen recordings or session content</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">4. How We Use Your Data</h2>
                    <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                        <li><strong>Abuse prevention:</strong> Rate limiting and blocking malicious usage</li>
                        <li><strong>Service improvement:</strong> Anonymous usage statistics</li>
                        <li><strong>Legal compliance:</strong> Response to valid legal requests</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">5. Data Retention</h2>
                    <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                        <li><strong>Session data:</strong> Deleted immediately when session ends</li>
                        <li><strong>Log data:</strong> Retained for 30 days, then automatically deleted</li>
                        <li><strong>Rate limit counters:</strong> Reset daily at midnight UTC</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">6. Session Isolation</h2>
                    <p className="text-muted-foreground">
                        Each browser session runs in an isolated container. When your session ends:
                    </p>
                    <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-4">
                        <li>The container is completely destroyed</li>
                        <li>All browsing data, cookies, and cache are deleted</li>
                        <li>A fresh container is created for the next user</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">7. Cookies</h2>
                    <p className="text-muted-foreground">
                        We use only essential cookies for session management.
                        No tracking cookies or third-party analytics are used.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">8. Third Parties</h2>
                    <p className="text-muted-foreground">
                        We do not sell, share, or transfer your data to third parties,
                        except as required by law.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">9. Your Rights</h2>
                    <p className="text-muted-foreground">
                        Since we collect minimal anonymized data, there is limited personal data to access or delete.
                        Contact us if you have concerns about your data.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">10. Contact</h2>
                    <p className="text-muted-foreground">
                        For privacy concerns: <a href="mailto:abuse@unshortlink.com" className="text-primary underline">abuse@unshortlink.com</a>
                    </p>
                </section>

                <div className="mt-12 pt-8 border-t border-border">
                    <a href="/" className="text-primary underline">← Back to Home</a>
                </div>
            </div>
        </main>
    );
}
