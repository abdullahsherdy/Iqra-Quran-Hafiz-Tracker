"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Rating, SessionType } from "@/components/badges";
import { Loader2, BookOpen, RotateCcw, CheckCircle2 } from "lucide-react";
import {
  formatAyahPreview,
  formatSurahLabel,
  toArabicNumerals,
} from "@/lib/arabic";

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

const SESSION_TYPES: { value: SessionType; label: string; icon: typeof BookOpen; colors: string }[] = [
  { value: "new_memorization", label: "تسميع جديد", icon: BookOpen, colors: "border-[#2563eb] bg-[#dbeafe] text-[#1e40af]" },
  { value: "review", label: "مراجعة", icon: RotateCcw, colors: "border-[#7c3aed] bg-[#ede9fe] text-[#5b21b6]" },
];

const RATINGS: { value: Rating; label: string; colors: string }[] = [
  { value: "excellent", label: "ممتاز", colors: "border-[#16a34a] bg-[#dcfce7] text-[#166534]" },
  { value: "good", label: "جيد", colors: "border-[#ca8a04] bg-[#fef9c3] text-[#854d0e]" },
  { value: "weak", label: "ضعيف", colors: "border-[#dc2626] bg-[#fee2e2] text-[#991b1b]" },
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

  const today = new Date().toISOString().split("T")[0];

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
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            student_id: studentId,
            session_date: sessionDate,
            session_type: sessionType,
            surah_id: surahId,
            from_ayah: from,
            to_ayah: to,
            pages: pages === "" ? null : pagesNum,
            rating,
            notes: notes || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "حدث خطأ");

        setSuccess(true);
        setNotes("");
        setPages("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "حدث خطأ");
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
    <form onSubmit={handleSubmit} className="mx-auto max-w-lg space-y-5">
      {success && (
        <div className="rounded-lg bg-[#dcfce7] p-3 text-sm font-medium text-[#166534] flex items-center gap-2">
          <CheckCircle2 className="size-4" />
          تم الحفظ ✓
        </div>
      )}

      <div className="card space-y-5">
        <div>
          <label className="form-label">الطالب <span className="required-star">*</span></label>
          <select
            className="input-field"
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
            className="input-field"
            dir="ltr"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
          />
        </div>

        <div>
          <label className="form-label">نوع الجلسة <span className="required-star">*</span></label>
          <div className="grid grid-cols-3 gap-2">
            {SESSION_TYPES.map(({ value, label, icon: Icon, colors }) => (
              <button
                key={value}
                type="button"
                onClick={() => setSessionType(value)}
                className={`flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-lg border-2 p-2 text-sm font-medium transition-colors ${
                  sessionType === value ? colors : "border-border bg-card text-muted-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="size-5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="form-label">السورة <span className="required-star">*</span></label>
          <input
            className="input-field mb-2"
            placeholder="بحث عن سورة…"
            value={surahSearch}
            onChange={(e) => setSurahSearch(e.target.value)}
          />
          <select
            className="input-field"
            value={surahId}
            onChange={(e) => handleSurahChange(Number(e.target.value))}
            required
            size={5}
          >
            {filteredSurahs.map((s) => (
              <option key={s.id} value={s.id}>
                {formatSurahLabel(s.id, s.name_arabic)} ({toArabicNumerals(s.total_ayahs)} آية)
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
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
          <p className="mt-1 text-xs text-muted-foreground">
            عدد الصفحات التي حفظها/سمّعها الطالب في هذه الجلسة
          </p>
        </div>

        {preview && (
          <p className="rounded-lg bg-secondary p-3 text-sm font-medium text-center">
            {preview}
          </p>
        )}

        <div>
          <label className="form-label">التقييم <span className="required-star">*</span></label>
          <div className="grid grid-cols-3 gap-2">
            {RATINGS.map(({ value, label, colors }) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                className={`min-h-[52px] rounded-lg border-2 text-sm font-medium transition-colors ${
                  rating === value ? colors : "border-border bg-card text-muted-foreground hover:bg-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="form-label">ملاحظات</label>
          <textarea
            className="input-field min-h-[72px] resize-none"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات اختيارية…"
          />
        </div>
      </div>

      {error && <p className="field-error text-base">{error}</p>}

      <button type="submit" className="btn-primary w-full py-3 text-base" disabled={isPending}>
        {isPending ? <Loader2 className="size-5 animate-spin" /> : "حفظ الجلسة"}
      </button>
    </form>
  );
}
