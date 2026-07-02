import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerComponentClient } from "@/lib/supabase/server";
import { getApiAppUser, getAssignedStudentIds, canAccessStudent } from "@/lib/auth/student-access";
import { validateSessionPayload } from "@/lib/sessions";
import { recalculateStudentSummary } from "@/lib/students";
import { recalculateStudentAttendance } from "@/lib/attendance";

// GET /api/sessions — role-scoped list
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerComponentClient();
  if (!supabase) return Response.json({ error: "Config missing" }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Config missing" }, { status: 500 });

  const appUser = await getApiAppUser(admin, user.id);
  if (!appUser || !appUser.is_active) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("student_id") ?? "";
  const sessionType = searchParams.get("session_type") ?? "";
  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo = searchParams.get("date_to") ?? "";

  let query = admin
    .from("sessions")
    .select("id, student_id, teacher_id, session_date, session_type, surah_id, from_ayah, to_ayah, pages, rating, notes, created_at, surahs(id, name_arabic, total_ayahs), students(id, name)")
    .order("session_date", { ascending: false });

  if (appUser.role === "teacher") {
    const ids = await getAssignedStudentIds(admin, appUser.id);
    if (ids.length === 0) return Response.json([]);
    query = query.in("student_id", ids).eq("teacher_id", appUser.id);
  }

  if (studentId) query = query.eq("student_id", studentId);
  if (sessionType) query = query.eq("session_type", sessionType);
  if (dateFrom) query = query.gte("session_date", dateFrom);
  if (dateTo) query = query.lte("session_date", dateTo);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

// POST /api/sessions — create session
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerComponentClient();
  if (!supabase) return Response.json({ error: "Config missing" }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Config missing" }, { status: 500 });

  const appUser = await getApiAppUser(admin, user.id);
  if (!appUser || !appUser.is_active) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (appUser.role !== "teacher" && appUser.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { data: surah } = await admin
    .from("surahs")
    .select("total_ayahs")
    .eq("id", body.surah_id)
    .maybeSingle();

  if (!surah) return Response.json({ error: "السورة غير موجودة" }, { status: 400 });

  const validated = validateSessionPayload(body, surah.total_ayahs);
  if ("error" in validated) return Response.json({ error: validated.error }, { status: 400 });

  const { data: sessionPayload } = validated;
  const allowed = await canAccessStudent(admin, appUser, sessionPayload.student_id);
  if (!allowed) return Response.json({ error: "Forbidden" }, { status: 403 });

  const teacherId = appUser.role === "teacher" ? appUser.id : (body.teacher_id ?? appUser.id);

  const { data, error } = await admin
    .from("sessions")
    .insert({
      ...sessionPayload,
      teacher_id: teacherId,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  await recalculateStudentSummary(admin, sessionPayload.student_id);
  await recalculateStudentAttendance(admin, sessionPayload.student_id);
  return Response.json(data, { status: 201 });
}
