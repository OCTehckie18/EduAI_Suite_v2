/**
 * Centralized API configuration.
 *
 * VITE_API_URL should be the public backend origin in deployed frontends, e.g.
 * https://your-backend.example.com/api/v1. When it is not set, default to the
 * same-origin /api/v1 path, which the Vite dev proxy and the Vercel rewrite
 * forward to the backend.
 */
export const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "/api/v1"
).replace(/\/$/, "");

export const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const buildWsUrl = (path: string): string => {
  const abs = API_BASE_URL.startsWith("/")
    ? new URL(API_BASE_URL, window.location.origin)
    : new URL(API_BASE_URL);
  const protocol = abs.protocol === "https:" ? "wss:" : "ws:";
  // HTTP endpoints are mounted below /api/v1, but ASGI WebSockets are
  // mounted at /ws directly (the dev proxy forwards /ws as well).
  const prefix = abs.pathname.replace(/\/api(?:\/v\d+)?\/?$/, "").replace(/\/$/, "");
  return `${protocol}//${abs.host}${prefix}${path}`;
};

export const API_ENDPOINTS = {
  BASE: API_BASE_URL,
  AUTH: `${API_BASE_URL}/auth`,
  COURSES: `${API_BASE_URL}/courses`,
  STUDENTS: `${API_BASE_URL}/students`,
  ASSIGNMENTS: `${API_BASE_URL}/assignments`,
  SUBMISSIONS: `${API_BASE_URL}/submissions`,
  GAMES: `${API_BASE_URL}/games`,
  EXAMS: `${API_BASE_URL}/exams`,
  QUIZZES: `${API_BASE_URL}/quizzes`,
  ANNOUNCEMENTS: `${API_BASE_URL}/announcements`,
  APPOINTMENTS: `${API_BASE_URL}/appointments`,
  ANALYTICS: `${API_BASE_URL}/analytics`,
  ENGAGEMENT: `${API_BASE_URL}/engagement`,
  CALENDAR: `${API_BASE_URL}/calendar`,
  MAIL: `${API_BASE_URL}/mail`,
  OMR: `${API_BASE_URL}/omr`,
  WORDCLOUD: `${API_BASE_URL}/wordcloud`,
  REPORTS: `${API_BASE_URL}/reports`,
  SLIDO: `${API_BASE_URL}/slido`,
  LESSONS: `${API_BASE_URL}/lessons`,
  DASHBOARD: `${API_BASE_URL}/dashboard`,
  HISTORY: `${API_BASE_URL}/history`,
};
