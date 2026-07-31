"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import {
  RatingBadge,
  SessionTypeBadge,
  type SessionType,
  type Rating,
} from "@/components/badges";
import { formatAyahPreview, toArabicNumerals } from "@/lib/arabic";
import { apiGet, ApiError } from "@/lib/api-client";

interface SessionRow {
  id: string;
  session_date: string;
  session_type: SessionType;
  surah_name: string;
  from_ayah: number;
  to_ayah: number;
  pages: number | null;
  rating: Rating;
  notes: string | null;
  teacher_name: string;
}

interface StudentSessionsTabProps {
  studentId: string;
}

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "كل الأنواع" },
  { value: "new_memorization", label: "تسميع جديد" },
  { value: "review", label: "مراجعة" },
];

export function StudentSessionsTab({ studentId }: StudentSessionsTabProps) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionType, setSessionType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (sessionType) params.set("session_type", sessionType);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);

      const data = await apiGet<SessionRow[]>(`/api/students/${studentId}/sessions?${params}`);
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "فشل تحميل الجلسات");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [studentId, sessionType, dateFrom, dateTo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSessions();
  }, [fetchSessions]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="form-label text-xs">نوع الجلسة</label>
          <select className="input-field" value={sessionType} onChange={(e) => setSessionType(e.target.value)}>
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label text-xs">من تاريخ</label>
          <input type="date" className="input-field" dir="ltr" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="form-label text-xs">إلى تاريخ</label>
          <input type="date" className="input-field" dir="ltr" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <p className="text-center py-10 text-sm text-destructive">{error}</p>
      ) : sessions.length === 0 ? (
        <p className="text-center py-10 text-sm text-muted-foreground">لا توجد جلسات مسجّلة</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary text-right">
                <th className="px-3 py-2 font-medium">التاريخ</th>
                <th className="px-3 py-2 font-medium">النوع</th>
                <th className="px-3 py-2 font-medium">السورة / الآيات</th>
                <th className="px-3 py-2 font-medium">الصفحات</th>
                <th className="px-3 py-2 font-medium">التقييم</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">المحفظ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-secondary/50">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(s.session_date).toLocaleDateString("ar-EG")}
                  </td>
                  <td className="px-3 py-2">
                    <SessionTypeBadge value={s.session_type} />
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{s.surah_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatAyahPreview(s.surah_name, s.from_ayah, s.to_ayah).replace(`سورة ${s.surah_name} `, "")}
                    </p>
                    {s.notes && <p className="text-xs text-muted-foreground mt-0.5">{s.notes}</p>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {s.pages != null ? toArabicNumerals(s.pages) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <RatingBadge value={s.rating} />
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">
                    {s.teacher_name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
