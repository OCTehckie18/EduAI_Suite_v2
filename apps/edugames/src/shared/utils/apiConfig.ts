/**
 * Centralized API configuration.
 *
 * VITE_API_URL should be the public backend origin in deployed frontends, e.g.
 * https://your-backend.example.com. When it is not set, default to /api. The
 * Vercel deployment rewrites /api/* to the public backend as a fallback.
 */
export const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "/api"
).replace(/\/$/, "");

export const buildWsUrl = (path: string): string => {
  const abs = API_BASE_URL.startsWith("/")
    ? new URL(API_BASE_URL, window.location.origin)
    : new URL(API_BASE_URL);
  const protocol = abs.protocol === "https:" ? "wss:" : "ws:";
  // HTTP endpoints are mounted below /api or /api/v1, but ASGI WebSockets
  // are mounted at /ws directly.
  const prefix = API_BASE_URL.startsWith("/")
    ? abs.pathname.replace(/\/$/, "")
    : abs.pathname.replace(/\/api(?:\/v\d+)?\/?$/, "");
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
  SLIDO: `${API_BASE_URL}/api/slido`,
  LESSONS: `${API_BASE_URL}/lessons`,
  DASHBOARD: `${API_BASE_URL}/api/dashboard`,
  HISTORY: `${API_BASE_URL}/history`,
};
