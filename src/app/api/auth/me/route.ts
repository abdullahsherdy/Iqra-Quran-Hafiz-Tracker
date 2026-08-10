import { NextResponse } from "next/server";

import { getCurrentAppUser } from "@/features/auth/session";
import type { AuthMeResponse } from "@/features/auth/shared";

export async function GET() {
  const user = await getCurrentAppUser();

  if (!user || !user.is_active) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body: AuthMeResponse = {
    id: user.id,
    name: user.name,
    role: user.role,
  };

  return NextResponse.json(body);
}
