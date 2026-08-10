import { requireRole } from "@/features/auth/session";
import { isSuperAdmin } from "@/features/auth/shared";
import { redirect } from "next/navigation";
import AdminsListClient from "./admins-list-client";

export default async function AdminsPage() {
  const user = await requireRole("admin");
  if (!isSuperAdmin(user.role)) {
    redirect("/admin/reports");
  }
  return <AdminsListClient />;
}
