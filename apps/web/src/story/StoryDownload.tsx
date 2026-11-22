import { useState } from "react";
import { useQuery } from "convex/react";
import type { PartyMember } from "@sorcerers-cave/engine";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { fullStoryMarkdown, type PostMaterialFacts } from "./postMaterial";

/** The pieces of a high-score row the post-material needs. */
export interface StoryRow {
  _id: string;
  name: string;
  score: number;
  createdAt: number;
  party: PartyMember[];
  maxDepth?: number;
  extensionKit?: boolean;
  sibyl?: boolean;
}

const ruleSet = (r: StoryRow): string => (r.sibyl ? "Extension Kit with the Sibyl" : r.extensionKit ? "Extension Kit" : "Base game");

export function storyFacts(row: StoryRow, gameCode: string | null): PostMaterialFacts {
  return {
    playerName: row.name,
    gameCode,
    score: row.score,
    date: new Date(row.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    survivors: row.party.filter((m) => m.status === 0 || m.status === 1).length,
    deepestLevel: row.maxDepth ?? 1,
    ruleSet: ruleSet(row),
  };
}

/**
 * The "short story" control for a high-score entry (docs/requirements/auto-short-story). Shows nothing unless the entry has one
 * (high-scoring solo escapes only): a note while it is being written, a download button once it is ready. The PDF is built here, in
 * the browser, from the stored markdown plus the fixed post-material, and the PDF library is loaded only on click.
 */
export function StoryDownload({ row, gameCode, multiplayer }: { row: StoryRow; gameCode: string | null; multiplayer?: boolean }) {
  const story = useQuery(api.stories.forScore, multiplayer ? "skip" : { highScoreId: row._id as Id<"highScores"> });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!story || story.status === "failed") return null; // loading, no story, or one that could not be written: say nothing
  if (story.status === "pending" || !story.text) {
    return <span className="scv-hsd-dl-note" data-testid="story-pending">Short story being written…</span>;
  }
  const text = story.text;
  const download = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { downloadStoryPdf } = await import("./storyPdf");
      await downloadStoryPdf(fullStoryMarkdown(text, storyFacts(row, gameCode)));
    } catch {
      setErr("The PDF could not be made. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="scv-hsd-dl" disabled={busy} onClick={() => void download()} title={story.title ?? "Short story"} data-testid="story-download">
        {busy ? "Making PDF…" : "Short story (PDF)"}
      </button>
      {err && <span className="scv-resume-err" role="alert">{err}</span>}
    </>
  );
}
