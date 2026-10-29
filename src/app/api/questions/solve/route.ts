import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { QuestionDoc, ContentBlock } from "@/types/game";
import { getCurriculumConstraintPrompt } from "@/lib/syllabus";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Extract all image URLs from a QuestionDoc (prompt and choices)
function extractImageUrls(question: QuestionDoc): string[] {
  const urls: string[] = [];

  // 1. Structured prompt
  if (question.promptContent) {
    question.promptContent.forEach((block) => {
      if (block.type === "image" && block.value) urls.push(block.value);
    });
  }

  // 2. Legacy prompt image
  if (question.promptImageUrl) {
    urls.push(question.promptImageUrl);
  }
  if (question.imageUrl) {
    urls.push(question.imageUrl);
  }

  // 3. Structured choices
  if (question.choicesContent) {
    question.choicesContent.forEach((c) => {
      c.content?.forEach((block) => {
        if (block.type === "image" && block.value) urls.push(block.value);
      });
    });
  }

  // 4. Legacy choices markdown images
  if (question.choices) {
    question.choices.forEach((c) => {
      const match = c.match(/!\[.*?\]\((.*?)\)/);
      if (match && match[1]) urls.push(match[1]);
    });
  }

  return Array.from(new Set(urls.filter(Boolean)));
}

