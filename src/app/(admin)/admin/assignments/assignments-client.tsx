"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Search, Loader2 } from "lucide-react";
import { GenderBadge } from "@/components/badges";
import { apiPost, ApiError } from "@/lib/api-client";

interface Teacher {
  id: string;
  name: string;
  gender: string;
  can_view_all_genders: boolean;
}

interface StudentAssignment {
  id: string;
  teacher_id: string;
  name: string;
  start_date: string;
}

interface StudentWithAssignments {
  id: string;
  name: string;
  gender: string;
  memorized_juz_count: number;
  status: string;
  assignments: StudentAssignment[];
}

interface AssignmentsClientProps {
  students: StudentWithAssignments[];
  teachers: Teacher[];
}

export function AssignmentsClient({ students, teachers }: AssignmentsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Modal / Selection state
  const [selectedStudent, setSelectedStudent] = useState<StudentWithAssignments | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");

  const filteredStudents = students.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !selectedTeacherId) return;

    setError(null);
    startTransition(async () => {
      try {
        await apiPost("/api/assignments", {
          student_id: selectedStudent.id,
          teacher_id: selectedTeacherId,
        });

        setSelectedStudent(null);
        setSelectedTeacherId("");
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "حدث خطأ");
      }
    });
  };

  const handleRemoveAssignment = (assignmentId: string) => {
    if (!confirm("هل أنت متأكد من إزالة هذا المحفظ؟")) return;

    setError(null);
    startTransition(async () => {
      try {
        await apiPost(`/api/assignments/${assignmentId}/end`);

        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "حدث خطأ");
      }
    });
  };

  // Get eligible teachers for a student based on gender scoping
  const getEligibleTeachers = (student: StudentWithAssignments) => {
    return teachers.filter((t) => {
      // Must not already be assigned
      const isAlreadyAssigned = student.assignments.some((a) => a.teacher_id === t.id);
      if (isAlreadyAssigned) return false;

      // Gender check
      if (t.can_view_all_genders) return true;
      return t.gender === student.gender;
    });
  };

  return (
    <div className="space-y-4">
      {/* Search box */}
      <div className="card max-w-md p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input-field !ps-9"
            placeholder="بحث عن طالب…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive font-medium">
          {error}
        </div>
      )}

      {/* Students list with teacher chips */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary text-right">
              <th className="px-4 py-3 font-medium">اسم الطالب</th>
              <th className="px-4 py-3 font-medium">الجنس</th>
              <th className="px-4 py-3 font-medium">المحفظون الحاليون</th>
              <th className="px-4 py-3 font-medium text-center">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  لا توجد نتائج بحث
                </td>
              </tr>
            ) : (
              filteredStudents.map((s) => (
                <tr key={s.id} className="hover:bg-secondary/50 transition-colors">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3">
                    <GenderBadge value={s.gender as "male" | "female"} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {s.assignments.length === 0 ? (
                        <span className="text-xs text-muted-foreground">لا يوجد محفظ مسند</span>
                      ) : (
                        s.assignments.map((a) => (
                          <span
                            key={a.id}
                            className="inline-flex items-center gap-1 rounded-full bg-secondary border border-border px-2.5 py-0.5 text-xs font-medium text-foreground"
                          >
                            {a.name}
                            <button
                              type="button"
                              onClick={() => handleRemoveAssignment(a.id)}
                              className="mr-1 rounded-full p-0.5 hover:bg-border text-muted-foreground hover:text-foreground transition-colors"
                              title="إزالة المحفظ"
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => setSelectedStudent(s)}
                      className="btn-secondary py-1 px-2.5 text-xs gap-1"
                    >
                      <Plus className="size-3" />
                      إسناد محفظ
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Assign Teacher Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-md space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="font-bold text-base">إسناد محفظ جديد</h3>
              <button
                type="button"
                onClick={() => {
                  setSelectedStudent(null);
                  setSelectedTeacherId("");
                }}
                className="rounded-full p-1 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleAddAssignment} className="space-y-4">
              <div>
                <span className="text-xs text-muted-foreground block mb-1">اسم الطالب</span>
                <p className="font-medium text-sm">{selectedStudent.name}</p>
              </div>

              <div>
                <label className="form-label">
                  اختر المحفظ <span className="required-star">*</span>
                </label>
                <select
                  className="input-field"
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  required
                >
                  <option value="">-- اختر محفظاً --</option>
                  {getEligibleTeachers(selectedStudent).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.gender === "male" ? "ذكور" : "إناث"}
                      {t.can_view_all_genders ? " · رؤية الجنسين" : ""})
                    </option>
                  ))}
                </select>
                {getEligibleTeachers(selectedStudent).length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    لا يوجد محفظون مؤهلون متاحون لهذا الطالب (قد يكون جميع المحفظين المتاحين مسندين بالفعل أو من جنس مختلف).
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStudent(null);
                    setSelectedTeacherId("");
                  }}
                  className="btn-secondary"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isPending || !selectedTeacherId}
                >
                  {isPending && <Loader2 className="size-4 animate-spin" />}
                  إسناد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
