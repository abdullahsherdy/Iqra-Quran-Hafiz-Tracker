"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Rating, SessionType } from "@/components/badges";
import { Loader2, BookOpen, RotateCcw, CheckCircle2, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { cn, todayDateString } from "@/lib/utils";
import {
  formatAyahPreview,
  formatSurahLabel,
  toArabicNumerals,
} from "@/lib/arabic";
import { apiPost, apiPut, ApiError } from "@/lib/api-client";
import { RecommendedReview } from "@/features/sessions/components/recommended-review";

export interface StudentOption {
  id: string;
  name: string;
}

export interface SurahOption {
  id: number;
  name_arabic: string;
  total_ayahs: number;
}

export interface SessionItemInitial {
  id: string;
  session_type: SessionType;
  surah_id: number;
  from_ayah: number;
  to_ayah: number;
  rating: Rating;
  pages: number | null;
  notes: string | null;
}

export interface SessionInitialData {
  student_id: string;
  session_date: string;
  overall_rating: Rating;
  notes: string | null;
  items: SessionItemInitial[];
}

interface SessionItemForm {
  id: string; // local ID for React key
  session_type: SessionType;
  surah_id: number;
  from_ayah: string;
  to_ayah: string;
  rating: Rating;
  pages: string;
  notes: string;
}

interface SessionFormProps {
  students: StudentOption[];
  surahs: SurahOption[];
  defaultStudentId?: string;
  editSessionId?: string;
  initialData?: SessionInitialData;
  onCancelEdit?: () => void;
  onEdited?: () => void;
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

let itemCounter = 0;
function makeItemId() {
  return `item-${++itemCounter}`;
}

function makeEmptyItem(): SessionItemForm {
  return {
    id: makeItemId(),
    session_type: "new_memorization",
    surah_id: 0,
    from_ayah: "",
    to_ayah: "",
    rating: "good",
    pages: "",
    notes: "",
  };
}

function itemFromInitial(init: SessionItemInitial): SessionItemForm {
  return {
    id: makeItemId(),
    session_type: init.session_type,
    surah_id: init.surah_id,
    from_ayah: String(init.from_ayah),
    to_ayah: String(init.to_ayah),
    rating: init.rating,
    pages: init.pages != null ? String(init.pages) : "",
    notes: init.notes ?? "",
  };
}

export function SessionForm({ students, surahs, defaultStudentId, editSessionId, initialData, onCancelEdit, onEdited }: SessionFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isEditMode = !!editSessionId;

  const today = todayDateString();

  const [studentId, setStudentId] = useState(initialData?.student_id ?? defaultStudentId ?? students[0]?.id ?? "");
  const [sessionDate, setSessionDate] = useState(initialData?.session_date ?? today);
  const [overallRating, setOverallRating] = useState<Rating>(initialData?.overall_rating ?? "good");
  const [sessionNotes, setSessionNotes] = useState(initialData?.notes ?? "");
  const [items, setItems] = useState<SessionItemForm[]>(
    initialData?.items?.length
      ? initialData.items.map(itemFromInitial)
      : [],
  );
  const [expandedItemId, setExpandedItemId] = useState<string | null>(initialData?.items?.[0]?.id ?? null);

  const handleStudentChange = (id: string) => {
    setStudentId(id);
  };

  const updateItem = (itemId: string, updates: Partial<SessionItemForm>) => {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...updates } : it)));
  };

  const addItem = () => {
    const newItem = makeEmptyItem();
    setItems((prev) => [...prev, newItem]);
    setExpandedItemId(newItem.id);
  };

  const removeItem = (itemId: string) => {
    setItems((prev) => prev.filter((it) => it.id !== itemId));
  };

  const handleSurahChange = (itemId: string, surahId: number) => {
    const surah = surahs.find((s) => s.id === surahId);
    if (surah) {
      updateItem(itemId, {
        surah_id: surahId,
        from_ayah: "1",
        to_ayah: String(surah.total_ayahs),
      });
    }
    if (!isEditMode && studentId && surahId > 0 && typeof window !== "undefined") {
      localStorage.setItem(lastSurahKey(studentId), String(surahId));
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

    // Validate items
    if (items.length === 0) {
      setError("يجب إضافة عنصر واحد على الأقل للجلسة");
      return;
    }
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const surah = surahs.find((s) => s.id === item.surah_id);
      if (!surah) {
        setError(`العنصر ${i + 1}: يرجى اختيار السورة`);
        return;
      }
      const from = Number(item.from_ayah);
      const to = Number(item.to_ayah);
      if (Number.isNaN(from) || Number.isNaN(to) || from < 1 || to < 1) {
        setError(`العنصر ${i + 1}: يرجى إدخال أرقام الآيات`);
        return;
      }
      if (from > to) {
        setError(`العنصر ${i + 1}: آية البداية يجب أن تكون أقل من أو تساوي آية النهاية`);
        return;
      }
      if (to > surah.total_ayahs) {
        setError(`العنصر ${i + 1}: آية النهاية لا يمكن أن تتجاوز ${toArabicNumerals(surah.total_ayahs)}`);
        return;
      }
      const pagesNum = Number(item.pages);
      if (item.pages !== "" && (Number.isNaN(pagesNum) || pagesNum < 0)) {
        setError(`العنصر ${i + 1}: عدد الصفحات يجب أن يكون رقماً صحيحاً`);
        return;
      }
    }

    startTransition(async () => {
      try {
        const payload = {
          student_id: studentId,
          session_date: sessionDate,
          overall_rating: overallRating,
          notes: sessionNotes || null,
          items: items.map((item) => ({
            session_type: item.session_type,
            surah_id: item.surah_id,
            from_ayah: Number(item.from_ayah),
            to_ayah: Number(item.to_ayah),
            pages: item.pages === "" ? null : Number(item.pages),
            rating: item.rating,
            notes: item.notes || null,
          })),
        };

        if (isEditMode && editSessionId) {
          await apiPut(`/api/sessions/${editSessionId}`, payload);
          setSuccess(true);
          onEdited?.();
        } else {
          await apiPost("/api/sessions", payload);
          setSuccess(true);
          setSessionNotes("");
          setItems([]);
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "حدث خطأ");
      }
    });
  };

  if (students.length === 0) {
    return (
      <div className="card py-12 text-center text-muted-foreground">
        <p className="font-medium">لا يوجد طلاب</p>
        <p className="text-sm mt-1">أضف طالباً أولاً من قائمة الطلاب</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-6">
      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm font-medium text-emerald-800 flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="size-5 text-emerald-600" />
          <span>{isEditMode ? "تم تعديل الجلسة بنجاح ✓" : "تم تسجيل الجلسة بنجاح ✓"}</span>
        </div>
      )}

      {/* Session-level fields */}
      <div className="card space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-3 mb-1">
          <h3 className="font-semibold text-primary text-base">
            {isEditMode ? "تعديل الجلسة" : "معلومات الجلسة"}
          </h3>
          {isEditMode && onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="btn-secondary text-sm px-3 py-1.5"
            >
              إلغاء التعديل
            </button>
          )}
        </div>

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
            max={today}
            onChange={(e) => setSessionDate(e.target.value)}
          />
        </div>

        <div>
          <label className="form-label">التقييم العام للجلسة <span className="required-star">*</span></label>
          <div className="grid grid-cols-3 gap-2.5">
            {RATINGS.map(({ value, label }) => {
              const isSelected = overallRating === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setOverallRating(value)}
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

        <div>
          <label className="form-label">ملاحظات الجلسة (اختياري)</label>
          <textarea
            className="input-field min-h-[60px] resize-none"
            value={sessionNotes}
            onChange={(e) => setSessionNotes(e.target.value)}
            placeholder="ملاحظات عامة على الجلسة…"
          />
        </div>
      </div>

      {/* Recommended review (create mode only) */}
      {!isEditMode && studentId && (
        <RecommendedReview studentId={studentId} date={sessionDate} />
      )}

      {/* Session items */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="font-semibold text-primary text-base">
            عناصر الجلسة ({toArabicNumerals(items.length)})
          </h3>
          <button
            type="button"
            onClick={addItem}
            className="btn-secondary gap-1.5 text-sm px-3 py-1.5"
          >
            <Plus className="size-4" />
            إضافة عنصر
          </button>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <p>لا توجد عناصر في هذه الجلسة بعد</p>
            <p className="text-xs mt-1">اضغط «إضافة عنصر» لإضافة ما تم تسميعه</p>
          </div>
        ) : (
          items.map((item, index) => {
          const surah = surahs.find((s) => s.id === item.surah_id);
          const isExpanded = expandedItemId === item.id;
          const preview = surah && item.from_ayah && item.to_ayah
            ? formatAyahPreview(surah.name_arabic, Number(item.from_ayah), Number(item.to_ayah))
            : "";

          return (
            <div key={item.id} className="rounded-lg border border-border overflow-hidden">
              {/* Item header — always visible */}
              <div className="flex items-center gap-2 p-3 bg-secondary/30">
                <button
                  type="button"
                  onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                  className="flex items-center gap-2 flex-1 min-w-0 text-right"
                >
                  <span className="size-6 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                    {toArabicNumerals(index + 1)}
                  </span>
                  <span className="text-sm font-medium truncate">
                    {surah ? formatSurahLabel(surah.id, surah.name_arabic) : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {item.session_type === "new_memorization" ? "تسميع جديد" : "مراجعة"}
                  </span>
                  {isExpanded ? <ChevronUp className="size-4 text-muted-foreground mr-auto" /> : <ChevronDown className="size-4 text-muted-foreground mr-auto" />}
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="text-destructive hover:bg-destructive/10 rounded p-1.5 transition-colors"
                  title="حذف العنصر"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              {/* Item details — visible when expanded */}
              {isExpanded && (
                <div className="p-3 space-y-3">
                  {/* Session type */}
                  <div>
                    <label className="form-label text-xs">النوع</label>
                    <div className="grid grid-cols-2 gap-2">
                      {SESSION_TYPES.map(({ value, label, icon: Icon }) => {
                        const isSelected = item.session_type === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => updateItem(item.id, { session_type: value })}
                            className={cn(
                              "flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition-all cursor-pointer",
                              isSelected
                                ? value === "new_memorization"
                                  ? "border-[#2563eb] bg-[#2563eb]/10 text-[#1e40af]"
                                  : "border-[#ca8a04] bg-[#ca8a04]/10 text-[#a16207]"
                                : "border-border bg-card text-muted-foreground hover:bg-secondary"
                            )}
                          >
                            <Icon className="size-3.5" />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Surah picker */}
                  <div>
                    <label className="form-label text-xs">السورة</label>
                    <select
                      className="input-field text-sm"
                      value={item.surah_id}
                      onChange={(e) => handleSurahChange(item.id, Number(e.target.value))}
                    >
                      <option value={0} disabled>— اختر السورة —</option>
                      {surahs.map((s) => (
                        <option key={s.id} value={s.id}>
                          {formatSurahLabel(s.id, s.name_arabic)} ({toArabicNumerals(s.total_ayahs)} آية)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Ayah range */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label text-xs">آية من</label>
                      <input
                        type="number"
                        min={1}
                        max={surah?.total_ayahs ?? 286}
                        className="input-field"
                        dir="ltr"
                        value={item.from_ayah}
                        onChange={(e) => updateItem(item.id, { from_ayah: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="form-label text-xs">آية إلى</label>
                      <input
                        type="number"
                        min={1}
                        max={surah?.total_ayahs ?? 286}
                        className="input-field"
                        dir="ltr"
                        value={item.to_ayah}
                        onChange={(e) => updateItem(item.id, { to_ayah: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Rating */}
                  <div>
                    <label className="form-label text-xs">تقييم العنصر</label>
                    <div className="grid grid-cols-3 gap-2">
                      {RATINGS.map(({ value, label }) => {
                        const isSelected = item.rating === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => updateItem(item.id, { rating: value })}
                            className={cn(
                              "rounded-lg border py-1.5 text-xs font-medium transition-all cursor-pointer",
                              isSelected
                                ? value === "excellent"
                                  ? "border-[#16a34a] bg-[#16a34a]/10 text-[#15803d] font-bold"
                                  : value === "good"
                                  ? "border-[#ca8a04] bg-[#ca8a04]/10 text-[#a16207] font-bold"
                                  : "border-[#dc2626] bg-[#dc2626]/10 text-[#b91c1c] font-bold"
                                : "border-border bg-card text-muted-foreground hover:bg-secondary"
                            )}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Pages */}
                  <div>
                    <label className="form-label text-xs">عدد الصفحات (اختياري)</label>
                    <input
                      type="number"
                      min={0}
                      className="input-field"
                      dir="ltr"
                      value={item.pages}
                      onChange={(e) => updateItem(item.id, { pages: e.target.value })}
                      placeholder="مثال: 2"
                    />
                  </div>

                  {/* Item notes */}
                  <div>
                    <label className="form-label text-xs">ملاحظات العنصر (اختياري)</label>
                    <input
                      type="text"
                      className="input-field text-sm"
                      value={item.notes}
                      onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                      placeholder="ملاحظة خاصة بهذا العنصر…"
                    />
                  </div>

                  {/* Preview */}
                  {preview && (
                    <div className="rounded-lg bg-emerald-950/5 border border-emerald-950/10 p-2 text-xs font-semibold text-emerald-800 text-center">
                      {preview}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
        )}
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
          isEditMode ? "حفظ التعديلات" : "حفظ الجلسة"
        )}
      </button>
    </form>
  );
}