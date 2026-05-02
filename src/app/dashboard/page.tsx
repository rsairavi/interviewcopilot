"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Mic,
  BarChart3,
  Zap,
  MessageSquare,
  Calendar,
  Loader2,
  ArrowLeft,
  Target,
  ThumbsUp,
  Users,
  Share2,
  ClipboardList,
  Copy,
  Check,
  FileSearch,
  BookOpen,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  HelpCircle,
  Mail,
  Send,
  GraduationCap,
  Trophy,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  ApiError,
  createCheckoutSession,
  generateSessionPrepPlan,
  getAnalyticsOverview,
  getAnswerFeedbackSummary,
  toUserMessage,
  upgradeToPro,
  analyzeJD,
  listStories,
  saveStory,
  deleteStory,
  generateStrategy,
  type JDAnalysisResponse,
  type BehavioralStory,
  type StrategyResponse,
  generateAssessment,
  type QuizQuestion,
  type AssessmentResponse,
  analyzeSpeech,
  type SpeechAnalysisResponse,
} from "@/lib/api";
import { useSpeechRecognition } from "@/lib/hooks/useSpeechRecognition";
import type { AnalyticsOverview } from "@/lib/api";
import {
  LAST_SESSION_DEBRIEF_STORAGE_KEY,
  SESSIONS_STORAGE_KEY,
} from "@/lib/types";
import type {
  AnswerFeedbackSummary,
  CompanyMode,
  Role,
  SessionDebrief,
  SessionPrepPlanResponse,
  SessionSummary,
} from "@/lib/types";

const PREP_ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "ml-engineer", label: "ML / AI Engineer" },
  { value: "data-scientist", label: "Data Scientist" },
  { value: "ai-architect", label: "AI Solutions Architect" },
  { value: "backend", label: "Backend Engineer" },
  { value: "fullstack", label: "Full-Stack Engineer" },
  { value: "product", label: "Product Manager" },
];

const PREP_COMPANY_OPTIONS: { value: CompanyMode; label: string }[] = [
  { value: "generic", label: "General (default)" },
  { value: "google", label: "Google" },
  { value: "amazon", label: "Amazon" },
  { value: "razorpay", label: "Razorpay" },
  { value: "atlassian", label: "Atlassian" },
  { value: "flipkart", label: "Flipkart" },
];

const VALID_PREP_ROLES = new Set(PREP_ROLE_OPTIONS.map((r) => r.value));
const VALID_PREP_COMPANY = new Set(PREP_COMPANY_OPTIONS.map((c) => c.value));

function linesFromTextarea(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatPrepPlanForCopy(plan: SessionPrepPlanResponse): string {
  const lines: string[] = ["InfinityHire Copilot — 7-day prep plan", "", plan.summary, ""];
  for (const d of plan.days) {
    lines.push(`Day ${d.day}`, `Goal: ${d.goal}`, "Drills:");
    for (const drill of d.drills) lines.push(`- ${drill}`);
    lines.push(`Expected outcome: ${d.expectedOutcome}`, "");
  }
  return lines.join("\n");
}

function getLocalSessions(): SessionSummary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is SessionSummary =>
        s && typeof s === "object" && typeof s.timestamp === "number" && typeof s.count === "number"
    );
  } catch {
    return [];
  }
}

