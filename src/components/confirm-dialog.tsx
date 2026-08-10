"use client";

import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "تأكيد",
  cancelLabel = "إلغاء",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        className="card w-full max-w-sm space-y-5 shadow-xl border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center gap-3">
          {variant === "danger" && (
            <div className="rounded-full bg-destructive/10 p-3.5">
              <AlertTriangle className="size-7 text-destructive" />
            </div>
          )}
          <div>
            <h3 className="font-bold text-lg text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground mt-1.5">{message}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary py-2.5 text-sm font-semibold cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={variant === "danger" ? "btn-destructive py-2.5 text-sm font-bold cursor-pointer" : "btn-primary py-2.5 text-sm font-bold cursor-pointer"}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
