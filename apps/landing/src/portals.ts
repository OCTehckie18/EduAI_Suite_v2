/**
 * Where each portal lives. Set these in production; in development every portal runs on its own
 * port of the same host as this page.
 */
const fallback = (port: number) => `${window.location.protocol}//${window.location.hostname}:${port}`;
const clean = (value: string | undefined, port: number) => (value || fallback(port)).replace(/\/$/, "");

export interface Portal {
  id: "students" | "teachers" | "admin";
  audience: string;
  name: string;
  summary: string;
  note: string;
  action: string;
  url: string;
}

export const portals = (): Portal[] => [
  {
    id: "students",
    audience: "Students",
    name: "EduGames",
    summary: "Join classes, hand in work, take exams and play live quizzes.",
    note: "Your university email must be on the admitted-students list.",
    action: "Open EduGames",
    url: clean(import.meta.env.VITE_EDUGAMES_URL as string | undefined, 5174),
  },
  {
    id: "teachers",
    audience: "Teachers",
    name: "TeacherBuddy",
    summary: "Run classrooms, assignments, exams, quizzes and marking.",
    note: "New teachers need approval from the administration before they can start.",
    action: "Open TeacherBuddy",
    url: clean(import.meta.env.VITE_TEACHERBUDDY_URL as string | undefined, 5173),
  },
  {
    id: "admin",
    audience: "Administration",
    name: "Master Admin",
    summary: "Set up the university, approve teachers and manage the admission roster.",
    note: "For university administrators only.",
    action: "Open Master Admin",
    url: clean(import.meta.env.VITE_ADMIN_URL as string | undefined, 5175),
  },
];
