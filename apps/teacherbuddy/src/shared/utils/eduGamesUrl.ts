/**
 * Where students play. Set VITE_EDUGAMES_URL (for example https://games.example.edu) in production.
 * In development EduGames runs on port 5174 of the same host as TeacherBuddy.
 */
export const eduGamesUrl = (path: string): string => {
  const configured = import.meta.env.VITE_EDUGAMES_URL as string | undefined;
  const base = (configured || `${window.location.protocol}//${window.location.hostname}:5174`).replace(/\/$/, "");
  return `${base}${path}`;
};
