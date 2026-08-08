import { getApiContext } from "@/features/auth/api-context";
import { fetchReportStats } from "@/features/students/server/report-stats";
import { usersTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sanitizeError } from "@/lib/api-error";

// GET /api/reports/students-stats — dashboard stats, honor roll, student table
export async function GET() {
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

  try {
    let opts: { teacherId?: string; teacherGender?: string | null; canViewAllGenders?: boolean } = {};

    if (appUser.role === "teacher") {
      const [teacherUser] = await db
        .select({
          gender: usersTable.gender,
          can_view_all_genders: usersTable.can_view_all_genders,
        })
        .from(usersTable)
        .where(eq(usersTable.id, appUser.id))
        .limit(1);

      opts = {
        teacherId: appUser.id,
        teacherGender: teacherUser?.gender ?? null,
        canViewAllGenders: teacherUser?.can_view_all_genders ?? false,
      };
    }

    const result = await fetchReportStats(db, opts);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "report stats fetch") }, { status: 500 });
  }
}
