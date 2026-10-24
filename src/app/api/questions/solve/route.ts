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

    // 3. Priority 2: Return cached AI solution if it exists AND matches requested curriculum location
    const cachedLocationOrder = questionData.aiSolution?.locationOrder ?? null;
    const isLocationMatch = !reqLocationOrder || cachedLocationOrder === reqLocationOrder;

    if (questionData.aiSolution && questionData.aiSolution.text && !forceRefresh && isLocationMatch) {
      return NextResponse.json({
        source: "cached_ai",
        solutionText: questionData.aiSolution.text,
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

    // Compose user prompt for live streaming
    const userPrompt = `
You are an expert mathematics professor analyzing a multiple-choice mathematics problem from an educational adventure game.

TITLE: ${questionData.title || "Mathematics Question"}
PROBLEM STATEMENT:
${promptText}

MULTIPLE-CHOICE OPTIONS:
${choicesTexts.join("\n")}

GAME DATABASE CONFIGURATION:
Configured Correct Option in database: Option ${configuredLetter} (index ${configuredIndex})

${curriculumPrompt}

INSTRUCTIONS FOR YOUR EXPLANATION:
1. Provide a rigorous, crystal-clear, step-by-step mathematical derivation using ONLY the allowed curriculum concepts to solve the problem.
2. PEDAGOGICAL NARRATIVE: You MUST include clear explanatory sentences BETWEEN mathematical steps. Explain WHY each step is done, what algebraic identity or formula is being applied, and how it directly advances the solution toward the answer. Do not merely list raw equations without narrative explanation.
3. FORMATTING: Use standard LaTeX formatting ($...$ for inline expressions, $$...$$ for standalone display equations).
4. Verify all options carefully against your derivation. Compute which option is mathematically correct (Option A, B, C, or D).
5. At the VERY END of your explanation, output a separate verification block on new lines with this exact format:

---VERIFICATION---
CORRECT_OPTION: [A, B, C, or D]
IS_DISCREPANCY: [TRUE or FALSE]
DISCREPANCY_NOTE: [If IS_DISCREPANCY is TRUE, explain author error here. If FALSE, write: None]
---END_VERIFICATION---
`.trim();

    contentParts.push({ text: userPrompt });

    // Call Gemini with Streaming (ultra-low latency, tokens stream immediately)
    let responseStream: any;
    try {
      responseStream = await ai.models.generateContentStream({
        model: "gemini-flash-latest",
        contents: contentParts,
        config: {
          systemInstruction:
            "You are an expert mathematics professor and curriculum auditor for the IB DP Mathematics AA HL curriculum. You explain math with deep pedagogical clarity, using standard LaTeX notation ($...$ inline and $$...$$ display) and thoughtful explanatory sentences between intermediate steps, strictly obeying the student's current location syllabus bounds.",
          temperature: 0.1,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          maxOutputTokens: 2500,
        },
      });
    } catch (modelErr: any) {
      const errMsg = modelErr?.message || String(modelErr);
      const isDenied = errMsg.includes("denied access") || errMsg.includes("PERMISSION_DENIED") || errMsg.includes("403");
      const isKeyInvalid = errMsg.includes("API_KEY_INVALID") || errMsg.includes("not found");
      const isBillingExhausted = errMsg.includes("402") || errMsg.includes("prepay") || errMsg.includes("prepago") || errMsg.includes("RESOURCE_EXHAUSTED");

      if (isBillingExhausted) {
        return NextResponse.json(
          {
            error: "Google AI Error 402 (Prepaid Budget Exhausted): The Google Cloud project for this key has prepaid billing configured with a budget of $0. In Google AI Studio (https://aistudio.google.com/app/apikey), create a key in a project WITHOUT billing attached to use the 100% Free Tier (15 requests/min, 1,500/day free), or add prepay credit to your current project.",
            needsApiKey: true,
            isBillingError: true,
            details: errMsg,
          },
          { status: 402 }
        );
      }

      if (isDenied || isKeyInvalid) {
        return NextResponse.json(
          {
            error: isDenied
              ? "Google AI access was denied for the default environment key. Please enter your Google AI Studio API key (free at https://aistudio.google.com) to generate step-by-step explanations."
              : `Google AI API key error: ${errMsg}`,
            needsApiKey: true,
            details: errMsg,
          },
          { status: 403 }
        );
      }

      console.warn("[Gemini Solver] gemini-flash-latest failed, trying fallback to gemini-3.8-flash:", modelErr);
      try {
        responseStream = await ai.models.generateContentStream({
          model: "gemini-3.8-flash",
          contents: contentParts,
          config: {
            systemInstruction:
              "You are an expert mathematics professor and curriculum auditor for the IB DP Mathematics AA HL curriculum. You explain math clearly with LaTeX notation, include pedagogical narrative between steps, and strictly respect curriculum constraints.",
            temperature: 0.1,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            maxOutputTokens: 2500,
          },
        });
      } catch (fbErr: any) {
        const fbErrMsg = fbErr?.message || String(fbErr);
        const fbIsBillingExhausted = fbErrMsg.includes("402") || fbErrMsg.includes("prepay") || fbErrMsg.includes("prepago") || fbErrMsg.includes("RESOURCE_EXHAUSTED");
        const fbIsDenied = fbErrMsg.includes("denied access") || fbErrMsg.includes("PERMISSION_DENIED") || fbErrMsg.includes("403");

        if (fbIsBillingExhausted) {
          return NextResponse.json(
            {
              error: "Google AI Error 402 (Prepaid Budget Exhausted): The project for this API key has prepaid billing with a $0 budget. Create an API key in a Google AI Studio project WITHOUT billing to use the 100% Free Tier (1,500/day free), or add funds to your project.",
              needsApiKey: true,
              isBillingError: true,
              details: fbErrMsg,
            },
            { status: 402 }
          );
        }

        return NextResponse.json(
          {
            error: fbIsDenied
              ? "Google AI Studio API key required: The default environment key has restricted permissions. Please enter your own Google AI Studio API key."
              : `AI Generation error: ${fbErrMsg}`,
            needsApiKey: fbIsDenied,
            details: fbErrMsg,
          },
          { status: fbIsDenied ? 403 : 500 }
        );
      }
    }

    // Return Server-Sent Events stream for live word-by-word typing
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            if (chunk.text) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: chunk.text })}\n\n`)
              );
            }
          }
          const durationMs = Date.now() - startTime;
          console.log(`[Gemini Solver] Stream completed successfully in ${durationMs}ms`);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done", locationOrder: reqLocationOrder })}\n\n`
            )
          );
          controller.close();
        } catch (streamErr: any) {
          console.error("[Stream Chunk Error]:", streamErr);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: streamErr.message || String(streamErr) })}\n\n`
            )
          );
          controller.close();
        }
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
