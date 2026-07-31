"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import {
  InitialMemorizationGrid,
  type JuzEntry,
} from "@/features/students/components/initial-memorization-grid";
import { apiPost, ApiError } from "@/lib/api-client";
import { todayDateString } from "@/lib/utils";

interface NewStudentFormProps {
  role: "admin" | "teacher";
  /**
   * For teachers: force gender to the teacher's gender (unless can_view_all_genders).
   * For admin: undefined → let user pick.
   */
  forcedGender?: "male" | "female";
  redirectBase: string; // e.g. "/admin/students" or "/teacher/students"
}

interface FormState {
  name: string;
  gender: "male" | "female" | "";
  birth_date: string;
  guardian_name: string;
  guardian_phone: string;
  enrollment_date: string;
  notes: string;
}

export function NewStudentForm({ role: _role, forcedGender, redirectBase }: NewStudentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showInitMem, setShowInitMem] = useState(false);
  const [initMem, setInitMem] = useState<JuzEntry[]>([]);

  const today = todayDateString();
  const [form, setForm] = useState<FormState>({
    name: "",
    gender: forcedGender ?? "",
    birth_date: "",
    guardian_name: "",
    guardian_phone: "",
    enrollment_date: today,
    notes: "",
  });

  const set = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name || !form.gender || !form.guardian_name || !form.guardian_phone) {
      setError("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    // Validate sheikh_name required for with_ijaza
    const missingSheikhName = initMem.find(
      (r) => r.status === "with_ijaza" && !r.sheikh_name?.trim()
    );
    if (missingSheikhName) {
      setError(`يرجى إدخال اسم الشيخ للجزء ${missingSheikhName.juz_number}`);
      return;
    }

    startTransition(async () => {
      try {
        const data = await apiPost<{ id: string }>("/api/students", {
          name: form.name,
          gender: form.gender,
          birth_date: form.birth_date || null,
          guardian_name: form.guardian_name,
          guardian_phone: form.guardian_phone,
          enrollment_date: form.enrollment_date,
          notes: form.notes || null,
          initial_memorization: initMem,
        });
        router.push(`${redirectBase}/${data.id}`);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "حدث خطأ");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="card space-y-5">
        <h3 className="font-semibold text-base border-b border-border pb-2">بيانات الطالب</h3>

        {/* Name */}
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

        {/* Gender */}
        <div>
          <label className="form-label">
            الجنس <span className="required-star">*</span>
          </label>
          {forcedGender ? (
            <div className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
              forcedGender === "male"
                ? "bg-[#dbeafe] text-[#1e40af]"
                : "bg-[#fdf2f8] text-[#9d174d]"
            }`}>
              {forcedGender === "male" ? "ذكر" : "أنثى"}
            </div>
          ) : (
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
          )}
        </div>

        {/* Birth date */}
        <div>
          <label className="form-label">تاريخ الميلاد</label>
          <input
            type="date"
            className="input-field"
            dir="ltr"
            value={form.birth_date}
            onChange={(e) => set("birth_date", e.target.value)}
            max={today}
          />
        </div>

        {/* Guardian name */}
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

        {/* Guardian phone */}
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

        {/* Enrollment date */}
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

        {/* Notes */}
        <div>
          <label className="form-label">ملاحظات</label>
          <textarea
            className="input-field min-h-[80px] resize-none"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="أي ملاحظات عن الطالب…"
          />
        </div>
      </div>

      {/* Initial memorization section */}
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
          <InitialMemorizationGrid
            value={initMem}
            onChange={setInitMem}
          />
        )}
      </div>

      {error && <p className="field-error text-base">{error}</p>}

      <div className="flex justify-end gap-3">
        <Link href={redirectBase} className="btn-secondary">
          إلغاء
        </Link>
        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          حفظ الطالب
        </button>
      </div>
    </form>
  );
}
