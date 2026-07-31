/**
 * Frontend API client — centralizes fetch calls with consistent error
 * handling (E1) and typing. Every client component should use these instead
 * of raw `fetch()` so that res.ok checks and error extraction are uniform.
 *
 * Usage:
 *   const students = await apiGet<Student[]>("/api/students");
 *   const created = await apiPost<Session>("/api/sessions", body);
 */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === "string") return data.error;
  } catch {
    // response body is not JSON or empty
  }
  return "حدث خطأ غير متوقع";
}

async function request<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new ApiError(await parseError(res), res.status);
  }
  // 204 No Content or empty body
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function apiGet<T>(url: string): Promise<T> {
  return request<T>(url);
}

export function apiPost<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function apiPut<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function apiDelete<T>(url: string): Promise<T> {
  return request<T>(url, { method: "DELETE" });
}
