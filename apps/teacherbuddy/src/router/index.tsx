import { lazy } from "react";
import { ModuleGate } from "../shared/university";
import { createBrowserRouter } from "react-router-dom";
import { DashboardShell } from "../layouts/DashboardShell";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { AuthPage } from "../features/auth/AuthPage";
import { ConstructionPage } from "../shared/components/ConstructionPage";

import { WaitingPage } from "../features/auth/WaitingPage";
import { ProfileSetupPage } from "../features/auth/ProfileSetupPage";

// Feature pages load on first visit, so the sign-in and dashboard need only the main bundle.
const EvaluationPage = lazy(() => import("../features/evaluation/EvaluationPage").then((m) => ({ default: m.EvaluationPage })));
const OMRPage = lazy(() => import("../features/omr/OMRPage").then((m) => ({ default: m.OMRPage })));
const ReportsPage = lazy(() => import("../features/reports/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const FormsPage = lazy(() => import("../features/forms/FormsPage").then((m) => ({ default: m.FormsPage })));
const RiskIntelligencePage = lazy(() => import("../features/analytics/RiskIntelligencePage").then((m) => ({ default: m.RiskIntelligencePage })));
const CalendarPage = lazy(() => import("../features/calendar/CalendarPage").then((m) => ({ default: m.CalendarPage })));
const AIChatPage = lazy(() => import("../features/ai-chat/AIChatPage").then((m) => ({ default: m.AIChatPage })));
const GamesPage = lazy(() => import("../features/games/GamesPage").then((m) => ({ default: m.GamesPage })));
const QuizCreator = lazy(() => import("../features/games/QuizCreator").then((m) => ({ default: m.QuizCreator })));
const QuizLibraryPage = lazy(() => import("../features/games/QuizLibraryPage").then((m) => ({ default: m.QuizLibraryPage })));
const QuizMonitoring = lazy(() => import("../features/games/QuizMonitoring").then((m) => ({ default: m.QuizMonitoring })));
const QuizReportPage = lazy(() => import("../features/games/QuizReportPage").then((m) => ({ default: m.QuizReportPage })));
const QuizTestParticipantPage = lazy(() => import("../features/games/QuizTestParticipantPage").then((m) => ({ default: m.QuizTestParticipantPage })));
const TeacherAppointmentsPage = lazy(() => import("../features/appointments/TeacherAppointmentsPage").then((m) => ({ default: m.TeacherAppointmentsPage })));
const TeacherToolsPage = lazy(() => import("../features/tools/TeacherToolsPage").then((m) => ({ default: m.TeacherToolsPage })));
const ClassroomsPage = lazy(() => import("../features/classroom/ClassroomsPage").then((m) => ({ default: m.ClassroomsPage })));
const ExamsPage = lazy(() => import("../features/exam/ExamsPage").then((m) => ({ default: m.ExamsPage })));
const MailStudentsPage = lazy(() => import("../features/mail/MailStudentsPage").then((m) => ({ default: m.MailStudentsPage })));
const TrelloBoardsPage = lazy(() => import("../features/trello/TrelloBoardsPage").then((m) => ({ default: m.TrelloBoardsPage })));
const TrelloBoardView = lazy(() => import("../features/trello/TrelloBoardView").then((m) => ({ default: m.TrelloBoardView })));

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
    element: <DashboardShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "omr", element: <ModuleGate module="omr"><OMRPage /></ModuleGate> },
      { path: "evaluation", element: <EvaluationPage /> },
      { path: "reports", element: <ModuleGate module="reports"><ReportsPage /></ModuleGate> },
      { path: "forms", element: <ModuleGate module="forms"><FormsPage /></ModuleGate> },
      { path: "games", element: <GamesPage /> },
      { path: "games/quiz", element: <ModuleGate module="live_quizzes"><QuizLibraryPage /></ModuleGate> },
      { path: "games/quiz/create", element: <ModuleGate module="live_quizzes"><QuizCreator /></ModuleGate> },
      { path: "games/quiz/edit/:id", element: <ModuleGate module="live_quizzes"><QuizCreator /></ModuleGate> },
      { path: "games/quiz/host/:quizId", element: <ModuleGate module="live_quizzes"><QuizMonitoring /></ModuleGate> },
      { path: "games/quiz/session/:pin", element: <ModuleGate module="live_quizzes"><QuizMonitoring /></ModuleGate> },
      { path: "games/quiz/report/:pin", element: <ModuleGate module="live_quizzes"><QuizReportPage /></ModuleGate> },
      { path: "games/quiz/test/:pin", element: <ModuleGate module="live_quizzes"><QuizTestParticipantPage /></ModuleGate> },
      // Slido has no server part yet, so these screens would only show errors.
      { path: "games/slido/assignments", element: <ConstructionPage title="Slido live polls" /> },
      { path: "games/slido/grade/:submissionId", element: <ConstructionPage title="Slido grading" /> },
      { path: "appointments", element: <ModuleGate module="appointments"><TeacherAppointmentsPage /></ModuleGate> },
      { path: "tools", element: <TeacherToolsPage /> },
      { path: "classrooms", element: <ClassroomsPage /> },
      { path: "classrooms/:courseId", element: <ClassroomsPage /> },
      { path: "analytics", element: <RiskIntelligencePage /> },
      { path: "mail", element: <ModuleGate module="mail"><MailStudentsPage /></ModuleGate> },
      { path: "calendar", element: <CalendarPage /> },
      { path: "chat", element: <ModuleGate module="ai_assistant"><AIChatPage /></ModuleGate> },
      { path: "settings", element: <ConstructionPage title="Settings" /> },
      { path: "exams", element: <ExamsPage /> },
      { path: "games/trello", element: <ModuleGate module="trello"><TrelloBoardsPage /></ModuleGate> },
      { path: "games/trello/:boardId", element: <ModuleGate module="trello"><TrelloBoardView /></ModuleGate> },
      { path: "tools/trello", element: <ModuleGate module="trello"><TrelloBoardsPage /></ModuleGate> },
      { path: "tools/trello/:boardId", element: <ModuleGate module="trello"><TrelloBoardView /></ModuleGate> },
      { path: "*", element: <ConstructionPage /> },
    ],
  },
  {
    path: "*",
    element: <ConstructionPage />,
  },
]);
