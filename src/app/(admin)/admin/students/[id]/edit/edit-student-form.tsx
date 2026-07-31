"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import {
  InitialMemorizationGrid,
  type JuzEntry,
} from "@/features/students/components/initial-memorization-grid";
import { apiPut, ApiError } from "@/lib/api-client";

interface StudentData {
  id: string;
  name: string;
  gender: string;
  birth_date?: string | null;
  guardian_name: string;
  guardian_phone: string;
  enrollment_date: string;
  notes?: string | null;
  status: string;
}

interface EditStudentFormProps {
  student: StudentData;
  initialMem: JuzEntry[];
  redirectBase: string;
  mode: "admin" | "teacher";
}

export function EditStudentForm({ student, initialMem, redirectBase, mode }: EditStudentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showInitMem, setShowInitMem] = useState(initialMem.length > 0);
  const [initMem, setInitMem] = useState<JuzEntry[]>(initialMem);

  const [form, setForm] = useState({
    name: student.name,
    gender: student.gender,
    birth_date: student.birth_date ? student.birth_date.split("T")[0] : "",
    guardian_name: student.guardian_name,
    guardian_phone: student.guardian_phone,
    enrollment_date: student.enrollment_date ? student.enrollment_date.split("T")[0] : "",
    notes: student.notes ?? "",
    status: student.status,
  });

  const set = (key: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "teacher") {
      startTransition(async () => {
        try {
          await apiPut(`/api/students/${student.id}`, { notes: form.notes || null });
          router.push(redirectBase);
          router.refresh();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "حدث خطأ");
        }
      });
      return;
    }

    if (!form.name || !form.gender || !form.guardian_name || !form.guardian_phone) {
      setError("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    const missingSheikhName = initMem.find(
      (r) => r.status === "with_ijaza" && !r.sheikh_name?.trim()
    );
    if (missingSheikhName) {
      setError(`يرجى إدخال اسم الشيخ للجزء ${missingSheikhName.juz_number}`);
      return;
    }

    startTransition(async () => {
      try {
        await apiPut(`/api/students/${student.id}`, {
          name: form.name,
          gender: form.gender,
          birth_date: form.birth_date || null,
          guardian_name: form.guardian_name,
          guardian_phone: form.guardian_phone,
          enrollment_date: form.enrollment_date,
          notes: form.notes || null,
          status: form.status,
          initial_memorization: initMem,
        });
        router.push(redirectBase);
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "حدث خطأ");
      }
    });
  };

  if (mode === "teacher") {
    return (
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="card space-y-3">
          <h3 className="font-semibold text-base border-b border-border pb-2">ملاحظات الطالب</h3>
          <p className="text-sm text-muted-foreground">
            يمكنك تعديل الملاحظات فقط. لبقية البيانات تواصل مع المشرف.
          </p>
          <div>
            <label className="form-label">الطالب</label>
            <p className="text-sm font-medium">{student.name}</p>
          </div>
          <div>
            <label className="form-label">ملاحظات</label>
            <textarea
              className="input-field min-h-[120px] resize-none"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="أي ملاحظات عن الطالب…"
            />
          </div>
        </div>

        {error && <p className="field-error text-base">{error}</p>}

        <div className="flex justify-end gap-3">
          <Link href={redirectBase} className="btn-secondary">
            إلغاء
          </Link>
          <button type="submit" className="btn-primary" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            حفظ الملاحظات
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="card space-y-5">
        <h3 className="font-semibold text-base border-b border-border pb-2">بيانات الطالب</h3>

        <div>
          <label className="form-label">
            الاسم الكامل <span className="required-star">*</span>
          </label>
          <input
            className="input-field"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="عبد الله محمد"
          />
        </div>

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

        <div>
          <label className="form-label">تاريخ الميلاد</label>
          <input
            type="date"
            className="input-field"
            dir="ltr"
            value={form.birth_date}
            onChange={(e) => set("birth_date", e.target.value)}
          />
        </div>

        <div>
          <label className="form-label">
            اسم ولي الأمر <span className="required-star">*</span>
          </label>
          <input
            className="input-field"
            value={form.guardian_name}
            onChange={(e) => set("guardian_name", e.target.value)}
            placeholder="محمد عبد الله"
          />
        </div>

        <div>
          <label className="form-label">
            هاتف ولي الأمر <span className="required-star">*</span>
          </label>
          <input
            className="input-field"
            dir="ltr"
            value={form.guardian_phone}
            onChange={(e) => set("guardian_phone", e.target.value)}
            placeholder="05xxxxxxxx"
          />
        </div>

        <div>
          <label className="form-label">تاريخ الانضمام</label>
          <input
            type="date"
            className="input-field"
            dir="ltr"
            value={form.enrollment_date}
            onChange={(e) => set("enrollment_date", e.target.value)}
          />
        </div>

        <div>
          <label className="form-label">ملاحظات</label>
          <textarea
            className="input-field min-h-[80px] resize-none"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="أي ملاحظات عن الطالب…"
          />
        </div>

        <div>
          <label className="form-label">الحالة</label>
          <select
            className="input-field"
            value={form.status}
            onChange={(e) => set("status", e.target.value)}
          >
            <option value="active">نشط</option>
            <option value="paused">موقوف مؤقتاً</option>
            <option value="graduated">خريج</option>
            <option value="withdrawn">منسحب</option>
          </select>
        </div>
      </div>

      <div className="card space-y-4">
        <button
          type="button"
          className="flex w-full items-center justify-between font-semibold text-base"
          onClick={() => setShowInitMem((v) => !v)}
        >
          <span>الحفظ السابق قبل الانضمام ({initMem.length} جزء)</span>
          {showInitMem ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>

        {showInitMem && (
          <InitialMemorizationGrid value={initMem} onChange={setInitMem} />
        )}
      </div>

      {error && <p className="field-error text-base">{error}</p>}

      <div className="flex justify-end gap-3">
        <Link href={redirectBase} className="btn-secondary">
          إلغاء
        </Link>
        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          حفظ التعديلات
        </button>
      </div>
    </form>
  );
}
