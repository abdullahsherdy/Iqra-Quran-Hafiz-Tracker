"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { AttendanceBadge, type AttendanceStatus } from "@/components/badges";
import { toArabicNumerals } from "@/lib/arabic";

interface AttendanceRow {
  id: string;
  attendance_date: string;
  status: AttendanceStatus;
  notes: string | null;
  teacher_name: string;
}

interface AttendanceStats {
  total: number;
  present: number;
  absent: number;
  attendanceRate: number | null;
}

interface StudentAttendanceTabProps {
  studentId: string;
}

export function StudentAttendanceTab({ studentId }: StudentAttendanceTabProps) {
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);

      const res = await fetch(`/api/students/${studentId}/attendance?${params}`);
      const data = await res.json();
      setRecords(data.records ?? []);
      setStats(data.stats ?? null);
    } finally {
      setLoading(false);
    }
  }, [studentId, dateFrom, dateTo]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  return (
    <div className="space-y-4">
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
        </div>
      )}

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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
