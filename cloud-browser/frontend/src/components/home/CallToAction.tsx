"use client";

import { Button, TextField } from "@mui/material";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Toast from "@/components/shared/Toast";

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
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "error">("error");
  const [toastAutoHide, setToastAutoHide] = useState<number | null>(6000);
  const [toastActionLabel, setToastActionLabel] = useState<string | undefined>();
  const [toastOnAction, setToastOnAction] = useState<(() => void) | undefined>();

  const showToast = (
    message: string,
    opts?: {
      type?: "success" | "error";
      autoHide?: number | null;
      actionLabel?: string;
      onAction?: () => void;
    },
  ) => {
    setToastMessage(message);
    setToastType(opts?.type ?? "error");
    setToastAutoHide(opts?.autoHide ?? 6000);
    setToastActionLabel(opts?.actionLabel);
    setToastOnAction(() => opts?.onAction);
    setToastOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      showToast("URL is required");
      return;
    }

    setLoading(true);
    setToastOpen(false);

    try {
      let finalUrl = url.trim();
      if (!finalUrl.match(/^https?:\/\//)) {
        finalUrl = `https://${finalUrl}`;
      }

      const apiUrl = typeof window !== "undefined" ? window.location.origin : "";
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

        // Concurrent session — persistent toast with "Rejoin" action
        if (data.concurrent && data.activeSessionId) {
          showToast("You already have an active session.", {
            type: "error",
            autoHide: null,
            actionLabel: "Rejoin",
            onAction: () => router.push(`/session/${data.activeSessionId}`),
          });
          setLoading(false);
          return;
        }

        // Concurrent without activeSessionId (pending queue)
        if (data.concurrent) {
          showToast(data.message || "You already have a pending request.", {
            type: "error",
            autoHide: null,
          });
          setLoading(false);
          return;
        }

        // All other errors — auto-hide toast
        showToast(data.message || "Failed to start session");
        setLoading(false);
        return;
      }

      if (data.sessionId) {
        router.push(`/session/${data.sessionId}`);
        return;
      }

      router.push(`/queue/${data.queueId}`);
    } catch (err) {
      showToast("Failed to connect to server");
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
          disabled={loading}
        >
          {loading ? "Starting..." : t("expand-url")}
        </Button>
      </form>

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

      <Toast
        open={toastOpen}
        message={toastMessage}
        type={toastType}
        vertical="top"
        autoHideDuration={toastAutoHide}
        onClose={() => setToastOpen(false)}
        showCloseAction
        actionLabel={toastActionLabel}
        onAction={toastOnAction}
      />
    </div>
  );
};

export default CallToAction;
