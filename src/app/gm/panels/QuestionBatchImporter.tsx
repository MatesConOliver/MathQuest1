"use client";

import { useState } from "react";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ContentBlock } from "@/types/game";
import { generatedQuestions } from "./generatedQuestions";

const BATCH_LIMIT = 500;

function stringToContentBlocks(text: string): ContentBlock[] {
  const parts = text.split(/(!\[.*?\]\(.*?\)|\$.*?\$)/g).filter(Boolean);

  return parts.map((part) => {
    if (part.startsWith("![")) {
      const urlMatch = part.match(/\((.*?)\)/);
      return { type: "image", value: urlMatch ? urlMatch[1] : "" };
    }
    if (part.startsWith("$") && part.endsWith("$")) {
      return { type: "latex", value: part.slice(1, -1) };
    }
    return { type: "text", value: part };
  });
}

function validateQuestions(): string | null {
  if (generatedQuestions.length === 0) {
    return "Add questions to generatedQuestions.ts before uploading.";
  }
  for (const [index, question] of generatedQuestions.entries()) {
    const number = index + 1;
    if (!question.title.trim()) return `Question ${number} needs a title.`;
    if (!question.prompt.trim()) return `Question ${number} needs a prompt.`;
    if (question.choices.length !== 4 || question.choices.some((choice) => !choice.trim())) {
      return `Question ${number} must have four non-empty choices.`;
    }
    if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex > 3) {
      return `Question ${number} must have a correctIndex from 0 to 3.`;
    }
    if (!Number.isFinite(question.difficulty) || question.difficulty < 1 || question.difficulty > 5) {
      return `Question ${number} must have a difficulty from 1 to 5.`;
    }
    if (!Array.isArray(question.tags) || question.tags.some((tag) => typeof tag !== "string")) {
      return `Question ${number} must have an array of string tags.`;
    }
  }

  return null;
}

export function QuestionBatchImporter() {
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  async function uploadBatch() {
    const validationError = validateQuestions();
    if (validationError) {
      setMessage(validationError);
      return;
    }
    if (!window.confirm(`Upload ${generatedQuestions.length} questions? Uploading again creates duplicates.`)) {
      return;
    }

    setUploading(true);
    setMessage("Uploading...");
    let uploadedCount = 0;

    try {
      for (let start = 0; start < generatedQuestions.length; start += BATCH_LIMIT) {
        const questions = generatedQuestions.slice(start, start + BATCH_LIMIT);
        const batch = writeBatch(db);

        for (const question of questions) {
          const questionRef = doc(collection(db, "questions"));
          batch.set(questionRef, {
            title: question.title,
            promptContent: stringToContentBlocks(question.prompt),
            choicesContent: question.choices.map((choice) => ({
              content: stringToContentBlocks(choice),
            })),
            correctIndex: question.correctIndex,
            difficulty: question.difficulty,
            tags: question.tags.map((tag) => tag.trim()).filter(Boolean),
            timeLimit: 30,
            order: null,
            groupId: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        await batch.commit();
        uploadedCount += questions.length;
      }

      setMessage(`Uploaded ${uploadedCount} questions successfully.`);
    } catch (error) {
      console.error("Question batch upload failed.", error);
      const detail = error instanceof Error ? error.message : "Unknown Firestore error.";
      setMessage(`Upload failed after ${uploadedCount} questions: ${detail}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="mb-6 space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
      <div>
        <h2 className="font-bold">Batch question upload</h2>
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
          Add questions to <code>generatedQuestions.ts</code>, then upload them here.
          Prompts and choices support the same text, $LaTeX$, and image syntax as the editor.
        </p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {generatedQuestions.length} question{generatedQuestions.length === 1 ? "" : "s"} ready.
          Correct answers use zero-based indexes (0–3). Uploading the same batch again creates duplicates.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={uploadBatch}
          disabled={uploading || generatedQuestions.length === 0}
          className="rounded-lg bg-black px-4 py-2 font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
        >
          {uploading ? "Uploading..." : "Upload batch"}
        </button>
        {message && <p role="status" className="text-sm font-medium">{message}</p>}
      </div>
    </section>
  );
}
