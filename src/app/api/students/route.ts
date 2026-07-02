import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerComponentClient } from "@/lib/supabase/server";
import { getLevelInfo, countsFromInitialMemorization, validateInitialMemorization, recalculateStudentSummary } from "@/lib/students";

// GET /api/students — role-scoped list with search, filters and pagination
export async function GET(request: NextRequest) {
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

  if (!appUser) return Response.json({ error: "User not found" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";
  const genderFilter = searchParams.get("gender") ?? "";
  const levelFilter = searchParams.get("level") ?? "";
  const minJuz = searchParams.get("min_juz") ? Number(searchParams.get("min_juz")) : null;
  const maxJuz = searchParams.get("max_juz") ? Number(searchParams.get("max_juz")) : null;
  const hasIjaza = searchParams.get("has_ijaza") ?? "";
  const ageMin = searchParams.get("age_min") ? Number(searchParams.get("age_min")) : null;
  const ageMax = searchParams.get("age_max") ? Number(searchParams.get("age_max")) : null;
  const teacherId = searchParams.get("teacher_id") ?? "";
  const isActive = searchParams.get("is_active") ?? "";
  const lastActiveDays = searchParams.get("last_active_days") ? Number(searchParams.get("last_active_days")) : null;
  const lastActivity = searchParams.get("last_activity") ?? "";
  const sortBy = searchParams.get("sort_by") ?? "name";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin
    .from("students")
    .select(
      "id, name, gender, birth_date, enrollment_date, is_active, memorized_juz_count, ijaza_juz_count, last_session_date, guardian_name, guardian_phone, notes",
      { count: "exact" }
    );

  // Role-scoping: teacher sees only assigned students
  if (appUser.role === "teacher") {
    const { data: myAssignments } = await admin
      .from("teacher_student_assignments")
      .select("student_id")
      .eq("teacher_id", appUser.id)
      .is("end_date", null);

    const myStudentIds = (myAssignments ?? []).map((a) => a.student_id);
    if (myStudentIds.length === 0) {
      return Response.json({ data: [], count: 0, page, pageSize });
    }
    query = query.in("id", myStudentIds);

    // Gender scoping
    if (!appUser.can_view_all_genders) {
      query = query.eq("gender", appUser.gender);
    }
  }

  // Filters
  if (search) {
    query = query.or(`name.ilike.%${search}%,guardian_name.ilike.%${search}%`);
  }
  if (genderFilter && ["male", "female"].includes(genderFilter)) {
    query = query.eq("gender", genderFilter);
  }
  if (isActive === "true") query = query.eq("is_active", true);
  else if (isActive === "false") query = query.eq("is_active", false);

  if (minJuz !== null) query = query.gte("memorized_juz_count", minJuz);
  if (maxJuz !== null) query = query.lte("memorized_juz_count", maxJuz);

  // Level filter → translate to juz range
  if (levelFilter === "beginner") query = query.lte("memorized_juz_count", 4);
  else if (levelFilter === "intermediate") query = query.gte("memorized_juz_count", 5).lte("memorized_juz_count", 14);
  else if (levelFilter === "advanced") query = query.gte("memorized_juz_count", 15).lte("memorized_juz_count", 29);
  else if (levelFilter === "completed") query = query.eq("memorized_juz_count", 30);

  if (hasIjaza === "true") query = query.gt("ijaza_juz_count", 0);
  else if (hasIjaza === "false") query = query.eq("ijaza_juz_count", 0);

  // Age filter: birth_date derived
  if (ageMin !== null) {
    const maxBirth = new Date();
    maxBirth.setFullYear(maxBirth.getFullYear() - ageMin);
    query = query.lte("birth_date", maxBirth.toISOString().split("T")[0]);
  }
  if (ageMax !== null) {
    const minBirth = new Date();
    minBirth.setFullYear(minBirth.getFullYear() - ageMax - 1);
    query = query.gte("birth_date", minBirth.toISOString().split("T")[0]);
  }

  if (lastActivity === "inactive") {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    query = query.or(`last_session_date.is.null,last_session_date.lt.${cutoffStr}`);
  } else if (lastActivity === "7" || lastActivity === "30") {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(lastActivity));
    query = query.gte("last_session_date", cutoff.toISOString().split("T")[0]);
  } else if (lastActiveDays !== null) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lastActiveDays);
    query = query.gte("last_session_date", cutoff.toISOString().split("T")[0]);
  }

  // Admin-only teacher_id filter
  if (appUser.role === "admin" && teacherId) {
    const { data: tAssignments } = await admin
      .from("teacher_student_assignments")
      .select("student_id")
      .eq("teacher_id", teacherId)
      .is("end_date", null);
    const ids = (tAssignments ?? []).map((a) => a.student_id);
    if (ids.length === 0) return Response.json({ data: [], count: 0, page, pageSize });
    query = query.in("id", ids);
  }

  // Sort
  const sortMap: Record<string, { column: string; ascending: boolean }> = {
    name: { column: "name", ascending: true },
    memorized_juz_count: { column: "memorized_juz_count", ascending: false },
    age: { column: "birth_date", ascending: false },
    last_session_date: { column: "last_session_date", ascending: false },
    enrollment_date: { column: "enrollment_date", ascending: false },
  };
  const sort = sortMap[sortBy] ?? sortMap.name;
  query = query.order(sort.column, { ascending: sort.ascending });
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Attach level label
  const enriched = (data ?? []).map((s) => ({
    ...s,
    level: getLevelInfo(s.memorized_juz_count),
  }));

  return Response.json({ data: enriched, count, page, pageSize });
}

