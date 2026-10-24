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
                    {renderInlineFormatted(trimmed.slice(4))}
                  </h4>
                );
              }
              if (trimmed.startsWith("## ")) {
                return (
                  <h3 key={lIdx} className="font-black text-base text-yellow-400 mt-3 mb-1">
                    {renderInlineFormatted(trimmed.slice(3))}
                  </h3>
                );
              }
              if (trimmed.startsWith("# ")) {
                return (
                  <h2 key={lIdx} className="font-black text-lg text-yellow-400 mt-3 mb-1.5">
                    {renderInlineFormatted(trimmed.slice(2))}
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
                    <div className="flex-1">{renderInlineFormatted(bulletText)}</div>
                  </div>
                );
              }

              return (
                <p key={lIdx} className="text-xs sm:text-sm text-gray-200">
                  {renderInlineFormatted(line)}
                </p>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/**
 * Renders inline text, properly handling bold (**...**), italic (*...*),
 * and LaTeX math ($...$) even when math is nested inside bold text.
 */
function renderInlineFormatted(text: string): React.ReactNode {
  if (!text) return null;

  // Matches:
  // 1. Double asterisk bold: **text** (can contain $...$)
  // 2. Double underscore bold: __text__
  // 3. Inline LaTeX: $math$
  // 4. Single asterisk emphasis: *text*
  const tokenRegex = /(\*\*[^\n*]+?\*\*|__[^\n_]+?__|\$[^\$\n]+?\$|\*[^\n*]+?\*)/g;
  const parts = text.split(tokenRegex);

  return (
    <>
      {parts.map((part, idx) => {
        if (!part) return null;

        // Double asterisk bold: **text**
        if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
          const inner = part.slice(2, -2);
          return (
            <strong key={idx} className="font-bold text-white">
              {renderMathOnly(inner)}
            </strong>
          );
        }

        // Double underscore bold: __text__
        if (part.startsWith("__") && part.endsWith("__") && part.length >= 4) {
          const inner = part.slice(2, -2);
          return (
            <strong key={idx} className="font-bold text-white">
              {renderMathOnly(inner)}
            </strong>
          );
        }

        // Inline LaTeX math: $math$
        if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
          const math = part.slice(1, -1);
          try {
            return (
              <span key={idx} className="inline-block mx-1 text-sky-300 font-medium">
                <InlineMath math={math} />
              </span>
            );
          } catch {
            return (
              <span key={idx} className="text-red-400 font-mono text-xs">
                {part}
              </span>
            );
          }
        }

        // Single asterisk emphasis: *text*
        if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
          const inner = part.slice(1, -1);
          return (
            <span key={idx} className="font-semibold text-yellow-200">
              {renderMathOnly(inner)}
            </span>
          );
        }

        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
    </>
  );
}

/**
 * Helper to render any $...$ math nested inside bold/italic text
 */
function renderMathOnly(text: string): React.ReactNode {
  if (!text.includes("$")) return text;
  const parts = text.split(/(\$[^\$\n]+?\$)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("$") && p.endsWith("$") && p.length > 2) {
          const math = p.slice(1, -1);
          try {
            return (
              <span key={i} className="inline-block mx-1 text-sky-300 font-medium">
                <InlineMath math={math} />
              </span>
            );
          } catch {
            return (
              <span key={i} className="text-red-400 font-mono text-xs">
                {p}
              </span>
            );
          }
        }
        return <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </>
  );
}
