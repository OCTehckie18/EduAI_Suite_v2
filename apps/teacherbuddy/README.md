# TeacherBuddy

TeacherBuddy is the exclusive administrative portal for the EduAI Suite platform. It is designed to provide teachers, faculty, and administrators with powerful, secure tools to manage classrooms and evaluate student performance without exposing sensitive configurations to students.

## Features

- **Strict Isolation**: Runs securely on its own domain (port `5173`), ensuring students cannot access administrative workflows.
- **AI-Powered Evaluation**: Bulk evaluation tools leveraging AI to score subjective answers.
- **Content Creation**: Includes the **Game Studio** to plan and create interactive game modules for students.
- **Teacher Tools**: Features automated lesson planners and smart question generators.
- **Advanced Reporting**: Automated report generation and form management.
- **Risk & Analytics**: Early-warning systems identifying at-risk students based on engagement and attendance.
- **Mental Wellbeing**: Tools for faculty wellness.

## Development

TeacherBuddy is part of the EduAI Suite monorepo and is built with React, Vite, and Tailwind CSS.

Start the development server:
```bash
# From the monorepo root
npm run dev
# Or individually
npm run dev -w @eduai/teacherbuddy
```

## Security Note

This application does not implement role-switching. Only faculty and administrative accounts are authorized to log into TeacherBuddy. Student interactions occur exclusively via **EduGames**.
