import { requireRole } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Award, Plus } from "lucide-react";
import { GrantIjazaForm } from "@/components/grant-ijaza-form";
import { AdminIjazatTable } from "@/components/admin-ijazat-table";

export const metadata = { title: "إدارة الإجازات | أقرأ" };

interface PageProps {
  searchParams: Promise<{ grant_for?: string }>;
}

export default async function AdminIjazatPage({ searchParams }: PageProps) {
  await requireRole("admin");
  const { grant_for: grantForId } = await searchParams;

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return <div className="text-destructive p-4">خطأ في الاتصال بالخادم</div>;
  }

  // Fetch all ijazat with student info, sorted newest first
  const { data: allIjazat } = await admin
    .from("ijazat")
    .select(
      "id, ijaza_type, juz_number, sheikh_name, ijaza_date, notes, created_at, students(id, name, gender)"
    )
    .order("ijaza_date", { ascending: false });

  // Fetch all active students for the grant form
  const { data: students } = await admin
    .from("students")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Award className="size-6 text-amber-500" />
            إدارة الإجازات
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            منح وإلغاء إجازات الطلاب — المجموع: {allIjazat?.length ?? 0} إجازة
          </p>
        </div>
      </div>

      {/* Two-column layout: list on right, form on left (RTL) */}
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* Ijazat list */}
        <div className="space-y-4">
          <h3 className="font-semibold text-base border-b border-border pb-2">
            سجل الإجازات
          </h3>
          <AdminIjazatTable ijazat={allIjazat ?? []} />
        </div>

        {/* Grant new ijaza form */}
        <div className="space-y-4">
          <h3 className="font-semibold text-base border-b border-border pb-2 flex items-center gap-2">
            <Plus className="size-4" />
            منح إجازة جديدة
          </h3>
          <GrantIjazaForm
            students={students ?? []}
            preselectedStudentId={grantForId}
            redirectTo={
              grantForId
                ? `/admin/students/${grantForId}`
                : "/admin/ijazat"
            }
          />
        </div>
      </div>
    </div>
  );
}
