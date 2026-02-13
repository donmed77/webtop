"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError("");

    try {
      const finalUrl = url.trim();

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'}/api/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: finalUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.rateLimited) {
          router.push("/rate-limited");
          return;
        }
        setError(data.message || "Failed to start session");
        setLoading(false);
        return;
      }

      // Always navigate to queue page - unified flow
      // Don't reset loading — keep button disabled until page transitions
      router.push(`/queue/${data.queueId}`);
    } catch (err) {
      setError("Failed to connect to server");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold mb-2">Unshort Link</h1>
            <p className="text-muted-foreground text-sm">
              Browse any website securely
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="text"
              placeholder="Enter URL..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              className="w-full"
            />

            <Button
              type="submit"
              className="w-full cursor-pointer"
              disabled={loading || !url.trim()}
            >
              {loading ? "Starting..." : "Browse"}
            </Button>

            {error && (
              <p className="text-destructive text-sm text-center">{error}</p>
            )}
          </form>
        </CardContent>
      </Card>

      <footer className="fixed bottom-4 left-0 right-0 text-center text-muted-foreground text-xs">
        <a href="/terms" className="hover:underline">Terms of Service</a>
        {" · "}
        <a href="/privacy" className="hover:underline">Privacy Policy</a>
      </footer>
    </main>
  );
}
