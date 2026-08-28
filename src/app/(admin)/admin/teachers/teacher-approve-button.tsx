"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2 } from "lucide-react";
import { apiPut, ApiError } from "@/lib/api-client";

/**
 * One-click approval for a pending (self-registered, `is_active === false`)
 * teacher. PUTs `{ is_active: true }` to the existing teachers route and
 * refreshes the list. Kept as a small client island so the list page stays a
 * server component.
 */
export function TeacherApproveButton({ teacherId }: { teacherId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const approve = () => {
    setError(null);
    startTransition(async () => {
      try {
        await apiPut(`/api/teachers/${teacherId}`, { is_active: true });
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "حدث خطأ");
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={approve}
        disabled={isPending}
        className="btn-primary gap-1.5 text-xs px-3 py-1.5 shrink-0"
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <CheckCircle2 className="size-4" />
        )}
        تفعيل الحساب
      </button>
      {error && <span className="field-error text-xs">{error}</span>}
    </div>
  );
}
