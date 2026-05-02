import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/server/auth";
import { generateText } from "@/lib/server/ai";

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { transcript, role } = await req.json();

  if (!transcript) {
    return NextResponse.json({ error: "No speech transcript provided" }, { status: 400 });
  }

  const systemPrompt = `You are a communications coach for elite tech professionals. 
Analyze the provided speech transcript for a ${role} candidate.
Return ONLY valid JSON (no markdown) with this shape:
{
  "confidenceScore": number, // 0-100
  "clarityScore": number, // 0-100
  "fillerWordCount": number,
  "fillerWordList": string[],
  "feedback": string,
  "suggestedImprovement": string
}
Identify filler words like "um", "uh", "like", "you know", "actually", "basically".`;

  const result = await generateText(`${systemPrompt}\n\nTranscript:\n"${transcript}"`, {
    maxTokens: 800,
    temperature: 0.5,
  });

  if (!result) return NextResponse.json({ error: "Failed to analyze speech" }, { status: 500 });

  try {
    const parsed = JSON.parse(result.text.trim().match(/\{[\s\S]*\}/)?.[0] || "{}");
    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json({ error: "Invalid analysis format" }, { status: 500 });
  }
}
