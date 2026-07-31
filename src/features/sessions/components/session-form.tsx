"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Rating, SessionType } from "@/components/badges";
import { Loader2, BookOpen, RotateCcw, CheckCircle2 } from "lucide-react";
import { cn, todayDateString } from "@/lib/utils";
import {
  formatAyahPreview,
  formatSurahLabel,
  toArabicNumerals,
} from "@/lib/arabic";
import { apiPost, ApiError } from "@/lib/api-client";

export interface StudentOption {
  id: string;
  name: string;
}

export interface SurahOption {
  id: number;
  name_arabic: string;
  total_ayahs: number;
}

interface SessionFormProps {
  students: StudentOption[];
  surahs: SurahOption[];
  defaultStudentId?: string;
}

const SESSION_TYPES: { value: SessionType; label: string; icon: typeof BookOpen }[] = [
  { value: "new_memorization", label: "تسميع جديد", icon: BookOpen },
  { value: "review", label: "مراجعة", icon: RotateCcw },
];

const RATINGS: { value: Rating; label: string }[] = [
  { value: "excellent", label: "ممتاز" },
  { value: "good", label: "جيد" },
  { value: "weak", label: "ضعيف" },
];

function lastSurahKey(studentId: string) {
  return `iqra_last_surah_${studentId}`;
}

