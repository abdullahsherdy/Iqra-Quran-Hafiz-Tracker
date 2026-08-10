import { requireRole } from "@/features/auth/session";
import NewTeacherForm from "./new-teacher-form";

export default async function NewTeacherPage() {
  await requireRole("admin");
  return <NewTeacherForm />;
}
