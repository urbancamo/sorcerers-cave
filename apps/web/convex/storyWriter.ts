import {
  DEFAULT_MODEL, EDITOR_SYSTEM, WORD_RANGE, WRITER_SYSTEM, editorUserMessage, estimateCostUsd, storyProblems, writerUserMessage,
} from "./storyPrompt";

/**
 * The two-pass story generator, with the model call passed in so it is testable without an API and so the Convex action
 * stays thin. Pass 1 writes from the digest; pass 2 checks the draft against the digest (facts and continuity), returns the
 * improved story and any facts it could not support; one retry of pass 2 may clear those; deterministic guards run last.
 */
export type ModelCall = (a: { model: string; system: string; user: string; maxTokens: number }) => Promise<{ text: string; inputTokens: number; outputTokens: number }>;

export interface ResolvedPrompt { version: number; writer: string; editor: string; model: string; minWords: number; maxWords: number }

/** The prompt used when none has been saved in the admin panel: the defaults in storyPrompt.ts (version 0). */
export const defaultPrompt = (): ResolvedPrompt => ({ version: 0, writer: WRITER_SYSTEM, editor: EDITOR_SYSTEM, model: DEFAULT_MODEL, minWords: WORD_RANGE.min, maxWords: WORD_RANGE.max });

export interface RunRecord {
  pass: "write" | "check";
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

const MAX_TOKENS = 4096;
const short = (s: string): string => s.replace(/\s+/g, " ").slice(0, 200);

/** The title and body of a "# Title" markdown story. */
export function splitStory(text: string): { title: string; words: number } {
  const [first = "", ...rest] = text.trim().split("\n");
  return { title: first.replace(/^#\s+/, "").trim(), words: rest.join(" ").split(/\s+/).filter(Boolean).length };
}

/** Read the editor's JSON reply, tolerating a code fence or stray text around it. */
export function parseEditorReply(raw: string): { story: string; unsupported: string[] } | null {
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const j = JSON.parse(raw.slice(start, end + 1)) as { story?: unknown; unsupported?: unknown };
    if (typeof j.story !== "string" || !j.story.trim()) return null;
    const unsupported = Array.isArray(j.unsupported) ? j.unsupported.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
    return { story: j.story.trim(), unsupported };
  } catch { return null; }
}

export async function writeStory(call: ModelCall, prompt: ResolvedPrompt, digestText: string, now: () => number = Date.now): Promise<WriteResult> {
  const runs: RunRecord[] = [];

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

  const draft = await attempt("write", prompt.writer, writerUserMessage(digestText));
  if (draft === null) return { ok: false, reason: `write failed: ${runs[runs.length - 1]!.reason}`, runs };

  let edited = await attempt("check", prompt.editor, editorUserMessage(digestText, draft));
  if (edited === null) return { ok: false, reason: `check failed: ${runs[runs.length - 1]!.reason}`, runs };
  let parsed = parseEditorReply(edited);
  if (!parsed) return reject("editor reply was not valid JSON");

  // Unsupported facts left after the first check: one more pass over the edited story, told what remains.
  if (parsed.unsupported.length) {
    const again = await attempt("check", prompt.editor, `${editorUserMessage(digestText, parsed.story)}\n\nThe previous check could not reconcile these with the record; fix them in the text:\n- ${parsed.unsupported.join("\n- ")}`);
    if (again === null) return { ok: false, reason: `check failed: ${runs[runs.length - 1]!.reason}`, runs };
    edited = again;
    parsed = parseEditorReply(edited);
    if (!parsed) return reject("editor reply was not valid JSON");
    if (parsed.unsupported.length) return reject(`unsupported facts remain: ${short(parsed.unsupported.join("; "))}`);
  }

  const problems = storyProblems(parsed.story, { min: prompt.minWords, max: prompt.maxWords });
  if (problems.length) return reject(`guard: ${problems.join(", ")}`);
  const { title, words } = splitStory(parsed.story);
  return { ok: true, title, text: parsed.story, words, runs };
}
