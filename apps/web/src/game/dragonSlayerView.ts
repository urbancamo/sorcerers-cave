import { ALL_CREATURES, type GameEvent } from "@sorcerers-cave/engine";

/** The Dragon's creature id — its card is the one that flips in the celebration. */
export const DRAGON_CREATURE_ID = 10;

/** What the dragon-slayer celebration shows: one slayer's feat, with its wording. */
export interface DragonSlayerView {
  title: string;
  headline: string;
  detail: string;
  kills: number;
}

/** One celebration per `dragonSlain` event (rulebook §Dragon: felled single-handed — each kill is +1
 *  fighting strength for ever after, so the tally is also the total bonus). */
export function dragonSlayersFromEvents(events: GameEvent[]): DragonSlayerView[] {
  const views: DragonSlayerView[] = [];
  for (const e of events) {
    if (e.type !== "dragonSlain") continue;
    const who = `Your ${ALL_CREATURES[e.creatureId]?.name ?? "fighter"}`;
    views.push(e.kills === 1
      ? {
          title: "Dragon-slayer!",
          headline: `${who} has felled a dragon single-handed!`,
          detail: "The dragon's card is turned and kept with its slayer — +1 fighting strength, for ever after.",
          kills: e.kills,
        }
      : {
          title: "Dragon-slayer!",
          headline: `${who} fells yet another dragon!`,
          detail: `Dragon-slayer ×${e.kills} — +${e.kills} fighting strength in all.`,
          kills: e.kills,
        });
  }
  return views;
}
