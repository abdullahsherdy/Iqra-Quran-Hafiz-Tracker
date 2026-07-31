import { asc } from "drizzle-orm";

import { surahsTable } from "@/db/schema";
import { getApiContext } from "@/features/auth/api-context";

// GET /api/surahs — all 114 surahs for dropdowns
export async function GET() {
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db } = ctx;

  const data = await db
    .select({
      id: surahsTable.id,
      name_arabic: surahsTable.name_arabic,
      juz_number: surahsTable.juz_number,
      total_ayahs: surahsTable.total_ayahs,
    })
    .from(surahsTable)
    .orderBy(asc(surahsTable.id));

  return Response.json(data);
}
