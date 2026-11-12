/**
 * The address of the API, the same in every portal: VITE_API_URL when it is set (a deployed front end pointing at a
 * backend), else the same-origin /api/v1 path that the dev proxy and nginx forward to the backend.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_URL || "/api/v1").replace(/\/$/, "");
