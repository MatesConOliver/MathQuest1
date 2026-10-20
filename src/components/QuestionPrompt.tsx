"use client";

import { BlockMath, InlineMath } from "react-katex";
import { ContentBlock } from "@/types/game";

type QuestionLike = {
  promptContent?: ContentBlock[];
  promptType?: "text" | "latex" | "image";
  promptText?: string;
  promptLatex?: string;
  promptImageUrl?: string;
  prompt?: string;
};

export function QuestionPrompt({ q }: { q: QuestionLike }) {
  if (q.promptContent && q.promptContent.length > 0) {
    return (
      <div className="mt-2 space-y-2">
        {q.promptContent.map((block, idx) => {
          if (block.type === "latex") {
            return (
              <span key={idx} className="inline-block mx-1">
                <InlineMath math={block.value} />
              </span>
            );
          }
          if (block.type === "image") {
            return (
              <img
                key={idx}
                src={block.value}
                alt="Question Content"
                className="my-2 rounded-xl border max-w-full h-auto inline-block"
              />
            );
          }
          return <span key={idx}>{block.value}</span>;
        })}
      </div>
    );
  }

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
