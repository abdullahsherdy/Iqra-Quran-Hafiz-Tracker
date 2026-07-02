import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerComponentClient } from "@/lib/supabase/server";
import { canAccessStudent, getApiAppUser } from "@/lib/auth/student-access";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/students/[id]/sessions — session history for student profile
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
  const sessionType = searchParams.get("session_type") ?? "";
  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo = searchParams.get("date_to") ?? "";

  let query = admin
    .from("sessions")
    .select("id, session_date, session_type, surah_id, from_ayah, to_ayah, pages, rating, notes, teacher_id, surahs(id, name_arabic), users!sessions_teacher_id_fkey(id, name)")
    .eq("student_id", studentId)
    .order("session_date", { ascending: false });

  if (sessionType) query = query.eq("session_type", sessionType);
  if (dateFrom) query = query.gte("session_date", dateFrom);
  if (dateTo) query = query.lte("session_date", dateTo);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const sessions = (data ?? []).map((s) => {
    const surah = s.surahs as unknown as { id: number; name_arabic: string } | null;
    const teacher = s.users as unknown as { id: string; name: string } | null;
    return {
      id: s.id,
      session_date: s.session_date,
      session_type: s.session_type,
      surah_id: s.surah_id,
      surah_name: surah?.name_arabic ?? "",
      from_ayah: s.from_ayah,
      to_ayah: s.to_ayah,
      pages: s.pages,
      rating: s.rating,
      notes: s.notes,
      teacher_id: s.teacher_id,
      teacher_name: teacher?.name ?? "",
    };
  });

  return Response.json(sessions);
}
