"use client";

import { useState, useEffect } from "react";
import { Loader2, Award, Calendar, Trash2 } from "lucide-react";
import { toArabicNumerals } from "@/lib/arabic";
import { apiGet, apiDelete, ApiError } from "@/lib/api-client";

interface StudentIjazatTabProps {
  studentId: string;
  isAdmin?: boolean;
}

interface IjazaRecord {
  id: string;
  ijaza_type: "juz" | "full_quran";
  juz_number: number | null;
  sheikh_name: string;
  ijaza_date: string;
  notes: string | null;
  created_at: string;
}

export function StudentIjazatTab({ studentId, isAdmin = false }: StudentIjazatTabProps) {
  const [ijazat, setIjazat] = useState<IjazaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchIjazat = async () => {
    try {
      const data = await apiGet<IjazaRecord[]>(`/api/ijazat?student_id=${studentId}`);
      setIjazat(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "فشل تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchIjazat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const handleRevoke = async (id: string) => {
    if (!window.confirm("هل أنت متأكد من رغبتك في إلغاء/سحب هذه الإجازة؟ سيتم إعادة حساب تقدم الطالب تلقائياً.")) {
      return;
    }

    setRevokingId(id);
    try {
      await apiDelete(`/api/ijazat/${id}`);

      // Refresh list
      await fetchIjazat();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "حدث خطأ ما");
    } finally {
      setRevokingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-2">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">جاري تحميل سجل الإجازات...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-50 text-red-700 text-xs border border-red-100">
        {error}
      </div>
    );
  }

  if (ijazat.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground bg-secondary/10 rounded-lg border border-dashed border-border">
        <Award className="size-10 mx-auto text-muted-foreground/45 mb-2" />
        <p>لا توجد إجازات مسجلة لهذا الطالب.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {ijazat.map((ij) => (
        <div
          key={ij.id}
          className="relative p-5 bg-gradient-to-br from-amber-50/40 to-orange-50/10 dark:from-amber-950/10 dark:to-orange-950/5 border border-amber-200/60 dark:border-amber-900/40 rounded-xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4"
        >
          <div className="space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 p-1.5 rounded-lg">
                  <Award className="size-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-amber-900 dark:text-amber-300">
                    {ij.ijaza_type === "full_quran"
                      ? "إجازة القرآن الكريم كاملاً"
                      : `إجازة الجزء ${toArabicNumerals(ij.juz_number ?? "")}`}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    بإسناد الشيخ: <span className="font-semibold text-foreground">{ij.sheikh_name}</span>
                  </p>
                </div>
              </div>
            </div>

            {ij.notes && (
              <p className="text-xs text-muted-foreground bg-white/70 dark:bg-black/20 p-2.5 rounded-lg border border-amber-100/50 dark:border-amber-950/30">
                {ij.notes}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-amber-200/30 pt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="size-3.5" />
              <span>تاريخ الإجازة:</span>
              <span className="font-medium text-foreground">
                {new Date(ij.ijaza_date).toLocaleDateString("ar-EG")}
              </span>
            </div>

            {isAdmin && (
              <button
                type="button"
                disabled={revokingId === ij.id}
                onClick={() => handleRevoke(ij.id)}
                className="text-destructive hover:text-red-700 disabled:opacity-50 p-1 rounded transition-colors hover:bg-red-50 dark:hover:bg-red-950/20"
                title="إلغاء الإجازة"
              >
                {revokingId === ij.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
