import { requireRole } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EditStudentForm } from "./edit-student-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  if (!admin) return { title: "تعديل الطالب" };
  const { data } = await admin.from("students").select("name").eq("id", id).maybeSingle();
  return { title: `تعديل: ${data?.name ?? "الطالب"} | اقرأ` };
}

export default async function EditStudentPage({ params }: PageProps) {
  await requireRole("admin");
  const { id } = await params;

  const admin = createSupabaseAdminClient();
  if (!admin) return notFound();

  const { data: student } = await admin
    .from("students")
    .select("id, name, gender, birth_date, guardian_name, guardian_phone, enrollment_date, notes, is_active, memorized_juz_count")
    .eq("id", id)
    .maybeSingle();

  if (!student) return notFound();

  const { data: initMem } = await admin
    .from("initial_memorization")
    .select("juz_number, status, sheikh_name")
    .eq("student_id", id)
    .order("juz_number");

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
        initialMem={(initMem ?? []).map((r) => ({
          juz_number: r.juz_number,
          status: r.status as "memorized" | "with_ijaza",
          sheikh_name: r.sheikh_name ?? undefined,
        }))}
        redirectBase={`/admin/students/${id}`}
        mode="admin"
      />
    </div>
  );
}
