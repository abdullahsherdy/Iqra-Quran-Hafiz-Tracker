"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { apiPut, ApiError } from "@/lib/api-client";

interface TeacherProfileActionsProps {
  teacherId: string;
  isActive: boolean;
  canViewAllGenders: boolean;
}

export function TeacherProfileActions({
  teacherId,
  isActive,
  canViewAllGenders,
}: TeacherProfileActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const update = (updates: Record<string, boolean>) => {
    setError(null);
    startTransition(async () => {
      try {
        await apiPut(`/api/teachers/${teacherId}`, updates);
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "حدث خطأ");
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* is_active toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary p-3">
        <div>
          <p className="text-sm font-medium">حالة الحساب</p>
          <p className="text-xs text-muted-foreground">
            {isActive ? "الحساب نشط — يمكن تسجيل الدخول" : "الحساب معطّل"}
          </p>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={() => update({ is_active: !isActive })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            isActive ? "bg-primary" : "bg-[#e5e7eb]"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              isActive ? "translate-x-[-24px]" : "translate-x-[-4px]"
            }`}
          />
        </button>
      </div>

      {/* can_view_all_genders toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary p-3">
        <div>
          <p className="text-sm font-medium">رؤية الجنسين</p>
          <p className="text-xs text-muted-foreground">
            {canViewAllGenders
              ? "يمكنه رؤية طلاب كلا الجنسين"
              : "يرى طلاب جنسه فقط (الافتراضي)"}
          </p>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={() => update({ can_view_all_genders: !canViewAllGenders })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            canViewAllGenders ? "bg-primary" : "bg-[#e5e7eb]"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              canViewAllGenders ? "translate-x-[-24px]" : "translate-x-[-4px]"
            }`}
          />
        </button>
      </div>

      {isPending && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> جاري الحفظ…
        </p>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
