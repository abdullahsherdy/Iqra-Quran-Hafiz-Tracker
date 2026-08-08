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
}

export default function NewAdminForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    name: "",
    username: "",
    password: "",
    phone: "",
    gender: "",
  });

  const set = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name || !form.username || !form.password) {
      setError("يرجى ملء الاسم واسم المستخدم وكلمة المرور");
      return;
    }

    startTransition(async () => {
      try {
        await apiPost<{ id: string }>("/api/admins", {
          name: form.name,
          username: form.username,
          password: form.password,
          phone: form.phone || null,
          gender: form.gender || null,
        });
        router.push("/admin/admins");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "حدث خطأ");
      }
    });
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-4 flex items-center gap-2">
        <Link href="/admin/admins" className="text-sm text-muted-foreground hover:text-foreground">
          <ArrowRight className="size-4 inline" /> رجوع
        </Link>
      </div>
      <h1 className="mb-6 text-xl font-bold">إضافة مشرف جديد</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="form-label">الاسم *</label>
          <input
            className="input-field"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="الاسم الكامل"
          />
        </div>
        <div>
          <label className="form-label">اسم المستخدم *</label>
          <input
            className="input-field"
            value={form.username}
            onChange={(e) => set("username", e.target.value)}
            placeholder="username"
            dir="ltr"
          />
        </div>
        <div>
          <label className="form-label">كلمة المرور *</label>
          <input
            type="password"
            className="input-field"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            placeholder="••••••••"
            dir="ltr"
          />
        </div>
        <div>
          <label className="form-label">الهاتف</label>
          <input
            className="input-field"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="01xxxxxxxxx"
            dir="ltr"
          />
        </div>
        <div>
          <label className="form-label">الجنس</label>
          <select
            className="input-field"
            value={form.gender}
            onChange={(e) => set("gender", e.target.value)}
          >
            <option value="">—</option>
            <option value="male">ذكر</option>
            <option value="female">أنثى</option>
          </select>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={isPending} className="btn-primary w-full">
          {isPending ? <Loader2 className="size-4 animate-spin" /> : "إنشاء المشرف"}
        </button>
      </form>
    </div>
  );
}
