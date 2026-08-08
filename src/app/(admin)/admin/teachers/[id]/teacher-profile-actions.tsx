"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Lock } from "lucide-react";
import { apiPut, apiDelete, ApiError } from "@/lib/api-client";
import { GenderBadge } from "@/components/badges";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatWesternDate } from "@/lib/arabic";

function SettingRow({
  label,
  description,
  variant = "neutral",
  children,
}: {
  label: string;
  description: string;
  variant?: "neutral" | "danger";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg border p-3 ${
        variant === "danger"
          ? "border-destructive/20 bg-red-50"
          : "border-border bg-secondary"
      }`}
    >
      <div>
        <p className={`text-sm font-medium ${variant === "danger" ? "text-destructive" : ""}`}>
          {label}
        </p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

interface TeacherProfileActionsProps {
  teacherId: string;
  teacherName: string;
  teacherUsername: string;
  teacherPhone: string | null;
  teacherGender: string | null;
  teacherCreatedAt: string | null;
  isActive: boolean;
  canViewAllGenders: boolean;
}

export function TeacherProfileActions({
  teacherId,
  teacherName,
  teacherUsername,
  teacherPhone,
  teacherGender,
  teacherCreatedAt,
  isActive,
  canViewAllGenders,
}: TeacherProfileActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(teacherName);
  const [phone, setPhone] = useState(teacherPhone ?? "");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const update = (updates: Record<string, unknown>) => {
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

  const handleSaveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    update({ name, phone: phone || null });
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    if (password.length < 6) {
      setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (password !== passwordConfirm) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await apiPut(`/api/teachers/${teacherId}`, { password });
        setPassword("");
        setPasswordConfirm("");
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "حدث خطأ");
      }
    });
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    setShowDeleteConfirm(false);
    setDeleting(true);
    startTransition(async () => {
      try {
        await apiDelete(`/api/teachers/${teacherId}`);
        router.push("/admin/teachers");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "حدث خطأ");
        setDeleting(false);
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Row 1: Info card + Edit form + Password reset — same height */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
        {/* Read-only info card */}
        <div className="card space-y-3 h-full flex flex-col">
          <h4 className="text-sm font-semibold">بيانات المحفظ</h4>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground shrink-0">الاسم</dt>
              <dd className="font-medium text-end">{teacherName}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground shrink-0">اسم المستخدم</dt>
              <dd dir="ltr" className="flex items-center gap-1.5">
                <Lock className="size-3 text-muted-foreground" />
                {teacherUsername}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground shrink-0">الجنس</dt>
              <dd>
                {teacherGender ? (
                  <GenderBadge value={teacherGender as "male" | "female"} />
                ) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground shrink-0">الهاتف</dt>
              <dd dir="ltr">{teacherPhone ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground shrink-0">تاريخ الإنشاء</dt>
              <dd>{teacherCreatedAt ? formatWesternDate(teacherCreatedAt) : "—"}</dd>
            </div>
          </dl>
        </div>

        {/* Edit name + phone */}
        <form onSubmit={handleSaveDetails} className="card space-y-3 h-full flex flex-col">
          <h4 className="text-sm font-semibold">تعديل البيانات</h4>
          <div>
            <label className="form-label">الاسم</label>
            <input
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="الاسم الكامل"
            />
          </div>
          <div>
            <label className="form-label">الهاتف</label>
            <input
              className="input-field"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01xxxxxxxxx"
              dir="ltr"
            />
          </div>
          <button type="submit" disabled={isPending} className="btn-secondary text-sm mt-auto">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : "حفظ البيانات"}
          </button>
        </form>

        {/* Reset password */}
        <form onSubmit={handleResetPassword} className="card space-y-3 h-full flex flex-col">
          <h4 className="text-sm font-semibold">إعادة تعيين كلمة المرور</h4>
          <div>
            <label className="form-label">كلمة المرور الجديدة</label>
            <input
              type="password"
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              dir="ltr"
            />
          </div>
          <div>
            <label className="form-label">تأكيد كلمة المرور</label>
            <input
              type="password"
              className="input-field"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="••••••••"
              dir="ltr"
            />
          </div>
          <button type="submit" disabled={isPending || !password || !passwordConfirm} className="btn-secondary text-sm mt-auto">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : "تعيين كلمة المرور"}
          </button>
        </form>
      </div>

      {/* Row 2: Settings + Delete — side by side */}
      <div className="grid gap-4 sm:grid-cols-2 items-stretch">
        {/* Settings toggles */}
        <div className="card space-y-3 h-full flex flex-col">
          <h4 className="text-sm font-semibold">الإعدادات</h4>

          <SettingRow
            label="حالة الحساب"
            description={isActive ? "الحساب نشط — يمكن تسجيل الدخول" : "الحساب معطّل"}
          >
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
          </SettingRow>

          <SettingRow
            label="رؤية الجنسين"
            description={
              canViewAllGenders
                ? "يمكنه رؤية طلاب كلا الجنسين"
                : "يرى طلاب جنسه فقط (الافتراضي)"
            }
          >
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
          </SettingRow>
        </div>

        {/* Delete teacher */}
        <div className="card space-y-3 h-full flex flex-col">
          <h4 className="text-sm font-semibold">منطقة الخطر</h4>
          <SettingRow
            label="حذف المحفظ"
            description="حذف نهائي لا يمكن التراجع عنه"
            variant="danger"
          >
            <button
              type="button"
              disabled={isPending}
              onClick={handleDelete}
              className="btn-destructive gap-1.5 text-sm shrink-0"
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              حذف
            </button>
          </SettingRow>
        </div>
      </div>

      {isPending && !deleting && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> جاري الحفظ…
        </p>
      )}
      {error && <p className="field-error">{error}</p>}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="تأكيد حذف المحفظ"
        message={`هل أنت متأكد من حذف المحفظ "${teacherName}"؟ سيتم حذف جميع بياناته نهائياً.`}
        confirmLabel="حذف"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
