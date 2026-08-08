import { requireRole } from "@/features/auth/session";
import { getDb } from "@/db/client";
import { ijazatTable, studentsTable } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { Award, Plus, BookOpen } from "lucide-react";
import { GrantIjazaForm } from "@/features/ijazat/components/grant-ijaza-form";
import { AdminIjazatTable } from "@/features/ijazat/components/admin-ijazat-table";

export const metadata = { title: "إدارة الإجازات | اقرأ" };

interface PageProps {
  searchParams: Promise<{ grant_for?: string }>;
}

export default async function AdminIjazatPage({ searchParams }: PageProps) {
  await requireRole("admin");
  const { grant_for: grantForId } = await searchParams;

  const db = getDb();
  if (!db) {
    return <div className="text-destructive p-4">خطأ في الاتصال بالخادم</div>;
  }

  // Fetch all ijazat with student info, sorted newest first
  const ijazatRows = await db
    .select({
      id: ijazatTable.id,
      ijaza_type: ijazatTable.ijaza_type,
      juz_number: ijazatTable.juz_number,
      sheikh_name: ijazatTable.sheikh_name,
      ijaza_date: ijazatTable.ijaza_date,
      notes: ijazatTable.notes,
      created_at: ijazatTable.created_at,
      student_id: studentsTable.id,
      student_name: studentsTable.name,
      student_gender: studentsTable.gender,
    })
    .from(ijazatTable)
    .leftJoin(studentsTable, eq(ijazatTable.student_id, studentsTable.id))
    .orderBy(desc(ijazatTable.ijaza_date));

  // Map to the shape expected by AdminIjazatTable (nested students object)
  const allIjazat = ijazatRows.map((r) => ({
    id: r.id,
    ijaza_type: r.ijaza_type as "juz" | "full_quran",
    juz_number: r.juz_number,
    sheikh_name: r.sheikh_name,
    ijaza_date: r.ijaza_date,
    notes: r.notes,
    created_at: r.created_at ? r.created_at.toISOString() : "",
    students: r.student_id ? { id: r.student_id, name: r.student_name ?? "", gender: r.student_gender ?? "" } : null,
  }));

  // Fetch all active students for the grant form
  const students = await db
    .select({
      id: studentsTable.id,
      name: studentsTable.name,
    })
    .from(studentsTable)
    .where(eq(studentsTable.status, "active"))
    .orderBy(asc(studentsTable.name));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Award className="size-6 text-amber-500" />
            إدارة الإجازات
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            منح وإلغاء إجازات الطلاب — المجموع: {allIjazat.length} إجازة
          </p>
        </div>
      </div>

      {/* 1. Grant new ijaza form (full width, constrained on large screens) */}
      <section className="mx-auto w-full max-w-2xl">
        <h3 className="font-semibold text-base border-b border-border pb-2 mb-4 flex items-center gap-2">
          <Plus className="size-4" />
          منح إجازة جديدة
        </h3>
        <GrantIjazaForm
          students={students}
          preselectedStudentId={grantForId}
          redirectTo={
            grantForId
              ? `/admin/students/${grantForId}`
              : "/admin/ijazat"
          }
        />
      </section>

      {/* 2. Ijazat log (full record table) */}
      <section className="space-y-4">
        <h3 className="font-semibold text-base border-b border-border pb-2 flex items-center gap-2">
          <BookOpen className="size-4" />
          سجل الإجازات
        </h3>
        <AdminIjazatTable ijazat={allIjazat} />
      </section>
    </div>
  );
}
