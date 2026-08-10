import { NextRequest } from "next/server";
import { count, desc, eq, and, gte, lte, type SQL } from "drizzle-orm";

import { isSuperAdmin } from "@/features/auth/shared";
import { auditLogsTable } from "@/db/schema";
import { getApiContext } from "@/features/auth/api-context";

// GET /api/audit-logs — super_admin only, paginated with filters
export async function GET(request: NextRequest) {
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (!isSuperAdmin(appUser.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Math.min(Number(searchParams.get("page_size") ?? "50"), 100);
  const action = searchParams.get("action");
  const entityType = searchParams.get("entity_type");
  const userId = searchParams.get("user_id");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");

  const conditions: SQL[] = [];
  if (action) conditions.push(eq(auditLogsTable.action, action));
  if (entityType) conditions.push(eq(auditLogsTable.entity_type, entityType));
  if (userId) conditions.push(eq(auditLogsTable.user_id, userId));
  if (dateFrom) conditions.push(gte(auditLogsTable.created_at, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(auditLogsTable.created_at, new Date(dateTo)));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const offset = (page - 1) * pageSize;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(auditLogsTable)
      .where(whereClause)
      .orderBy(desc(auditLogsTable.created_at))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: count() })
      .from(auditLogsTable)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  return Response.json({ data: rows, count: total, page, pageSize });
}
