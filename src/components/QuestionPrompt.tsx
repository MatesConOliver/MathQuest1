"use client";

import { BlockMath } from "react-katex";

type QuestionLike = {
  promptType?: "text" | "latex" | "image";
  promptText?: string;
  promptLatex?: string;
  promptImageUrl?: string;
  // fallback for older questions
  prompt?: string;
};

export function QuestionPrompt({ q }: { q: QuestionLike }) {
  const t =
    q.promptType ??
    (q.promptLatex ? "latex" : q.promptImageUrl ? "image" : "text");

  if (t === "image" && q.promptImageUrl) {
    return (
      <div className="mt-2">
        <img
          src={q.promptImageUrl}
          alt="Question"
          className="max-w-full rounded-xl border"
        />
      </div>
    );
  }

  if (t === "latex" && q.promptLatex) {
    return (
      <div className="mt-2 overflow-x-auto">
        <BlockMath math={q.promptLatex} />
      </div>
    );
  }

  const text = q.promptText ?? q.prompt ?? "";
  return <p className="mt-2">{text}</p>;
}
