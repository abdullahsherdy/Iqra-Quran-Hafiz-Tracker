import { requireRole } from "@/features/auth/session";
import { getDb } from "@/db/client";
import { studentsTable, initialMemorizationTable } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EditStudentForm } from "./edit-student-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const db = getDb();
  if (!db) return { title: "تعديل الطالب" };
  const [row] = await db.select({ name: studentsTable.name }).from(studentsTable).where(eq(studentsTable.id, id)).limit(1);
  return { title: `تعديل: ${row?.name ?? "الطالب"} | اقرأ` };
}

export default async function EditStudentPage({ params }: PageProps) {
  await requireRole("admin");
  const { id } = await params;

  const db = getDb();
  if (!db) return notFound();

  const [student] = await db
    .select({
      id: studentsTable.id,
      name: studentsTable.name,
      gender: studentsTable.gender,
      birth_date: studentsTable.birth_date,
      guardian_name: studentsTable.guardian_name,
      guardian_phone: studentsTable.guardian_phone,
      enrollment_date: studentsTable.enrollment_date,
      notes: studentsTable.notes,
      status: studentsTable.status,
      memorized_juz_count: studentsTable.memorized_juz_count,
    })
    .from(studentsTable)
    .where(eq(studentsTable.id, id))
    .limit(1);

  if (!student) return notFound();

  const initMem = await db
    .select({
      juz_number: initialMemorizationTable.juz_number,
      status: initialMemorizationTable.status,
      sheikh_name: initialMemorizationTable.sheikh_name,
      pages: initialMemorizationTable.pages,
    })
    .from(initialMemorizationTable)
    .where(eq(initialMemorizationTable.student_id, id))
    .orderBy(asc(initialMemorizationTable.juz_number));

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/admin/students/${id}`} className="btn-secondary px-2 py-1.5 text-xs">
          <ArrowRight className="size-4" />
        </Link>
        <div>
          <h2 className="text-xl font-bold">تعديل بيانات الطالب</h2>
          <p className="text-sm text-muted-foreground">{student.name}</p>
        </div>
      </div>

      <EditStudentForm
        student={student}
        initialMem={initMem.map((r) => ({
          juz_number: r.juz_number,
          status: r.status as "memorized" | "with_ijaza",
          sheikh_name: r.sheikh_name ?? undefined,
          pages: r.pages,
        }))}
        redirectBase={`/admin/students/${id}`}
        mode="admin"
      />
    </div>
  );
}
