"use client";

import { useState, useEffect } from "react";
import { Loader2, Star, Calendar, Award, BookOpen, AlertCircle } from "lucide-react";
import { RatingBadge, SessionTypeBadge, type SessionType, type Rating } from "@/components/badges";
import { toArabicNumerals } from "@/lib/arabic";
import { apiGet, ApiError } from "@/lib/api-client";
import type { JuzProgressDetailed } from "@/domain/progress";

type JuzProgressDetail = JuzProgressDetailed;

interface ProgressMapProps {
  studentId: string;
}

export function ProgressMap({ studentId }: ProgressMapProps) {
  const [progressData, setProgressData] = useState<JuzProgressDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJuz, setSelectedJuz] = useState<number | null>(null);

  useEffect(() => {
    async function fetchProgress() {
      setLoading(true);
      try {
        const data = await apiGet<JuzProgressDetail[]>(`/api/students/${studentId}/progress`);
        setProgressData(data);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "حدث خطأ ما");
      } finally {
        setLoading(false);
      }
    }

    fetchProgress();
  }, [studentId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">جاري تحميل خريطة التقدم...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 flex flex-col items-center text-center space-y-2 border-red-200 bg-red-50/50">
        <AlertCircle className="size-8 text-destructive" />
        <p className="text-sm font-semibold text-destructive">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-secondary text-xs px-3 py-1.5"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const selectedDetails = selectedJuz ? progressData.find((p) => p.juz === selectedJuz) : null;

  return (
    <div className="space-y-6">
      {/* 30 Juz Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-10 gap-2">
        {progressData.map((juzData) => {
          const isSelected = selectedJuz === juzData.juz;
          
          // Style mapping
          let colorClasses = "";
          if (juzData.color === "green") {
            colorClasses = "bg-[#16a34a] text-white hover:bg-[#15803d]";
          } else if (juzData.color === "blue") {
            colorClasses = "bg-[#2563eb] text-white hover:bg-[#1d4ed8]";
          } else if (juzData.color === "yellow") {
            colorClasses = "bg-[#d97706] text-white hover:bg-[#b45309]";
          } else {
            colorClasses = "bg-[#f3f4f6] text-muted-foreground hover:bg-[#e5e7eb]";
          }

          return (
            <button
              key={juzData.juz}
              type="button"
              onClick={() => setSelectedJuz(isSelected ? null : juzData.juz)}
              className={`relative flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all duration-200 cursor-pointer ${colorClasses} ${
                isSelected
                  ? "border-[#111827] scale-105 shadow-md z-10"
                  : "border-transparent hover:scale-102"
              }`}
            >
              {juzData.hasIjaza && (
                <div className="absolute top-1 right-1 bg-yellow-400 text-yellow-900 rounded-full p-0.5 shadow-sm">
                  <Star className="size-3 fill-yellow-900" />
                </div>
              )}
              <span className="text-xs font-semibold">جزء {toArabicNumerals(juzData.juz)}</span>
              <span className="text-[10px] opacity-90 mt-0.5">
                {toArabicNumerals(Math.round(juzData.coveragePercent))}%
              </span>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center items-center text-xs text-muted-foreground border-b border-border pb-4">
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-[#16a34a]" />
          <span>أجاز (مُجاز)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-[#2563eb]" />
          <span>حافظ بإتقان (٧٠٪+ وتقييم جيد/ممتاز)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-[#d97706]" />
          <span>يحتاج مراجعة (ضعيف / غير نشط / أقل من ٧٠٪)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-[#f3f4f6] border border-border" />
          <span>لم يبدأ (٠٪)</span>
        </div>
      </div>

      {/* Selected Juz Details */}
      {selectedDetails && (
        <div className="card p-5 bg-secondary/10 border border-border rounded-xl space-y-6 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3 gap-2">
            <div className="flex items-center gap-2">
              <h4 className="text-lg font-bold text-foreground">
                تفاصيل الجزء {toArabicNumerals(selectedDetails.juz)}
              </h4>
              {selectedDetails.hasIjaza && (
                <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 rounded-full px-2 py-0.5 text-xs font-medium border border-yellow-200">
                  <Star className="size-3.5 fill-yellow-800" />
                  مُجاز
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <BookOpen className="size-4" />
                <span>نسبة الحفظ:</span>
                <span className="font-semibold text-foreground">
                  {toArabicNumerals(selectedDetails.coveragePercent)}%
                </span>
              </div>
              {selectedDetails.lastSessionDate && (
                <div className="flex items-center gap-1">
                  <Calendar className="size-4" />
                  <span>آخر جلسة:</span>
                  <span className="font-semibold text-foreground">
                    {new Date(selectedDetails.lastSessionDate).toLocaleDateString("ar-EG")}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Surahs Progress */}
            <div className="space-y-3">
              <h5 className="font-semibold text-sm flex items-center gap-1">
                <Award className="size-4 text-primary" />
                السور والآيات في هذا الجزء
              </h5>
              <div className="space-y-3.5 bg-secondary/20 p-4 rounded-lg">
                {selectedDetails.surahs.map((surah) => (
                  <div key={surah.surah_id} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span>سورة {surah.surah_name}</span>
                      <span className="text-muted-foreground">
                        {toArabicNumerals(surah.covered_ayahs)} / {toArabicNumerals(surah.total_ayahs)} آية ({toArabicNumerals(surah.coverage_percent)}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          selectedDetails.color === "green"
                            ? "bg-[#16a34a]"
                            : selectedDetails.color === "blue"
                            ? "bg-[#2563eb]"
                            : selectedDetails.color === "yellow"
                            ? "bg-[#d97706]"
                            : "bg-muted-foreground/30"
                        }`}
                        style={{ width: `${surah.coverage_percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sessions List */}
            <div className="space-y-3">
              <h5 className="font-semibold text-sm flex items-center gap-1">
                <Calendar className="size-4 text-primary" />
                سجل الجلسات لهذا الجزء
              </h5>
              {selectedDetails.sessions.length === 0 ? (
                <p className="text-center py-8 text-xs text-muted-foreground bg-secondary/15 rounded-lg border border-dashed border-border">
                  لا توجد جلسات مسجلة لهذا الجزء (الحفظ تم مسبقاً قبل الالتحاق)
                </p>
              ) : (
                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                  {selectedDetails.sessions.map((sess) => (
                    <div
                      key={sess.id}
                      className="p-3 bg-secondary/15 rounded-lg border border-border/60 text-xs space-y-1.5 hover:bg-secondary/25 transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-muted-foreground">
                          {new Date(sess.session_date).toLocaleDateString("ar-EG")}
                        </span>
                        <div className="flex gap-1">
                          <SessionTypeBadge value={sess.session_type as SessionType} />
                          <RatingBadge value={sess.rating as Rating} />
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <p className="font-medium">
                          سورة {sess.surah_name} من آية {toArabicNumerals(sess.from_ayah)} إلى {toArabicNumerals(sess.to_ayah)}
                        </p>
                        <span className="text-muted-foreground">المحفظ: {sess.teacher_name}</span>
                      </div>
                      {sess.notes && (
                        <p className="bg-secondary/35 p-1.5 rounded text-[11px] text-muted-foreground">
                          {sess.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
