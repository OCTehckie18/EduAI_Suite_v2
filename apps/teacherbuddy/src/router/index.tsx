import { ModuleGate } from "../shared/university";
import { createBrowserRouter } from "react-router-dom";
import { DashboardShell } from "../layouts/DashboardShell";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { EvaluationPage } from "../features/evaluation/EvaluationPage";
import { OMRPage } from "../features/omr/OMRPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { FormsPage } from "../features/forms/FormsPage";
import { RiskIntelligencePage } from "../features/analytics/RiskIntelligencePage";
import { CalendarPage } from "../features/calendar/CalendarPage";
import { AIChatPage } from "../features/ai-chat/AIChatPage";
import { AuthPage } from "../features/auth/AuthPage";
import { GamesPage } from "../features/games/GamesPage";
import { QuizCreator } from "../features/games/QuizCreator";
import { QuizLibraryPage } from "../features/games/QuizLibraryPage";
import { QuizMonitoring } from "../features/games/QuizMonitoring";
import { QuizReportPage } from "../features/games/QuizReportPage";
import { QuizTestParticipantPage } from "../features/games/QuizTestParticipantPage";
import { TeacherAppointmentsPage } from "../features/appointments/TeacherAppointmentsPage";
import { TeacherToolsPage } from "../features/tools/TeacherToolsPage";
import { ClassroomsPage } from "../features/classroom/ClassroomsPage";
import { ExamsPage } from "../features/exam/ExamsPage";
import { MailStudentsPage } from "../features/mail/MailStudentsPage";
import { ConstructionPage } from "../shared/components/ConstructionPage";
import { TrelloBoardsPage } from "../features/trello/TrelloBoardsPage";
import { TrelloBoardView } from "../features/trello/TrelloBoardView";

import { WaitingPage } from "../features/auth/WaitingPage";
import { ProfileSetupPage } from "../features/auth/ProfileSetupPage";

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
