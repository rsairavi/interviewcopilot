import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/server/auth";
import { generateText } from "@/lib/server/ai";

const ROLE_LABELS: Record<string, string> = {
  "ml-engineer": "ML / AI Engineer",
  "data-scientist": "Data Scientist",
  "ai-architect": "AI Solutions Architect",
  backend: "Backend Engineer",
  fullstack: "Full-Stack Engineer",
  product: "Product Manager",
};

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { question, userAnswer, role, companyMode } = await req.json();

  if (!question || !userAnswer || !role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const roleLabel = ROLE_LABELS[role] || role;

  const systemPreamble = `You are a senior interview evaluator. Evaluate the candidate's answer to the following question for a ${roleLabel} role ${companyMode !== "generic" ? `at ${companyMode}` : ""}.
Return ONLY valid JSON (no markdown fences) with this shape:
{
  "score": number, 
  "strengths": string[], 
  "improvements": string[], 
  "betterAnswer": string,
  "coachNote": string
}
Rules: 
- score: 0-100.
- strengths: 2-3 bullet points.
- improvements: 2-3 actionable points.
- betterAnswer: A "gold standard" version of how they SHOULD have answered (200-300 words).
- coachNote: 1-2 sentences of direct encouragement or warning.`;

  const userContent = `Question: "${question}"
Candidate's Answer: "${userAnswer}"`;

  const fullPrompt = `${systemPreamble}\n\n${userContent}`;

  const result = await generateText(fullPrompt, {
    maxTokens: 1000,
    temperature: 0.5,
  });

  if (!result) {
    return NextResponse.json({ error: "Failed to evaluate answer" }, { status: 500 });
  }

  try {
    const parsed = JSON.parse(result.text.trim().match(/\{[\s\S]*\}/)?.[0] || "{}");
    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json({ error: "Invalid evaluation format" }, { status: 500 });
  }
}
