import { requireRole } from "@/features/auth/session";
import { isSuperAdmin } from "@/features/auth/shared";
import { redirect } from "next/navigation";
import AuditLogsClient from "./audit-logs-client";

export default async function AuditLogsPage() {
  const user = await requireRole("admin");
  if (!isSuperAdmin(user.role)) {
    redirect("/admin/reports");
  }
  return <AuditLogsClient />;
}
