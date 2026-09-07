import { createBrowserRouter } from "react-router-dom";
import { DashboardShell } from "../layouts/DashboardShell";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { EvaluationPage } from "../features/evaluation/EvaluationPage";
import { OMRPage } from "../features/omr/OMRPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { FormsPage } from "../features/forms/FormsPage";
import { AnalyticsPage } from "../features/analytics/AnalyticsPage";
import { CalendarPage } from "../features/calendar/CalendarPage";
import { AIChatPage } from "../features/ai-chat/AIChatPage";
import { AuthPage } from "../features/auth/AuthPage";
import { GamesPage } from "../features/games/GamesPage";
import { QuizCreator } from "../features/games/QuizCreator";
import { QuizLibraryPage } from "../features/games/QuizLibraryPage";
import { QuizMonitoring } from "../features/games/QuizMonitoring";
import SlidoAssignmentDashboard from "../features/games/SlidoAssignmentDashboard";
import { LiveGradingPage } from "../features/games/LiveGradingForm";
import SplitViewGrading from "../features/games/SplitViewGrading";
import { TeacherAppointmentsPage } from "../features/appointments/TeacherAppointmentsPage";
import { TeacherToolsPage } from "../features/tools/TeacherToolsPage";
import { ClassroomsPage } from "../features/classroom/ClassroomsPage";
import { ExamsPage } from "../features/exam/ExamsPage";
import { MailStudentsPage } from "../features/mail/MailStudentsPage";
import { ConstructionPage } from "../shared/components/ConstructionPage";
import { TrelloBoardsPage } from "../features/trello/TrelloBoardsPage";
import { TrelloBoardView } from "../features/trello/TrelloBoardView";
import { AdminUsersPage } from "../features/admin/AdminUsersPage";

import { WaitingPage } from "../features/auth/WaitingPage";

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
    path: "/",
    element: <DashboardShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "omr", element: <OMRPage /> },
      { path: "evaluation", element: <EvaluationPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "forms", element: <FormsPage /> },
      { path: "games", element: <GamesPage /> },
      { path: "games/quiz", element: <QuizLibraryPage /> },
      { path: "games/quiz/create", element: <QuizCreator /> },
      { path: "games/quiz/edit/:id", element: <QuizCreator /> },
      { path: "games/quiz/host/:quizId", element: <QuizMonitoring /> },
      {
        path: "games/slido/assignments",
        element: <SlidoAssignmentDashboard />,
      },
      { path: "games/slido/grade/:submissionId", element: <SplitViewGrading /> },
      { path: "appointments", element: <TeacherAppointmentsPage /> },
      { path: "tools", element: <TeacherToolsPage /> },
      { path: "classrooms", element: <ClassroomsPage /> },
      { path: "classrooms/:courseId", element: <ClassroomsPage /> },
      { path: "analytics", element: <AnalyticsPage /> },
      { path: "mail", element: <MailStudentsPage /> },
      { path: "calendar", element: <CalendarPage /> },
      { path: "chat", element: <AIChatPage /> },
      { path: "settings", element: <ConstructionPage /> },
      { path: "exams", element: <ExamsPage /> },
      { path: "admin/users", element: <AdminUsersPage /> },
      { path: "games/trello", element: <TrelloBoardsPage /> },
      { path: "games/trello/:boardId", element: <TrelloBoardView /> },
      { path: "tools/trello", element: <TrelloBoardsPage /> },
      { path: "tools/trello/:boardId", element: <TrelloBoardView /> },
      { path: "*", element: <ConstructionPage /> },
    ],
  },
  {
    path: "*",
    element: <ConstructionPage />,
  },
]);
