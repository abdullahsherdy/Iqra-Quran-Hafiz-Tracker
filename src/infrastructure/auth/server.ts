import "server-only";

import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "./config";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

function createReadonlyCookieAdapter(cookieStore: CookieStore) {
  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(_cookiesToSet: CookieToSet[]) {},
  };
}

function createWritableCookieAdapter(cookieStore: CookieStore) {
  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet: CookieToSet[]) {
      for (const { name, value, options } of cookiesToSet) {
        cookieStore.set(name, value, options);
      }
    },
  };
}

export async function createSupabaseServerComponentClient(): Promise<SupabaseClient | null> {
  const env = getSupabasePublicEnv();

  if (!env) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(env.url, env.publishableKey, {
    cookies: createReadonlyCookieAdapter(cookieStore),
  });
}

export async function createSupabaseServerActionClient(): Promise<SupabaseClient | null> {
  const env = getSupabasePublicEnv();

  if (!env) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(env.url, env.publishableKey, {
    cookies: createWritableCookieAdapter(cookieStore),
  });
}
