import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createSupabaseServerActionClient } from "@/infrastructure/auth/server";

/**
 * Email-verification callback: `/auth/confirm`.
 *
 * Lives OUTSIDE the `(auth)` route group so the public path is literally
 * `/auth/confirm` (matches the Supabase email template + redirect allowlist).
 *
 * Supports both Supabase SSR confirmation styles so it works regardless of how
 * the dashboard email template is configured:
 *   - `?token_hash=…&type=…`  → `verifyOtp` (recommended token-hash template)
 *   - `?code=…`               → `exchangeCodeForSession` (default PKCE template)
 *
 * On success the session cookie is set (writable server-action client) and we
 * redirect to `next` (defaulted + sanitized to a same-origin relative path to
 * avoid an open redirect) with `?verified=1`. On any failure we send the user
 * to `/login?verified=0` so the login page can show a "link expired" notice.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/login";

  // Open-redirect guard: only allow a same-origin relative path.
  const safeNext =
    nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/login";

  const supabase = await createSupabaseServerActionClient();

  if (supabase) {
    if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error) {
        return NextResponse.redirect(new URL(`${safeNext}?verified=1`, origin));
      }
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(new URL(`${safeNext}?verified=1`, origin));
      }
    }
  }

  return NextResponse.redirect(new URL("/login?verified=0", origin));
}
