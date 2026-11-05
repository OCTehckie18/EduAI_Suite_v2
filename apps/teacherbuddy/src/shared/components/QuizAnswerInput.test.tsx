import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuizAnswerInput } from "./QuizAnswerInput";

const options = [
  { id: 1, text: "Paris", color: "#e21b3c" },
  { id: 2, text: "Rome", color: "#1368ce" },
  { id: 3, text: "Oslo", color: "#d89e00" },
];
const question = (question_type: string, opts = options) => ({ id: 9, question_type, text: "Capital?", options: opts });

describe("QuizAnswerInput", () => {
  it("sends the tapped answer straight away for single-choice and true/false questions", async () => {
    const onSubmit = vi.fn();
    render(<QuizAnswerInput question={question("mcq")} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Rome" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ option_id: 2 });
  });

  it("lets several answers be ticked and only sends them when told to", async () => {
    const onSubmit = vi.fn();
    render(<QuizAnswerInput question={question("multi")} onSubmit={onSubmit} />);
    const send = screen.getByRole("button", { name: "Send answer" });
    expect(send).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Paris" }));
    await userEvent.click(screen.getByRole("button", { name: "Oslo" }));
    await userEvent.click(screen.getByRole("button", { name: "Oslo" })); // untick
    await userEvent.click(screen.getByRole("button", { name: "Rome" }));
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.click(send);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ option_ids: [1, 2] });
  });

  it("sends typed text trimmed, and not an empty box", async () => {
    const onSubmit = vi.fn();
    render(<QuizAnswerInput question={question("typed", [])} onSubmit={onSubmit} />);
    const send = screen.getByRole("button", { name: "Send answer" });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Type your answer"), "  Paris ");
    await userEvent.click(send);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ text: "Paris" });
  });

  it("cannot be answered again once disabled", async () => {
    const onSubmit = vi.fn();
    render(<QuizAnswerInput question={question("mcq")} disabled onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Paris" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
