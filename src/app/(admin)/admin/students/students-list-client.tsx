"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, ChevronRight, ChevronLeft, Users } from "lucide-react";
import { GenderBadge, StudentStatusBadge, type StudentStatus } from "@/components/badges";
import { LevelBadge } from "@/features/students/components/level-badge";
import { apiGet } from "@/lib/api-client";

interface Teacher {
  id: string;
  name: string;
  gender: string;
}

interface Student {
  id: string;
  name: string;
  gender: string;
  birth_date?: string;
  memorized_juz_count: number;
  ijaza_juz_count: number;
  last_session_date?: string;
  status: StudentStatus;
  level: { level: string; label: string };
  guardian_name: string;
}

interface StudentsListClientProps {
  teachers: Teacher[];
  role: "admin" | "teacher";
  basePath?: string;
}

const LEVELS = [
  { value: "", label: "كل المستويات" },
  { value: "beginner", label: "مبتدئ" },
  { value: "intermediate", label: "متوسط" },
  { value: "advanced", label: "متقدم" },
  { value: "completed", label: "خاتم" },
];

const SORT_OPTIONS = [
  { value: "name", label: "الاسم" },
  { value: "memorized_juz_count", label: "الأجزاء" },
  { value: "last_session_date", label: "آخر جلسة" },
  { value: "enrollment_date", label: "تاريخ الانضمام" },
  { value: "age", label: "العمر" },
];

