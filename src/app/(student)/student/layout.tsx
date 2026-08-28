import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/features/auth/session";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("student");

  return (
    <AppShell role="student" username={user.name}>
      {children}
    </AppShell>
  );
}
