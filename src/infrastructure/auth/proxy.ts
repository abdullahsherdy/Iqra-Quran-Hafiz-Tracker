import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

import { isAdmin, roleHomePath, type AppRole } from "@/features/auth/shared";
import { getSupabasePublicEnv } from "./config";

interface AppUserRow {
  role: AppRole;
  is_active: boolean;
}

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  const env = getSupabasePublicEnv();

  if (!env) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const pathname = request.nextUrl.pathname;
  const isProtectedPath = pathname.startsWith("/admin") || pathname.startsWith("/teacher");
  const isLoginPath = pathname === "/login";

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (!isProtectedPath) {
      return response;
    }

    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const { data: appUser } = await supabase
    .from("users")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!appUser || !(appUser as AppUserRow).is_active) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const role = (appUser as AppUserRow).role;

  if (isLoginPath) {
    return NextResponse.redirect(new URL(roleHomePath(role), request.url));
  }

  if (pathname.startsWith("/admin") && !isAdmin(role)) {
    return NextResponse.redirect(new URL(roleHomePath(role), request.url));
  }

  if (pathname.startsWith("/teacher") && role !== "teacher") {
    return NextResponse.redirect(new URL(roleHomePath(role), request.url));
  }

  return response;
}
