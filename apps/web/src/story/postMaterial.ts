/**
 * The FIXED material added after every story. It is not generated and not stored with the story: it is built from the
 * high-score entry when the story is shown or the PDF is made, so editing this file updates every story (old ones too)
 * without a rewrite. Edit the wording here. Markdown; `{placeholders}` are filled from `PostMaterialFacts`.
 */
export interface PostMaterialFacts {
  /** The name the player saved the score under. */
  playerName: string;
  /** The four-letter game code that replays the run. */
  gameCode: string | null;
  score: number;
  /** Day the score was recorded, as a readable date. */
  date: string;
  /** Final party size at the exit, and the deepest level reached. */
  survivors: number;
  deepestLevel: number;
  /** Which rule set the score belongs to: "Base game", "Extension Kit", "Extension Kit with the Sibyl". */
  ruleSet: string;
}

export const POST_MATERIAL_TEMPLATE = `---

## About this story

This story was written from a real expedition in *The Sorcerer's Cave*. {playerName} led the party out of the cave on {date}, with {survivors} {survivorsWord} alive, having reached level {deepestLevel} of the cave, for a score of **{score}** ({ruleSet}).

The names, the thoughts and the words are invented; what happened in the cave is not. Every room, meeting, fight and loss in the tale is one the game recorded.
{replayLine}
*Play the game and write your own.*
`;

const REPLAY_LINE = "\nYou can watch this run again, move by move, from the title screen: game code **{gameCode}**.\n";

export function postMaterial(f: PostMaterialFacts): string {
  const fill: Record<string, string> = {
    playerName: f.playerName.replace(/[*_#>`]/g, ""), // a player's name is data: strip anything markdown could read as formatting
    date: f.date,
    survivors: String(f.survivors),
    survivorsWord: f.survivors === 1 ? "member" : "members",
    deepestLevel: String(f.deepestLevel),
    score: String(f.score),
    ruleSet: f.ruleSet,
    gameCode: f.gameCode ?? "",
    replayLine: f.gameCode ? REPLAY_LINE.replace("{gameCode}", f.gameCode.replace(/[^A-Za-z0-9]/g, "")) : "",
  };
  return POST_MATERIAL_TEMPLATE.replace(/\{(\w+)\}/g, (_, k: string) => fill[k] ?? "");
}

/** A story plus its fixed post-material, as the one markdown document that is shown and printed. */
export const fullStoryMarkdown = (storyMd: string, f: PostMaterialFacts): string => `${storyMd.trim()}\n\n${postMaterial(f)}`;
