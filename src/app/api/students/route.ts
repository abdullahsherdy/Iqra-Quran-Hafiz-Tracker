import { NextRequest } from "next/server";
import { and, count, desc, asc, eq, gte, lte, gt, lt, ilike, or, isNull, inArray, type SQL, type AnyColumn } from "drizzle-orm";
import { studentsTable, teacherStudentAssignmentsTable, initialMemorizationTable } from "@/db/schema";
import { getAssignedStudentIds } from "@/features/auth/student-access";
import { getLevelInfo, countsFromInitialMemorization, validateInitialMemorization, validateStudentPayload } from "@/domain/students";
import { recalculateStudentSummary } from "@/features/students/server/recalc";
import { sanitizeError } from "@/lib/api-error";
import { getApiContext } from "@/features/auth/api-context";
import { todayDateString, toDateString } from "@/lib/utils";

// GET /api/students — role-scoped list with search, filters and pagination
export async function GET(request: NextRequest) {
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

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
  const statusFilter = searchParams.get("status") ?? "";
  const lastActiveDays = searchParams.get("last_active_days") ? Number(searchParams.get("last_active_days")) : null;
  const lastActivity = searchParams.get("last_activity") ?? "";
  const sortBy = searchParams.get("sort_by") ?? "name";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = 25;
  const from = (page - 1) * pageSize;

  // Build dynamic conditions array
  const conditions: SQL[] = [];

  // Role-scoping: teacher sees only assigned students
  if (appUser.role === "teacher") {
    const myStudentIds = await getAssignedStudentIds(db, appUser.id);
    if (myStudentIds.length === 0) {
      return Response.json({ data: [], count: 0, page, pageSize });
    }
    conditions.push(inArray(studentsTable.id, myStudentIds));

    // Gender scoping
    if (!appUser.can_view_all_genders && appUser.gender) {
      conditions.push(eq(studentsTable.gender, appUser.gender));
    }
  }

  // Filters
  if (search) {
    conditions.push(or(ilike(studentsTable.name, `%${search}%`), ilike(studentsTable.guardian_name, `%${search}%`))!);
  }
  if (genderFilter && ["male", "female"].includes(genderFilter)) {
    conditions.push(eq(studentsTable.gender, genderFilter));
  }
  if (statusFilter && ["active", "paused", "graduated", "withdrawn"].includes(statusFilter)) {
    conditions.push(eq(studentsTable.status, statusFilter));
  }

  if (minJuz !== null) conditions.push(gte(studentsTable.memorized_juz_count, minJuz));
  if (maxJuz !== null) conditions.push(lte(studentsTable.memorized_juz_count, maxJuz));

  // Level filter → translate to juz range
  if (levelFilter === "beginner") conditions.push(lte(studentsTable.memorized_juz_count, 4));
  else if (levelFilter === "intermediate") { conditions.push(gte(studentsTable.memorized_juz_count, 5)); conditions.push(lte(studentsTable.memorized_juz_count, 14)); }
  else if (levelFilter === "advanced") { conditions.push(gte(studentsTable.memorized_juz_count, 15)); conditions.push(lte(studentsTable.memorized_juz_count, 29)); }
  else if (levelFilter === "completed") conditions.push(eq(studentsTable.memorized_juz_count, 30));

  if (hasIjaza === "true") conditions.push(gt(studentsTable.ijaza_juz_count, 0));
  else if (hasIjaza === "false") conditions.push(eq(studentsTable.ijaza_juz_count, 0));

  // Age filter: birth_date derived
  if (ageMin !== null) {
    const maxBirth = new Date();
    maxBirth.setFullYear(maxBirth.getFullYear() - ageMin);
    conditions.push(lte(studentsTable.birth_date, toDateString(maxBirth)));
  }
  if (ageMax !== null) {
    const minBirth = new Date();
    minBirth.setFullYear(minBirth.getFullYear() - ageMax - 1);
    conditions.push(gte(studentsTable.birth_date, toDateString(minBirth)));
  }

  if (lastActivity === "inactive") {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = toDateString(cutoff);
    conditions.push(or(isNull(studentsTable.last_session_date), lt(studentsTable.last_session_date, cutoffStr))!);
  } else if (lastActivity === "7" || lastActivity === "30") {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(lastActivity));
    conditions.push(gte(studentsTable.last_session_date, toDateString(cutoff)));
  } else if (lastActiveDays !== null) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lastActiveDays);
    conditions.push(gte(studentsTable.last_session_date, toDateString(cutoff)));
  }

  // Admin-only teacher_id filter
  if (appUser.role === "admin" && teacherId) {
    const ids = await getAssignedStudentIds(db, teacherId);
    if (ids.length === 0) return Response.json({ data: [], count: 0, page, pageSize });
    conditions.push(inArray(studentsTable.id, ids));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Sort
  const sortMap: Record<string, { column: AnyColumn; order: "asc" | "desc" }> = {
    name: { column: studentsTable.name, order: "asc" },
    memorized_juz_count: { column: studentsTable.memorized_juz_count, order: "desc" },
    age: { column: studentsTable.birth_date, order: "desc" },
    last_session_date: { column: studentsTable.last_session_date, order: "desc" },
    enrollment_date: { column: studentsTable.enrollment_date, order: "desc" },
  };
  const sort = sortMap[sortBy] ?? sortMap.name;

  try {
    const [data, countResult] = await Promise.all([
      db
        .select({
          id: studentsTable.id,
          name: studentsTable.name,
          gender: studentsTable.gender,
          birth_date: studentsTable.birth_date,
          enrollment_date: studentsTable.enrollment_date,
          status: studentsTable.status,
          memorized_juz_count: studentsTable.memorized_juz_count,
          ijaza_juz_count: studentsTable.ijaza_juz_count,
          last_session_date: studentsTable.last_session_date,
          guardian_name: studentsTable.guardian_name,
          guardian_phone: studentsTable.guardian_phone,
          notes: studentsTable.notes,
        })
        .from(studentsTable)
        .where(whereClause)
        .orderBy(sort.order === "asc" ? asc(sort.column) : desc(sort.column))
        .offset(from)
        .limit(pageSize),
      db
        .select({ count: count() })
        .from(studentsTable)
        .where(whereClause),
    ]);

    const totalCount = countResult[0]?.count ?? 0;

    // Attach level label
    const enriched = data.map((s) => ({
      ...s,
      level: getLevelInfo(s.memorized_juz_count),
    }));

    return Response.json({ data: enriched, count: totalCount, page, pageSize });
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "api") }, { status: 500 });
  }
}

