import { requireRole } from "@/features/auth/session";
import { ReportsDashboard } from "@/features/reports/components/reports-dashboard";

export async function generateMetadata() {
  return { title: `التقارير | ${process.env.NEXT_PUBLIC_APP_NAME ?? "اقرأ"}` };
}

export default async function AdminReportsPage() {
  await requireRole("admin");
  return <ReportsDashboard role="admin" />;
}
