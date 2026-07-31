import { requireRole } from "@/features/auth/session";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { StudentsListClient } from "@/app/(admin)/admin/students/students-list-client";

export const metadata = { title: "طلابي | اقرأ" };

export default async function TeacherStudentsPage() {
  await requireRole("teacher");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">طلابي</h2>
          <p className="text-sm text-muted-foreground">الطلاب المسندون إليّ حالياً</p>
        </div>
        <Link href="/teacher/students/new" className="btn-primary">
          <PlusCircle className="size-4" />
          إضافة طالب
        </Link>
      </div>

      <StudentsListClient teachers={[]} role="teacher" basePath="/teacher/students" />
    </div>
  );
}
