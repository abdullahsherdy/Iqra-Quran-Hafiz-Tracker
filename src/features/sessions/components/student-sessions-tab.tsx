"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Trash2, Pencil } from "lucide-react";
import {
  RatingBadge,
  SessionTypeBadge,
  type SessionType,
  type Rating,
} from "@/components/badges";
import { formatAyahPreview, toArabicNumerals } from "@/lib/arabic";
import { apiGet, apiDelete, ApiError } from "@/lib/api-client";
import {
  SessionForm,
  type StudentOption,
  type SurahOption,
  type SessionInitialData,
} from "@/features/sessions/components/session-form";

interface SessionItem {
  id: string;
  session_type: SessionType;
  surah_id: number;
  from_ayah: number;
  to_ayah: number;
  rating: Rating;
  pages: number | null;
  notes: string | null;
  surah_name: string;
}

interface SessionRow {
  id: string;
  session_date: string;
  overall_rating: Rating;
  notes: string | null;
  teacher_name: string;
  items: SessionItem[];
}

interface AttendanceStats {
  total: number;
  thisMonth: number;
}

interface StudentSessionsTabProps {
  studentId: string;
  studentName?: string;
}

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "كل الأنواع" },
  { value: "new_memorization", label: "تسميع جديد" },
  { value: "review", label: "مراجعة" },
];

export function StudentSessionsTab({ studentId, studentName }: StudentSessionsTabProps) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionType, setSessionType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<SessionRow | null>(null);
  const [surahs, setSurahs] = useState<SurahOption[]>([]);
  const [surahsLoading, setSurahsLoading] = useState(false);
  const [attendanceStats, setAttendanceStats] = useState<AttendanceStats | null>(null);

  const fetchAttendanceStats = useCallback(async () => {
    try {
      const data = await apiGet<{ stats: AttendanceStats }>(`/api/students/${studentId}/attendance`);
      setAttendanceStats(data.stats ?? null);
    } catch {
      // Attendance stats are non-critical — silently ignore
      setAttendanceStats(null);
    }
  }, [studentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAttendanceStats();
  }, [fetchAttendanceStats]);

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

  const ensureSurahs = useCallback(async () => {
    if (surahs.length > 0 || surahsLoading) return;
    setSurahsLoading(true);
    try {
      const data = await apiGet<SurahOption[]>("/api/surahs");
      setSurahs(Array.isArray(data) ? data : []);
    } catch {
      // Surahs fetch failed — edit form will handle gracefully
    } finally {
      setSurahsLoading(false);
    }
  }, [surahs.length, surahsLoading]);

  const handleEdit = async (session: SessionRow) => {
    await ensureSurahs();
    setEditingSession(session);
  };

  const handleCancelEdit = () => {
    setEditingSession(null);
  };

  const handleEdited = () => {
    setEditingSession(null);
    fetchSessions();
    fetchAttendanceStats();
  };

  const handleDelete = async (sessionId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه الجلسة؟")) return;
    setDeletingId(sessionId);
    try {
      await apiDelete(`/api/sessions/${sessionId}`);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      fetchAttendanceStats();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "فشل حذف الجلسة");
    } finally {
      setDeletingId(null);
    }
  };

  // Build initial data for edit form from the session row
  const buildInitialData = (session: SessionRow): SessionInitialData => ({
    student_id: studentId,
    session_date: session.session_date,
    overall_rating: session.overall_rating,
    notes: session.notes,
    items: session.items.map((item) => ({
      id: item.id,
      session_type: item.session_type,
      surah_id: item.surah_id,
      from_ayah: item.from_ayah,
      to_ayah: item.to_ayah,
      rating: item.rating,
      pages: item.pages,
      notes: item.notes,
    })),
  });

  const students: StudentOption[] = studentName
    ? [{ id: studentId, name: studentName }]
    : [];

  return (
    <div className="space-y-4">
      {/* Edit form (inline, shown when editing) */}
      {editingSession && surahs.length > 0 && (
        <SessionForm
          students={students}
          surahs={surahs}
          editSessionId={editingSession.id}
          initialData={buildInitialData(editingSession)}
          onCancelEdit={handleCancelEdit}
          onEdited={handleEdited}
        />
      )}
      {editingSession && surahsLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      )}

      {/* Attendance stats: total + this month */}
      {attendanceStats && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-secondary p-3 text-center">
            <p className="text-2xl font-bold text-primary">{toArabicNumerals(attendanceStats.total)}</p>
            <p className="text-xs text-muted-foreground">إجمالي الحضور</p>
          </div>
          <div className="rounded-lg border border-border bg-secondary p-3 text-center">
            <p className="text-2xl font-bold text-[#16a34a]">{toArabicNumerals(attendanceStats.thisMonth)}</p>
            <p className="text-xs text-muted-foreground">حضور هذا الشهر</p>
          </div>
        </div>
      )}

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
        <div className="space-y-3">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`rounded-lg border border-border overflow-hidden transition-opacity ${
                editingSession?.id === s.id ? "opacity-50" : ""
              }`}
            >
              {/* Session header */}
              <div className="flex items-center justify-between gap-2 p-3 bg-secondary/30">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(s.session_date).toLocaleDateString("ar-EG")}
                  </span>
                  <RatingBadge value={s.overall_rating} />
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    · {s.teacher_name}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEdit(s)}
                    disabled={!!editingSession}
                    className="text-primary hover:bg-primary/10 rounded p-1.5 transition-colors disabled:opacity-50"
                    title="تعديل الجلسة"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(s.id)}
                    disabled={deletingId === s.id || !!editingSession}
                    className="text-destructive hover:bg-destructive/10 rounded p-1.5 transition-colors disabled:opacity-50"
                    title="حذف الجلسة"
                  >
                    {deletingId === s.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Session notes */}
              {s.notes && (
                <p className="px-3 pt-2 text-xs text-muted-foreground bg-secondary/10">
                  {s.notes}
                </p>
              )}

              {/* Items */}
              <div className="divide-y divide-border">
                {s.items.map((item, idx) => (
                  <div key={item.id} className="p-3 flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="size-5 shrink-0 rounded-full bg-secondary text-muted-foreground flex items-center justify-center text-[10px] font-bold">
                          {toArabicNumerals(idx + 1)}
                        </span>
                        <SessionTypeBadge value={item.session_type} />
                        <span className="font-medium text-sm">{item.surah_name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground pr-7">
                        {formatAyahPreview(item.surah_name, item.from_ayah, item.to_ayah).replace(`سورة ${item.surah_name} `, "")}
                        {item.pages != null && ` · ${toArabicNumerals(item.pages)} صفحة`}
                      </p>
                      {item.notes && (
                        <p className="text-xs text-muted-foreground pr-7 bg-secondary/30 rounded p-1.5">
                          {item.notes}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0">
                      <RatingBadge value={item.rating} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}