// Convert question content blocks to readable text string
function contentBlocksToText(blocks?: ContentBlock[]): string {
  if (!blocks || !Array.isArray(blocks)) return "";
  return blocks
    .map((b) => {
      if (b.type === "latex") return `$${b.value}$`;
      if (b.type === "image") return `[Image: ${b.value}]`;
      return b.value;
    })
    .join(" ");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { questionId, questionData: clientQuestionData, forceRefresh, locationOrder } = body;
    const reqLocationOrder =
      typeof locationOrder === "number" && !isNaN(locationOrder) && locationOrder > 0
        ? Math.round(locationOrder)
        : null;

    if (!questionId && !clientQuestionData) {
      return NextResponse.json({ error: "questionId or questionData is required" }, { status: 400 });
    }

    const startTime = Date.now();
    const questionData: QuestionDoc | null = clientQuestionData || null;

    if (!questionData) {
      return NextResponse.json({ error: "Question details could not be found" }, { status: 404 });
    }

    // 2. Priority 1: GM's manual solutionText ALWAYS overrides everything
    if (questionData.solutionText && questionData.solutionText.trim() && !forceRefresh) {
      return NextResponse.json({
        source: "gm",
        solutionText: questionData.solutionText.trim(),
        solutionUrl: questionData.solutionUrl || null,
        verifiedCorrectIndex: questionData.correctIndex ?? 0,
        isDiscrepancy: false,
        cached: true,
      });
    }

    // 3. Priority 2: Return cached AI solution if it exists (0 tokens, instant response)
    const cachedLocationOrder = questionData.aiSolution?.locationOrder ?? null;
    if (questionData.aiSolution && questionData.aiSolution.text && questionData.aiSolution.text.trim() && !forceRefresh) {
      return NextResponse.json({
        source: "cached_ai",
        solutionText: questionData.aiSolution.text.trim(),
        solutionUrl: questionData.solutionUrl || null,
        verifiedCorrectIndex: questionData.aiSolution.verifiedCorrectIndex ?? questionData.correctIndex,
        isDiscrepancy: !!questionData.aiSolution.isDiscrepancy,
        discrepancyNote: questionData.aiSolution.discrepancyNote || null,
        generatedAt: questionData.aiSolution.generatedAt,
        locationOrder: cachedLocationOrder,
        cached: true,
      });
    }

    // 4. Priority 3: Generate via Google AI (using active workspace Gemini Flash model)
    const headerKey = req.headers.get("x-gemini-api-key");
    const customKey = (headerKey && headerKey.trim()) || (body.geminiApiKey && String(body.geminiApiKey).trim());
    const apiKey = customKey || process.env.CUSTOM_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error: "Google Gemini API key is missing. Please provide your Google AI Studio API key.",
          needsApiKey: true,
        },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // Build question representation
    const promptText = questionData.promptContent
      ? contentBlocksToText(questionData.promptContent)
      : questionData.promptText || questionData.promptLatex || "Untitled Question";

    const choicesTexts: string[] = [];
    if (questionData.choicesContent && questionData.choicesContent.length > 0) {
      questionData.choicesContent.forEach((c, idx) => {
        choicesTexts.push(`Option ${String.fromCharCode(65 + idx)}: ${contentBlocksToText(c.content)}`);
      });
    } else if (questionData.choices && questionData.choices.length > 0) {
      questionData.choices.forEach((c, idx) => {
        choicesTexts.push(`Option ${String.fromCharCode(65 + idx)}: ${c}`);
      });
    }

    const configuredIndex = questionData.correctIndex ?? 0;
    const configuredLetter = String.fromCharCode(65 + configuredIndex);

    // Collect images for multimodal analysis
    const imageUrls = extractImageUrls(questionData);
    const contentParts: any[] = [];

    // Parallel download or decode images as inlineData (max 2s timeout per image)
    const imageResults = await Promise.allSettled(
      imageUrls.map(async (imgUrl) => {
        const dataMatch = imgUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (dataMatch) {
          return {
            inlineData: {
              mimeType: dataMatch[1],
              data: dataMatch[2],
            },
          };
        }
        if (imgUrl.startsWith("http://") || imgUrl.startsWith("https://")) {
          const fetchRes = await fetch(imgUrl, { signal: AbortSignal.timeout(2000) });
          if (fetchRes.ok) {
            const buffer = await fetchRes.arrayBuffer();
            const mimeType = fetchRes.headers.get("content-type")?.split(";")[0] || "image/jpeg";
            return {
              inlineData: {
                mimeType,
                data: Buffer.from(buffer).toString("base64"),
              },
            };
          }
        }
        return null;
      })
    );

    imageResults.forEach((res) => {
      if (res.status === "fulfilled" && res.value) {
        contentParts.push(res.value);
      }
    });

    const curriculumPrompt = getCurriculumConstraintPrompt(reqLocationOrder);

    // Compose user prompt (NO internal question title included)
    const userPrompt = `
You are an expert mathematics professor explaining a multiple-choice mathematics problem from an educational adventure game.

PROBLEM STATEMENT:
${promptText}

MULTIPLE-CHOICE OPTIONS:
${choicesTexts.join("\n")}

GAME DATABASE CONFIGURATION:
Configured Correct Option in database: Option ${configuredLetter} (index ${configuredIndex})

${curriculumPrompt}

MANDATORY INSTRUCTIONS:
You MUST structure your response into the following two sections in order:

### Step-by-Step Derivation & Explanation
1. NOTE ON ALTERNATIVE METHODS: If there are alternative, more obvious, or more direct ways to solve this question (such as direct inspection, testing choice options, symmetry, or intuitive shortcuts), include a brief 1-2 sentence note right at the very beginning (e.g., "**Alternative Approaches:** While this problem can also be solved more directly by [mention alternative method], here is a full step-by-step derivation:"), so the student does not feel this derivation is the only way to reach the solution.
2. Provide a rigorous, crystal-clear, step-by-step mathematical derivation from first principles/allowed tools to reach the correct answer.
3. PEDAGOGICAL NARRATIVE: You MUST include clear explanatory sentences BETWEEN intermediate mathematical steps. Explain WHY each step is done, what theorem, identity, or formula is being applied, and how it directly advances the solution toward the answer. Do not merely list raw equations without narrative explanation.
4. FORMATTING: Use standard LaTeX formatting ($...$ for inline expressions, $$...$$ for standalone display equations).
5. Verify all options carefully against your derivation. Compute which option is mathematically correct (Option A, B, C, or D).

### Verification
CORRECT_OPTION: [A, B, C, or D]
IS_DISCREPANCY: [TRUE or FALSE]
DISCREPANCY_NOTE: [If IS_DISCREPANCY is TRUE, explain author error here. If FALSE, write: None]
`.trim();

    contentParts.push({ text: userPrompt });
    const formattedContents = [{ role: "user", parts: contentParts }];

    // Return Server-Sent Events stream immediately (flushes HTTP 200 in ~10ms to eliminate Vercel 504 Gateway Timeouts)
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // 1. Immediate heartbeat comment flushes HTTP headers to Vercel and browser instantly
        controller.enqueue(encoder.encode(": connected\n\n"));

        // Models to try in order: stable production flash first, then 3.8 flash, then flash-lite
        const candidateModels = [
          { name: "gemini-flash-latest", thinking: false },
          { name: "gemini-3.8-flash", thinking: true },
          { name: "gemini-3.1-flash-lite", thinking: false },
        ];

        let streamedAnyChunk = false;
        let lastErrorMsg = "";
        let isBillingExhausted = false;
        let isKeyDenied = false;

        for (const candidate of candidateModels) {
          try {
            console.log(`[Gemini Solver] Attempting model ${candidate.name}...`);
            const config: any = {
              systemInstruction:
                "You are an expert mathematics professor and curriculum auditor for the IB DP Mathematics AA HL curriculum. If there are more obvious or alternative ways to solve the problem, you always note them briefly at the top of '### Step-by-Step Derivation & Explanation' so students recognize multiple valid paths, then provide the complete step-by-step mathematical derivation with pedagogical explanations between steps, followed by the short '### Verification' block.",
              temperature: 0.1,
              maxOutputTokens: 1500,
            };

            if (candidate.thinking) {
              config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
            }

            const responseStream = await ai.models.generateContentStream({
              model: candidate.name,
              contents: formattedContents,
              config,
            });

            for await (const chunk of responseStream) {
              if (chunk.text) {
                streamedAnyChunk = true;
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: chunk.text })}\n\n`)
                );
              }
            }

            if (streamedAnyChunk) {
              const durationMs = Date.now() - startTime;
              console.log(`[Gemini Solver] Completed with ${candidate.name} in ${durationMs}ms`);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "done", locationOrder: reqLocationOrder })}\n\n`
                )
              );
              controller.close();
              return;
            }
          } catch (modelErr: any) {
            const rawMsg = modelErr?.message || String(modelErr);
            console.warn(`[Gemini Solver] Model ${candidate.name} error:`, rawMsg);

            if (rawMsg.includes("402") || rawMsg.includes("prepay") || rawMsg.includes("prepago") || rawMsg.includes("RESOURCE_EXHAUSTED")) {
              isBillingExhausted = true;
            }
            if (rawMsg.includes("denied access") || rawMsg.includes("PERMISSION_DENIED") || rawMsg.includes("403") || rawMsg.includes("API_KEY_INVALID")) {
              isKeyDenied = true;
            }

            // Extract cleaner text from JSON if present
            const matchMsg = rawMsg.match(/"message":\s*"([^"]+)"/);
            lastErrorMsg = matchMsg ? matchMsg[1].replace(/\\n/g, " ") : rawMsg;

            // If we already started streaming text to the user, we cannot switch models mid-stream
            if (streamedAnyChunk) {
              break;
            }
            // Otherwise, continue to the next candidate model in the list!
          }
        }

        // If we reach here and no text was streamed, report clean error
        let finalUserError = lastErrorMsg || "All available models are temporarily busy. Please try again in a few moments.";
        if (isBillingExhausted) {
          finalUserError = "Google AI Error 402: Project billing quota exhausted. In Google AI Studio (aistudio.google.com), create a key in a project without billing for 1,500 free requests/day.";
        } else if (isKeyDenied) {
          finalUserError = "Google AI API key error: Key is invalid or denied permission. Please check your GEMINI_API_KEY.";
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              error: finalUserError,
              needsApiKey: isKeyDenied || isBillingExhausted,
              isBillingError: isBillingExhausted,
            })}\n\n`
          )
        );
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err: any) {
    console.error("[Gemini Solver API Error]:", err);
    return NextResponse.json(
      {
        error: err.message || "Failed to generate solution",
      },
      { status: 500 }
    );
  }
}
