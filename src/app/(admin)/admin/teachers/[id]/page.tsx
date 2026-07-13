import { requireRole } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { GenderBadge } from "@/components/badges";
import { LevelBadge } from "@/components/level-badge";
import { ArrowRight } from "lucide-react";
import { TeacherProfileActions } from "./teacher-profile-actions";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  if (!admin) return { title: "المحفظ" };
  const { data } = await admin.from("users").select("name").eq("id", id).maybeSingle();
  return { title: `${data?.name ?? "المحفظ"} | اقرأ` };
}

export default async function TeacherProfilePage({ params }: PageProps) {
  await requireRole("admin");
  const { id } = await params;

  const admin = createSupabaseAdminClient();
  if (!admin) return notFound();

  const { data: teacher } = await admin
    .from("users")
    .select("id, name, username, phone, gender, can_view_all_genders, is_active, created_at")
    .eq("id", id)
    .eq("role", "teacher")
    .maybeSingle();

  if (!teacher) return notFound();

  const { data: assignments } = await admin
    .from("teacher_student_assignments")
    .select("id, start_date, student_id, students(id, name, gender, memorized_juz_count, status)")
    .eq("teacher_id", id)
    .is("end_date", null)
    .order("start_date");

  const students = (assignments ?? []).map((a) => {
    const s = a.students as unknown as { id: string; name: string; gender: string; memorized_juz_count: number; status: string } | null;
    return s ? { ...s, assignment_id: a.id, start_date: a.start_date } : null;
  }).filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Back */}
      <div className="flex items-center gap-3">
        <Link href="/admin/teachers" className="btn-secondary px-2 py-1.5 text-xs">
          <ArrowRight className="size-4" />
        </Link>
        <h2 className="text-xl font-bold">{teacher.name}</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Info card */}
        <div className="card space-y-4">
          <h3 className="font-semibold">بيانات المحفظ</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">الاسم</dt>
              <dd className="font-medium">{teacher.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">اسم المستخدم</dt>
              <dd dir="ltr">{teacher.username}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">الجنس</dt>
              <dd>
                {teacher.gender ? (
                  <GenderBadge value={teacher.gender as "male" | "female"} />
                ) : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">الهاتف</dt>
              <dd dir="ltr">{teacher.phone ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">تاريخ الإنشاء</dt>
              <dd>{new Date(teacher.created_at).toLocaleDateString("ar-EG")}</dd>
            </div>
          </dl>
        </div>

        {/* Controls */}
        <div className="card space-y-4">
          <h3 className="font-semibold">الإعدادات</h3>
          <TeacherProfileActions
            teacherId={teacher.id}
            isActive={teacher.is_active}
            canViewAllGenders={teacher.can_view_all_genders}
          />
        </div>
      </div>

      {/* Current students */}
      <div className="card p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-semibold">الطلاب الحاليون ({students.length})</h3>
        </div>
        {students.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            لا يوجد طلاب مسندون لهذا المحفظ حالياً
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary text-right">
                <th className="px-4 py-2.5 font-medium">الطالب</th>
                <th className="px-4 py-2.5 font-medium">الجنس</th>
                <th className="px-4 py-2.5 font-medium">المستوى</th>
                <th className="px-4 py-2.5 font-medium">تاريخ الإسناد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map((s) => s && (
                <tr key={s.id} className="hover:bg-secondary/50">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/students/${s.id}`} className="font-medium text-primary hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <GenderBadge value={s.gender as "male" | "female"} />
                  </td>
                  <td className="px-4 py-2.5">
                    <LevelBadge memorizedJuzCount={s.memorized_juz_count} />
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {new Date(s.start_date).toLocaleDateString("ar-EG")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
