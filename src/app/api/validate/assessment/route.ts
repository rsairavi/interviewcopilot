import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/server/auth";
import { generateText } from "@/lib/server/ai";

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, topic, difficulty } = await req.json();

  const systemPrompt = `You are an expert technical interviewer for ${role} roles.
Generate a 5-question technical assessment on the topic: ${topic || "General " + role}.
Difficulty: ${difficulty || "Intermediate"}.
Return ONLY valid JSON (no markdown) with this shape:
{
  "assessmentId": string,
  "questions": [
    {
      "id": number,
      "question": string,
      "options": string[],
      "correctAnswer": number, // index of the correct option
      "explanation": string
    }
  ]
}
Each question must have 4 options.`;

  const result = await generateText(systemPrompt, {
    maxTokens: 1200,
    temperature: 0.7,
  });

  if (!result) return NextResponse.json({ error: "Failed to generate assessment" }, { status: 500 });

  try {
    const parsed = JSON.parse(result.text.trim().match(/\{[\s\S]*\}/)?.[0] || "{}");
    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json({ error: "Invalid assessment format" }, { status: 500 });
  }
}
