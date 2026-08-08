"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { apiGet, apiPut, ApiError } from "@/lib/api-client";

interface AdminData {
  id: string;
  name: string;
  username: string;
  phone: string | null;
  is_active: boolean | null;
}

interface FormState {
  name: string;
  phone: string;
  is_active: boolean;
  password: string;
}

export default function EditAdminForm({ adminId }: { adminId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    name: "",
    phone: "",
    is_active: true,
    password: "",
  });

  useEffect(() => {
    async function load() {
      try {
        const admin = await apiGet<AdminData>(`/api/admins/${adminId}`);
        setForm({
          name: admin.name,
          phone: admin.phone ?? "",
          is_active: admin.is_active ?? true,
          password: "",
        });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "حدث خطأ");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [adminId]);

  const set = (key: keyof FormState, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name) {
      setError("الاسم مطلوب");
      return;
    }

    if (form.password && form.password.length < 6) {
      setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }

    startTransition(async () => {
      try {
        const updates: Record<string, unknown> = {
          name: form.name,
          phone: form.phone || null,
          is_active: form.is_active,
        };
        if (form.password) {
          updates.password = form.password;
        }
        await apiPut(`/api/admins/${adminId}`, updates);
        router.push("/admin/admins");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "حدث خطأ");
      }
    });
  };

  if (loading) return <p className="text-muted-foreground">جاري التحميل...</p>;
  if (error && !form.name) return <p className="text-destructive">{error}</p>;

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-4 flex items-center gap-2">
        <Link href="/admin/admins" className="text-sm text-muted-foreground hover:text-foreground">
          <ArrowRight className="size-4 inline" /> رجوع
        </Link>
      </div>
      <h1 className="mb-6 text-xl font-bold">تعديل المشرف</h1>
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
          <label className="form-label">كلمة المرور (اتركها فارغة لعدم التغيير)</label>
          <input
            type="password"
            className="input-field"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            placeholder="••••••••"
            dir="ltr"
          />
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => set("is_active", e.target.checked)}
            className="size-4"
          />
          <div>
            <p className="text-sm font-medium">الحساب نشط</p>
            <p className="text-xs text-muted-foreground">تعطيل الحساب يمنع تسجيل الدخول</p>
          </div>
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={isPending} className="btn-primary w-full">
          {isPending ? <Loader2 className="size-4 animate-spin" /> : "حفظ التغييرات"}
        </button>
      </form>
    </div>
  );
}
