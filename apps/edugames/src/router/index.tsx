import { lazy } from "react";
import { ModuleGate } from "../shared/university";
import { createBrowserRouter } from "react-router-dom";
import { StudentShell } from "../layouts/StudentShell";
import { StudentDashboard } from "../features/dashboard/StudentDashboard";
import { AuthPage } from "../features/auth/AuthPage";
import { ConstructionPage } from "../shared/components/ConstructionPage";

import { WaitingPage } from "../features/auth/WaitingPage";
import { ProfileSetupPage } from "../features/auth/ProfileSetupPage";

// Feature pages load on first visit, so the sign-in and dashboard need only the main bundle.
const StudentClassrooms = lazy(() => import("../features/classroom/StudentClassrooms").then((m) => ({ default: m.StudentClassrooms })));
const StudentExams = lazy(() => import("../features/exam/StudentExams").then((m) => ({ default: m.StudentExams })));
const GamesPage = lazy(() => import("../features/games/GamesPage").then((m) => ({ default: m.GamesPage })));
const ChainAnswerGamePage = lazy(() => import("../features/games/ChainAnswerGamePage").then((m) => ({ default: m.ChainAnswerGamePage })));
const QuizController = lazy(() => import("../features/games/QuizController").then((m) => ({ default: m.QuizController })));
const AppointmentBookingPage = lazy(() => import("../features/appointments/AppointmentBookingPage").then((m) => ({ default: m.AppointmentBookingPage })));
const StudentForms = lazy(() => import("../features/forms/StudentForms").then((m) => ({ default: m.StudentForms })));
const MyProgressPage = lazy(() => import("../features/progress/MyProgressPage").then((m) => ({ default: m.MyProgressPage })));
const TrelloBoardsPage = lazy(() => import("../features/trello/TrelloBoardsPage").then((m) => ({ default: m.TrelloBoardsPage })));
const TrelloBoardView = lazy(() => import("../features/trello/TrelloBoardView").then((m) => ({ default: m.TrelloBoardView })));
const WordCloudPlayerPage = lazy(() => import("../features/games/WordCloudPlayerPage").then((m) => ({ default: m.WordCloudPlayerPage })));
const StudentCalendar = lazy(() => import("../features/calendar/StudentCalendar").then((m) => ({ default: m.StudentCalendar })));

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <AuthPage />,
  },
  {
    path: "/waiting",
    element: <WaitingPage />,
  },
  {
    path: "/profile/setup",
    element: <ProfileSetupPage />,
  },
  {
    path: "/",
    element: <StudentShell />,
    children: [
      { index: true, element: <StudentDashboard /> },
      { path: "classroom", element: <StudentClassrooms /> },
      { path: "exams", element: <StudentExams /> },
      { path: "games/chain-answer", element: <ModuleGate module="chain_answer"><ChainAnswerGamePage /></ModuleGate> },
      { path: "games/chain-answer/:sessionId", element: <ModuleGate module="chain_answer"><ChainAnswerGamePage /></ModuleGate> },
      { path: "games/quiz/play", element: <ModuleGate module="live_quizzes"><QuizController /></ModuleGate> },
      { path: "games", element: <GamesPage /> },
      { path: "games/word-cloud", element: <ModuleGate module="word_cloud"><WordCloudPlayerPage /></ModuleGate> },
      // Slido has no server part yet, so these screens would only show errors.
      { path: "games/slido/submit", element: <ConstructionPage title="Slido presentations" /> },
      { path: "games/slido/join", element: <ConstructionPage title="Slido live polls" /> },
      { path: "games/slido/live/:pin", element: <ConstructionPage title="Slido live polls" /> },
      { path: "games/trello", element: <ModuleGate module="trello"><TrelloBoardsPage /></ModuleGate> },
      { path: "games/trello/:boardId", element: <ModuleGate module="trello"><TrelloBoardView /></ModuleGate> },
      { path: "trello", element: <ModuleGate module="trello"><TrelloBoardsPage /></ModuleGate> },
      { path: "trello/:boardId", element: <ModuleGate module="trello"><TrelloBoardView /></ModuleGate> },
      { path: "forms", element: <ModuleGate module="forms"><StudentForms /></ModuleGate> },
      { path: "progress", element: <MyProgressPage /> },
      { path: "calendar", element: <StudentCalendar /> },
      { path: "appointments", element: <ModuleGate module="appointments"><AppointmentBookingPage /></ModuleGate> },
      { path: "*", element: <ConstructionPage /> },
    ],
  },
  {
    path: "*",
    element: <ConstructionPage />,
  },
]);
