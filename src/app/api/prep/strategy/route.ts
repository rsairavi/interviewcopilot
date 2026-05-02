import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/server/auth";
import { generateText } from "@/lib/server/ai";

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type, companyMode, role, notes } = await req.json();

  let systemPrompt = "";
  let userContent = `Company: ${companyMode}, Role: ${role}`;

  if (type === "battle-card") {
    systemPrompt = `Generate a high-density "Interview Battle Card" for a ${role} position at ${companyMode}. 
Include:
1. Key Company Values/Principles.
2. Technical "Must-Knows" for this role/company.
3. Recent Company News/Strategy.
4. "The North Star": The one thing to keep in mind during this interview.
Return valid JSON (no markdown) with fields: companyValues (string[]), techFocus (string[]), recentNews (string[]), northStar (string).`;
  } else if (type === "reverse-questions") {
    systemPrompt = `Generate 5 strategic, high-level questions a ${role} candidate should ask their interviewer at ${companyMode}. 
Focus on leadership, team culture, and technical roadmap. 
Avoid generic questions. 
Return valid JSON (no markdown) with field: questions (string[]).`;
  } else if (type === "thank-you") {
    systemPrompt = `Draft a personalized, high-impact Thank-You email for a ${role} interview at ${companyMode}. 
Use these interview notes to personalize it: "${notes}".
The tone should be professional, confident, and grateful.
Return valid JSON (no markdown) with fields: subject (string), body (string).`;
  }

  const result = await generateText(systemPrompt + "\n\n" + userContent, {
    maxTokens: 1000,
    temperature: 0.7,
  });

  if (!result) return NextResponse.json({ error: "Failed to generate strategy" }, { status: 500 });

  try {
    const parsed = JSON.parse(result.text.trim().match(/\{[\s\S]*\}/)?.[0] || "{}");
    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json({ error: "Invalid strategy format" }, { status: 500 });
  }
}
