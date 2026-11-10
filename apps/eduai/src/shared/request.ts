import { authHeaders } from "./apiConfig";

export async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // The full response rides along so a screen can show field errors or conflicts.
    throw Object.assign(new Error(data.detail || data.error?.message || "Request failed."), { body: data });
  }
  return data as T;
}
