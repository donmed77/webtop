import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Terms of Service - Cloud Browser",
    description: "Terms of Service for the Cloud Browser service",
};

export default function TermsPage() {
    return (
        <main className="min-h-screen bg-background py-12 px-4">
            <div className="max-w-3xl mx-auto prose prose-invert">
                <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>

                <p className="text-muted-foreground mb-6">
                    Last updated: February 7, 2026
                </p>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">1. Acceptance of Terms</h2>
                    <p className="text-muted-foreground">
                        By accessing and using the Cloud Browser service ("Service"), you accept and agree
                        to be bound by these Terms of Service. If you do not agree to these terms,
                        please do not use the Service.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">2. Description of Service</h2>
                    <p className="text-muted-foreground">
                        Cloud Browser provides temporary, isolated browser sessions for secure web browsing.
                        Each session is limited to 5 minutes and runs in a sandboxed environment.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">3. Acceptable Use</h2>
                    <p className="text-muted-foreground mb-4">You agree NOT to use the Service to:</p>
                    <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                        <li>Engage in any illegal activity</li>
                        <li>Access, download, or distribute illegal content</li>
                        <li>Attempt to bypass security measures or attack other systems</li>
                        <li>Harass, abuse, or harm others</li>
                        <li>Violate the intellectual property rights of others</li>
                        <li>Send spam or conduct phishing activities</li>
                        <li>Mine cryptocurrency or perform resource-intensive operations</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">4. Service Limitations</h2>
                    <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                        <li>Sessions are limited to 5 minutes each</li>
                        <li>Maximum 10 sessions per IP address per day</li>
                        <li>Maximum 3 concurrent users at any time</li>
                        <li>No data persistence between sessions</li>
                        <li>Service availability is not guaranteed</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">5. Privacy and Data</h2>
                    <p className="text-muted-foreground">
                        We log initial URLs visited and anonymized IP addresses for abuse prevention.
                        All browsing data within sessions is deleted when the session ends.
                        See our <a href="/privacy" className="text-primary underline">Privacy Policy</a> for details.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">6. Disclaimer of Warranties</h2>
                    <p className="text-muted-foreground">
                        THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND.
                        We do not guarantee uninterrupted or error-free service.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">7. Limitation of Liability</h2>
                    <p className="text-muted-foreground">
                        We shall not be liable for any indirect, incidental, special, or consequential damages
                        arising from your use of the Service.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">8. Termination</h2>
                    <p className="text-muted-foreground">
                        We reserve the right to terminate or suspend access to the Service at any time,
                        without notice, for violations of these terms or any other reason.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">9. Contact</h2>
                    <p className="text-muted-foreground">
                        For abuse reports: <a href="mailto:abuse@unshortlink.com" className="text-primary underline">abuse@unshortlink.com</a>
                    </p>
                </section>

                <div className="mt-12 pt-8 border-t border-border">
                    <a href="/" className="text-primary underline">← Back to Home</a>
                </div>
            </div>
        </main>
    );
}
