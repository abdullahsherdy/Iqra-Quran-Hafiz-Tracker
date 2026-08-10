import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/features/auth/session";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("admin");

  return (
    <AppShell role={user.role} username={user.name}>
      {children}
    </AppShell>
  );
}
