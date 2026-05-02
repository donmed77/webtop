"use client";

import { Button, TextField } from "@mui/material";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

const CallToAction = ({
  link,
}: {
  link?: string;
  scrapeId?: number;
  dataIsShare?: any;
}) => {
  const t = useTranslations("home.hero");
  const router = useRouter();

  const [url, setUrl] = useState(link ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError("");
    setActiveSessionId(null);

    try {
      let finalUrl = url.trim();
      if (!finalUrl.match(/^https?:\/\//)) {
        finalUrl = `https://${finalUrl}`;
      }

      const apiUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const response = await fetch(`${apiUrl}/api/session`, {
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
        if (data.concurrent && data.activeSessionId) {
          setActiveSessionId(data.activeSessionId);
        }
        setError(data.message || "Failed to start session");
        setLoading(false);
        return;
      }

      if (data.sessionId) {
        router.push(`/session/${data.sessionId}`);
        return;
      }

      router.push(`/queue/${data.queueId}`);
    } catch (err) {
      setError("Failed to connect to server");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-3 md:mt-4">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row w-full pt-2 lg:w-[90%]"
      >
        <div className="relative w-full flex items-center justify-center">
          <TextField
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            fullWidth
            id="outlined-basic"
            label={t("enter-a-short-link")}
            variant="outlined"
            autoComplete="off"
            disabled={loading}
            slotProps={{ input: { style: { paddingRight: "40px" } } }}
          />
        </div>
        <Button
          type="submit"
          className="sm:!min-w-fit !duration-0 bg-primary-purple dark:!bg-primary-purple-light sm:!w-fit !text-white  h-[56px] sm:!px-6 !text-[16px]"
          style={{ borderRadius: 0, boxShadow: "unset" }}
          variant="contained"
          color="primary"
          disabled={loading || !url.trim()}
        >
          {loading ? "Starting..." : t("expand-url")}
        </Button>
      </form>

      {error && (
        <div className="flex flex-col gap-2 mt-1">
          <p className="text-red-500 text-sm">{error}</p>
          {activeSessionId && (
            <Button
              className="!text-primary-purple dark:!text-primary-purple-light !text-sm !p-0 !min-w-fit"
              style={{ borderRadius: 0, boxShadow: "unset" }}
              variant="text"
              onClick={() => router.push(`/session/${activeSessionId}`)}
            >
              Go to Active Session →
            </Button>
          )}
        </div>
      )}

      <div className="lg:w-[91%] flex flex-col gap-[22px] mt-2">
        <div className="flex flex-wrap gap-1 text-[14px]">
          <p>{t("try-these")}:</p>
          <p
            className="cursor-pointer underline min-w-fit text-primary-purple dark:text-primary-purple-light"
            onClick={() => setUrl("cutt.ly/UraWGrsu")}
          >
            cutt.ly/UraWGrsu
          </p>
        </div>
      </div>
    </div>
  );
};

export default CallToAction;
