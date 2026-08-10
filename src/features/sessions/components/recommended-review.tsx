"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Calendar, RotateCcw, BookOpen, Info } from "lucide-react";
import { toArabicNumerals, formatSurahLabel } from "@/lib/arabic";
import { apiGet, ApiError } from "@/lib/api-client";

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

interface RecommendedReviewProps {
  studentId: string;
  date: string;
}

const RULE_LABELS: Record<
  "1-day" | "7-day" | "30-day",
  { label: string; icon: typeof Calendar; color: string }
> = {
  "1-day": { label: "المراجعة القريبة (يوم)", icon: Calendar, color: "text-[#2563eb] border-[#2563eb]/30 bg-[#dbeafe]/50" },
  "7-day": { label: "المراجعة المتوسطة (أسبوع)", icon: RotateCcw, color: "text-[#ca8a04] border-[#ca8a04]/30 bg-[#fef9c3]/50" },
  "30-day": { label: "المراجعة التراكمية (شهر)", icon: BookOpen, color: "text-[#16a34a] border-[#16a34a]/30 bg-[#dcfce7]/50" },
};

export function RecommendedReview({ studentId, date }: RecommendedReviewProps) {
  const [data, setData] = useState<ReviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReview = useCallback(async () => {
    if (!studentId || !date) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<ReviewResponse>(
        `/api/students/${studentId}/review?date=${date}`,
      );
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "فشل تحميل المراجعة");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [studentId, date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchReview();
  }, [fetchReview]);

  const rules: ("1-day" | "7-day" | "30-day")[] = ["1-day", "7-day", "30-day"];

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Calendar className="size-5 text-primary" />
        <h3 className="font-semibold text-primary text-base">المراجعة المجدولة</h3>
        {data && (
          <span className="mr-auto text-xs text-muted-foreground">
            {data.total > 0
              ? `${toArabicNumerals(data.total)} عنصر للمراجعة`
              : "لا توجد مراجعة مجدولة"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive text-center py-4">{error}</p>
      ) : data && data.total > 0 ? (
        <div className="space-y-3">
          {rules.map((rule) => {
            const reviews = data.grouped[rule];
            if (reviews.length === 0) return null;

            const { label, icon: Icon, color } = RULE_LABELS[rule];

            return (
              <div key={rule} className={`rounded-lg border p-3 space-y-2 ${color}`}>
                <div className="flex items-center gap-2">
                  <Icon className="size-4" />
                  <h4 className="font-semibold text-sm">{label}</h4>
                  <span className="mr-auto text-xs font-bold">
                    {toArabicNumerals(reviews.length)} عنصر
                  </span>
                </div>

                <div className="space-y-1.5">
                  {reviews.map((r, i) => (
                    <div
                      key={`${r.surah_id}-${r.from_ayah}-${r.to_ayah}-${i}`}
                      className="flex items-center justify-between gap-2 rounded-lg bg-card border border-border p-2"
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
        <div className="flex items-start gap-2 py-3 text-sm text-muted-foreground">
          <Info className="size-4 shrink-0 mt-0.5" />
          <p>
            لا توجد مراجعة مجدولة لهذا التاريخ. تظهر المراجعة تلقائياً بناءً على ما حفظه الطالب قبل ١ أو ٧ أو ٣٠ يوماً.
          </p>
        </div>
      )}
    </div>
  );
}
