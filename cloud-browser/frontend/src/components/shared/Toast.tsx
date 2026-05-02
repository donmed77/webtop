"use client";

import { Slide, Snackbar, SnackbarContent, ToggleButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import useThemeStore from "@/stores/theme-store";

type ToastType = "success" | "error";
type Vertical = "top" | "bottom";

interface ToastProps {
  open: boolean;
  message: string;
  type?: ToastType;
  vertical?: Vertical;
  autoHideDuration?: number | null;
  onClose: () => void;
  showCloseAction?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

const Toast = ({
  open,
  message,
  type = "success",
  vertical = "top",
  autoHideDuration = 5000,
  onClose,
  showCloseAction = false,
  actionLabel,
  onAction,
}: ToastProps) => {
  const { theme } = useThemeStore();

  const bg =
    type === "error"
      ? "#ef5350"
      : theme === "light"
      ? "#8437fe"
      : "#a97dff";

  const handleClose = (
    _event: React.SyntheticEvent | Event,
    reason?: string,
  ) => {
    if (reason === "clickaway") return;
    onClose();
  };

  const closeAction = showCloseAction ? (
    <ToggleButton
      className="!rounded-none !text-white !border-none"
      aria-label="close"
      value="close"
      onClick={() => onClose()}
    >
      <CloseIcon />
    </ToggleButton>
  ) : undefined;

  const messageContent = (
    <span>
      {message}
      {actionLabel && onAction && (
        <>
          {" "}
          <span
            onClick={() => onAction()}
            className="underline font-bold cursor-pointer"
          >
            {actionLabel}
          </span>
        </>
      )}
    </span>
  );

  return (
    <Snackbar
      className={
        vertical === "top"
          ? "sm:mt-[43px] mt-[59px]"
          : "sm:mt-[43px] mt-[9px] !z-[9999]"
      }
      open={open}
      autoHideDuration={autoHideDuration}
      onClose={handleClose}
      anchorOrigin={{ horizontal: "center", vertical }}
      slots={{ transition: Slide }}
    >
      <SnackbarContent
        style={{
          backgroundColor: bg,
          color: "white",
          boxShadow: "none",
          borderRadius: 0,
          zIndex: 999,
        }}
        action={closeAction}
        message={messageContent}
      />
    </Snackbar>
  );
};

export default Toast;
