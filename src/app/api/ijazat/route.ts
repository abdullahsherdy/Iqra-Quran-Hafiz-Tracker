import { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";

import { ijazatTable, studentsTable } from "@/db/schema";
import { canAccessStudent } from "@/features/auth/student-access";
import { recalculateStudentSummary } from "@/features/students/server/recalc";
import { sanitizeError } from "@/lib/api-error";
import { getApiContext } from "@/features/auth/api-context";
import { logAction } from "@/features/audit/audit-log";

// GET /api/ijazat — list ijazat (role-scoped)
export async function GET(request: NextRequest) {
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("student_id") ?? "";

  const conditions = [];

  if (appUser.role === "teacher") {
    // Gender scoping only — no assignment check.
    if (studentId) {
      const allowed = await canAccessStudent(db, appUser, studentId);
      if (!allowed) return Response.json({ error: "Forbidden" }, { status: 403 });
      conditions.push(eq(ijazatTable.student_id, studentId));
    }

    if (!appUser.can_view_all_genders && appUser.gender) {
      conditions.push(eq(studentsTable.gender, appUser.gender));
    }
  } else {
    // Admin can filter by any student
    if (studentId) {
      conditions.push(eq(ijazatTable.student_id, studentId));
    }
  }

  try {
    const rows = await db
      .select({
        id: ijazatTable.id,
        student_id: ijazatTable.student_id,
        granted_by: ijazatTable.granted_by,
        ijaza_type: ijazatTable.ijaza_type,
        juz_number: ijazatTable.juz_number,
        sheikh_name: ijazatTable.sheikh_name,
        ijaza_date: ijazatTable.ijaza_date,
        notes: ijazatTable.notes,
        created_at: ijazatTable.created_at,
        student_id_join: studentsTable.id,
        student_name: studentsTable.name,
        student_gender: studentsTable.gender,
      })
      .from(ijazatTable)
      .leftJoin(studentsTable, eq(ijazatTable.student_id, studentsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(ijazatTable.ijaza_date));

    const data = rows.map((r) => ({
      id: r.id,
      student_id: r.student_id,
      granted_by: r.granted_by,
      ijaza_type: r.ijaza_type,
      juz_number: r.juz_number,
      sheikh_name: r.sheikh_name,
      ijaza_date: r.ijaza_date,
      notes: r.notes,
      created_at: r.created_at,
      students: r.student_id_join
        ? { id: r.student_id_join, name: r.student_name, gender: r.student_gender }
        : null,
    }));

    return Response.json(data);
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "api") }, { status: 500 });
  }
}

// POST /api/ijazat — grant ijaza
export async function POST(request: NextRequest) {
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

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
  const allowed = await canAccessStudent(db, appUser, student_id);
  if (!allowed) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [created] = await db
      .insert(ijazatTable)
      .values({
        student_id,
        granted_by: appUser.id,
        ijaza_type,
        juz_number: ijaza_type === "juz" ? Number(juz_number) : null,
        sheikh_name,
        ijaza_date,
        notes: notes ?? null,
      })
      .returning();

    // Recalculate student summary
    await recalculateStudentSummary(db, student_id);

    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "create",
      entityType: "ijaza",
      entityId: created.id,
      method: "POST",
      path: "/api/ijazat",
      statusCode: 201,
      requestBody: { student_id, ijaza_type, juz_number, sheikh_name, ijaza_date },
      responseBody: { id: created.id },
    });
    return Response.json(created, { status: 201 });
  } catch (error) {
    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "create",
      entityType: "ijaza",
      method: "POST",
      path: "/api/ijazat",
      statusCode: 500,
      requestBody: { student_id, ijaza_type },
      responseBody: { error: sanitizeError(error, "api") },
    });
    return Response.json({ error: sanitizeError(error, "api") }, { status: 500 });
  }
}