function getRecentSessionsSummary(sessions: SessionSummary[]): {
  sessionCount: number;
  totalQuestions: number;
} {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = sessions.filter((s) => s.timestamp >= thirtyDaysAgo);
  const totalQuestions = recent.reduce((sum, s) => sum + s.count, 0);
  return { sessionCount: recent.length, totalQuestions };
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [localSessions, setLocalSessions] = useState<SessionSummary[]>([]);
  const [feedbackSummary, setFeedbackSummary] = useState<AnswerFeedbackSummary | null>(null);
  const [prepRole, setPrepRole] = useState<Role>("ml-engineer");
  const [prepCompany, setPrepCompany] = useState<CompanyMode>("generic");
  const [prepFocusText, setPrepFocusText] = useState("");
  const [prepImprovementText, setPrepImprovementText] = useState("");
  const [prepCoachNote, setPrepCoachNote] = useState("");
  const [prepPlan, setPrepPlan] = useState<SessionPrepPlanResponse | null>(null);
  const [prepLoading, setPrepLoading] = useState(false);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [prepCopied, setPrepCopied] = useState(false);
  
  // JD Matcher State
  const [jdText, setJdText] = useState("");
  const [jdResumeText, setJdResumeText] = useState("");
  const [jdAnalysis, setJdAnalysis] = useState<JDAnalysisResponse | null>(null);
  const [jdLoading, setJdLoading] = useState(false);
  
  // Stories State
  const [stories, setStories] = useState<BehavioralStory[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [showStoryForm, setShowStoryForm] = useState(false);
  const [editingStory, setEditingStory] = useState<Partial<BehavioralStory> | null>(null);
  
  // Toolkit State
  const [activeToolkitTab, setActiveToolkitTab] = useState<"battle-card" | "reverse-questions" | "thank-you">("battle-card");
  const [strategyResult, setStrategyResult] = useState<StrategyResponse | null>(null);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [thankYouNotes, setThankYouNotes] = useState("");
  
  // Assessment State
  const [activeAssessment, setActiveAssessment] = useState<AssessmentResponse | null>(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [assessmentStep, setAssessmentStep] = useState<"setup" | "quiz" | "result">("setup");
  const [quizScore, setQuizScore] = useState(0);
  
  // Speech Analysis State
  const [speechStep, setSpeechStep] = useState<"setup" | "recording" | "result">("setup");
  const [speechAnalysis, setSpeechAnalysis] = useState<SpeechAnalysisResponse | null>(null);
  const [speechLoading, setSpeechLoading] = useState(false);
  const [speechError, setSpeechError] = useState("");

  const handleSpeechFinal = useCallback(async (finalTranscript: string) => {
    setSpeechLoading(true);
    try {
      const res = await analyzeSpeech({ transcript: finalTranscript, role: prepRole });
      setSpeechAnalysis(res);
      setSpeechStep("result");
    } catch (e) {
      setSpeechError("Analysis failed. Try again.");
    } finally {
      setSpeechLoading(false);
    }
  }, [prepRole]);

  const { isListening, transcript, start, stop } = useSpeechRecognition(handleSpeechFinal, setSpeechError);

  useEffect(() => {
    getAnalyticsOverview()
      .then(setOverview)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getAnswerFeedbackSummary().then(setFeedbackSummary).catch(() => setFeedbackSummary(null));
  }, []);

  useEffect(() => {
    setLocalSessions(getLocalSessions());
    const onStorage = () => setLocalSessions(getLocalSessions());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    setStoriesLoading(true);
    listStories()
      .then(setStories)
      .catch(() => {})
      .finally(() => setStoriesLoading(false));
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_SESSION_DEBRIEF_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      let debrief: SessionDebrief | null = null;
      let storedRole: Role | undefined;
      let storedCompany: CompanyMode | undefined;
      if (parsed && typeof parsed === "object" && parsed !== null && "debrief" in parsed) {
        const w = parsed as { debrief?: SessionDebrief; role?: string; companyMode?: string };
        debrief = w.debrief ?? null;
        if (typeof w.role === "string" && VALID_PREP_ROLES.has(w.role as Role)) {
          storedRole = w.role as Role;
        }
        if (typeof w.companyMode === "string" && VALID_PREP_COMPANY.has(w.companyMode as CompanyMode)) {
          storedCompany = w.companyMode as CompanyMode;
        }
      } else if (parsed && typeof parsed === "object" && parsed !== null) {
        debrief = parsed as SessionDebrief;
      }
      if (!debrief) return;
      if (storedRole) setPrepRole(storedRole);
      if (storedCompany) setPrepCompany(storedCompany);
      if (debrief.improvementAreas?.length) {
        setPrepImprovementText(debrief.improvementAreas.join("\n"));
      }
      if (debrief.conciseCoachNote) {
        setPrepCoachNote(debrief.conciseCoachNote);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const { sessionCount, totalQuestions } = getRecentSessionsSummary(localSessions);

  if (loading) {
    return (
      <main className="min-h-screen bg-neural-bg flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-neural-cyan animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neural-bg">
      <header className="sticky top-0 z-50 border-b border-neural-border bg-neural-bg/90 backdrop-blur-md px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="inline-flex items-center gap-2 text-neural-muted hover:text-white transition-colors">
              <Mic className="w-5 h-5 text-neural-cyan" />
              <span className="font-bold text-white">InfinityHire Copilot</span>
            </Link>
            <span className="text-xs px-2 py-0.5 rounded-full bg-neural-surface border border-neural-border text-neural-muted">
              Dashboard
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/team"
              className="text-xs text-neural-muted hover:text-white transition-colors inline-flex items-center gap-1"
            >
              <Users className="w-3 h-3" /> Team panel
            </Link>
            <Link
              href="/session"
              className="text-xs text-neural-muted hover:text-white transition-colors inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" /> Back to Session
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-white mb-6">Interview Analytics</h1>

        {error && (
          <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 mb-6">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Total answers this month */}
          <div className="rounded-xl border border-neural-border bg-neural-surface p-5 card-hover">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-5 h-5 text-neural-cyan" />
              <span className="text-xs font-medium text-neural-muted uppercase tracking-wider">
                Answers this month
              </span>
            </div>
            <p className="text-3xl font-bold text-white">
              {overview?.answersThisMonth ?? 0}
            </p>
          </div>

          {/* Plan */}
          <div className="rounded-xl border border-neural-border bg-neural-surface p-5 card-hover">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-neural-purple" />
              <span className="text-xs font-medium text-neural-muted uppercase tracking-wider">
                Plan
              </span>
            </div>
            <p className="text-2xl font-bold text-white capitalize">
              {overview?.plan ?? "free"}
            </p>
            <p className="text-xs text-neural-muted mt-1">
              {overview?.plan === "pro" ? "Unlimited answers" : `${overview?.monthlyQuota ?? 30} answers/month`}
            </p>
          </div>

          {/* Remaining quota */}
          <div className="rounded-xl border border-neural-border bg-neural-surface p-5 card-hover">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-5 h-5 text-neural-green" />
              <span className="text-xs font-medium text-neural-muted uppercase tracking-wider">
                Remaining quota
              </span>
            </div>
            <p className="text-3xl font-bold text-white">
              {overview?.remainingQuota ?? 0}
            </p>
            <p className="text-xs text-neural-muted mt-1">
              of {overview?.monthlyQuota === -1 ? "unlimited" : overview?.monthlyQuota ?? 30} this month
            </p>
          </div>

          {/* Recent sessions / questions */}
          <div className="rounded-xl border border-neural-border bg-neural-surface p-5 card-hover">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-neural-cyan" />
              <span className="text-xs font-medium text-neural-muted uppercase tracking-wider">
                Recent (30d)
              </span>
            </div>
            <p className="text-2xl font-bold text-white">
              {sessionCount} sessions
            </p>
            <p className="text-sm text-neural-muted mt-1">
              {totalQuestions} questions total
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-neural-border bg-neural-surface p-5 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Share2 className="w-5 h-5 text-neural-cyan" />
            <h2 className="text-lg font-semibold text-white">Team debrief & sharing</h2>
          </div>
          <p className="text-sm text-neural-muted mb-4 leading-relaxed">
            Run a quick panel rubric after interviews, or paste a shareable practice summary to mentors and peers.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/team"
              className="inline-flex items-center gap-2 rounded-lg border border-neural-purple/40 bg-neural-purple/15 px-4 py-2 text-xs font-semibold text-white hover:bg-neural-purple/25 transition-colors"
            >
              <Users className="w-4 h-4 text-neural-cyan" />
              Open team panel
            </Link>
            <Link
              href="/session"
              className="inline-flex items-center gap-2 rounded-lg border border-neural-cyan/40 px-4 py-2 text-xs font-semibold text-neural-cyan hover:bg-neural-cyan/10 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Session — shareable report after debrief
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-neural-border bg-neural-surface p-5 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="w-5 h-5 text-neural-cyan" />
            <h2 className="text-lg font-semibold text-white">7-day prep plan</h2>
          </div>
          <p className="text-sm text-neural-muted mb-4 leading-relaxed">
            Turn debrief takeaways and your focus areas into a week of drills. Fields pre-fill from your last session
            debrief when you generate one in session.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <label className="block text-xs text-neural-muted">
              Role
              <select
                value={prepRole}
                onChange={(e) => setPrepRole(e.target.value as Role)}
                className="mt-1 w-full rounded-lg border border-neural-border bg-neural-bg px-3 py-2 text-sm text-white"
              >
                {PREP_ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-neural-muted">
              Company interview bar
              <select
                value={prepCompany}
                onChange={(e) => setPrepCompany(e.target.value as CompanyMode)}
                className="mt-1 w-full rounded-lg border border-neural-border bg-neural-bg px-3 py-2 text-sm text-white"
              >
                {PREP_COMPANY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs text-neural-muted mb-3">
            Focus areas (optional, one per line)
            <textarea
              value={prepFocusText}
              onChange={(e) => setPrepFocusText(e.target.value)}
              rows={3}
              placeholder={"e.g. system design under pressure\nshorter answers with metrics"}
              className="mt-1 w-full rounded-lg border border-neural-border bg-neural-bg px-3 py-2 text-sm text-white placeholder:text-neural-muted/60"
            />
          </label>
          <label className="block text-xs text-neural-muted mb-3">
            Debrief improvement areas (optional, one per line)
            <textarea
              value={prepImprovementText}
              onChange={(e) => setPrepImprovementText(e.target.value)}
              rows={3}
              placeholder="Pasted from debrief or your own notes"
              className="mt-1 w-full rounded-lg border border-neural-border bg-neural-bg px-3 py-2 text-sm text-white placeholder:text-neural-muted/60"
            />
          </label>
          <label className="block text-xs text-neural-muted mb-4">
            Coach note from debrief (optional)
            <textarea
              value={prepCoachNote}
              onChange={(e) => setPrepCoachNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-neural-border bg-neural-bg px-3 py-2 text-sm text-white placeholder:text-neural-muted/60"
            />
          </label>
          <button
            type="button"
            data-testid="dashboard-generate-prep-plan"
            disabled={prepLoading}
            onClick={async () => {
              setPrepError(null);
              setPrepLoading(true);
              setPrepPlan(null);
              try {
                const focusAreas = linesFromTextarea(prepFocusText);
                const improvementLines = linesFromTextarea(prepImprovementText);
                const debriefPartial =
                  improvementLines.length > 0 || prepCoachNote.trim().length > 0
                    ? {
                        ...(improvementLines.length > 0 ? { improvementAreas: improvementLines } : {}),
                        ...(prepCoachNote.trim() ? { conciseCoachNote: prepCoachNote.trim() } : {}),
                      }
                    : undefined;
                const plan = await generateSessionPrepPlan({
                  role: prepRole,
                  companyMode: prepCompany,
                  focusAreas: focusAreas.length > 0 ? focusAreas : undefined,
                  debrief: debriefPartial,
                });
                setPrepPlan(plan);
              } catch (e) {
                setPrepError(toUserMessage(e, "Could not generate prep plan."));
              } finally {
                setPrepLoading(false);
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-neural-cyan px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
          >
            {prepLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Generating…
              </>
            ) : (
              "Generate 7-day prep plan"
            )}
          </button>
          {prepError && (
            <p className="mt-3 text-sm text-red-300" role="alert">
              {prepError}
            </p>
          )}
          {prepPlan && (
            <div data-testid="prep-plan-results" className="mt-6 space-y-4 border-t border-neural-border pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Your plan</p>
                <button
                  type="button"
                  data-testid="dashboard-copy-prep-plan"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(formatPrepPlanForCopy(prepPlan));
                      setPrepCopied(true);
                      window.setTimeout(() => setPrepCopied(false), 2000);
                    } catch {
                      setPrepError("Could not copy to clipboard.");
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-neural-border px-3 py-1.5 text-xs font-semibold text-neural-muted hover:text-white hover:border-neural-cyan/40 transition-colors"
                >
                  {prepCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-neural-green" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy plan
                    </>
                  )}
                </button>
              </div>
              <p className="text-sm text-slate-200 leading-relaxed">{prepPlan.summary}</p>
              <ol className="space-y-4 list-none p-0 m-0">
                {prepPlan.days.map((d) => (
                  <li
                    key={d.day}
                    className="rounded-lg border border-neural-cyan/15 bg-neural-bg/60 p-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-neural-cyan mb-1">
                      Day {d.day}
                    </p>
                    <p className="text-sm font-medium text-white mb-2">{d.goal}</p>
                    <ul className="list-disc list-inside text-sm text-neural-muted space-y-1 mb-2">
                      {d.drills.map((drill, i) => (
                        <li key={i}>{drill}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-slate-300">
                      <span className="text-neural-muted">Expected: </span>
                      {d.expectedOutcome}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* JD Matcher Section */}
        <div className="rounded-xl border border-neural-border bg-neural-surface p-5 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <FileSearch className="w-5 h-5 text-neural-cyan" />
            <h2 className="text-lg font-semibold text-white">JD Matcher & Gap Analysis</h2>
          </div>
          <p className="text-sm text-neural-muted mb-4 leading-relaxed">
            Paste a Job Description to find skill gaps and get targeted interview questions.
          </p>
          <div className="space-y-4">
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste Job Description here..."
              rows={4}
              className="w-full rounded-lg border border-neural-border bg-neural-bg px-3 py-2 text-sm text-white placeholder:text-neural-muted/60"
            />
            <textarea
              value={jdResumeText}
              onChange={(e) => setJdResumeText(e.target.value)}
              placeholder="Paste your Resume here (optional, defaults to last uploaded)..."
              rows={3}
              className="w-full rounded-lg border border-neural-border bg-neural-bg px-3 py-2 text-sm text-white placeholder:text-neural-muted/60"
            />
            <button
              onClick={async () => {
                setJdLoading(true);
                try {
                  const res = await analyzeJD({
                    jdText,
                    resumeText: jdResumeText || "Use latest from profile",
                    role: prepRole
                  });
                  setJdAnalysis(res);
                } catch (e) {
                  setError("Failed to analyze JD");
                } finally {
                  setJdLoading(false);
                }
              }}
              disabled={jdLoading || !jdText}
              className="inline-flex items-center gap-2 rounded-lg bg-neural-cyan px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              {jdLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Analyze Match"}
            </button>

            {jdAnalysis && (
              <div className="mt-6 p-4 rounded-lg border border-neural-cyan/20 bg-neural-bg/50 space-y-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white uppercase">Fit Score</span>
                  <span className="text-2xl font-bold text-neural-cyan">{jdAnalysis.overallFitScore}%</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-neural-green mb-2">Matching Skills</p>
                    <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
                      {jdAnalysis.matchingSkills.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-amber-200/90 mb-2">Skill Gaps</p>
                    <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
                      {jdAnalysis.gapAnalysis.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                </div>
                <div className="pt-4 border-t border-neural-border">
                  <p className="text-sm font-semibold text-white mb-2">Targeted Prep Questions</p>
                  <ul className="space-y-2">
                    {jdAnalysis.prepQuestions.map((q, i) => (
                      <li key={i} className="text-xs text-slate-200 bg-neural-surface/50 p-2 rounded border border-neural-border/50">{q}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* STAR Story Workspace */}
        <div className="rounded-xl border border-neural-border bg-neural-surface p-5 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-neural-purple" />
              <h2 className="text-lg font-semibold text-white">STAR Story Workspace</h2>
            </div>
            <button 
              onClick={() => { setShowStoryForm(true); setEditingStory({}); }}
              className="inline-flex items-center gap-1 rounded-lg bg-neural-cyan/10 border border-neural-cyan/30 px-3 py-1.5 text-xs font-semibold text-neural-cyan hover:bg-neural-cyan/20"
            >
              <Plus className="w-4 h-4" /> New Story
            </button>
          </div>

          {showStoryForm && (
            <div className="mb-6 p-4 rounded-xl border border-neural-cyan/20 bg-neural-bg/50 space-y-4">
              <input 
                value={editingStory?.title || ""} 
                onChange={e => setEditingStory({...editingStory, title: e.target.value})}
                placeholder="Story Title (e.g. Scaling the Payment Engine)"
                className="w-full rounded-lg border border-neural-border bg-neural-bg px-3 py-2 text-sm text-white"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <textarea 
                  value={editingStory?.situation || ""} 
                  onChange={e => setEditingStory({...editingStory, situation: e.target.value})}
                  placeholder="Situation..." 
                  className="rounded-lg border border-neural-border bg-neural-bg px-3 py-2 text-xs text-white h-24"
                />
                <textarea 
                  value={editingStory?.task || ""} 
                  onChange={e => setEditingStory({...editingStory, task: e.target.value})}
                  placeholder="Task..." 
                  className="rounded-lg border border-neural-border bg-neural-bg px-3 py-2 text-xs text-white h-24"
                />
                <textarea 
                  value={editingStory?.action || ""} 
                  onChange={e => setEditingStory({...editingStory, action: e.target.value})}
                  placeholder="Action..." 
                  className="rounded-lg border border-neural-border bg-neural-bg px-3 py-2 text-xs text-white h-24"
                />
                <textarea 
                  value={editingStory?.result || ""} 
                  onChange={e => setEditingStory({...editingStory, result: e.target.value})}
                  placeholder="Result (Numbers/Metrics!)..." 
                  className="rounded-lg border border-neural-border bg-neural-bg px-3 py-2 text-xs text-white h-24"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowStoryForm(false)} className="px-3 py-1.5 text-xs text-neural-muted">Cancel</button>
                <button 
                  onClick={async () => {
                    if (!editingStory?.title) return;
                    const saved = await saveStory(editingStory);
                    setStories(prev => editingStory?.id ? prev.map(s => s.id === saved.id ? saved : s) : [saved, ...prev]);
                    setShowStoryForm(false);
                  }}
                  className="px-4 py-1.5 rounded-lg bg-neural-cyan text-black text-xs font-bold"
                >
                  Save Story
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {storiesLoading && <Loader2 className="w-5 h-5 animate-spin mx-auto" />}
            {stories.map(story => (
              <div key={story.id} className="group rounded-lg border border-neural-border bg-neural-bg/40 p-4 hover:border-neural-cyan/30 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-white">{story.title}</h3>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditingStory(story); setShowStoryForm(true); }} className="text-xs text-neural-cyan">Edit</button>
                    <button 
                      onClick={async () => {
                        await deleteStory(story.id);
                        setStories(prev => prev.filter(s => s.id !== story.id));
                      }}
                      className="text-xs text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-[10px] uppercase font-bold tracking-wider">
                  <div className="text-neural-muted">S</div>
                  <div className="text-neural-muted">T</div>
                  <div className="text-neural-muted">A</div>
                  <div className="text-neural-cyan">R</div>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  <div className="text-[11px] text-slate-400 line-clamp-2">{story.situation}</div>
                  <div className="text-[11px] text-slate-400 line-clamp-2">{story.task}</div>
                  <div className="text-[11px] text-slate-400 line-clamp-2">{story.action}</div>
                  <div className="text-[11px] text-white line-clamp-2 font-medium">{story.result}</div>
                </div>
              </div>
            ))}
            {!storiesLoading && stories.length === 0 && (
              <p className="text-xs text-neural-muted text-center py-4">No stories saved yet. Build your first STAR story!</p>
            )}
          </div>
        </div>

        {/* Success Toolkit Section */}
        <div className="rounded-xl border border-neural-border bg-neural-surface p-5 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-neural-cyan" />
            <h2 className="text-lg font-semibold text-white">Interview Success Toolkit</h2>
          </div>
          
          <div className="flex border-b border-neural-border mb-6">
            <button 
              onClick={() => { setActiveToolkitTab("battle-card"); setStrategyResult(null); }}
              className={`px-4 py-2 text-xs font-bold transition-colors border-b-2 ${activeToolkitTab === "battle-card" ? "border-neural-cyan text-neural-cyan" : "border-transparent text-neural-muted hover:text-white"}`}
            >
              🛡️ Battle Card
            </button>
            <button 
              onClick={() => { setActiveToolkitTab("reverse-questions"); setStrategyResult(null); }}
              className={`px-4 py-2 text-xs font-bold transition-colors border-b-2 ${activeToolkitTab === "reverse-questions" ? "border-neural-cyan text-neural-cyan" : "border-transparent text-neural-muted hover:text-white"}`}
            >
              ❓ Smart Questions
            </button>
            <button 
              onClick={() => { setActiveToolkitTab("thank-you"); setStrategyResult(null); }}
              className={`px-4 py-2 text-xs font-bold transition-colors border-b-2 ${activeToolkitTab === "thank-you" ? "border-neural-cyan text-neural-cyan" : "border-transparent text-neural-muted hover:text-white"}`}
            >
              ✉️ The Closer
            </button>
          </div>

          <div className="min-h-[200px]">
            {!strategyResult && !strategyLoading && (
              <div className="text-center py-8">
                <p className="text-sm text-neural-muted mb-4">
                  {activeToolkitTab === "battle-card" && "Generate a high-density strategy sheet for your next interview."}
                  {activeToolkitTab === "reverse-questions" && "Get elite questions to ask your interviewer to show leadership."}
                  {activeToolkitTab === "thank-you" && "Draft a personalized thank-you note based on your interview conversation."}
                </p>
                {activeToolkitTab === "thank-you" && (
                  <textarea 
                    value={thankYouNotes}
                    onChange={e => setThankYouNotes(e.target.value)}
                    placeholder="Brief notes from the interview (e.g. talked about scaling K8s, mentioned the upcoming product launch in Japan)..."
                    className="w-full max-w-md mx-auto mb-4 block rounded-lg border border-neural-border bg-neural-bg px-3 py-2 text-sm text-white"
                    rows={3}
                  />
                )}
                <button 
                  onClick={async () => {
                    setStrategyLoading(true);
                    try {
                      const res = await generateStrategy({
                        type: activeToolkitTab,
                        companyMode: prepCompany,
                        role: prepRole,
                        notes: thankYouNotes
                      });
                      setStrategyResult(res);
                    } catch (e) {
                      setError("Failed to generate toolkit materials");
                    } finally {
                      setStrategyLoading(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-neural-cyan px-6 py-2 text-sm font-bold text-black"
                >
                  Generate {activeToolkitTab.replace("-", " ")}
                </button>
              </div>
            )}

            {strategyLoading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 text-neural-cyan animate-spin" />
                <p className="text-sm text-neural-cyan font-mono animate-pulse">Consulting AI Strategist...</p>
              </div>
            )}

            {strategyResult && (
              <div className="space-y-6 animate-fade-in">
                {activeToolkitTab === "battle-card" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-xs font-bold text-neural-cyan uppercase tracking-widest mb-2 flex items-center gap-1.5">
                          <ShieldAlert className="w-3 h-3" /> Core Values
                        </h4>
                        <ul className="space-y-1.5">
                          {strategyResult.companyValues?.map((v, i) => (
                            <li key={i} className="text-sm text-slate-200 border-l-2 border-neural-cyan/30 pl-3">{v}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-neural-purple uppercase tracking-widest mb-2 flex items-center gap-1.5">
                          <Zap className="w-3 h-3" /> Tech Focus
                        </h4>
                        <ul className="space-y-1.5">
                          {strategyResult.techFocus?.map((v, i) => (
                            <li key={i} className="text-sm text-slate-200 border-l-2 border-neural-purple/30 pl-3">{v}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl border border-neural-cyan/20 bg-neural-cyan/5">
                        <h4 className="text-xs font-bold text-neural-cyan uppercase tracking-widest mb-2">The North Star</h4>
                        <p className="text-sm text-white italic">"{strategyResult.northStar}"</p>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-neural-muted uppercase tracking-widest mb-2">Recent Strategy</h4>
                        <ul className="space-y-1.5">
                          {strategyResult.recentNews?.map((v, i) => (
                            <li key={i} className="text-xs text-neural-muted">• {v}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {activeToolkitTab === "reverse-questions" && (
                  <div className="space-y-3">
                    {strategyResult.questions?.map((q, i) => (
                      <div key={i} className="flex gap-3 p-3 rounded-lg border border-neural-border bg-neural-bg/50 group hover:border-neural-cyan/30 transition-colors">
                        <span className="text-neural-cyan font-mono text-sm">Q{i+1}</span>
                        <p className="text-sm text-slate-200 leading-relaxed">{q}</p>
                      </div>
                    ))}
                  </div>
                )}

                {activeToolkitTab === "thank-you" && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg border border-neural-border bg-neural-bg">
                      <p className="text-xs text-neural-muted mb-1 uppercase font-bold">Subject Line</p>
                      <p className="text-sm text-white font-medium">{strategyResult.subject}</p>
                    </div>
                    <div className="p-4 rounded-lg border border-neural-border bg-neural-bg relative group">
                      <p className="text-xs text-neural-muted mb-2 uppercase font-bold">Email Body</p>
                      <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{strategyResult.body}</p>
                      <button 
                        onClick={() => {
                          if (strategyResult.body) navigator.clipboard.writeText(strategyResult.body);
                        }}
                        className="absolute top-4 right-4 p-2 rounded-lg bg-neural-surface border border-neural-border opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Copy className="w-4 h-4 text-neural-muted" />
                      </button>
                    </div>
                  </div>
                )}
                
                <div className="flex justify-center pt-4">
                  <button 
                    onClick={() => setStrategyResult(null)}
                    className="text-xs text-neural-muted hover:text-white"
                  >
                    Reset and re-generate
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

          </div>
        </div>

        {/* Skill Validation Center Section */}
        <div className="rounded-xl border border-neural-border bg-neural-surface p-5 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-neural-cyan" />
              <h2 className="text-lg font-semibold text-white">Skill Validation Center</h2>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-neural-cyan/10 border border-neural-cyan/20 text-neural-cyan font-bold uppercase tracking-widest">
              Beta
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
             <div className="p-4 rounded-xl border border-neural-border bg-neural-bg/50 flex flex-col items-center text-center">
                <GraduationCap className="w-8 h-8 text-neural-cyan mb-3" />
                <h3 className="text-sm font-bold text-white mb-1">Technical Assessment</h3>
                <p className="text-[10px] text-neural-muted mb-4">Validate your technical depth with AI-generated quizzes.</p>
                {assessmentStep === "setup" && (
                   <button 
                    onClick={async () => {
                       setAssessmentLoading(true);
                       try {
                          const res = await generateAssessment({ role: prepRole });
                          setActiveAssessment(res);
                          setAssessmentStep("quiz");
                       } catch (e) { setError("Failed to start assessment"); }
                       finally { setAssessmentLoading(false); }
                    }}
                    className="mt-auto px-4 py-1.5 rounded-lg bg-neural-cyan text-black text-[11px] font-bold"
                   >
                      {assessmentLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Start Quiz"}
                   </button>
                )}
             </div>
             <div className="p-4 rounded-xl border border-neural-border bg-neural-bg/50 flex flex-col items-center text-center">
                <Mic className="w-8 h-8 text-neural-purple mb-3" />
                <h3 className="text-sm font-bold text-white mb-1">Language Proficiency</h3>
                <p className="text-[10px] text-neural-muted mb-4">Speech analysis for clarity and confidence.</p>
                {speechStep === "setup" && (
                   <button 
                    onClick={() => setSpeechStep("recording")}
                    className="mt-auto px-4 py-1.5 rounded-lg bg-neural-purple/20 border border-neural-purple/40 text-neural-purple text-[11px] font-bold"
                   >
                      Test My Speech
                   </button>
                )}
             </div>
             <div className="p-4 rounded-xl border border-neural-border bg-neural-bg/30 flex flex-col items-center text-center opacity-60 grayscale cursor-not-allowed">
                <BarChart3 className="w-8 h-8 text-neural-green mb-3" />
                <h3 className="text-sm font-bold text-white mb-1">Virtual Job Tryout</h3>
                <p className="text-[10px] text-neural-muted mb-4">Task-based simulation of actual work.</p>
                <span className="mt-auto text-[10px] font-bold text-neural-muted">Coming Soon</span>
             </div>
          </div>

          {assessmentStep === "quiz" && activeAssessment && (
             <div className="p-6 rounded-xl border border-neural-cyan/20 bg-neural-bg/80 animate-fade-in">
                <div className="flex items-center justify-between mb-6">
                   <h4 className="text-sm font-bold text-white uppercase">Technical Quiz: {prepRole}</h4>
                   <span className="text-xs text-neural-cyan font-mono">{Object.keys(userAnswers).length} / 5 Answered</span>
                </div>
                <div className="space-y-8">
                   {activeAssessment.questions.map((q, idx) => (
                      <div key={q.id} className="space-y-4">
                         <p className="text-sm text-white font-medium"><span className="text-neural-cyan">Q{idx+1}.</span> {q.question}</p>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {q.options.map((opt, optIdx) => (
                               <button 
                                key={optIdx}
                                onClick={() => setUserAnswers({...userAnswers, [q.id]: optIdx})}
                                className={`p-3 rounded-lg border text-left text-xs transition-all ${userAnswers[q.id] === optIdx ? 'border-neural-cyan bg-neural-cyan/10 text-white' : 'border-neural-border bg-neural-surface/50 text-neural-muted hover:border-neural-border/80'}`}
                               >
                                  <span className="font-mono mr-2 text-neural-cyan opacity-50">{String.fromCharCode(65 + optIdx)}.</span> {opt}
                               </button>
                            ))}
                         </div>
                      </div>
                   ))}
                </div>
                <div className="flex justify-end mt-8">
                   <button 
                    disabled={Object.keys(userAnswers).length < 5}
                    onClick={() => {
                       let score = 0;
                       activeAssessment.questions.forEach(q => {
                          if (userAnswers[q.id] === q.correctAnswer) score += 20;
                       });
                       setQuizScore(score);
                       setAssessmentStep("result");
                    }}
                    className="px-8 py-2 rounded-lg bg-neural-cyan text-black text-sm font-bold disabled:opacity-50"
                   >
                      Submit Results
                   </button>
                </div>
             </div>
          )}

          {assessmentStep === "result" && activeAssessment && (
             <div className="p-6 rounded-xl border border-neural-cyan/20 bg-neural-bg/80 animate-fade-in text-center">
                <div className="mb-6">
                   <p className="text-xs font-bold text-neural-cyan uppercase tracking-widest mb-2">Final Score</p>
                   <p className="text-5xl font-black text-white">{quizScore}%</p>
                </div>
                <div className="space-y-4 text-left max-w-2xl mx-auto mb-8">
                   {activeAssessment.questions.map((q, idx) => (
                      <div key={q.id} className="p-4 rounded-lg border border-neural-border bg-neural-surface/30">
                         <div className="flex items-start gap-3 mb-2">
                            {userAnswers[q.id] === q.correctAnswer ? <CheckCircle2 className="w-4 h-4 text-neural-green flex-shrink-0" /> : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                            <p className="text-xs text-white font-medium">{q.question}</p>
                         </div>
                         <p className="text-[10px] text-neural-muted italic pl-7">"{q.explanation}"</p>
                      </div>
                   ))}
                </div>
                <button 
                  onClick={() => {
                     setAssessmentStep("setup");
                     setActiveAssessment(null);
                     setUserAnswers({});
                  }}
                  className="text-xs text-neural-muted hover:text-white"
                >
                   Return to Dashboard
                </button>
             </div>
          )}

          {speechStep === "recording" && (
             <div className="p-8 rounded-xl border border-neural-purple/20 bg-neural-bg/80 animate-fade-in text-center">
                <div className="mb-6 relative inline-block">
                   <div className={`absolute inset-0 rounded-full bg-neural-purple/20 animate-ping ${isListening ? 'block' : 'hidden'}`} />
                   <div className={`p-6 rounded-full bg-neural-bg border-4 ${isListening ? 'border-neural-purple' : 'border-neural-border'}`}>
                      <Mic className={`w-12 h-12 ${isListening ? 'text-neural-purple' : 'text-neural-muted'}`} />
                   </div>
                </div>
                <h4 className="text-lg font-bold text-white mb-2">{isListening ? "Listening to your pitch..." : "Ready to record"}</h4>
                <p className="text-xs text-neural-muted mb-6 max-w-sm mx-auto">
                   Introduce yourself or explain a technical concept. The AI will analyze your delivery once you stop speaking.
                </p>
                
                {transcript && (
                   <div className="mb-6 p-4 rounded-lg bg-neural-surface/50 border border-neural-border max-w-lg mx-auto text-left">
                      <p className="text-xs text-slate-300 italic">"{transcript}"</p>
                   </div>
                )}

                <div className="flex justify-center gap-3">
                   {!isListening ? (
                      <button onClick={start} className="px-8 py-2 rounded-lg bg-neural-purple text-white text-sm font-bold">Start Recording</button>
                   ) : (
                      <button onClick={stop} className="px-8 py-2 rounded-lg bg-neural-surface border border-neural-border text-white text-sm font-bold">Stop & Analyze</button>
                   )}
                   <button onClick={() => setSpeechStep("setup")} className="px-4 py-2 text-xs text-neural-muted">Cancel</button>
                </div>
                
                {speechLoading && (
                   <div className="mt-6 flex items-center justify-center gap-2 text-neural-purple">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-xs font-mono">Analyzing speech patterns...</span>
                   </div>
                )}
                {speechError && <p className="mt-4 text-xs text-red-400">{speechError}</p>}
             </div>
          )}

          {speechStep === "result" && speechAnalysis && (
             <div className="p-6 rounded-xl border border-neural-purple/20 bg-neural-bg/80 animate-fade-in">
                <div className="flex items-center justify-between mb-8">
                   <h4 className="text-sm font-bold text-white uppercase">Speech Analysis Result</h4>
                   <button onClick={() => setSpeechStep("setup")} className="text-xs text-neural-muted hover:text-white">Close</button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                   <div className="p-4 rounded-xl bg-neural-surface/50 border border-neural-border text-center">
                      <p className="text-[10px] font-bold text-neural-muted uppercase mb-1">Confidence</p>
                      <p className="text-3xl font-black text-white">{speechAnalysis.confidenceScore}%</p>
                   </div>
                   <div className="p-4 rounded-xl bg-neural-surface/50 border border-neural-border text-center">
                      <p className="text-[10px] font-bold text-neural-muted uppercase mb-1">Clarity</p>
                      <p className="text-3xl font-black text-white">{speechAnalysis.clarityScore}%</p>
                   </div>
                   <div className="p-4 rounded-xl bg-neural-surface/50 border border-neural-border text-center">
                      <p className="text-[10px] font-bold text-neural-muted uppercase mb-1">Filler Words</p>
                      <p className="text-3xl font-black text-neural-purple">{speechAnalysis.fillerWordCount}</p>
                   </div>
                </div>

                <div className="space-y-4">
                   <div className="p-4 rounded-lg bg-neural-purple/5 border border-neural-purple/10">
                      <p className="text-xs font-bold text-neural-purple uppercase mb-2">Coach Feedback</p>
                      <p className="text-sm text-slate-200 leading-relaxed">{speechAnalysis.feedback}</p>
                   </div>
                   <div className="p-4 rounded-lg bg-neural-bg border border-neural-border">
                      <p className="text-xs font-bold text-neural-cyan uppercase mb-2">How to Improve</p>
                      <p className="text-sm text-slate-200 leading-relaxed">{speechAnalysis.suggestedImprovement}</p>
                   </div>
                   {speechAnalysis.fillerWordList.length > 0 && (
                      <div className="pt-2">
                         <p className="text-[10px] text-neural-muted mb-2 uppercase font-bold tracking-widest">Detected Fillers</p>
                         <div className="flex flex-wrap gap-2">
                            {speechAnalysis.fillerWordList.map((w, i) => (
                               <span key={i} className="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-[10px] text-red-300 font-mono">{w}</span>
                            ))}
                         </div>
                      </div>
                   )}
                </div>
                
                <div className="mt-8 flex justify-center">
                   <button onClick={() => setSpeechStep("setup")} className="px-6 py-2 rounded-lg bg-neural-purple text-white text-xs font-bold">Try Another Pitch</button>
                </div>
             </div>
          )}
        </div>

        <div className="rounded-xl border border-neural-border bg-neural-surface p-5">
          <h2 className="text-lg font-semibold text-white mb-3">Usage summary</h2>
          <p className="text-sm text-neural-muted">
            Answers this month are tracked server-side. Session and question counts come from this device (localStorage).
            Upgrade to Pro for unlimited answers.
          </p>
          {overview?.plan === "free" && (
            <button
              type="button"
              data-testid="dashboard-secure-checkout"
              onClick={async () => {
                setError(null);
                setUpgrading(true);
                try {
                  const { checkoutUrl } = await createCheckoutSession();
                  window.location.assign(checkoutUrl);
                } catch (e) {
                  // 503 = billing not configured (or unavailable). Try mock upgrade when allowed (dev / ALLOW_MOCK_UPGRADE).
                  const billingNotReady = e instanceof ApiError && e.status === 503;
                  if (billingNotReady) {
                    try {
                      await upgradeToPro();
                      const refreshed = await getAnalyticsOverview();
                      setOverview(refreshed);
                    } catch (inner) {
                      setError(inner instanceof Error ? inner.message : "Upgrade failed");
                    }
                  } else {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Checkout is unavailable. Try again or contact support.",
                    );
                  }
                } finally {
                  setUpgrading(false);
                }
              }}
              disabled={upgrading}
              className="mt-4 rounded-lg bg-neural-cyan px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              {upgrading ? "Starting checkout…" : "Secure checkout"}
            </button>
          )}
        </div>

        <div className="rounded-xl border border-neural-border bg-neural-surface p-5 mt-6">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-5 h-5 text-neural-cyan" />
            <h2 className="text-lg font-semibold text-white">Activation score</h2>
          </div>
          <p className="text-sm text-neural-muted mb-3">
            Tracks your progress through key product milestones.
          </p>
          <p className="text-3xl font-bold text-white mb-3">
            {overview?.activation?.score ?? 0}%
          </p>
          <div className="text-sm text-neural-muted space-y-1">
            <p>
              Completed:{" "}
              <span className="text-white">
                {overview?.activation?.completed?.length ?? 0}
              </span>
            </p>
            <p>
              Remaining:{" "}
              <span className="text-white">
                {overview?.activation?.pending?.length ?? 0}
              </span>
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-neural-border bg-neural-surface p-5 mt-6">
          <div className="flex items-center gap-2 mb-3">
            <ThumbsUp className="w-5 h-5 text-neural-cyan" />
            <h2 className="text-lg font-semibold text-white">Interview quality score</h2>
          </div>
          <p className="text-sm text-neural-muted mb-3">
            Uses your helpful/not-helpful feedback to track answer quality and guide improvements.
          </p>
          <p className="text-3xl font-bold text-white mb-3">
            {feedbackSummary?.score === null || feedbackSummary?.score === undefined
              ? "--"
              : `${feedbackSummary.score}%`}
          </p>
          <div className="text-sm text-neural-muted space-y-1">
            <p>
              Helpful votes:{" "}
              <span className="text-white">
                {feedbackSummary?.up ?? 0}
              </span>
            </p>
            <p>
              Not helpful votes:{" "}
              <span className="text-white">
                {feedbackSummary?.down ?? 0}
              </span>
            </p>
            <p>
              Total ratings this month:{" "}
              <span className="text-white">
                {feedbackSummary?.total ?? 0}
              </span>
            </p>
          </div>
          {(feedbackSummary?.total ?? 0) === 0 && (
            <p className="text-xs text-neural-muted mt-3">
              Rate answers in session to unlock a personalized quality score.
            </p>
          )}
          <Link
            href="/session"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-neural-cyan/40 px-3 py-2 text-xs font-semibold text-neural-cyan hover:bg-neural-cyan/10 transition-colors"
          >
            Improve score in next session
          </Link>
        </div>
      </div>
    </main>
  );
}
