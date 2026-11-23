import {
  DEFAULT_MODEL, EDITOR_SYSTEM, FACT_CHECK_SYSTEM, PLANNER_SYSTEM, WORD_RANGE, WRITER_SYSTEM, editorUserMessage, estimateCostUsd, factCheckUserMessage, parseVoices, pickVoice, plannerUserMessage, renderVoices, storyProblems, writerUserMessage,
} from "./storyPrompt";
import { bibleFor, renderBible } from "./storyBible";
import { castFor, renderCharacters } from "./storyCharacters";

/**
 * The story generator, with the model call passed in so it is testable without an API and so the Convex action stays thin.
 * plan (the shape) -> write (a draft) -> check (a fact-checker lists what is wrong) -> edit (a line editor fixes those and improves
 * the telling) -> check again, since an edit can add a fact; one more edit and check if problems remain. Deterministic guards run last.
 */
export type ModelCall = (a: { model: string; system: string; user: string; maxTokens: number }) => Promise<{ text: string; inputTokens: number; outputTokens: number }>;

/** Everything the generator reads. `planner`, `factCheck`, `voices` and `bible` are text (voices and bible in the formats of `parseVoices` and `parseBible`). */
export interface ResolvedPrompt {
  version: number; writer: string; editor: string; model: string; minWords: number; maxWords: number;
  planner: string; factCheck: string; voices: string; bible: string;
  /** The story characters (class entries, names, pools and pairings), in the format of `parseCharacters`. */
  characters: string;
}

/** The prompt used when none has been saved in the admin panel: the defaults in storyPrompt.ts (version 0). */
export const defaultPrompt = (): ResolvedPrompt => ({
  version: 0, writer: WRITER_SYSTEM, editor: EDITOR_SYSTEM, model: DEFAULT_MODEL, minWords: WORD_RANGE.min, maxWords: WORD_RANGE.max,
  planner: PLANNER_SYSTEM, factCheck: FACT_CHECK_SYSTEM, voices: renderVoices(), bible: renderBible(), characters: renderCharacters(),
});

/** Fill the five newer prompt fields from the source defaults when a caller (or an old saved version) left them out. */
export function resolveFields<T extends { planner?: string; factCheck?: string; voices?: string; bible?: string; characters?: string }>(p: T): T & Pick<ResolvedPrompt, "planner" | "factCheck" | "voices" | "bible" | "characters"> {
  const d = defaultPrompt();
  return { ...p, planner: p.planner ?? d.planner, factCheck: p.factCheck ?? d.factCheck, voices: p.voices ?? d.voices, bible: p.bible ?? d.bible, characters: p.characters ?? d.characters };
}

export interface RunRecord {
  pass: "plan" | "write" | "check" | "edit";
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  status: "ok" | "rejected" | "error";
  reason?: string;
}

export type WriteResult =
  | { ok: true; title: string; text: string; words: number; runs: RunRecord[] }
  | { ok: false; reason: string; runs: RunRecord[] };

const MAX_TOKENS = 16000; // this model counts nearly 3 tokens a word: a 1,800-word story is about 5,000, and the editor returns it whole
const short = (s: string): string => s.replace(/\s+/g, " ").slice(0, 200);

