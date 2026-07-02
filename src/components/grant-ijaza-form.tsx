"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Award, Loader2, CheckCircle2 } from "lucide-react";
import { toArabicNumerals } from "@/lib/arabic";

interface StudentOption {
  id: string;
  name: string;
}

interface GrantIjazaFormProps {
  students: StudentOption[];
  /** if pre-selected (e.g. from student profile), lock the student dropdown */
  preselectedStudentId?: string;
  /** redirect destination after success */
  redirectTo?: string;
}

const JUZ_OPTIONS = Array.from({ length: 30 }, (_, i) => i + 1);

export function GrantIjazaForm({
  students,
  preselectedStudentId,
  redirectTo = "/",
}: GrantIjazaFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [studentId, setStudentId] = useState(preselectedStudentId ?? "");
  const [ijazaType, setIjazaType] = useState<"juz" | "full_quran">("juz");
  const [juzNumber, setJuzNumber] = useState<string>("1");
  const [sheikhName, setSheikhName] = useState("");
  const [ijazaDate, setIjazaDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!studentId) {
      setError("يرجى اختيار الطالب");
      return;
    }
    if (!sheikhName.trim()) {
      setError("اسم الشيخ مطلوب");
      return;
    }
    if (!ijazaDate) {
      setError("تاريخ الإجازة مطلوب");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/ijazat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            student_id: studentId,
            ijaza_type: ijazaType,
            juz_number: ijazaType === "juz" ? Number(juzNumber) : null,
            sheikh_name: sheikhName.trim(),
            ijaza_date: ijazaDate,
            notes: notes.trim() || null,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "حدث خطأ أثناء منح الإجازة");
          return;
        }

        setSuccess(true);
        setTimeout(() => router.push(redirectTo), 1500);
      } catch {
        setError("حدث خطأ في الاتصال بالخادم");
      }
    });
  }

  if (success) {
    return (
      <div className="card flex flex-col items-center gap-4 py-12 text-center">
        <div className="rounded-full bg-green-100 p-4">
          <CheckCircle2 className="size-10 text-green-600" />
        </div>
        <div>
          <h3 className="font-bold text-lg">تم منح الإجازة بنجاح 🎉</h3>
          <p className="text-sm text-muted-foreground mt-1">
            جاري تحديث خريطة تقدم الطالب...
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-5 max-w-xl">
      {/* Student selector */}
      {!preselectedStudentId ? (
        <div className="space-y-1.5">
          <label htmlFor="grant-student" className="form-label">
            الطالب <span className="text-destructive">*</span>
          </label>
          <select
            id="grant-student"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="form-input"
            required
          >
            <option value="">— اختر الطالب —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <label className="form-label">الطالب</label>
          <p className="form-input bg-secondary/50 text-muted-foreground cursor-not-allowed">
            {students.find((s) => s.id === preselectedStudentId)?.name ?? preselectedStudentId}
          </p>
        </div>
      )}

      {/* Ijaza type */}
      <div className="space-y-1.5">
        <label className="form-label">
          نوع الإجازة <span className="text-destructive">*</span>
        </label>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="ijaza_type"
              value="juz"
              checked={ijazaType === "juz"}
              onChange={() => setIjazaType("juz")}
              className="accent-primary"
            />
            <span className="text-sm">إجازة جزء</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="ijaza_type"
              value="full_quran"
              checked={ijazaType === "full_quran"}
              onChange={() => setIjazaType("full_quran")}
              className="accent-primary"
            />
            <span className="text-sm">إجازة القرآن الكريم كاملاً</span>
          </label>
        </div>
      </div>

      {/* Juz number — shown only when type=juz */}
      {ijazaType === "juz" && (
        <div className="space-y-1.5">
          <label htmlFor="grant-juz" className="form-label">
            رقم الجزء <span className="text-destructive">*</span>
          </label>
          <select
            id="grant-juz"
            value={juzNumber}
            onChange={(e) => setJuzNumber(e.target.value)}
            className="form-input"
            required
          >
            {JUZ_OPTIONS.map((j) => (
              <option key={j} value={j}>
                الجزء {toArabicNumerals(j)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Sheikh name */}
      <div className="space-y-1.5">
        <label htmlFor="grant-sheikh" className="form-label">
          اسم الشيخ / المجيز <span className="text-destructive">*</span>
        </label>
        <input
          id="grant-sheikh"
          type="text"
          value={sheikhName}
          onChange={(e) => setSheikhName(e.target.value)}
          placeholder="مثال: الشيخ عبد الله الأحمد"
          className="form-input"
          required
        />
      </div>

      {/* Ijaza date */}
      <div className="space-y-1.5">
        <label htmlFor="grant-date" className="form-label">
          تاريخ الإجازة <span className="text-destructive">*</span>
        </label>
        <input
          id="grant-date"
          type="date"
          value={ijazaDate}
          onChange={(e) => setIjazaDate(e.target.value)}
          className="form-input"
          required
        />
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label htmlFor="grant-notes" className="form-label">
          ملاحظات (اختياري)
        </label>
        <textarea
          id="grant-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="أي ملاحظات إضافية عن الإجازة..."
          className="form-input resize-none"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Submit */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary gap-2"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Award className="size-4" />
          )}
          منح الإجازة
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-secondary"
        >
          إلغاء
        </button>
      </div>
    </form>
  );
}
