"use client";

import React from "react";
import { BlockMath, InlineMath } from "react-katex";

interface MathMarkdownProps {
  content: string;
  className?: string;
}

/**
 * Parses a string containing markdown text and LaTeX math ($...$ or $$...$$)
 * and renders it with KaTeX and formatting.
 */
export function MathMarkdown({ content, className = "" }: MathMarkdownProps) {
  if (!content) return null;

  // Split by double dollar ($$...$$) first for block math, then by single dollar ($...$)
  const blockParts = content.split(/(\$\$[\s\S]*?\$\$)/g);

  return (
    <div className={`space-y-2 leading-relaxed ${className}`}>
      {blockParts.map((blockPart, bIdx) => {
        if (blockPart.startsWith("$$") && blockPart.endsWith("$$")) {
          const math = blockPart.slice(2, -2).trim();
          try {
            return (
              <div key={bIdx} className="my-3 overflow-x-auto py-1 text-center bg-black/30 p-2 rounded-lg border border-white/10">
                <BlockMath math={math} />
              </div>
            );
          } catch {
            return (
              <pre key={bIdx} className="my-2 p-2 bg-red-950/40 text-red-300 font-mono text-xs rounded">
                {blockPart}
              </pre>
            );
          }
        }

        // Inside regular text, split by lines or paragraphs
        const lines = blockPart.split("\n");
        return (
          <React.Fragment key={bIdx}>
            {lines.map((line, lIdx) => {
              const trimmed = line.trim();
              if (!trimmed) {
                return <div key={lIdx} className="h-1.5" />;
              }

              // Check for markdown headings
              if (trimmed.startsWith("### ")) {
                return (
                  <h4 key={lIdx} className="font-bold text-sm text-yellow-300 mt-2 mb-1">
                    {renderInlineMath(trimmed.slice(4))}
                  </h4>
                );
              }
              if (trimmed.startsWith("## ")) {
                return (
                  <h3 key={lIdx} className="font-black text-base text-yellow-400 mt-3 mb-1">
                    {renderInlineMath(trimmed.slice(3))}
                  </h3>
                );
              }
              if (trimmed.startsWith("# ")) {
                return (
                  <h2 key={lIdx} className="font-black text-lg text-yellow-400 mt-3 mb-1.5">
                    {renderInlineMath(trimmed.slice(2))}
                  </h2>
                );
              }

              // Check for list items
              const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("* ");
              const isNumber = /^\d+\.\s/.test(trimmed);

              if (isBullet || isNumber) {
                const bulletText = trimmed.replace(/^([-*]|\d+\.)\s/, "");
                return (
                  <div key={lIdx} className="flex items-start gap-2 ml-2 my-1 text-xs sm:text-sm">
                    <span className="text-yellow-400 font-bold shrink-0">•</span>
                    <div className="flex-1">{renderInlineMath(bulletText)}</div>
                  </div>
                );
              }

              return (
                <p key={lIdx} className="text-xs sm:text-sm text-gray-200">
                  {renderInlineMath(line)}
                </p>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function renderInlineMath(text: string): React.ReactNode {
  if (!text.includes("$")) {
    return renderBoldAndItalic(text);
  }

  const parts = text.split(/(\$.*?\$)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
          const math = part.slice(1, -1);
          try {
            return (
              <span key={index} className="inline-block mx-1 text-sky-300 font-medium">
                <InlineMath math={math} />
              </span>
            );
          } catch {
            return (
              <span key={index} className="text-red-400 font-mono text-xs">
                {part}
              </span>
            );
          }
        }
        return <React.Fragment key={index}>{renderBoldAndItalic(part)}</React.Fragment>;
      })}
    </>
  );
}

function renderBoldAndItalic(text: string): React.ReactNode {
  if (!text.includes("**")) return text;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <>
      {parts.map((p, idx) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          return (
            <strong key={idx} className="font-bold text-white">
              {p.slice(2, -2)}
            </strong>
          );
        }
        return p;
      })}
    </>
  );
}
