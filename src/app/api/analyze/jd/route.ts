import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/server/auth";
import { generateText } from "@/lib/server/ai";

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jdText, resumeText, role } = await req.json();

  if (!jdText || !resumeText) {
    return NextResponse.json({ error: "Missing JD or Resume text" }, { status: 400 });
  }

  const systemPreamble = `You are a technical recruiting expert. Compare the provided Job Description (JD) with the candidate's Resume for a ${role || "technical"} role.
Identify specific gaps and generate 3-5 targeted interview questions the candidate should prepare for.
Return ONLY valid JSON (no markdown fences) with this shape:
{
  "gapAnalysis": string[],
  "matchingSkills": string[],
  "prepQuestions": string[],
  "overallFitScore": number
}
Rules: 
- gapAnalysis: focus on missing technologies, leadership scope, or domain experience.
- matchingSkills: highlight where the candidate is strongest for this JD.
- prepQuestions: high-signal questions to test the candidate on their gap areas.
- overallFitScore: 0-100.`;

  const userContent = `Job Description:
${jdText.slice(0, 4000)}

Candidate Resume:
${resumeText.slice(0, 4000)}`;

  const result = await generateText(`${systemPreamble}\n\n${userContent}`, {
    maxTokens: 800,
    temperature: 0.5,
  });

  if (!result) {
    return NextResponse.json({ error: "Failed to analyze JD" }, { status: 500 });
  }

  try {
    const parsed = JSON.parse(result.text.trim().match(/\{[\s\S]*\}/)?.[0] || "{}");
    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json({ error: "Invalid analysis format" }, { status: 500 });
  }
}
