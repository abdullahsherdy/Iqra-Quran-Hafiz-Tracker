"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { AttendanceBadge, type AttendanceStatus } from "@/components/badges";
import { toArabicNumerals } from "@/lib/arabic";
import { apiGet, apiPost, apiDelete, ApiError } from "@/lib/api-client";

interface AttendanceRow {
  id: string;
  attendance_date: string;
  status: AttendanceStatus;
  notes: string | null;
  recorded_manually: boolean;
  teacher_name: string;
}

interface AttendanceStats {
  total: number;
  present: number;
  absent: number;
  excused: number;
  holiday: number;
  attendanceRate: number | null;
}

interface StudentAttendanceTabProps {
  studentId: string;
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "حاضر" },
  { value: "absent", label: "غائب" },
  { value: "excused", label: "غياب بعذر" },
  { value: "holiday", label: "إجازة" },
];

export function StudentAttendanceTab({ studentId }: StudentAttendanceTabProps) {
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Manual entry form state
  const [showForm, setShowForm] = useState(false);
  const [entryDate, setEntryDate] = useState("");
  const [entryStatus, setEntryStatus] = useState<AttendanceStatus>("excused");
  const [entryNotes, setEntryNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);

      const data = await apiGet<{ records: AttendanceRow[]; stats: AttendanceStats }>(
        `/api/students/${studentId}/attendance?${params}`,
      );
      setRecords(data.records ?? []);
      setStats(data.stats ?? null);
    } catch {
      setRecords([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [studentId, dateFrom, dateTo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAttendance();
  }, [fetchAttendance]);

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryDate) {
      setFormError("التاريخ مطلوب");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await apiPost(`/api/students/${studentId}/attendance`, {
        attendance_date: entryDate,
        status: entryStatus,
        notes: entryNotes || null,
      });
      setShowForm(false);
      setEntryDate("");
      setEntryNotes("");
      setEntryStatus("excused");
      await fetchAttendance();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (date: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا السجل؟")) return;
    try {
      await apiDelete(`/api/students/${studentId}/attendance?date=${date}`);
      await fetchAttendance();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "حدث خطأ");
    }
  };

  return (
    <div className="space-y-4">
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-secondary p-3 text-center">
            <p className="text-2xl font-bold text-primary">
              {stats.attendanceRate !== null ? `${toArabicNumerals(stats.attendanceRate)}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">نسبة الحضور</p>
          </div>
          <div className="rounded-lg border border-border bg-secondary p-3 text-center">
            <p className="text-2xl font-bold">{toArabicNumerals(stats.present)}</p>
            <p className="text-xs text-muted-foreground">حاضر</p>
          </div>
          <div className="rounded-lg border border-border bg-secondary p-3 text-center">
            <p className="text-2xl font-bold">{toArabicNumerals(stats.absent)}</p>
            <p className="text-xs text-muted-foreground">غائب</p>
          </div>
          <div className="rounded-lg border border-border bg-secondary p-3 text-center">
            <p className="text-2xl font-bold">{toArabicNumerals(stats.excused + stats.holiday)}</p>
            <p className="text-xs text-muted-foreground">بعذر/إجازة</p>
          </div>
        </div>
      )}

      {/* Manual entry button + form */}
      <div className="flex justify-end">
        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="btn-secondary py-1.5 px-3 text-xs gap-1.5"
          >
            <Plus className="size-3.5" />
            إضافة سجل يدوي
          </button>
        ) : (
          <div className="card w-full space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">إضافة سجل حضور يدوي</h4>
              <button
                type="button"
                onClick={() => { setShowForm(false); setFormError(null); }}
                className="rounded-full p-1 hover:bg-secondary text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={handleAddEntry} className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="form-label text-xs">التاريخ</label>
                <input
                  type="date"
                  className="input-field"
                  dir="ltr"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="form-label text-xs">الحالة</label>
                <select
                  className="input-field"
                  value={entryStatus}
                  onChange={(e) => setEntryStatus(e.target.value as AttendanceStatus)}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label text-xs">ملاحظات</label>
                <input
                  type="text"
                  className="input-field"
                  value={entryNotes}
                  onChange={(e) => setEntryNotes(e.target.value)}
                  placeholder="اختياري"
                />
              </div>
              {formError && (
                <p className="text-xs text-destructive sm:col-span-3">{formError}</p>
              )}
              <div className="sm:col-span-3 flex justify-end">
                <button type="submit" disabled={saving} className="btn-primary py-1.5 px-4 text-xs">
                  {saving ? <Loader2 className="size-4 animate-spin" /> : "حفظ"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
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
      ) : records.length === 0 ? (
        <p className="text-center py-10 text-sm text-muted-foreground">لا يوجد سجل حضور</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary text-right">
                <th className="px-3 py-2 font-medium">التاريخ</th>
                <th className="px-3 py-2 font-medium">الحالة</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">المحفظ</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">ملاحظات</th>
                <th className="px-3 py-2 font-medium text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-secondary/50">
                  <td className="px-3 py-2">
                    {new Date(r.attendance_date).toLocaleDateString("ar-EG")}
                  </td>
                  <td className="px-3 py-2">
                    <AttendanceBadge value={r.status} />
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">
                    {r.teacher_name}
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">
                    {r.notes ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.recorded_manually ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteEntry(r.attendance_date)}
                        className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="حذف السجل اليدوي"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">تلقائي</span>
                    )}
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
