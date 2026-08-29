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
  const isProtectedPath =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/teacher") ||
    pathname.startsWith("/student");
  // Public auth entry pages — never require auth; redirect already-signed-in
  // active users to their role home.
  const isAuthEntryPath = pathname === "/login" || pathname === "/register";

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
    // Authenticated in Supabase but no readable/active app-user row (e.g. a
    // teacher pending admin approval, or a stale session). Never redirect an
    // auth entry page to /login: /login -> /login is an infinite redirect
    // loop. Let the page render so they can sign in as someone else; only
    // bounce them off protected paths.
    if (isAuthEntryPath) {
      return response;
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const role = (appUser as AppUserRow).role;

  if (isAuthEntryPath) {
    return NextResponse.redirect(new URL(roleHomePath(role), request.url));
  }

  if (pathname.startsWith("/admin") && !isAdmin(role)) {
    return NextResponse.redirect(new URL(roleHomePath(role), request.url));
  }

  if (pathname.startsWith("/teacher") && role !== "teacher") {
    return NextResponse.redirect(new URL(roleHomePath(role), request.url));
  }

  if (pathname.startsWith("/student") && role !== "student") {
    return NextResponse.redirect(new URL(roleHomePath(role), request.url));
  }

  return response;
}
