import "server-only";

import type { Db } from "@/db/client";
import { auditLogsTable } from "@/db/schema";

export interface AuditLogInput {
  userId: string;
  username: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  method: string;
  path: string;
  statusCode: number;
  requestBody?: unknown;
  responseBody?: unknown;
}

/**
 * Insert an audit log entry. Non-blocking — errors are swallowed so
 * the main request flow is never interrupted by logging failures.
 */
export async function logAction(db: Db, input: AuditLogInput): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      user_id: input.userId,
      username: input.username,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      method: input.method,
      path: input.path,
      status_code: input.statusCode,
      request_body: input.requestBody ?? null,
      response_body: input.responseBody ?? null,
    });
  } catch {
    // Swallow — audit logging must not break the request
  }
}
