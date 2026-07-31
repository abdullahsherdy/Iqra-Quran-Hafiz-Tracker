import { requireRole } from "@/features/auth/session";
import { getDb } from "@/db/client";
import { usersTable } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { StudentsListClient } from "./students-list-client";

export const metadata = { title: "الطلاب | اقرأ" };

export default async function AdminStudentsPage() {
  await requireRole("admin");

  // Fetch teachers for filter dropdown
  const db = getDb();
  const teacherRows = db
    ? await db
        .select({
          id: usersTable.id,
          name: usersTable.name,
          gender: usersTable.gender,
        })
        .from(usersTable)
        .where(and(eq(usersTable.role, "teacher"), eq(usersTable.is_active, true)))
        .orderBy(asc(usersTable.name))
    : [];

  const teachers = teacherRows.map((t) => ({
    id: t.id,
    name: t.name,
    gender: t.gender ?? "",
  }));

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
