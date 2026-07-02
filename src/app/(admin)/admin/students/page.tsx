import { requireRole } from "@/lib/auth/session";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { StudentsListClient } from "./students-list-client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "الطلاب | اقرأ" };

export default async function AdminStudentsPage() {
  await requireRole("admin");

  // Fetch teachers for filter dropdown
  const admin = createSupabaseAdminClient();
  const teachers = admin
    ? (
      await admin
        .from("users")
        .select("id, name, gender")
        .eq("role", "teacher")
        .eq("is_active", true)
        .order("name")
    ).data ?? []
    : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">الطلاب</h2>
          <p className="text-sm text-muted-foreground">جميع الطلاب المسجلين</p>
        </div>
        <Link href="/admin/students/new" className="btn-primary">
          <PlusCircle className="size-4" />
          إضافة طالب
        </Link>
      </div>

      <StudentsListClient teachers={teachers} role="admin" />
    </div>
  );
}
