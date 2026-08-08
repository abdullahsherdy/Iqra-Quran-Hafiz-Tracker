import { requireRole } from "@/features/auth/session";
import EditAdminForm from "./edit-admin-form";

export default async function EditAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole("admin");
  return <EditAdminForm adminId={id} />;
}
