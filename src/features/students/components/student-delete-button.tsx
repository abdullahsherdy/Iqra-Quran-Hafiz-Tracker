"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, XOctagon, Loader2 } from "lucide-react";
import { StudentStatusBadge, type StudentStatus } from "@/components/badges";
import { apiPut, apiDelete, ApiError } from "@/lib/api-client";

const STATUS_OPTIONS: { value: StudentStatus; label: string }[] = [
  { value: "active",    label: "نشط" },
  { value: "paused",    label: "موقوف مؤقتاً" },
  { value: "graduated", label: "خريج" },
  { value: "withdrawn", label: "منسحب" },
];

interface StudentDeleteButtonProps {
  studentId: string;
  studentName: string;
  status: StudentStatus;
  redirectHref: string;
}

export function StudentDeleteButton({
  studentId,
  studentName,
  status,
  redirectHref,
}: StudentDeleteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<StudentStatus>(status);
  const [confirmPermanent, setConfirmPermanent] = useState(false);

  const updateStatus = () => {
    if (selectedStatus === status) return;
    setError(null);
    startTransition(async () => {
      try {
        await apiPut(`/api/students/${studentId}`, { status: selectedStatus });
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "حدث خطأ");
      }
    });
  };

  const permanentDelete = () => {
    setError(null);
    startTransition(async () => {
      try {
        await apiDelete(`/api/students/${studentId}?permanent=true`);
        router.push(redirectHref);
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "حدث خطأ");
        setConfirmPermanent(false);
      }
    });
  };

  return (
    <div className="space-y-3">
      {error && <p className="field-error text-sm">{error}</p>}

      <div className="rounded-lg border border-border bg-secondary p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">حالة الطالب</p>
          <StudentStatusBadge value={status} />
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input-field flex-1"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as StudentStatus)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={isPending || selectedStatus === status}
            onClick={updateStatus}
            className="btn-secondary text-sm whitespace-nowrap"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : "حفظ"}
          </button>
        </div>
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
