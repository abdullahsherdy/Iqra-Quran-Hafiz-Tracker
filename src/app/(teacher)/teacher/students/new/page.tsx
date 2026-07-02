import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerComponentClient } from "@/lib/supabase/server";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { NewStudentForm } from "@/components/new-student-form";

export const metadata = { title: "إضافة طالب | اقرأ" };

export default async function TeacherNewStudentPage() {
  const user = await requireRole("teacher");

  const supabase = await createSupabaseServerComponentClient();
  let forcedGender: "male" | "female" | undefined = undefined;

  if (supabase) {
    const { data: appUser } = await supabase
      .from("users")
      .select("gender, can_view_all_genders")
      .eq("id", user.id)
      .maybeSingle();

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
