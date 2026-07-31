import "server-only";

/**
 * Sanitize an error for client-facing API responses.
 *
 * Logs the full error server-side (with a context tag for grep-ability) and
 * returns a generic Arabic message suitable for the response body. Prevents
 * Supabase/PostgREST error messages — which can leak schema details (table,
 * constraint, column names) — from reaching clients (I3).
 *
 * Pass the original error so it gets logged, and a `context` string (e.g. the
 * operation name) so server logs are greppable.
 */
export function sanitizeError(error: unknown, context: string): string {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[api-error] ${context}:`, detail);
  return "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.";
}

/**
 * Build a JSON Response for an error, with the sanitized message and a status.
 * The full error is logged server-side.
 */
export function errorResponse(error: unknown, context: string, status = 500): Response {
  return Response.json({ error: sanitizeError(error, context) }, { status });
}
