// Every call goes to /api on this site's own address; the sign-in lives in a cookie, and changes carry the CSRF token.
let csrf = "";

export function setCsrf(token: string) { csrf = token; }

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = options.method ?? "GET";
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(method === "GET" ? {} : { "X-CSRFToken": csrf }) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let data: unknown = null;
  try { data = await response.json(); } catch { /* an empty answer */ }
  if (!response.ok) {
    const detail = (data as { detail?: string } | null)?.detail;
    throw new ApiError(detail ?? (response.status === 429 ? "Too many attempts. Wait a minute and try again." : `Request failed (${response.status}).`), response.status);
  }
  return data as T;
}

export interface Admin { id: number; email: string; name: string; active: boolean; last_login: string | null; created_at: string; }
export interface Summary { version?: string; admins?: number; teachers?: number; students?: number; email_configured?: boolean; }
export interface College {
  slug: string; college_name: string; status: string; plan: string; api_url: string; has_channel: boolean;
  renewal_date: string | null; snapshot_at: string | null; summary: Summary; contact_name?: string; contact_email?: string;
}
export interface AdminRow extends Admin { campus_slug: string; college_name: string; as_of: string | null; }
export interface ActionRow { id: number; campus_slug: string; college_name: string; staff: string; action: string; target_email: string; result: string; detail: string; at: string; }
