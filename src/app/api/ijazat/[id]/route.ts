import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerComponentClient } from "@/lib/supabase/server";
import { getApiAppUser } from "@/lib/auth/student-access";
import { recalculateStudentSummary } from "@/lib/students";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// DELETE /api/ijazat/[id] — admin revoke ijaza
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createSupabaseServerComponentClient();
  if (!supabase) return Response.json({ error: "Config missing" }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Config missing" }, { status: 500 });

  const appUser = await getApiAppUser(admin, user.id);
  if (!appUser || !appUser.is_active) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (appUser.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  // Get student id of this ijaza before deleting
  const { data: ijaza, error: fetchErr } = await admin
    .from("ijazat")
    .select("student_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return Response.json({ error: fetchErr.message }, { status: 500 });
  if (!ijaza) return Response.json({ error: "الإجازة غير موجودة" }, { status: 404 });

  const { error: deleteErr } = await admin
    .from("ijazat")
    .delete()
    .eq("id", id);

  if (deleteErr) return Response.json({ error: deleteErr.message }, { status: 500 });

  // Recalculate
  await recalculateStudentSummary(admin, ijaza.student_id);

  return Response.json({ ok: true });
}
