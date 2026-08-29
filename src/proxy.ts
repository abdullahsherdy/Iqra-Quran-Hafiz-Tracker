import type { NextRequest } from "next/server";

import { updateSupabaseSession } from "@/infrastructure/auth/proxy";

export async function proxy(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: ["/login", "/register", "/admin/:path*", "/teacher/:path*", "/student/:path*"],
};