export function SessionForm({ students, surahs, defaultStudentId }: SessionFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [surahSearch, setSurahSearch] = useState("");

  const today = todayDateString();

  const [studentId, setStudentId] = useState(defaultStudentId ?? students[0]?.id ?? "");
  const [sessionDate, setSessionDate] = useState(today);
  const [sessionType, setSessionType] = useState<SessionType>("new_memorization");
  const [surahId, setSurahId] = useState<number>(surahs[0]?.id ?? 1);
  const [fromAyah, setFromAyah] = useState("1");
  const [toAyah, setToAyah] = useState("1");
  const [pages, setPages] = useState("");
  const [rating, setRating] = useState<Rating>("good");
  const [notes, setNotes] = useState("");

  const selectedSurah = surahs.find((s) => s.id === surahId);

  // Restore last-used surah per student after hydration (client-only),
  // so SSR and the first client render agree on the initial surah.
  useEffect(() => {
    if (!studentId) return;
    const saved = localStorage.getItem(lastSurahKey(studentId));
    if (saved) {
      const num = Number(saved);
      if (surahs.some((s) => s.id === num) && num !== surahId) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSurahId(num);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const filteredSurahs = useMemo(() => {
    const q = surahSearch.trim().toLowerCase();
    if (!q) return surahs;
    return surahs.filter(
      (s) =>
        s.name_arabic.includes(q) ||
        String(s.id).includes(q) ||
        formatSurahLabel(s.id, s.name_arabic).includes(q)
    );
  }, [surahs, surahSearch]);

  const preview =
    selectedSurah && fromAyah && toAyah
      ? formatAyahPreview(selectedSurah.name_arabic, Number(fromAyah), Number(toAyah))
      : "";

  const handleStudentChange = (id: string) => {
    setStudentId(id);
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(lastSurahKey(id));
      if (saved) setSurahId(Number(saved));
    }
  };

  const handleSurahChange = (id: number) => {
    setSurahId(id);
    if (studentId && typeof window !== "undefined") {
      localStorage.setItem(lastSurahKey(studentId), String(id));
    }
    const surah = surahs.find((s) => s.id === id);
    if (surah) {
      setFromAyah("1");
      setToAyah(String(surah.total_ayahs));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!studentId) {
      setError("يرجى اختيار الطالب");
      return;
    }
    if (!selectedSurah) {
      setError("يرجى اختيار السورة");
      return;
    }

    const from = Number(fromAyah);
    const to = Number(toAyah);
    if (from < 1 || to < 1) {
      setError("يرجى إدخال أرقام الآيات");
      return;
    }
    if (from > to) {
      setError("آية البداية يجب أن تكون أقل من أو تساوي آية النهاية");
      return;
    }
    if (to > selectedSurah.total_ayahs) {
      setError(`آية النهاية لا يمكن أن تتجاوز ${toArabicNumerals(selectedSurah.total_ayahs)}`);
      return;
    }

    const pagesNum = Number(pages);
    if (pages !== "" && (Number.isNaN(pagesNum) || pagesNum < 0)) {
      setError("عدد الصفحات يجب أن يكون رقماً صحيحاً");
      return;
    }

    startTransition(async () => {
      try {
        await apiPost("/api/sessions", {
          student_id: studentId,
          session_date: sessionDate,
          session_type: sessionType,
          surah_id: surahId,
          from_ayah: from,
          to_ayah: to,
          pages: pages === "" ? null : pagesNum,
          rating,
          notes: notes || null,
        });

        setSuccess(true);
        setNotes("");
        setPages("");
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "حدث خطأ");
      }
    });
  };

  if (students.length === 0) {
    return (
      <div className="card py-12 text-center text-muted-foreground">
        <p className="font-medium">لا يوجد طلاب مسندون إليك</p>
        <p className="text-sm mt-1">أضف طالباً أولاً من قائمة الطلاب</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-6">
      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm font-medium text-emerald-800 flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="size-5 text-emerald-600" />
          <span>تم تسجيل الجلسة بنجاح ✓</span>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Right Column: Session Details */}
        <div className="card space-y-5">
          <h3 className="font-semibold border-b border-border pb-3 mb-1 text-primary text-base">
            معلومات الجلسة
          </h3>

          <div>
            <label className="form-label">الطالب <span className="required-star">*</span></label>
            <select
              className="input-field cursor-pointer"
              value={studentId}
              onChange={(e) => handleStudentChange(e.target.value)}
              required
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">تاريخ الجلسة</label>
            <input
              type="date"
              className="input-field cursor-pointer"
              dir="ltr"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label">نوع الجلسة <span className="required-star">*</span></label>
            <div className="grid grid-cols-2 gap-3">
              {SESSION_TYPES.map(({ value, label, icon: Icon }) => {
                const isSelected = sessionType === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSessionType(value)}
                    className={cn(
                      "flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-lg border p-2 text-sm font-medium transition-all shadow-xs cursor-pointer",
                      isSelected
                        ? value === "new_memorization"
                          ? "border-[#2563eb] bg-[#2563eb]/10 text-[#1e40af] scale-[1.02] font-semibold"
                          : "border-[#7c3aed] bg-[#7c3aed]/10 text-[#5b21b6] scale-[1.02] font-semibold"
                        : "border-border bg-card text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    <Icon className="size-4.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="form-label">التقييم <span className="required-star">*</span></label>
            <div className="grid grid-cols-3 gap-2.5">
              {RATINGS.map(({ value, label }) => {
                const isSelected = rating === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    className={cn(
                      "min-h-[46px] rounded-lg border text-sm font-medium transition-all shadow-xs cursor-pointer",
                      isSelected
                        ? value === "excellent"
                          ? "border-[#16a34a] bg-[#16a34a]/10 text-[#15803d] font-bold scale-[1.02]"
                          : value === "good"
                          ? "border-[#ca8a04] bg-[#ca8a04]/10 text-[#a16207] font-bold scale-[1.02]"
                          : "border-[#dc2626] bg-[#dc2626]/10 text-[#b91c1c] font-bold scale-[1.02]"
                        : "border-border bg-card text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Left Column: Quran Position */}
        <div className="card space-y-5">
          <h3 className="font-semibold border-b border-border pb-3 mb-1 text-primary text-base">
            الموضع القرآني
          </h3>

          <div>
            <label className="form-label">السورة <span className="required-star">*</span></label>
            <input
              className="input-field mb-2"
              placeholder="🔍 ابحث باسم السورة…"
              value={surahSearch}
              onChange={(e) => setSurahSearch(e.target.value)}
            />
            <div className="border border-border rounded-lg overflow-hidden bg-card shadow-xs">
              <div className="max-h-[160px] overflow-y-auto divide-y divide-border/60">
                {filteredSurahs.map((s) => {
                  const isSelected = s.id === surahId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSurahChange(s.id)}
                      className={cn(
                        "w-full text-right px-3.5 py-2.5 text-sm transition-colors flex items-center justify-between cursor-pointer",
                        isSelected
                          ? "bg-primary/10 text-primary font-bold"
                          : "hover:bg-secondary/60 text-foreground"
                      )}
                    >
                      <span>{formatSurahLabel(s.id, s.name_arabic)}</span>
                      <span className="text-xs text-muted-foreground">({toArabicNumerals(s.total_ayahs)} آية)</span>
                    </button>
                  );
                })}
                {filteredSurahs.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    لا توجد نتائج مطابقة
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="form-label">آية من</label>
              <input
                type="number"
                min={1}
                max={selectedSurah?.total_ayahs ?? 286}
                className="input-field"
                dir="ltr"
                value={fromAyah}
                onChange={(e) => setFromAyah(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="form-label">آية إلى</label>
              <input
                type="number"
                min={1}
                max={selectedSurah?.total_ayahs ?? 286}
                className="input-field"
                dir="ltr"
                value={toAyah}
                onChange={(e) => setToAyah(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="form-label">عدد الصفحات (اختياري)</label>
            <input
              type="number"
              min={0}
              className="input-field"
              dir="ltr"
              value={pages}
              onChange={(e) => setPages(e.target.value)}
              placeholder="مثال: 2"
            />
          </div>

          {preview && (
            <div className="rounded-lg bg-emerald-950/5 border border-emerald-950/10 p-3 text-sm font-semibold text-emerald-800 text-center shadow-xs">
              {preview}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Notes & Submit */}
      <div className="card space-y-4">
        <div>
          <label className="form-label">ملاحظات وتوجيهات للمعلم أو الطالب (اختياري)</label>
          <textarea
            className="input-field min-h-[80px] resize-none"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="مثال: بحاجة لتثبيت الغنن، مراجعة مخارج الحروف الشجرية…"
          />
        </div>

        {error && <p className="field-error text-base">{error}</p>}

        <button 
          type="submit" 
          className="btn-primary w-full py-3.5 text-base font-bold shadow-md hover:scale-[1.005] active:scale-[0.995] transition-all cursor-pointer" 
          disabled={isPending}
        >
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="size-5 animate-spin" />
              <span>جاري الحفظ…</span>
            </span>
          ) : (
            "حفظ الجلسة"
          )}
        </button>
      </div>
    </form>
  );
}
