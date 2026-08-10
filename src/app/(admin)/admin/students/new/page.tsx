import { requireRole } from "@/features/auth/session";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { NewStudentForm } from "@/features/students/components/new-student-form";

export const metadata = { title: "إضافة طالب | اقرأ" };

export default async function AdminNewStudentPage() {
  await requireRole("admin");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/students" className="btn-secondary px-2 py-1.5 text-xs">
          <ArrowRight className="size-4" />
        </Link>
        <div>
          <h2 className="text-xl font-bold">إضافة طالب جديد</h2>
          <p className="text-sm text-muted-foreground">أدخل بيانات الطالب والحفظ السابق</p>
        </div>
      </div>

      <NewStudentForm role="admin" redirectBase="/admin/students" />
    </div>
  );
}
