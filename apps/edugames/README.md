# EduGames

EduGames is the interactive student portal for the EduAI Suite platform. It is the centralized hub where students engage with the learning materials, play interactive educational games, take their exams, and track their performance.

## Features

- **Strict Isolation**: Runs securely on its own domain (port `5174`). It is entirely student-facing and contains no administrative UI, providing a completely decoupled and secure user experience.
- **Interactive Quizzes & Games**: The primary interface for students to participate in live quizzes, competitive battles, and experiential simulations designed by their teachers.
- **My Classrooms**: Easy access to enrolled courses and uploaded materials.
- **Exam Portal**: A dedicated workspace to take formal exams, complete with AI progress tracking and evaluation statuses.
- **Dashboards & Leaderboards**: Gamified personal tracking of student GPA, experience points, and competitive leaderboards.

## Development

EduGames is part of the EduAI Suite monorepo and is built with React, Vite, and Tailwind CSS.

Start the development server:
```bash
# From the monorepo root
npm run dev
# Or individually
npm run dev -w @eduai/edugames
```

## Security Note

EduGames is strictly a client-facing portal. Content creation, teacher logic, and formal evaluation are securely handled by **TeacherBuddy**. Student interactions that occur within EduGames are securely transmitted to the backend where they can be processed and pushed to TeacherBuddy dashboards.
