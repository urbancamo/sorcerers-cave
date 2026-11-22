import { ALL_CREATURES, ALL_TREASURES } from "@sorcerers-cave/engine";
import { MODEL_PRICES, WORD_RANGE, parseVoices } from "./storyPrompt";
import { bibleProblems } from "./storyBible";

/** Pure figures for the admin Stories dashboard (tested without a database), like analyticsLib.ts for games. */

const DAY_MS = 86_400_000;
export const DAYS = 30;

export interface RunRow { createdAt: number; pass: "plan" | "write" | "check" | "edit"; trigger: string; promptVersion: number; model: string; inputTokens: number; outputTokens: number; costUsd: number; durationMs: number; status: "ok" | "rejected" | "error" }
export interface StoryRow { status: "pending" | "ready" | "failed"; words?: number; promptVersion?: number; attempts: number; error?: string }

/** A short, countable label for a failure message. */
export function categoriseFailure(reason: string): string {
  const r = reason.toLowerCase();
  if (/paused/.test(r)) return "Paused";
  if (/cap reached/.test(r)) return "Spending cap reached";
  if (/anthropic_api_key/.test(r)) return "No API key";
  if (/unsupported facts/.test(r)) return "Unsupported facts";
  if (/^guard:/.test(r)) return "Failed the length, format or wording check";
  if (/expected format/.test(r)) return "Editor reply in the wrong format";
  if (/token limit|cut off/.test(r)) return "Reply cut off (token limit)";
  if (/api \d{3}|overloaded|fetch|network/.test(r)) return "API error";
  if (/replay/.test(r)) return "Run could not be replayed";
  return "Other";
}

const dayStart = (t: number) => t - (t % DAY_MS);
const monthStart = (t: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };

export function aggregateStories(runs: RunRow[], stories: StoryRow[], now: number) {
  const today = dayStart(now);
  const days = Array.from({ length: DAYS }, (_, i) => today - (DAYS - 1 - i) * DAY_MS);
  const perDay = new Map<number, { calls: number; ok: number; cents: number }>(days.map((d) => [d, { calls: 0, ok: 0, cents: 0 }]));
  let cost = 0, inTok = 0, outTok = 0, dur = 0, ok = 0, spendToday = 0, spendMonth = 0, writes = 0;
  const byPass = { plan: 0, write: 0, check: 0, edit: 0 };
  const byVersionCost = new Map<number, number>();
  for (const r of runs) {
    cost += r.costUsd; inTok += r.inputTokens; outTok += r.outputTokens; dur += r.durationMs;
    if (r.status === "ok") ok++;
    byPass[r.pass] += r.costUsd;
    if (r.pass === "write") writes++;
    byVersionCost.set(r.promptVersion, (byVersionCost.get(r.promptVersion) ?? 0) + r.costUsd);
    if (r.createdAt >= today) spendToday += r.costUsd;
    if (r.createdAt >= monthStart(now)) spendMonth += r.costUsd;
    const d = perDay.get(dayStart(r.createdAt));
    if (d) { d.calls++; if (r.status === "ok") d.ok++; d.cents += r.costUsd * 100; }
  }
  const counts = { pending: 0, ready: 0, failed: 0 };
  const byVersion = new Map<number, number>();
  const reasons = new Map<string, number>();
  let words = 0, wordStories = 0;
  for (const s of stories) {
    counts[s.status]++;
    if (s.status === "ready") {
      byVersion.set(s.promptVersion ?? 0, (byVersion.get(s.promptVersion ?? 0) ?? 0) + 1);
      if (s.words) { words += s.words; wordStories++; }
    }
    if (s.error) { const k = categoriseFailure(s.error); reasons.set(k, (reasons.get(k) ?? 0) + 1); }
  }
  const round = (n: number, p = 4) => Math.round(n * 10 ** p) / 10 ** p;
  return {
    counts,
    successRate: stories.length ? round((counts.ready / stories.length) * 100, 1) : null,
    avgWords: wordStories ? Math.round(words / wordStories) : null,
    runs: {
      total: runs.length, ok, failed: runs.length - ok,
      costUsd: round(cost), inputTokens: inTok, outputTokens: outTok,
      avgDurationMs: runs.length ? Math.round(dur / runs.length) : null,
      avgCostPerStoryUsd: writes ? round(cost / writes) : null, // each story starts with one write call
      byPass: { plan: round(byPass.plan), write: round(byPass.write), check: round(byPass.check), edit: round(byPass.edit) },
    },
    spend: { todayUsd: round(spendToday), monthUsd: round(spendMonth) },
    perDay: days.map((d) => ({ day: new Date(d).toISOString().slice(0, 10), ...perDay.get(d)!, cents: Math.round(perDay.get(d)!.cents * 100) / 100 })),
    byVersion: [...byVersion.entries()].sort((a, b) => a[0] - b[0]).map(([version, count]) => ({ version, count, costUsd: round(byVersionCost.get(version) ?? 0) })),
    failureReasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count })),
  };
}

/** What a saved prompt version must satisfy. Returns the problems (empty = fine). */
export function promptProblems(p: { writer: string; editor: string; model: string; minWords: number; maxWords: number; planner?: string; factCheck?: string; voices?: string; bible?: string }): string[] {
  const out: string[] = [];
  if (!p.writer.trim()) out.push("The writer prompt is empty.");
  if (!p.editor.trim()) out.push("The editor prompt is empty.");
  if (p.writer.length > 20_000) out.push("The writer prompt is over 20,000 characters.");
  if (p.editor.length > 20_000) out.push("The editor prompt is over 20,000 characters.");
  for (const [key, label] of [["planner", "planner"], ["factCheck", "fact-check"]] as const) {
    const t = p[key];
    if (t === undefined) continue;
    if (!t.trim()) out.push(`The ${label} prompt is empty.`);
    if (t.length > 20_000) out.push(`The ${label} prompt is over 20,000 characters.`);
  }
  if (p.voices !== undefined) out.push(...parseVoices(p.voices).problems);
  if (p.bible !== undefined) {
    if (p.bible.length > 80_000) out.push("The story bible is over 80,000 characters.");
    out.push(...bibleProblems(p.bible, { creatures: ALL_CREATURES.map((c) => c.name), treasures: ALL_TREASURES.map((t) => t.name) }));
  }
  if (!(p.model in MODEL_PRICES)) out.push(`The model must be one of: ${Object.keys(MODEL_PRICES).join(", ")}.`);
  if (!Number.isInteger(p.minWords) || !Number.isInteger(p.maxWords) || p.minWords < 100 || p.maxWords > 6000 || p.minWords >= p.maxWords) out.push("The word range must be whole numbers, at least 100 and at most 6,000, with the minimum below the maximum.");
  return out;
}

export { WORD_RANGE };
