"use client";

import { BlockMath } from "react-katex";

type Props = {
  question: {
    choices: string[];
    choiceType?: "text" | "latex";
  };
  index: number;
};

export function ChoiceLabel({ question, index }: Props) {
  const t = question.choiceType ?? "text";
  const value = question.choices[index] ?? "";

  if (t === "latex") {
    // BlockMath looks nicer for fractions etc.
    return (
      <div className="flex-1">
        <BlockMath math={value} />
      </div>
    );
  }

  return <span>{value}</span>;
}
