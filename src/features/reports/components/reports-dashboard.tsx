"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  BarChart3,
  Trophy,
  Loader2,
  AlertCircle,
  FileDown,
  Users,
  BookOpen,
  Calendar,
  Crown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  X,
} from "lucide-react";
import { apiGet, ApiError } from "@/lib/api-client";
import { isAdmin } from "@/features/auth/shared";
import type {
  StudentPageStats,
  HonorRollEntry,
  DashboardSummary,
} from "@/domain/report-stats";
import { GenderBadge } from "@/components/badges";

interface DashboardData {
  summary: DashboardSummary;
  honorToday: HonorRollEntry[];
  honorMonth: HonorRollEntry[];
  students: StudentPageStats[];
}

interface ReportsDashboardProps {
  role: "admin" | "teacher";
}

type ReportPeriod = "week" | "month" | "enrollment";

type SortKey =
  | "name"
  | "pagesToday"
  | "pagesWeek"
  | "pagesMonth"
  | "pagesSinceEnrollment"
  | "totalSessions"
  | "avgPagesPerSession"
  | "memorizedJuzCount";

type SortDir = "asc" | "desc";

type FilterableKey =
  | "pagesToday"
  | "pagesWeek"
  | "pagesMonth"
  | "pagesSinceEnrollment"
  | "totalSessions"
  | "avgPagesPerSession"
  | "memorizedJuzCount";