// POST /api/students — create student (admin or teacher self-add)
export async function POST(request: NextRequest) {
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

  const body = await request.json();
  const {
    name, gender, birth_date, guardian_name, guardian_phone,
    enrollment_date, notes, initial_memorization,
  } = body;

  if (!name || !gender || !guardian_name || !guardian_phone) {
    return Response.json({ error: "name, gender, guardian_name, guardian_phone required" }, { status: 400 });
  }

  // Gender scoping for teachers
  if (appUser.role === "teacher" && !appUser.can_view_all_genders && gender !== appUser.gender) {
    return Response.json({ error: "Gender not allowed" }, { status: 403 });
  }

  const initRows: Array<{ juz_number: number; status: string; sheikh_name?: string }> =
    Array.isArray(initial_memorization) ? initial_memorization : [];

  const initValidationError = validateInitialMemorization(initRows);
  if (initValidationError) {
    return Response.json({ error: initValidationError }, { status: 400 });
  }

  const { memorized_juz_count, ijaza_juz_count } = countsFromInitialMemorization(initRows);

  const { data: student, error: stuErr } = await admin
    .from("students")
    .insert({
      name,
      gender,
      birth_date: birth_date ?? null,
      guardian_name,
      guardian_phone,
      enrollment_date: enrollment_date ?? new Date().toISOString().split("T")[0],
      notes: notes ?? null,
      memorized_juz_count,
      ijaza_juz_count,
    })
    .select()
    .single();

  if (stuErr || !student) return Response.json({ error: stuErr?.message }, { status: 500 });

  // Persist initial_memorization rows
  if (initRows.length > 0) {
    const rowsToInsert = initRows.map((r) => ({
      student_id: student.id,
      juz_number: r.juz_number,
      status: r.status,
      sheikh_name: r.sheikh_name ?? null,
    }));
    await admin.from("initial_memorization").insert(rowsToInsert);
  }

  // Teacher self-add: auto-create active assignment
  if (appUser.role === "teacher") {
    await admin.from("teacher_student_assignments").insert({
      teacher_id: appUser.id,
      student_id: student.id,
      start_date: enrollment_date ?? new Date().toISOString().split("T")[0],
      created_by: appUser.id,
    });
  }

  await recalculateStudentSummary(admin, student.id);

  const { data: finalStudent } = await admin
    .from("students")
    .select("*")
    .eq("id", student.id)
    .single();

  return Response.json(finalStudent ?? student, { status: 201 });
}
