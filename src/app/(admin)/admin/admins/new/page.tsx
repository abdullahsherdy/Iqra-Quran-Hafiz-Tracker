import { requireRole } from "@/features/auth/session";
import NewAdminForm from "./new-admin-form";

export default async function NewAdminPage() {
  await requireRole("admin");
  return <NewAdminForm />;
}
