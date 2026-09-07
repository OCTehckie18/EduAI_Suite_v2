import React, { useEffect, useState } from "react";
import {
  Sparkles,
  BrainCircuit,
  Lightbulb,
  BookOpen,
  Clock,
  RefreshCw,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "../../shared/components/GlassCard";
import { AutoLessonPlannerComponent } from "./AutoLessonPlannerComponent";

const tools = [
  // {
  //   id: "generator",
  //   title: "Smart Question Generator",
  //   desc: "AI generates MCQs, Case studies, and Coding questions instantly.",
  //   icon: BrainCircuit,
  //   color: "text-blue-500",
  //   bg: "bg-blue-100/50",
  // },
  {
    id: "planner",
    title: "Auto Lesson Planner",
    desc: "Input a syllabus topic, get a structured flow with activities and quizzes.",
    icon: Lightbulb,
    color: "text-yellow-500",
    bg: "bg-yellow-100/50",
  },
  // {
  //   id: "intervention",
  //   title: "Intervention Planner",
  //   desc: "Get AI-suggested actions and extra tasks for at-risk students.",
  //   icon: Sparkles,
  //   color: "text-purple-500",
  //   bg: "bg-purple-100/50",
  // },
];

export const TeacherToolsPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedTool, setSelectedTool] = useState<string>("planner");
  const [courseId, setCourseId] = useState<number | null>(null);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/courses/`);
        if (!response.ok) return;
        const courses = await response.json();
        if (Array.isArray(courses) && courses.length > 0) {
          setCourseId(courses[0].id);
        }
      } catch {
        setCourseId(null);
      }
    };

    fetchCourses();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1
          className="text-2xl font-bold font-display"
          style={{ color: "var(--color-text-primary)" }}
        >
          AI Teaching Tools
        </h1>
        <p className="mt-1" style={{ color: "var(--color-text-secondary)" }}>
          Accelerate your prep time with generative AI.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tools.map((tool) => (
          <GlassCard
            key={tool.id}
            className={`p-5 cursor-pointer transition-all hover:-translate-y-1 ${selectedTool === tool.id ? "ring-2 ring-blue-500" : ""}`}
            onClick={() => setSelectedTool(tool.id)}
          >
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${tool.bg} ${tool.color}`}
            >
              <tool.icon size={20} />
            </div>
            <h3
              className="font-bold mb-1"
              style={{ color: "var(--color-text-primary)" }}
            >
              {tool.title}
            </h3>
            <p
              className="text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {tool.desc}
            </p>
          </GlassCard>
        ))}
      </div>

      {/* Tool Workspace */}
      {selectedTool === "planner" && (
        <AutoLessonPlannerComponent courseId={courseId ?? undefined} />
      )}

      {selectedTool === "generator" && (
        <GlassCard className="p-6">
          <h2
            className="text-lg font-bold mb-4 font-display"
            style={{ color: "var(--color-text-primary)" }}
          >
            Smart Question Generator
          </h2>
          <div
            className="p-12 text-center rounded-lg border-2 border-dashed"
            style={{ borderColor: "var(--color-border)" }}
          >
            <BrainCircuit
              size={32}
              className="mx-auto mb-3 text-blue-400"
              style={{ color: "var(--color-text-secondary)" }}
            />
            <p style={{ color: "var(--color-text-secondary)" }}>
              Question generator coming soon...
            </p>
          </div>
        </GlassCard>
      )}

      {selectedTool === "intervention" && (
        <GlassCard className="p-6">
          <h2
            className="text-lg font-bold mb-4 font-display"
            style={{ color: "var(--color-text-primary)" }}
          >
            Intervention Planner
          </h2>
          <div
            className="p-12 text-center rounded-lg border-2 border-dashed"
            style={{ borderColor: "var(--color-border)" }}
          >
            <Sparkles
              size={32}
              className="mx-auto mb-3 text-purple-400"
              style={{ color: "var(--color-text-secondary)" }}
            />
            <p style={{ color: "var(--color-text-secondary)" }}>
              Intervention planner coming soon...
            </p>
          </div>
        </GlassCard>
      )}
    </div>
  );
};
