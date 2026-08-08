import { requireRole } from "@/features/auth/session";
import { ReportsDashboard } from "@/features/reports/components/reports-dashboard";

export async function generateMetadata() {
  return { title: `تقاريري | ${process.env.NEXT_PUBLIC_APP_NAME ?? "اقرأ"}` };
}

export default async function TeacherReportsPage() {
  await requireRole("teacher");
  return <ReportsDashboard role="teacher" />;
}
