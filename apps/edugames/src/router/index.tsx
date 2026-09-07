import React from "react";
import { createBrowserRouter } from "react-router-dom";
import { StudentShell } from "../layouts/StudentShell";
import { StudentDashboard } from "../features/dashboard/StudentDashboard";
import { StudentClassrooms } from "../features/classroom/StudentClassrooms";
import { StudentExams } from "../features/exam/StudentExams";
import { AuthPage } from "../features/auth/AuthPage";
import { GamesPage } from "../features/games/GamesPage";
import { ChainAnswerGamePage } from "../features/games/ChainAnswerGamePage";
import { QuizController } from "../features/games/QuizController";
import { AppointmentBookingPage } from "../features/appointments/AppointmentBookingPage";
import { TrelloBoardsPage } from "../features/trello/TrelloBoardsPage";
import { TrelloBoardView } from "../features/trello/TrelloBoardView";
import { ConstructionPage } from "../shared/components/ConstructionPage";
import { WordCloudPlayerPage } from "../features/games/WordCloudPlayerPage";
import PresentationSubmissionPortal from "../features/games/PresentationSubmissionPortal";
import LiveSessionInterface from "../features/games/LiveSessionInterface";
import AudienceJoinHub from "../features/games/AudienceJoinHub";
import { StudentCalendar } from "../features/calendar/StudentCalendar";

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
    element: <StudentShell />,
    children: [
      { index: true, element: <StudentDashboard /> },
      { path: "classroom", element: <StudentClassrooms /> },
      { path: "exams", element: <StudentExams /> },
      { path: "games/chain-answer", element: <ChainAnswerGamePage /> },
      { path: "games/quiz/play", element: <QuizController /> },
      { path: "games", element: <GamesPage /> },
      { path: "games/word-cloud", element: <WordCloudPlayerPage /> },
      { path: "games/slido/submit", element: <PresentationSubmissionPortal /> },
      { path: "games/slido/join", element: <AudienceJoinHub /> },
      { path: "games/slido/live/:pin", element: <LiveSessionInterface /> },
      { path: "games/trello", element: <TrelloBoardsPage /> },
      { path: "games/trello/:boardId", element: <TrelloBoardView /> },
      { path: "trello", element: <TrelloBoardsPage /> },
      { path: "trello/:boardId", element: <TrelloBoardView /> },
      { path: "calendar", element: <StudentCalendar /> },
      { path: "appointments", element: <AppointmentBookingPage /> },
      { path: "*", element: <ConstructionPage /> },
    ],
  },
  {
    path: "*",
    element: <ConstructionPage />,
  },
]);