export function StudentsListClient({ teachers, role, basePath }: StudentsListClientProps) {
  const base = basePath ?? (role === "admin" ? "/admin/students" : "/teacher/students");

  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  // Filter state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [gender, setGender] = useState("");
  const [level, setLevel] = useState("");
  const [statusFilter, setStatusFilter] = useState<StudentStatus | "">( "active");
  const [hasIjaza, setHasIjaza] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [minJuz, setMinJuz] = useState("");
  const [maxJuz, setMaxJuz] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [lastActivity, setLastActivity] = useState("");

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (gender) params.set("gender", gender);
      if (level) params.set("level", level);
      if (statusFilter) params.set("status", statusFilter);
      if (hasIjaza) params.set("has_ijaza", hasIjaza);
      if (teacherId && role === "admin") params.set("teacher_id", teacherId);
      if (minJuz) params.set("min_juz", minJuz);
      if (maxJuz) params.set("max_juz", maxJuz);
      if (ageMin) params.set("age_min", ageMin);
      if (ageMax) params.set("age_max", ageMax);
      if (lastActivity) params.set("last_activity", lastActivity);
      params.set("sort_by", sortBy);
      params.set("page", String(page));

      const data = await apiGet<{ data: Student[]; count: number }>(`/api/students?${params}`);
      setStudents(data.data ?? []);
      setTotal(data.count ?? 0);
    } catch {
      setStudents([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, gender, level, statusFilter, hasIjaza, teacherId, minJuz, maxJuz, ageMin, ageMax, lastActivity, sortBy, page, role]);

  useEffect(() => {
    // Reset to page 1 when filters change. This is a legitimate state
    // synchronization effect — we need page to reset before the fetch effect runs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [debouncedSearch, gender, level, statusFilter, hasIjaza, teacherId, minJuz, maxJuz, ageMin, ageMax, lastActivity, sortBy]);

  useEffect(() => {
    // Data-fetching effect: fetchStudents calls setState internally.
    // Standard React data-fetching pattern — disable set-state-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStudents();
  }, [fetchStudents]);

  const totalPages = Math.ceil(total / 25);

  return (
    <div className="space-y-4">
      {/* Search + filter bar */}
      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input-field !ps-9"
            placeholder="بحث عن طالب أو ولي أمر…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <select
            className="input-field max-w-[140px]"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary gap-1.5"
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal className="size-4" />
            فلترة
          </button>
        </div>
      </div>

      {/* Filter panels */}
      {showFilters && (
        <div className="card grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          <div>
            <label className="form-label">الجنس</label>
            <select className="input-field" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">الكل</option>
              <option value="male">ذكر</option>
              <option value="female">أنثى</option>
            </select>
          </div>
          <div>
            <label className="form-label">المستوى</label>
            <select className="input-field" value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">الحالة</label>
            <select className="input-field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StudentStatus | "")}>
              <option value="">الكل</option>
              <option value="active">نشط</option>
              <option value="paused">موقوف مؤقتاً</option>
              <option value="graduated">خريج</option>
              <option value="withdrawn">منسحب</option>
            </select>
          </div>
          <div>
            <label className="form-label">الإجازة</label>
            <select className="input-field" value={hasIjaza} onChange={(e) => setHasIjaza(e.target.value)}>
              <option value="">الكل</option>
              <option value="true">حاصل على إجازة</option>
              <option value="false">بدون إجازة</option>
            </select>
          </div>
          {role === "admin" && (
            <div>
              <label className="form-label">المحفظ</label>
              <select className="input-field" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">الكل</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="form-label">عدد الأجزاء (من)</label>
            <input
              type="number"
              min={0}
              max={30}
              className="input-field"
              value={minJuz}
              onChange={(e) => setMinJuz(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="form-label">عدد الأجزاء (إلى)</label>
            <input
              type="number"
              min={0}
              max={30}
              className="input-field"
              value={maxJuz}
              onChange={(e) => setMaxJuz(e.target.value)}
              placeholder="30"
            />
          </div>
          <div>
            <label className="form-label">العمر (من)</label>
            <input
              type="number"
              min={0}
              className="input-field"
              value={ageMin}
              onChange={(e) => setAgeMin(e.target.value)}
              placeholder="مثال: 8"
            />
          </div>
          <div>
            <label className="form-label">العمر (إلى)</label>
            <input
              type="number"
              min={0}
              className="input-field"
              value={ageMax}
              onChange={(e) => setAgeMax(e.target.value)}
              placeholder="مثال: 15"
            />
          </div>
          <div>
            <label className="form-label">آخر نشاط</label>
            <select className="input-field" value={lastActivity} onChange={(e) => setLastActivity(e.target.value)}>
              <option value="">الكل</option>
              <option value="7">نشط خلال 7 أيام</option>
              <option value="30">نشط خلال 30 يوماً</option>
              <option value="inactive">غير نشط (أكثر من 30 يوماً)</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => {
                setGender(""); setLevel(""); setStatusFilter("active");
                setHasIjaza(""); setTeacherId("");
                setMinJuz(""); setMaxJuz("");
                setAgeMin(""); setAgeMax("");
                setLastActivity("");
              }}
            >
              إعادة ضبط
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="card flex items-center justify-center py-16">
          <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : students.length === 0 ? (
        <div className="card flex flex-col items-center gap-4 py-16 text-center">
          <Users className="size-12 text-muted-foreground opacity-40" />
          <p className="font-medium text-muted-foreground">لا يوجد طلاب</p>
          <Link href={`${base}/new`} className="btn-primary">
            إضافة أول طالب
          </Link>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {total} نتيجة — صفحة {page} من {totalPages}
          </p>
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary text-right">
                  <th className="px-4 py-3 font-medium">الطالب</th>
                  <th className="px-4 py-3 font-medium">الجنس</th>
                  <th className="px-4 py-3 font-medium">المستوى</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">الأجزاء</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">آخر جلسة</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-secondary/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`${base}/${s.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {s.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{s.guardian_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <GenderBadge value={s.gender as "male" | "female"} />
                    </td>
                    <td className="px-4 py-3">
                      <LevelBadge memorizedJuzCount={s.memorized_juz_count} />
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <span className="font-medium">{s.memorized_juz_count}</span>
                      <span className="text-muted-foreground">/30</span>
                      {s.ijaza_juz_count > 0 && (
                        <span className="mr-2 text-xs text-[#16a34a]">({s.ijaza_juz_count} إجازة)</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {s.last_session_date
                        ? new Date(s.last_session_date).toLocaleDateString("ar-EG")
                        : "—"}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <StudentStatusBadge value={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                className="btn-secondary px-2.5 py-1.5"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronRight className="size-4" />
              </button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className="btn-secondary px-2.5 py-1.5"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronLeft className="size-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
