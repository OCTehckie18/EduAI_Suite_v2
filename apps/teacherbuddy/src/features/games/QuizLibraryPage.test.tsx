import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuizLibraryPage } from "./QuizLibraryPage";

const QUIZZES = [
  { id: 1, title: "Capitals", description: "", is_draft: false, is_public: true, question_count: 3, created_at: "2026-11-01T10:00:00Z" },
  { id: 2, title: "Fractions draft", description: "", is_draft: true, is_public: false, question_count: 1, created_at: "2026-11-02T10:00:00Z" },
];

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

function mockServer(onDelete: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") return onDelete();
    if (String(url).includes("/quizzes/sessions")) return json([]);
    if (String(url).includes("/quizzes/")) return json(QUIZZES);
    return json([]);
  }));
}

const renderPage = () => render(<MemoryRouter><QuizLibraryPage /></MemoryRouter>);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("QuizLibraryPage", () => {
  it("the Filter narrows the list", async () => {
    mockServer(() => json({}, 204));
    renderPage();
    expect(await screen.findByText("Capitals")).toBeInTheDocument();
    expect(screen.getByText("Fractions draft")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Filter quizzes"), "draft");
    await waitFor(() => expect(screen.queryByText("Capitals")).not.toBeInTheDocument());
    expect(screen.getByText("Fractions draft")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Filter quizzes"), "public");
    expect(await screen.findByText("Capitals")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Fractions draft")).not.toBeInTheDocument());
  });

  it("a refused delete shows the server's reason and keeps the quiz", async () => {
    mockServer(() => json({ detail: "This quiz has games in progress." }, 409));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    await screen.findByText("Capitals");
    await userEvent.click(screen.getByLabelText("Delete Capitals"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This quiz has games in progress."));
    expect(screen.getByText("Capitals")).toBeInTheDocument();
  });
});
