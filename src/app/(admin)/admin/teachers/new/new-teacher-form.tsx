"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { apiPost, ApiError } from "@/lib/api-client";

interface FormState {
  name: string;
  username: string;
  password: string;
  phone: string;
  gender: "male" | "female" | "";
  can_view_all_genders: boolean;
}

export default function NewTeacherForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    name: "",
    username: "",
    password: "",
    phone: "",
    gender: "",
    can_view_all_genders: false,
  });

  const set = (key: keyof FormState, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name || !form.username || !form.password || !form.gender) {
      setError("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    startTransition(async () => {
      try {
        const data = await apiPost<{ id: string }>("/api/teachers", {
          name: form.name,
          username: form.username,
          password: form.password,
          phone: form.phone || null,
          gender: form.gender,
          can_view_all_genders: form.can_view_all_genders,
        });
        router.push(`/admin/teachers/${data.id}`);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "حدث خطأ");
      }
    });
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/teachers" className="btn-secondary px-2 py-1.5 text-xs">
          <ArrowRight className="size-4" />
        </Link>
        <div>
          <h2 className="text-xl font-bold">إضافة محفظ جديد</h2>
          <p className="text-sm text-muted-foreground">سيتم إنشاء حساب تسجيل الدخول تلقائياً</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5">
        {/* Name */}
        <div>
          <label className="form-label">
            الاسم الكامل <span className="required-star">*</span>
          </label>
          <input
            className="input-field"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="محمد أحمد"
          />
        </div>

        {/* Username */}
        <div>
          <label className="form-label">
            اسم المستخدم <span className="required-star">*</span>
          </label>
          <input
            className="input-field"
            dir="ltr"
            value={form.username}
            onChange={(e) => set("username", e.target.value.toLowerCase())}
            placeholder="teacher1"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            سيُستخدم لتسجيل الدخول — لا مسافات، حروف لاتينية فقط
          </p>
        </div>

        {/* Password */}
        <div>
          <label className="form-label">
            كلمة المرور <span className="required-star">*</span>
          </label>
          <input
            type="password"
            className="input-field"
            dir="ltr"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </div>

        {/* Gender */}
        <div>
          <label className="form-label">
            الجنس <span className="required-star">*</span>
          </label>
          <div className="flex gap-3">
            {(["male", "female"] as const).map((g) => (
              <label
                key={g}
                className={`flex flex-1 cursor-pointer items-center justify-center rounded-lg border-2 py-2.5 text-sm font-medium transition-colors ${
                  form.gender === g
                    ? g === "male"
                      ? "border-[#2563eb] bg-[#dbeafe] text-[#1e40af]"
                      : "border-[#9d174d] bg-[#fdf2f8] text-[#9d174d]"
                    : "border-border bg-card text-muted-foreground hover:bg-secondary"
                }`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name="gender"
                  value={g}
                  checked={form.gender === g}
                  onChange={() => set("gender", g)}
                />
                {g === "male" ? "ذكر" : "أنثى"}
              </label>
            ))}
          </div>
        </div>

        {/* Phone */}
        <div>
          <label className="form-label">رقم الهاتف</label>
          <input
            className="input-field"
            dir="ltr"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="05xxxxxxxx"
          />
        </div>

        {/* can_view_all_genders */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            checked={form.can_view_all_genders}
            onChange={(e) => set("can_view_all_genders", e.target.checked)}
          />
          <div>
            <p className="text-sm font-medium">رؤية الجنسين</p>
            <p className="text-xs text-muted-foreground">
              يسمح لهذا المحفظ برؤية وإضافة طلاب من كلا الجنسين (الحالة الاستثنائية فقط)
            </p>
          </div>
        </label>

        {error && <p className="field-error">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Link href="/admin/teachers" className="btn-secondary">
            إلغاء
          </Link>
          <button type="submit" className="btn-primary" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            حفظ
          </button>
        </div>
      </form>
    </div>
  );
}
