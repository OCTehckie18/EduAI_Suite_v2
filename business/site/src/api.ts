/** Talks to the EduAI Suite business backend only. This site never calls a campus API. */
export interface DemoRequestInput {
  name: string;
  role: string;
  institution: string;
  city: string;
  approx_students: number | null;
  work_email: string;
  phone: string;
  message: string;
  consent: boolean;
  /** Honeypot: hidden from people, left empty. */
  website: string;
}

export type SubmitResult =
  | { ok: true }
  | { ok: false; kind: "invalid"; fields: Record<string, string> }
  | { ok: false; kind: "throttled" | "network" | "server" };

export const apiBase = () => (import.meta.env.VITE_BUSINESS_API_URL ?? "").replace(/\/+$/, "");
export const salesEmail = () => import.meta.env.VITE_SALES_EMAIL || "";

export async function submitDemoRequest(input: DemoRequestInput): Promise<SubmitResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/api/demo-requests/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, kind: "network" };
  }
  if (response.ok) return { ok: true };
  if (response.status === 429) return { ok: false, kind: "throttled" };
  if (response.status === 400) {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      fields[key] = Array.isArray(value) ? String(value[0]) : String(value);
    }
    return { ok: false, kind: "invalid", fields };
  }
  return { ok: false, kind: "server" };
}
