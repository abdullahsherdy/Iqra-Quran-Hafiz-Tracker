import { requireRole } from "@/features/auth/session";
import { getDb } from "@/db/client";
import { usersTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { NewStudentForm } from "@/features/students/components/new-student-form";

export const metadata = { title: "إضافة طالب | اقرأ" };

export default async function TeacherNewStudentPage() {
  const user = await requireRole("teacher");

  const db = getDb();
  let forcedGender: "male" | "female" | undefined = undefined;

  if (db) {
    const [appUser] = await db
      .select({
        gender: usersTable.gender,
        can_view_all_genders: usersTable.can_view_all_genders,
      })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);

    if (appUser && !appUser.can_view_all_genders && appUser.gender) {
      forcedGender = appUser.gender as "male" | "female";
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/teacher/students" className="btn-secondary px-2 py-1.5 text-xs">
          <ArrowRight className="size-4" />
        </Link>
        <div>
          <h2 className="text-xl font-bold">إضافة طالب جديد</h2>
          <p className="text-sm text-muted-foreground">
            أدخل بيانات الطالب والحفظ السابق. سيتم إسناد الطالب إليك تلقائياً.
          </p>
        </div>
      </div>

      <NewStudentForm
        role="teacher"
        forcedGender={forcedGender}
        redirectBase="/teacher/students"
      />
    </div>
  );
}
