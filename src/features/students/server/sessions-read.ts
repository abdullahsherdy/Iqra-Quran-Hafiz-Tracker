import "server-only";

import { and, eq, gte, lte, desc, inArray } from "drizzle-orm";

import type { Db } from "@/db/client";
import { sessionsTable, sessionItemsTable, surahsTable, usersTable } from "@/db/schema";

export interface LoadSessionsOptions {
  sessionType?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

/**
 * DB-fetching shell for a student's session history (each session with its
 * recited items). Single source of truth shared by the staff route
 * (`/api/students/[id]/sessions`) and the read-only student portal.
 *
 * The return type is inferred and re-exported as `StudentSessionRow` so UI
 * components can consume the exact shape without drift.
 */
export async function loadStudentSessions(
  db: Db,
  studentId: string,
  opts: LoadSessionsOptions = {}
) {
  const sessionType = opts.sessionType ?? "";
  const limit = Math.min(opts.limit ?? 100, 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  const conditions = [eq(sessionsTable.student_id, studentId)];
  if (opts.dateFrom) conditions.push(gte(sessionsTable.session_date, opts.dateFrom));
  if (opts.dateTo) conditions.push(lte(sessionsTable.session_date, opts.dateTo));

  const sessions = await db
    .select({
      id: sessionsTable.id,
      session_date: sessionsTable.session_date,
      overall_rating: sessionsTable.overall_rating,
      notes: sessionsTable.notes,
      teacher_id: sessionsTable.teacher_id,
      teacher_name: usersTable.name,
    })
    .from(sessionsTable)
    .leftJoin(usersTable, eq(sessionsTable.teacher_id, usersTable.id))
    .where(and(...conditions))
    .orderBy(desc(sessionsTable.session_date))
    .limit(limit)
    .offset(offset);

  if (sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);
  const itemRows = await db
    .select({
      session_id: sessionItemsTable.session_id,
      id: sessionItemsTable.id,
      session_type: sessionItemsTable.session_type,
      surah_id: sessionItemsTable.surah_id,
      from_ayah: sessionItemsTable.from_ayah,
      to_ayah: sessionItemsTable.to_ayah,
      rating: sessionItemsTable.rating,
      pages: sessionItemsTable.pages,
      notes: sessionItemsTable.notes,
      surah_name: surahsTable.name_arabic,
    })
    .from(sessionItemsTable)
    .leftJoin(surahsTable, eq(sessionItemsTable.surah_id, surahsTable.id))
    .where(inArray(sessionItemsTable.session_id, sessionIds));

  const itemsBySession = new Map<string, typeof itemRows>();
  for (const item of itemRows) {
    const list = itemsBySession.get(item.session_id);
    if (list) list.push(item);
    else itemsBySession.set(item.session_id, [item]);
  }

  return sessions
    .map((s) => {
      const items = (itemsBySession.get(s.id) ?? []).map((item) => ({
        id: item.id,
        session_type: item.session_type,
        surah_id: item.surah_id,
        from_ayah: item.from_ayah,
        to_ayah: item.to_ayah,
        rating: item.rating,
        pages: item.pages,
        notes: item.notes,
        surah_name: item.surah_name ?? "",
      }));

      return {
        id: s.id,
        session_date: s.session_date,
        overall_rating: s.overall_rating,
        notes: s.notes,
        teacher_id: s.teacher_id,
        teacher_name: s.teacher_name ?? "",
        items: sessionType ? items.filter((i) => i.session_type === sessionType) : items,
      };
    })
    .filter((s) => !sessionType || s.items.length > 0);
}

export type StudentSessionRow = Awaited<
  ReturnType<typeof loadStudentSessions>
>[number];

export type StudentSessionItem = StudentSessionRow["items"][number];
