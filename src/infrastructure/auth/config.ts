export interface SupabasePublicEnv {
  url: string;
  publishableKey: string;
}

export interface SupabaseServerEnv extends SupabasePublicEnv {
  serviceRoleKey: string;
}

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!url || !publishableKey) {
    return null;
  }

  return {
    url,
    publishableKey,
  };
}

export function getSupabaseServerEnv(): SupabaseServerEnv | null {
  const publicEnv = getSupabasePublicEnv();
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!publicEnv || !serviceRoleKey) {
    return null;
  }

  return {
    ...publicEnv,
    serviceRoleKey,
  };
}
