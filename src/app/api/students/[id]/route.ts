import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerComponentClient } from "@/lib/supabase/server";
import { countsFromInitialMemorization, validateInitialMemorization, recalculateStudentSummary } from "@/lib/students";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/students/[id]
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createSupabaseServerComponentClient();
  if (!supabase) return Response.json({ error: "Config missing" }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Config missing" }, { status: 500 });

  const { data: appUser } = await admin
    .from("users")
    .select("id, role, gender, can_view_all_genders")
    .eq("id", user.id)
    .maybeSingle();

  if (!appUser) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { data: student, error } = await admin
    .from("students")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!student) return Response.json({ error: "Not found" }, { status: 404 });

  // Role-scope check for teachers
  if (appUser.role === "teacher") {
    if (!appUser.can_view_all_genders && student.gender !== appUser.gender) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const { data: assign } = await admin
      .from("teacher_student_assignments")
      .select("id")
      .eq("teacher_id", appUser.id)
      .eq("student_id", id)
      .is("end_date", null)
      .maybeSingle();
    if (!assign) return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Active teachers for this student
  const { data: activeAssignments } = await admin
    .from("teacher_student_assignments")
    .select("id, teacher_id, start_date, users!teacher_student_assignments_teacher_id_fkey(id, name)")
    .eq("student_id", id)
    .is("end_date", null);

  // Initial memorization
  const { data: initialMem } = await admin
    .from("initial_memorization")
    .select("juz_number, status, sheikh_name")
    .eq("student_id", id)
    .order("juz_number");

  return Response.json({ student, activeAssignments: activeAssignments ?? [], initialMem: initialMem ?? [] });
}

// PUT /api/students/[id]
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createSupabaseServerComponentClient();
  if (!supabase) return Response.json({ error: "Config missing" }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Config missing" }, { status: 500 });

  const { data: appUser } = await admin
    .from("users")
    .select("id, role, gender, can_view_all_genders, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!appUser || !appUser.is_active) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { data: existingStudent } = await admin
    .from("students")
    .select("id, gender")
    .eq("id", id)
    .maybeSingle();

  if (!existingStudent) return Response.json({ error: "Not found" }, { status: 404 });

  if (appUser.role === "teacher") {
    const { data: assign } = await admin
      .from("teacher_student_assignments")
      .select("id")
      .eq("teacher_id", appUser.id)
      .eq("student_id", id)
      .is("end_date", null)
      .maybeSingle();
    if (!assign) return Response.json({ error: "Forbidden" }, { status: 403 });
    if (!appUser.can_view_all_genders && existingStudent.gender !== appUser.gender) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const body = await request.json();

  if (appUser.role === "teacher") {
    const { data, error } = await admin
      .from("students")
      .update({ notes: body.notes ?? null })
      .eq("id", id)
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  }

  const allowedFields = ["name", "gender", "birth_date", "guardian_name", "guardian_phone", "enrollment_date", "notes", "is_active"];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field];
  }

  if ("initial_memorization" in body) {
    const initRows: Array<{ juz_number: number; status: string; sheikh_name?: string }> =
      Array.isArray(body.initial_memorization) ? body.initial_memorization : [];

    const initValidationError = validateInitialMemorization(initRows);
    if (initValidationError) {
      return Response.json({ error: initValidationError }, { status: 400 });
    }

    await admin.from("initial_memorization").delete().eq("student_id", id);

    if (initRows.length > 0) {
      const rowsToInsert = initRows.map((r) => ({
        student_id: id,
        juz_number: r.juz_number,
        status: r.status,
        sheikh_name: r.sheikh_name ?? null,
      }));
      const { error: memErr } = await admin.from("initial_memorization").insert(rowsToInsert);
      if (memErr) return Response.json({ error: memErr.message }, { status: 500 });
    }
  }

  const { data, error } = await admin
    .from("students")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  await recalculateStudentSummary(admin, id);

  const { data: finalStudent } = await admin
    .from("students")
    .select("*")
    .eq("id", id)
    .single();

  return Response.json(finalStudent ?? data);
}

// DELETE /api/students/[id] — admin only.
// Default (soft delete): toggles is_active = false. History is preserved and the
// profile stays viewable (reversible by editing the student to re-activate).
// ?permanent=true : hard delete — cascades every child row then removes the student.
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createSupabaseServerComponentClient();
  if (!supabase) return Response.json({ error: "Config missing" }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Config missing" }, { status: 500 });

  const { data: appUser } = await admin
    .from("users")
    .select("id, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  // Admin only.
  if (!appUser || !appUser.is_active || appUser.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const permanent = searchParams.get("permanent") === "true";

  const { data: existing } = await admin
    .from("students")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  if (!permanent) {
    // Soft delete: deactivate.
    const { error } = await admin
      .from("students")
      .update({ is_active: false })
      .eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, deactivated: true });
  }

  // Permanent delete: cascade all child rows (FKs are not ON DELETE CASCADE, so we
  // do it explicitly via the service-role client which bypasses RLS).
  const childTables: Array<{ table: string; column: string }> = [
    { table: "initial_memorization", column: "student_id" },
    { table: "ijazat", column: "student_id" },
    { table: "attendance", column: "student_id" },
    { table: "sessions", column: "student_id" },
    { table: "teacher_student_assignments", column: "student_id" },
  ];

  for (const { table, column } of childTables) {
    const { error } = await admin.from(table).delete().eq(column, id);
    if (error) return Response.json({ error: `فشل حذف ${table}: ${error.message}` }, { status: 500 });
  }

  const { error: delErr } = await admin.from("students").delete().eq("id", id);
  if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

  return Response.json({ ok: true, deleted: true });
}
