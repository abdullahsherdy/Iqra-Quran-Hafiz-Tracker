"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Calendar, RotateCcw, BookOpen, AlertCircle } from "lucide-react";
import { toArabicNumerals, formatSurahLabel } from "@/lib/arabic";
import { apiGet, ApiError } from "@/lib/api-client";
import { todayDateString } from "@/lib/utils";

interface ScheduledReview {
  rule: "1-day" | "7-day" | "30-day";
  original_date: string;
  surah_id: number;
  from_ayah: number;
  to_ayah: number;
  surah_name: string;
}

interface ReviewResponse {
  date: string;
  grouped: {
    "1-day": ScheduledReview[];
    "7-day": ScheduledReview[];
    "30-day": ScheduledReview[];
  };
  total: number;
}

interface ReviewCalendarProps {
  studentId: string;
  /**
   * API base path for the review fetch. Defaults to the staff route
   * (`/api/students/{id}`); the read-only student portal passes `/api/student`
   * (self-scoped, id resolved from the session).
   */
  basePath?: string;
}

const RULE_LABELS: Record<string, { label: string; icon: typeof Calendar; color: string }> = {
  "1-day": { label: "المراجعة القريبة (يوم)", icon: Calendar, color: "text-[#2563eb] border-[#2563eb]/30 bg-[#dbeafe]/50" },
  "7-day": { label: "المراجعة المتوسطة (أسبوع)", icon: RotateCcw, color: "text-[#ca8a04] border-[#ca8a04]/30 bg-[#fef9c3]/50" },
  "30-day": { label: "المراجعة التراكمية (شهر)", icon: BookOpen, color: "text-[#16a34a] border-[#16a34a]/30 bg-[#dcfce7]/50" },
};

export function ReviewCalendar({ studentId, basePath }: ReviewCalendarProps) {
  const reviewBase = basePath ?? `/api/students/${studentId}`;
  const [targetDate, setTargetDate] = useState(todayDateString());
  const [data, setData] = useState<ReviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<ReviewResponse>(
        `${reviewBase}/review?date=${targetDate}`
      );
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "فشل تحميل المراجعة");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [reviewBase, targetDate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchReview();
  }, [fetchReview]);

  const rules: ("1-day" | "7-day" | "30-day")[] = ["1-day", "7-day", "30-day"];

  return (
    <div className="space-y-4">
      {/* Date picker */}
      <div className="flex items-center gap-3">
        <div>
          <label className="form-label text-xs">تاريخ المراجعة</label>
          <input
            type="date"
            className="input-field"
            dir="ltr"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </div>
        {data && (
          <div className="mt-5 text-sm text-muted-foreground">
            {data.total > 0
              ? `${toArabicNumerals(data.total)} عنصر للمراجعة`
              : "لا توجد مراجعة مجدولة لهذا اليوم"}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="card p-6 flex flex-col items-center text-center space-y-2 border-red-200 bg-red-50/50">
          <AlertCircle className="size-8 text-destructive" />
          <p className="text-sm font-semibold text-destructive">{error}</p>
        </div>
      ) : data && data.total > 0 ? (
        <div className="space-y-4">
          {rules.map((rule) => {
            const reviews = data.grouped[rule];
            if (reviews.length === 0) return null;

            const { label, icon: Icon, color } = RULE_LABELS[rule];

            return (
              <div key={rule} className={`rounded-lg border p-4 space-y-3 ${color}`}>
                <div className="flex items-center gap-2">
                  <Icon className="size-4" />
                  <h4 className="font-semibold text-sm">{label}</h4>
                  <span className="mr-auto text-xs font-bold">
                    {toArabicNumerals(reviews.length)} عنصر
                  </span>
                </div>

                {/* Items table */}
                <div className="space-y-2">
                  {reviews.map((r, i) => (
                    <div
                      key={`${r.surah_id}-${r.from_ayah}-${r.to_ayah}-${i}`}
                      className="flex items-center justify-between gap-2 rounded-lg bg-card border border-border p-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {r.surah_name
                            ? formatSurahLabel(r.surah_id, r.surah_name)
                            : `سورة ${r.surah_id}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          من آية {toArabicNumerals(r.from_ayah)} إلى {toArabicNumerals(r.to_ayah)}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                        {new Date(r.original_date).toLocaleDateString("ar-EG")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card p-8 text-center text-sm text-muted-foreground">
          <Calendar className="size-8 mx-auto mb-2 opacity-40" />
          <p>لا توجد مراجعة مجدولة لهذا التاريخ</p>
          <p className="text-xs mt-1">
            تظهر المراجعة تلقائياً بناءً على ما حفظه الطالب قبل ١ أو ٧ أو ٣٠ يوماً
          </p>
        </div>
      )}
    </div>
  );
}