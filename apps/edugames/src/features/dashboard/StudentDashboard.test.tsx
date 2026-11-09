import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { StudentDashboard } from "./StudentDashboard";

vi.mock("../../store/useAuthStore", () => ({
  useAuthStore: () => ({ user: { name: "Alice Able" } }),
}));

const SUMMARY = {
  student: { name: "Alice Able", average: 82.5, pendingAssignments: 2, overdueAssignments: 1, liveGames: 0 },
  courses: [{ id: 7, code: "M1", name: "Maths", teacher_name: "Tess", students: 3, batch: "B", progress: 50, average: 82.5, description: "", color: "#0b4a87" }],
  deadlines: [{ id: 2, title: "Next week HW", course_code: "M1", course_id: 7, due_at: "2099-03-04T17:30:00+05:30", due_is_date_only: false, is_overdue: false, is_urgent: false }],
  overdue: [{ id: 1, title: "Late HW", course_code: "M1", course_id: 7, due_at: "2020-01-01T10:00:00+05:30", due_is_date_only: false, is_overdue: true, is_urgent: false }],
  liveGame: { title: "", teacher: "", active: false },
  recentResults: [
    { type: "exam", title: "Midterm", score: 80, status: "submitted", at: "2026-03-01T10:00:00+05:30" },
    { type: "exam", title: "Quiz cheat", score: 0, status: "flagged", at: "2026-03-02T10:00:00+05:30" },
  ],
  exams: [{ id: 5, title: "Final exam", courseCode: "M1", courseId: 7, timeLimit: 60, attemptsLeft: 1, inProgress: false }],
  announcements: [{ id: 3, title: "Class moved", body: "Room 5 tomorrow", courseCode: "M1", courseId: 7, pinned: true, createdAt: "2026-03-01T09:00:00+05:30" }],
  comingUp: [{ title: "Study group", start: "2099-03-04T17:00:00+05:30", kind: "custom", location: "Library", allDay: false, day: "today", courseId: null }],
};

const respond = (summaryStatus: number, body: unknown) =>
  vi.fn(async (url: string) => {
    const isSummary = String(url).includes("student-summary");
    const ok = !isSummary || summaryStatus < 400;
    return { ok, status: isSummary ? summaryStatus : 200, json: async () => (isSummary ? body : []) } as Response;
  });

const renderDashboard = () => render(<MemoryRouter><StudentDashboard /></MemoryRouter>);

afterEach(() => { vi.unstubAllGlobals(); });

describe("StudentDashboard", () => {
  it("shows the real average and no invented GPA, experience or rankings", async () => {
    vi.stubGlobal("fetch", respond(200, SUMMARY));
    renderDashboard();
    expect(await screen.findByText("82.5%")).toBeInTheDocument();
    expect(screen.queryByText(/TBD/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rankings/)).not.toBeInTheDocument();
  });

  it("lists overdue work separately and marks it overdue", async () => {
    vi.stubGlobal("fetch", respond(200, SUMMARY));
    renderDashboard();
    expect(await screen.findByText("Late HW")).toBeInTheDocument();
    expect(screen.getByText(/Overdue/)).toBeInTheDocument();
    expect(screen.getByText("Next week HW")).toBeInTheDocument();
  });

  it("says so, with a retry, when the dashboard cannot be loaded (never a false empty state)", async () => {
    const fetchMock = respond(500, { detail: "The server had a problem." });
    vi.stubGlobal("fetch", fetchMock);
    renderDashboard();
    expect(await screen.findByText("Your dashboard could not be loaded")).toBeInTheDocument();
    expect(screen.getByText("The server had a problem.")).toBeInTheDocument();
    expect(screen.queryByText(/not enrolled in any classrooms/)).not.toBeInTheDocument();

    vi.stubGlobal("fetch", respond(200, SUMMARY));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Late HW")).toBeInTheDocument());
  });

  it("shows results, exams to take, announcements and today's events from the server", async () => {
    vi.stubGlobal("fetch", respond(200, SUMMARY));
    renderDashboard();
    expect(await screen.findByText("Midterm")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("Flagged")).toBeInTheDocument(); // a flagged exam shows as flagged, not as a score
    expect(screen.getByText("Final exam")).toBeInTheDocument();
    expect(screen.getByText(/1 attempt left/)).toBeInTheDocument();
    expect(screen.getByText(/Class moved/)).toBeInTheDocument();
    expect(screen.getByText("Study group")).toBeInTheDocument();
  });

  it("explains the empty results box instead of leaving it blank", async () => {
    vi.stubGlobal("fetch", respond(200, { ...SUMMARY, recentResults: [], exams: [], announcements: [], comingUp: [] }));
    renderDashboard();
    expect(await screen.findByText(/Your results will appear here/)).toBeInTheDocument();
  });

  it("never sends the student's name to the server", async () => {
    const fetchMock = respond(200, SUMMARY);
    vi.stubGlobal("fetch", fetchMock);
    renderDashboard();
    await screen.findByText("82.5%");
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => /student_name|Alice/.test(url))).toBe(false);
    expect(urls.some((url) => url.includes("discoverable"))).toBe(false);
  });
});
