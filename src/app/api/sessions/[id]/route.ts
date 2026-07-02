import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerComponentClient } from "@/lib/supabase/server";
import { getApiAppUser, canAccessStudent } from "@/lib/auth/student-access";
import { validateSessionPayload } from "@/lib/sessions";
import { recalculateStudentSummary } from "@/lib/students";
import { recalculateStudentAttendance } from "@/lib/attendance";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getSessionWithAccess(admin: Awaited<ReturnType<typeof createSupabaseAdminClient>>, sessionId: string, appUser: Awaited<ReturnType<typeof getApiAppUser>>) {
  if (!admin || !appUser) return null;

  const { data: session } = await admin
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return null;

  if (appUser.role === "admin") return session;
  if (appUser.role === "teacher" && session.teacher_id === appUser.id) return session;

  return null;
}

// PUT /api/sessions/[id]
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createSupabaseServerComponentClient();
  if (!supabase) return Response.json({ error: "Config missing" }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Config missing" }, { status: 500 });

  const appUser = await getApiAppUser(admin, user.id);
  if (!appUser || !appUser.is_active) return Response.json({ error: "Forbidden" }, { status: 403 });

  const existing = await getSessionWithAccess(admin, id, appUser);
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const { data: surah } = await admin
    .from("surahs")
    .select("total_ayahs")
    .eq("id", body.surah_id ?? existing.surah_id)
    .maybeSingle();

  if (!surah) return Response.json({ error: "السورة غير موجودة" }, { status: 400 });

  const validated = validateSessionPayload(
    { ...existing, ...body },
    surah.total_ayahs
  );
  if ("error" in validated) return Response.json({ error: validated.error }, { status: 400 });

  const { data: sessionPayload } = validated;
  if (!(await canAccessStudent(admin, appUser, sessionPayload.student_id))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await admin
    .from("sessions")
    .update(sessionPayload)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  await recalculateStudentSummary(admin, sessionPayload.student_id);
  await recalculateStudentAttendance(admin, sessionPayload.student_id);
  return Response.json(data);
}

// DELETE /api/sessions/[id]
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createSupabaseServerComponentClient();
  if (!supabase) return Response.json({ error: "Config missing" }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Config missing" }, { status: 500 });

  const appUser = await getApiAppUser(admin, user.id);
  if (!appUser || !appUser.is_active) return Response.json({ error: "Forbidden" }, { status: 403 });

  const existing = await getSessionWithAccess(admin, id, appUser);
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const { error } = await admin.from("sessions").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await recalculateStudentSummary(admin, existing.student_id);
  await recalculateStudentAttendance(admin, existing.student_id);
  return Response.json({ ok: true });
}
