"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, XOctagon, Loader2 } from "lucide-react";

interface StudentDeleteButtonProps {
  studentId: string;
  studentName: string;
  isActive: boolean;
  redirectHref: string; // where to go after permanent delete (e.g. /admin/students)
}

/**
 * Admin-only student management actions:
 *  - Soft delete / re-activate (toggle is_active). Reversible.
 *  - Permanent delete (cascade). Irreversible, double-confirm.
 */
export function StudentDeleteButton({
  studentId,
  studentName,
  isActive,
  redirectHref,
}: StudentDeleteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmPermanent, setConfirmPermanent] = useState(false);

  const toggleActive = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/students/${studentId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: !isActive }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "حدث خطأ");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "حدث خطأ");
      }
    });
  };

  const permanentDelete = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/students/${studentId}?permanent=true`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "حدث خطأ");
        router.push(redirectHref);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "حدث خطأ");
        setConfirmPermanent(false);
      }
    });
  };

  return (
    <div className="space-y-3">
      {error && <p className="field-error text-sm">{error}</p>}

      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary p-3">
        <div>
          <p className="text-sm font-medium">حالة الطالب</p>
          <p className="text-xs text-muted-foreground">
            {isActive ? "نشط حالياً" : "غير نشط (محذوف مؤقتاً)"}
          </p>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={toggleActive}
          className="btn-secondary text-sm"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {isActive ? "إلغاء التفعيل (حذف مؤقت)" : "إعادة التفعيل"}
        </button>
      </div>

      <div className="rounded-lg border border-[#fee2e2] bg-[#fef2f2] p-3 space-y-2">
        <p className="text-sm font-medium text-[#991b1b]">منطقة الخطر</p>
        <p className="text-xs text-muted-foreground">
          الحذف النهائي يحذف الطالب وكل سجلاته (جلسات، حضور، إجازات، إسنادات) نهائياً ولا يمكن التراجع عنه.
        </p>
        {!confirmPermanent ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => setConfirmPermanent(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#dc2626] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#b91c1c] transition-colors disabled:opacity-50"
          >
            <Trash2 className="size-4" />
            حذف نهائي
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[#991b1b]">تأكيد حذف {studentName}؟</span>
            <button
              type="button"
              disabled={isPending}
              onClick={permanentDelete}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#dc2626] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#b91c1c] transition-colors disabled:opacity-50"
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <XOctagon className="size-4" />}
              نعم، احذف نهائياً
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirmPermanent(false)}
              className="btn-secondary text-sm"
            >
              إلغاء
            </button>
          </div>
        )}
      </div>
    </div>
  );
}