export function ReportsDashboard({ role }: ReportsDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Report generation state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState<string | null>(null);

  // Table sorting & filtering
  const [sortKey, setSortKey] = useState<SortKey>("pagesMonth");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [columnFilters, setColumnFilters] = useState<Partial<Record<FilterableKey, number>>>({});

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<DashboardData>("/api/reports/students-stats");
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "حدث خطأ ما");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDashboard();
  }, [fetchDashboard]);

  const toggleStudent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const filteredAndSorted = useMemo(() => {
    if (!data) return [];
    let result = data.students;

    // Apply column filters (show students with value >= filter)
    for (const [key, minVal] of Object.entries(columnFilters)) {
      if (minVal === undefined || minVal === null) continue;
      const k = key as FilterableKey;
      result = result.filter((s) => s[k] >= minVal);
    }

    const sorted = [...result].sort((a, b) => {
      let cmp: number;
      if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name, "ar");
      } else {
        cmp = a[sortKey] - b[sortKey];
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [data, columnFilters, sortKey, sortDir]);

  const activeFilterCount = Object.values(columnFilters).filter(Boolean).length;

  const clearFilters = () => setColumnFilters({});

  const setFilter = (key: FilterableKey, value: number | null) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (value === null || isNaN(value)) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const toggleAll = () => {
    if (!data) return;
    if (selectedIds.size === data.students.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.students.map((s) => s.studentId)));
    }
  };

  const generateReport = async () => {
    if (selectedIds.size === 0) return;
    setGenerating(true);
    setGenMessage(null);
    const ids = Array.from(selectedIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of ids) {
      try {
        const response = await fetch("/api/reports/parent-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId: id, period }),
        });

        if (!response.ok) {
          failCount++;
          continue;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const disposition = response.headers.get("Content-Disposition") ?? "";
        const starMatch = disposition.match(/filename\*=UTF-8''(.+?)(?:;|$)/);
        const plainMatch = disposition.match(/filename="(.+?)"/);
        a.download = starMatch?.[1] ? decodeURIComponent(starMatch[1]) : plainMatch?.[1] ?? `report-${id}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        successCount++;
      } catch {
        failCount++;
      }
    }

    if (failCount === 0) {
      setGenMessage(`تم إنشاء ${successCount} تقرير بنجاح`);
    } else {
      setGenMessage(`تم إنشاء ${successCount} تقرير، فشل ${failCount}`);
    }
    setGenerating(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">جاري تحميل لوحة التقارير...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-6 flex flex-col items-center text-center space-y-2 border-red-200 bg-red-50/50">
        <AlertCircle className="size-8 text-destructive" />
        <p className="text-sm font-semibold text-destructive">{error ?? "خطأ"}</p>
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

  const { summary, honorToday, honorMonth } = data;
  const basePath = isAdmin(role) ? "/admin" : "/teacher";

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={Users} value={summary.activeStudents} label="طالب نشط" color="text-primary" />
        <StatCard icon={Calendar} value={summary.sessionsToday} label="جلسة اليوم" color="text-[#854d0e]" />
        <StatCard icon={Calendar} value={summary.sessionsMonth} label="جلسة هذا الشهر" color="text-[#854d0e]" />
        <StatCard icon={BookOpen} value={summary.pagesToday} label="صفحة اليوم" color="text-[#2563eb]" />
        <StatCard icon={BookOpen} value={summary.pagesMonth} label="صفحة هذا الشهر" color="text-[#2563eb]" />
        {isAdmin(role) && (
          <StatCard icon={Users} value={summary.activeTeachers} label="محفظ نشط" color="text-[#1e40af]" />
        )}
      </div>

      {/* Honor Roll */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Today's honor roll */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <Crown className="size-4 text-[#ca8a04]" />
            <h3 className="font-semibold">لوحة الشرف — اليوم</h3>
          </div>
          {honorToday.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا يوجد حفظ اليوم</p>
          ) : (
            <ol className="space-y-2">
              {honorToday.map((entry, i) => (
                <li key={entry.studentId} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`size-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? "bg-[#facc15] text-[#854d0e]" : i === 1 ? "bg-[#e5e7eb] text-[#6b7280]" : i === 2 ? "bg-[#fed7aa] text-[#9a3412]" : "bg-secondary text-muted-foreground"
                    }`}>
                      {i + 1}
                    </span>
                    <Link href={`${basePath}/students/${entry.studentId}`} className="font-medium text-primary hover:underline truncate">
                      {entry.name}
                    </Link>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <span className="font-bold text-[#2563eb]">{entry.pages}</span>
                    <span className="text-xs text-muted-foreground">صفحة</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="font-semibold">{entry.memorizedJuzCount}</span>
                    <span className="text-xs text-muted-foreground">/30</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Month honor roll */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <Trophy className="size-4 text-primary" />
            <h3 className="font-semibold">لوحة الشرف — هذا الشهر</h3>
          </div>
          {honorMonth.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا يوجد حفظ هذا الشهر</p>
          ) : (
            <ol className="space-y-2">
              {honorMonth.map((entry, i) => (
                <li key={entry.studentId} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`size-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? "bg-[#facc15] text-[#854d0e]" : i === 1 ? "bg-[#e5e7eb] text-[#6b7280]" : i === 2 ? "bg-[#fed7aa] text-[#9a3412]" : "bg-secondary text-muted-foreground"
                    }`}>
                      {i + 1}
                    </span>
                    <Link href={`${basePath}/students/${entry.studentId}`} className="font-medium text-primary hover:underline truncate">
                      {entry.name}
                    </Link>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <span className="font-bold text-[#2563eb]">{entry.pages}</span>
                    <span className="text-xs text-muted-foreground">صفحة</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="font-semibold">{entry.memorizedJuzCount}</span>
                    <span className="text-xs text-muted-foreground">/30</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Report Generation Panel */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <FileDown className="size-4 text-primary" />
          <h3 className="font-semibold">إنشاء تقارير لأولياء الأمور</h3>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">الفترة:</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as ReportPeriod)}
              className="input-field text-sm w-auto"
            >
              <option value="week">آخر أسبوع</option>
              <option value="month">هذا الشهر</option>
              <option value="enrollment">منذ الانضمام</option>
            </select>
          </div>
          <button
            type="button"
            onClick={toggleAll}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            {selectedIds.size === data.students.length ? "إلغاء تحديد الكل" : "تحديد الكل"}
          </button>
          <button
            type="button"
            onClick={generateReport}
            disabled={selectedIds.size === 0 || generating}
            className="btn-primary text-sm gap-1.5"
          >
            {generating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileDown className="size-4" />
            )}
            إنشاء PDF ({selectedIds.size})
          </button>
          {genMessage && (
            <span className={`text-xs ${genMessage.includes("فشل") ? "text-destructive" : "text-[#16a34a]"}`}>
              {genMessage}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          اختر الطلاب من الجدول أدناه ثم اختر الفترة واضغط لإنشاء تقرير PDF لكل طالب
        </p>
      </div>

      {/* Students Table */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <BarChart3 className="size-4 text-primary" />
          <h3 className="font-semibold">إحصائيات الطلاب ({filteredAndSorted.length})</h3>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          <FilterInput label="صفحات اليوم" filterKey="pagesToday" value={columnFilters.pagesToday ?? null} onChange={setFilter} />
          <FilterInput label="صفحات الأسبوع" filterKey="pagesWeek" value={columnFilters.pagesWeek ?? null} onChange={setFilter} />
          <FilterInput label="صفحات الشهر" filterKey="pagesMonth" value={columnFilters.pagesMonth ?? null} onChange={setFilter} />
          <FilterInput label="منذ الانضمام" filterKey="pagesSinceEnrollment" value={columnFilters.pagesSinceEnrollment ?? null} onChange={setFilter} />
          <FilterInput label="عدد الجلسات" filterKey="totalSessions" value={columnFilters.totalSessions ?? null} onChange={setFilter} />
          <FilterInput label="الأجزاء" filterKey="memorizedJuzCount" value={columnFilters.memorizedJuzCount ?? null} onChange={setFilter} />
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="btn-secondary text-xs px-2 py-1 gap-1"
            >
              <X className="size-3" />
              مسح الفلاتر ({activeFilterCount})
            </button>
          )}
        </div>

        {/* Desktop/tablet: table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary text-right">
                <th className="px-3 py-2 font-medium w-8">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === data.students.length && data.students.length > 0}
                    onChange={toggleAll}
                    className="cursor-pointer"
                  />
                </th>
                <SortableTh label="الطالب" sortKey="name" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="صفحات اليوم" sortKey="pagesToday" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} center />
                <SortableTh label="صفحات الأسبوع" sortKey="pagesWeek" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} center />
                <SortableTh label="صفحات الشهر" sortKey="pagesMonth" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} center />
                <SortableTh label="منذ الانضمام" sortKey="pagesSinceEnrollment" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} center />
                <SortableTh label="عدد الجلسات" sortKey="totalSessions" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} center />
                <SortableTh label="متوسط الصفحات/جلسة" sortKey="avgPagesPerSession" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} center />
                <SortableTh label="الأجزاء" sortKey="memorizedJuzCount" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} center />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredAndSorted.map((s) => (
                <tr key={s.studentId} className="hover:bg-secondary/50 transition-colors">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.studentId)}
                      onChange={() => toggleStudent(s.studentId)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`${basePath}/students/${s.studentId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {s.name}
                      </Link>
                      <GenderBadge value={s.gender as "male" | "female"} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center font-semibold text-[#2563eb]">
                    {s.pagesToday > 0 ? s.pagesToday : "—"}
                  </td>
                  <td className="px-3 py-2 text-center font-semibold">
                    {s.pagesWeek > 0 ? s.pagesWeek : "—"}
                  </td>
                  <td className="px-3 py-2 text-center font-semibold">
                    {s.pagesMonth > 0 ? s.pagesMonth : "—"}
                  </td>
                  <td className="px-3 py-2 text-center font-semibold">
                    {s.pagesSinceEnrollment > 0 ? s.pagesSinceEnrollment : "—"}
                  </td>
                  <td className="px-3 py-2 text-center font-semibold">
                    {s.totalSessions > 0 ? s.totalSessions : "—"}
                  </td>
                  <td className="px-3 py-2 text-center font-semibold">
                    {s.avgPagesPerSession > 0 ? s.avgPagesPerSession.toFixed(1) : "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="font-bold">{s.memorizedJuzCount}</span>
                    <span className="text-muted-foreground">/30</span>
                    {s.ijazaJuzCount > 0 && (
                      <span className="text-[#16a34a] text-xs mr-1">({s.ijazaJuzCount}✓)</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredAndSorted.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                    لا يوجد طلاب مطابقون
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile: card view */}
        <div className="sm:hidden space-y-2.5">
          {filteredAndSorted.map((s) => (
            <div key={s.studentId} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(s.studentId)}
                    onChange={() => toggleStudent(s.studentId)}
                    className="cursor-pointer"
                  />
                  <Link
                    href={`${basePath}/students/${s.studentId}`}
                    className="font-medium text-primary truncate text-sm"
                  >
                    {s.name}
                  </Link>
                  <GenderBadge value={s.gender as "male" | "female"} />
                </div>
                <div className="text-xs">
                  <span className="font-bold">{s.memorizedJuzCount}</span>
                  <span className="text-muted-foreground">/30</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <p className="text-muted-foreground">اليوم</p>
                  <p className="font-semibold text-[#2563eb]">{s.pagesToday > 0 ? s.pagesToday : "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">الأسبوع</p>
                  <p className="font-semibold">{s.pagesWeek > 0 ? s.pagesWeek : "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">الشهر</p>
                  <p className="font-semibold">{s.pagesMonth > 0 ? s.pagesMonth : "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">الكل</p>
                  <p className="font-semibold">{s.pagesSinceEnrollment > 0 ? s.pagesSinceEnrollment : "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">الجلسات</p>
                  <p className="font-semibold">{s.totalSessions > 0 ? s.totalSessions : "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">متوسط/جلسة</p>
                  <p className="font-semibold">{s.avgPagesPerSession > 0 ? s.avgPagesPerSession.toFixed(1) : "—"}</p>
                </div>
              </div>
            </div>
          ))}
          {filteredAndSorted.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">لا يوجد طلاب مطابقون</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SortableTh({
  label,
  sortKey,
  currentSort,
  sortDir,
  onSort,
  center,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  center?: boolean;
}) {
  const isActive = currentSort === sortKey;
  return (
    <th
      className={`px-3 py-2 font-medium ${center ? "text-center" : ""} cursor-pointer select-none hover:bg-secondary/80 transition-colors`}
      onClick={() => onSort(sortKey)}
    >
      <span className={`inline-flex items-center gap-1 ${center ? "justify-center" : ""}`}>
        {label}
        {isActive ? (
          sortDir === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-30" />
        )}
      </span>
    </th>
  );
}

function FilterInput({
  label,
  filterKey,
  value,
  onChange,
}: {
  label: string;
  filterKey: FilterableKey;
  value: number | null;
  onChange: (key: FilterableKey, value: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm">
      <span className="text-muted-foreground whitespace-nowrap">{label}</span>
      <input
        type="number"
        min={0}
        placeholder="0+"
        value={value ?? ""}
        onChange={(e) => {
          const val = e.target.value === "" ? null : parseFloat(e.target.value);
          onChange(filterKey, val);
        }}
        className="w-16 bg-transparent text-sm outline-none"
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: typeof Users;
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="card text-center space-y-1">
      <Icon className={`size-5 mx-auto ${color} opacity-70`} />
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