/** The title and body of a "# Title" markdown story. */
export function splitStory(text: string): { title: string; words: number } {
  const [first = "", ...rest] = text.trim().split("\n");
  return { title: first.replace(/^#\s+/, "").trim(), words: rest.join(" ").split(/\s+/).filter(Boolean).length };
}

/** The line an older editor prompt put between the story and its list of unsupported facts; tolerated and ignored. */
export const UNSUPPORTED_MARKER = "=== UNSUPPORTED ===";

/** Read the line editor's reply: a "# Title" story. (A reply in the old format, with a marker line and a list after the story, is cut at the marker.) */
export function parseEditedStory(raw: string): string | null {
  const m = raw.match(/^[ \t]*={3} UNSUPPORTED ={3}[ \t]*$/m);
  const story = (m && m.index !== undefined ? raw.slice(0, m.index) : raw).trim();
  return /^# \S/.test(story) ? story : null;
}

/** Read the fact-checker's reply: one problem per line, or the single word "none". Null for an empty reply. */
export function parseFactCheck(raw: string): string[] | null {
  const lines = raw.split("\n").map((l) => l.replace(/^[-*\d.)\s]+/, "").trim()).filter(Boolean);
  if (!lines.length) return null;
  return lines.length === 1 && /^none\.?$/i.test(lines[0]!) ? [] : lines.filter((l) => !/^none\.?$/i.test(l));
}

/**
 * `voiceKey` (the high-score id) picks the voice the story is told in, the same one every time for the same game. The planning pass
 * comes first; if it fails the story is still written, just without a plan.
 */
export async function writeStory(call: ModelCall, prompt: ResolvedPrompt, digestText: string, now: () => number = Date.now, voiceKey = ""): Promise<WriteResult> {
  const runs: RunRecord[] = [];
  const voices = parseVoices(prompt.voices).voices;
  const voice = pickVoice(voiceKey, voices.length ? voices : undefined);
  // lore for just the creatures, objects and places in this run, then the named company of the party (fixed names, pools to pick from)
  const people = castFor(digestText, voiceKey, prompt.characters);
  const bible = [bibleFor(digestText, prompt.bible), people].filter(Boolean).join("\n\n");

  /** One model call, recorded as a run whatever happens. Returns the text, or null after recording the failure. */
  const attempt = async (pass: RunRecord["pass"], system: string, user: string): Promise<string | null> => {
    const t0 = now();
    try {
      const r = await call({ model: prompt.model, system, user, maxTokens: MAX_TOKENS });
      runs.push({ pass, model: prompt.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: estimateCostUsd(prompt.model, r.inputTokens, r.outputTokens), durationMs: now() - t0, status: "ok" });
      return r.text;
    } catch (e) {
      runs.push({ pass, model: prompt.model, inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: now() - t0, status: "error", reason: short(e instanceof Error ? e.message : String(e)) });
      return null;
    }
  };
  /** Mark the most recent run as rejected with a reason (the call worked, its output did not). */
  const reject = (reason: string): WriteResult => {
    const last = runs[runs.length - 1];
    if (last && last.status === "ok") { last.status = "rejected"; last.reason = reason; }
    return { ok: false, reason, runs };
  };

  const planText = await attempt("plan", prompt.planner, plannerUserMessage(digestText, voice, bible));
  const plan = planText?.trim() || undefined; // a failed plan is recorded as an error run; the story goes on without it
  const draft = await attempt("write", prompt.writer, writerUserMessage(digestText, voice, plan, bible));
  if (draft === null) return { ok: false, reason: `write failed: ${runs[runs.length - 1]!.reason}`, runs };

  /** Fact-check a story: the problems found, [] when it is clean, or null after recording a failure. */
  const check = async (story: string): Promise<string[] | WriteResult> => {
    const raw = await attempt("check", prompt.factCheck, factCheckUserMessage(digestText, story));
    if (raw === null) return { ok: false, reason: `check failed: ${runs[runs.length - 1]!.reason}`, runs };
    const found = parseFactCheck(raw);
    return found ?? reject("fact-check reply was empty");
  };

  let story = draft;
  let facts = await check(story);
  let guard: string[] = [];
  // Two edits at most. The first fixes the draft's fact problems and improves the telling. A second only if the edit left (or added) a fact
  // problem, or the finished text breaks a length or form rule: that is handed back to the editor too, not thrown away.
  for (let round = 0; round < 2; round++) {
    if (!Array.isArray(facts)) return facts;
    const edited = await attempt("edit", prompt.editor, editorUserMessage(digestText, story, voice, [...facts, ...guard], plan, people));
    if (edited === null) return { ok: false, reason: `edit failed: ${runs[runs.length - 1]!.reason}`, runs };
    const parsed = parseEditedStory(edited);
    if (!parsed) return reject("editor reply was not in the expected format");
    story = parsed;
    facts = await check(story); // an edit can add a fact: the final text is always checked
    guard = storyProblems(story, { min: prompt.minWords, max: prompt.maxWords });
    if (Array.isArray(facts) && !facts.length && !guard.length) break;
  }
  if (!Array.isArray(facts)) return facts;
  if (facts.length) return reject(`unsupported facts remain: ${short(facts.join("; "))}`);
  if (guard.length) return reject(`guard: ${guard.join(", ")}`);
  const { title, words } = splitStory(story);
  return { ok: true, title, text: story, words, runs };
}
