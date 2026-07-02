import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerComponentClient } from "@/lib/supabase/server";
import { getApiAppUser, canAccessStudent, getAssignedStudentIds } from "@/lib/auth/student-access";
import { recalculateStudentSummary } from "@/lib/students";

// GET /api/ijazat — list ijazat (role-scoped)
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

  let query = admin
    .from("ijazat")
    .select("*, students(id, name, gender)")
    .order("ijaza_date", { ascending: false });

  if (appUser.role === "teacher") {
    const assignedIds = await getAssignedStudentIds(admin, appUser.id);
    if (assignedIds.length === 0) return Response.json([]);
    
    if (studentId) {
      if (!assignedIds.includes(studentId)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      query = query.eq("student_id", studentId);
    } else {
      query = query.in("student_id", assignedIds);
    }
  } else {
    // Admin can filter by any student
    if (studentId) {
      query = query.eq("student_id", studentId);
    }
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

// POST /api/ijazat — grant ijaza
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerComponentClient();
  if (!supabase) return Response.json({ error: "Config missing" }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Config missing" }, { status: 500 });

  const appUser = await getApiAppUser(admin, user.id);
  if (!appUser || !appUser.is_active) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { student_id, ijaza_type, juz_number, sheikh_name, ijaza_date, notes } = body;

  if (!student_id || !ijaza_type || !sheikh_name || !ijaza_date) {
    return Response.json({ error: "يرجى تعبئة الحقول المطلوبة" }, { status: 400 });
  }

  if (ijaza_type !== "juz" && ijaza_type !== "full_quran") {
    return Response.json({ error: "نوع الإجازة غير صالح" }, { status: 400 });
  }

  if (ijaza_type === "juz") {
    const juzNum = Number(juz_number);
    if (Number.isNaN(juzNum) || juzNum < 1 || juzNum > 30) {
      return Response.json({ error: "رقم الجزء يجب أن يكون بين 1 و 30" }, { status: 400 });
    }
  }

  // Enforce access scoping
  const allowed = await canAccessStudent(admin, appUser, student_id);
  if (!allowed) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await admin
    .from("ijazat")
    .insert({
      student_id,
      granted_by: appUser.id,
      ijaza_type,
      juz_number: ijaza_type === "juz" ? Number(juz_number) : null,
      sheikh_name,
      ijaza_date,
      notes: notes ?? null
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Recalculate student summary
  await recalculateStudentSummary(admin, student_id);

  return Response.json(data, { status: 201 });
}
