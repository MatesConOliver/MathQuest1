"use client";

import { BlockMath, InlineMath } from "react-katex";
import { StructuredChoice } from "@/types/game";

type Props = {
  question: {
    choices?: string[];
    choicesContent?: StructuredChoice[];
    choiceType?: "text" | "latex";
  };
  index: number;
};

export function ChoiceLabel({ question, index }: Props) {
  // Support new structured content
  if (question.choicesContent && question.choicesContent[index]) {
    const blocks = question.choicesContent[index].content;
    return (
      <span className="flex-1 inline-flex items-center flex-wrap gap-1">
        {blocks.map((block, i) => {
          if (block.type === "latex") {
            return (
              <span key={i} className="inline-block mx-1">
                <InlineMath math={block.value} />
              </span>
            );
          }
          if (block.type === "image") {
            return (
              <img
                key={i}
                src={block.value}
                alt="Choice option"
                className="max-h-12 rounded inline-block"
              />
            );
          }
          return <span key={i}>{block.value}</span>;
        })}
      </span>
    );
  }

  // Legacy string choices
  const t = question.choiceType ?? "text";
  const value = question.choices?.[index] ?? "";

  if (t === "latex") {
    return (
      <div className="flex-1">
        <BlockMath math={value} />
      </div>
    );
  }

  return <span>{value}</span>;
}
