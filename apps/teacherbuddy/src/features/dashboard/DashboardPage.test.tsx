import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DashboardPage } from "./DashboardPage";

vi.mock("../../store/useAuthStore", () => ({
  useAuthStore: () => ({ user: { name: "Ann Lee" } }),
}));
vi.mock("../games/TeacherTestRuns", () => ({ TeacherTestRuns: () => null }));

const DATA = {
  stats: [{ label: "Active Students", value: "3", delta: "+2", icon: "Users", color: "#0b4a87", bg: "#eef", accent: "x" }],
  classrooms: [{ id: 1, code: "M1", name: "Maths", batch: "B", students: 3, time: null, submitted: 8, graded: 5, progress: 63, teacher: "Ann Lee" }],
  riskAlerts: [],
  recentActivity: [],
  schedule: [],
  pendingAppointments: [{ id: 9, studentName: "Sam", agenda: "Project help", timeSlot: "2099-01-01 10:00", status: "pending" }],
  recentReports: [],
  mailStats: { sentThisWeek: 0, lastSentAt: null },
  upcomingExams: [],
  engagementSnapshot: { avgAttendance: null, avgScore: null, atRiskCount: 0, studentCount: 3 },
  calendarEventsThisWeek: 0,
  markingQueue: { total: 4, items: [{ assignmentId: 1, title: "Big essay", courseId: 1, courseCode: "M1", waiting: 4 }] },
  dueSoon: [{ assignmentId: 2, title: "Lab report", courseId: 1, courseCode: "M1", dueAt: "2099-03-04T17:00:00+05:30", dueIsDateOnly: false, handedIn: 2, enrolled: 3 }],
  examResults: [{ examId: 9, title: "Midterm", courseCode: "M1", status: "published", finished: 5, flagged: 1, average: 72.5 }],
};

const mockApi = (patchResult: { ok: boolean; status: number; body: unknown }, summaryOk = true) =>
  vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return { ok: patchResult.ok, status: patchResult.status, json: async () => patchResult.body } as Response;
    if (String(url).includes("/summary")) return { ok: summaryOk, status: summaryOk ? 200 : 500, json: async () => (summaryOk ? DATA : { detail: "Server problem" }) } as Response;
    return { ok: true, status: 200, json: async () => [] } as Response;
  });

const renderPage = () => render(<MemoryRouter><DashboardPage /></MemoryRouter>);
afterEach(() => { vi.unstubAllGlobals(); });

describe("TeacherBuddy dashboard", () => {
  it("keeps the dashboard and shows the reason next to the request when Approve fails", async () => {
    vi.stubGlobal("fetch", mockApi({ ok: false, status: 403, body: { detail: "You cannot change this appointment." } }));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Approve the request from Sam/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You cannot change this appointment.");
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    expect(screen.getByText("Maths")).toBeInTheDocument(); // the rest of the dashboard is still there
    expect(screen.getByRole("button", { name: /Approve the request from Sam/ })).toBeEnabled();
  });

  it("removes the request once it is approved", async () => {
    vi.stubGlobal("fetch", mockApi({ ok: true, status: 200, body: {} }));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Approve the request from Sam/ }));
    await waitFor(() => expect(screen.queryByText("Sam")).not.toBeInTheDocument());
  });

  it("shows the marking queue, what is due this week and the exam results", async () => {
    vi.stubGlobal("fetch", mockApi({ ok: true, status: 200, body: {} }));
    renderPage();
    expect(await screen.findByText("4 to mark")).toBeInTheDocument();
    expect(screen.getByText("Big essay")).toBeInTheDocument();
    expect(screen.getByText("2 of 3 handed in")).toBeInTheDocument();
    expect(screen.getByText(/average 72.5%/)).toBeInTheDocument();
    expect(screen.getByText(/1 flagged for leaving the exam/)).toBeInTheDocument();
  });

  it("shows empty states and the real graded counts", async () => {
    vi.stubGlobal("fetch", mockApi({ ok: true, status: 200, body: {} }));
    renderPage();
    expect(await screen.findByText("5 of 8 graded")).toBeInTheDocument();
    expect(screen.getByText("Nothing has happened in your classes yet.")).toBeInTheDocument();
    expect(screen.getByText(/No student is below 60%/)).toBeInTheDocument();
  });

  it("retries a failed load without reloading the whole window", async () => {
    vi.stubGlobal("fetch", mockApi({ ok: true, status: 200, body: {} }, false));
    renderPage();
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Server problem")).toBeInTheDocument();
    vi.stubGlobal("fetch", mockApi({ ok: true, status: 200, body: {} }));
    await userEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(await screen.findByText("Maths")).toBeInTheDocument();
  });
});