// POST /api/students — create student (admin or teacher self-add)
export async function POST(request: NextRequest) {
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

  const body = await request.json();
  const {
    name, gender, birth_date, guardian_name, guardian_phone,
    enrollment_date, notes, initial_memorization,
  } = body;

  const validationError = validateStudentPayload({
    name, gender, birth_date, guardian_name, guardian_phone, enrollment_date, notes,
  });
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
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

  try {
    const [student] = await db
      .insert(studentsTable)
      .values({
        name,
        gender,
        birth_date: birth_date ?? null,
        guardian_name,
        guardian_phone,
        enrollment_date: enrollment_date ?? todayDateString(),
        notes: notes ?? null,
        memorized_juz_count,
        ijaza_juz_count,
      })
      .returning();

    if (!student) return Response.json({ error: sanitizeError(new Error("student insert failed"), "student insert") }, { status: 500 });

    // Persist initial_memorization rows
    if (initRows.length > 0) {
      const rowsToInsert = initRows.map((r) => ({
        student_id: student.id,
        juz_number: r.juz_number,
        status: r.status,
        sheikh_name: r.sheikh_name ?? null,
      }));
      await db.insert(initialMemorizationTable).values(rowsToInsert);
    }

    // Teacher self-add: auto-create active assignment
    if (appUser.role === "teacher") {
      await db.insert(teacherStudentAssignmentsTable).values({
        teacher_id: appUser.id,
        student_id: student.id,
        start_date: enrollment_date ?? todayDateString(),
        created_by: appUser.id,
      });
    }

    await recalculateStudentSummary(db, student.id);

    const [finalStudent] = await db
      .select()
      .from(studentsTable)
      .where(eq(studentsTable.id, student.id))
      .limit(1);

    return Response.json(finalStudent ?? student, { status: 201 });
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "student insert") }, { status: 500 });
  }
}
