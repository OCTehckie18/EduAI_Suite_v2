import { API_BASE_URL } from "./apiConfig";

export interface CallResult<T = any> {
  ok: boolean;
  data: T;
  error?: string;
}

/** One API request. Never throws: a failure comes back as a message the page can show. */
export async function apiCall<T = any>(method: string, path: string, body?: unknown): Promise<CallResult<T>> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, data, error: data?.detail || data?.error?.message || `Something went wrong (${res.status}).` };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, data: null as T, error: "Could not reach the server. Check your connection and try again." };
  }
}
