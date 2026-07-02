import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerComponentClient } from "@/lib/supabase/server";
import { canAccessStudent, getApiAppUser } from "@/lib/auth/student-access";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/students/[id]/attendance — attendance history + stats
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id: studentId } = await params;
  const supabase = await createSupabaseServerComponentClient();
  if (!supabase) return Response.json({ error: "Config missing" }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Config missing" }, { status: 500 });

  const appUser = await getApiAppUser(admin, user.id);
  if (!appUser || !appUser.is_active) return Response.json({ error: "Forbidden" }, { status: 403 });

  if (!(await canAccessStudent(admin, appUser, studentId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo = searchParams.get("date_to") ?? "";

  let query = admin
    .from("attendance")
    .select("id, attendance_date, status, notes, teacher_id, users!attendance_teacher_id_fkey(id, name)")
    .eq("student_id", studentId)
    .order("attendance_date", { ascending: false });

  if (dateFrom) query = query.gte("attendance_date", dateFrom);
  if (dateTo) query = query.lte("attendance_date", dateTo);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const records = (data ?? []).map((r) => {
    const teacher = r.users as unknown as { id: string; name: string } | null;
    return {
      id: r.id,
      attendance_date: r.attendance_date,
      status: r.status,
      notes: r.notes,
      teacher_id: r.teacher_id,
      teacher_name: teacher?.name ?? "",
    };
  });

  const total = records.length;
  const present = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const attendanceRate = total > 0 ? Math.round((present / total) * 100) : null;

  return Response.json({
    records,
    stats: { total, present, absent, attendanceRate },
  });
}
