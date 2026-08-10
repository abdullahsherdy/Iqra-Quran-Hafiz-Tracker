"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Award, Loader2, CheckCircle2 } from "lucide-react";
import { toArabicNumerals } from "@/lib/arabic";
import { cn, todayDateString } from "@/lib/utils";
import { apiPost, ApiError } from "@/lib/api-client";

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
    todayDateString()
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
        await apiPost("/api/ijazat", {
          student_id: studentId,
          ijaza_type: ijazaType,
          juz_number: ijazaType === "juz" ? Number(juzNumber) : null,
          sheikh_name: sheikhName.trim(),
          ijaza_date: ijazaDate,
          notes: notes.trim() || null,
        });

        setSuccess(true);
        setTimeout(() => router.push(redirectTo), 1500);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "حدث خطأ في الاتصال بالخادم");
      }
    });
  }

  if (success) {
    return (
      <div className="card flex flex-col items-center gap-4 py-12 text-center shadow-md border border-border">
        <div className="rounded-full bg-[#dcfce7] p-4 animate-bounce">
          <CheckCircle2 className="size-10 text-[#166534]" />
        </div>
        <div>
          <h3 className="font-bold text-lg text-foreground">تم منح الإجازة بنجاح 🎉</h3>
          <p className="text-sm text-muted-foreground mt-1">
            جاري تحديث خريطة تقدم الطالب...
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-6 w-full shadow-md border border-border">
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
            className="input-field cursor-pointer"
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
          <p className="input-field bg-secondary/40 text-muted-foreground cursor-not-allowed border-dashed">
            {students.find((s) => s.id === preselectedStudentId)?.name ?? preselectedStudentId}
          </p>
        </div>
      )}

      {/* Visual grouping of Ijaza Type & conditional Juz number */}
      <div className="rounded-xl border border-border/80 bg-secondary/10 p-4 space-y-4">
        <div>
          <label className="form-label mb-2">
            نوع الإجازة <span className="text-destructive">*</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setIjazaType("juz")}
              className={cn(
                "flex min-h-[56px] items-center justify-center gap-2 rounded-lg border p-2 text-sm font-semibold transition-all shadow-xs cursor-pointer",
                ijazaType === "juz"
                  ? "border-primary bg-primary/10 text-primary scale-[1.01]"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary"
              )}
            >
              <Award className="size-4.5" />
              <span>إجازة جزء</span>
            </button>
            <button
              type="button"
              onClick={() => setIjazaType("full_quran")}
              className={cn(
                "flex min-h-[56px] items-center justify-center gap-2 rounded-lg border p-2 text-sm font-semibold transition-all shadow-xs cursor-pointer",
                ijazaType === "full_quran"
                  ? "border-[#16a34a] bg-[#16a34a]/10 text-[#15803d] scale-[1.01]"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary"
              )}
            >
              <Award className="size-4.5" />
              <span>القرآن كاملاً</span>
            </button>
          </div>
        </div>

        {/* Juz number — shown only when type=juz */}
        {ijazaType === "juz" && (
          <div className="space-y-1.5 animate-fadeIn">
            <label htmlFor="grant-juz" className="form-label">
              رقم الجزء <span className="text-destructive">*</span>
            </label>
            <select
              id="grant-juz"
              value={juzNumber}
              onChange={(e) => setJuzNumber(e.target.value)}
              className="input-field cursor-pointer"
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
      </div>

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
          className="input-field"
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
          className="input-field cursor-pointer"
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
          className="input-field resize-none"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Submit & Cancel Buttons */}
      <div className="grid grid-cols-2 gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-sm"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Award className="size-4.5" />
          )}
          <span>منح الإجازة</span>
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-secondary w-full py-3 text-sm font-semibold cursor-pointer"
        >
          إلغاء
        </button>
      </div>
    </form>
  );
}
