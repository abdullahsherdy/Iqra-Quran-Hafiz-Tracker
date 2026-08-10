import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/features/auth/session";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("teacher");

  return (
    <AppShell role="teacher" username={user.name}>
      {children}
    </AppShell>
  );
}
