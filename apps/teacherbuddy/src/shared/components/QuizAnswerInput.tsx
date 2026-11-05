import React, { useState } from "react";

export interface QuizAnswerQuestion {
  id: number;
  question_type?: string;
  text: string;
  options: { id: number; text: string; color?: string }[];
}

interface Props {
  question: QuizAnswerQuestion;
  disabled?: boolean;
  /** Called once with what the player answered: {option_id}, {option_ids} or {text}. */
  onSubmit: (payload: Record<string, unknown>) => void;
  /** Show the answer text on each button (a phone has no projector to read it from). */
  showText?: boolean;
}

const SHAPES = ["rotate-45", "rounded-full", "-rotate-45", ""];

/** The answer area a player sees: tap one, tick several, or type, depending on the question. */
export const QuizAnswerInput: React.FC<Props> = ({ question, disabled, onSubmit, showText = true }) => {
  const kind = question.question_type || "mcq";
  const [picked, setPicked] = useState<number[]>([]);
  const [typed, setTyped] = useState("");

  if (kind === "typed") {
    return (
      <form
        className="flex-1 flex flex-col justify-center gap-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled && typed.trim()) onSubmit({ text: typed.trim() });
        }}
      >
        <label className="text-center text-lg font-black text-gray-700" htmlFor="quiz-typed-answer">
          Type your answer
        </label>
        <input
          id="quiz-typed-answer"
          autoFocus
          autoComplete="off"
          maxLength={200}
          disabled={disabled}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="w-full rounded-2xl border-4 border-purple-300 bg-white p-5 text-center text-2xl font-black text-gray-900 outline-none focus:border-purple-600"
        />
        <button
          type="submit"
          disabled={disabled || !typed.trim()}
          className="rounded-2xl bg-purple-600 p-5 text-2xl font-black text-white shadow-lg disabled:opacity-50"
        >
          Send answer
        </button>
      </form>
    );
  }

  const multi = kind === "multi";
  const toggle = (id: number) => setPicked((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));

  return (
    <div className="flex-1 flex flex-col gap-2">
      {multi && <p className="text-center text-sm font-black uppercase tracking-widest text-gray-500">Select all that apply</p>}
      <div className={`flex-1 grid gap-2 ${question.options.length <= 2 ? "grid-cols-1" : "grid-cols-2"} ${question.options.length > 2 ? "grid-rows-2" : ""}`}>
        {question.options.map((opt, idx) => {
          const on = picked.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              aria-pressed={multi ? on : undefined}
              aria-label={opt.text}
              onClick={() => (multi ? toggle(opt.id) : onSubmit({ option_id: opt.id }))}
              className={`relative w-full h-full min-h-28 rounded-2xl flex flex-col items-center justify-center gap-2 shadow-lg active:brightness-90 transition-all border-b-8 border-black/20 ${
                multi && picked.length > 0 && !on ? "opacity-50" : ""
              } ${on ? "ring-8 ring-white outline outline-4 outline-gray-900" : ""}`}
              style={{ backgroundColor: opt.color || "#333" }}
            >
              <div className="w-16 h-16 border-8 border-white/30 rounded-2xl flex items-center justify-center">
                <div className={`w-8 h-8 bg-white ${SHAPES[idx % 4]}`} />
              </div>
              {showText && <span className="px-3 text-xl font-black text-white line-clamp-2">{opt.text}</span>}
              {multi && on && <span className="absolute top-2 right-3 text-2xl font-black text-white">✓</span>}
            </button>
          );
        })}
      </div>
      {multi && (
        <button
          type="button"
          disabled={disabled || picked.length === 0}
          onClick={() => onSubmit({ option_ids: picked })}
          className="rounded-2xl bg-purple-600 p-5 text-2xl font-black text-white shadow-lg disabled:opacity-50"
        >
          Send answer
        </button>
      )}
    </div>
  );
};
