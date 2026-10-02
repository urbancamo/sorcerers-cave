import { ALL_CREATURES, ALL_TREASURES, type GameEvent } from "@sorcerers-cave/engine";

/** `flip` swings the card through 180° to lie inverted (a felled foe, kept as a trophy — the rulebook's
 *  upside-down dragon card); `rise` lifts it with a glow (a prize won or a gift received); `fall` is the
 *  grand finale — the card shudders, drains to ash and crashes inverted amid sparks (the Sorcerer). */
export type FeatMotion = "flip" | "rise" | "fall";
export type FeatId = "dragon-slain" | "sorcerer-slain" | "ruby-wrested" | "elixir-strength";

export interface FeatView {
  id: FeatId;
  title: string;
  headline: string;
  detail: string;
  /** The card shown: looked up in the manifest by category + engine entity id; `name` is its alt text. */
  card: { category: "creature" | "treasure"; entityId: number; name: string };
  motion: FeatMotion;
  /** A short chip on the card: a running tally ("×3", repeat dragon kills) or the points won ("+30"). */
  badge?: string;
  /** A closing line after the detail (the Sorcerer's curses). */
  aside?: string;
}

const DRAGON = 10, SORCERER = 11, LOST_RUBY = 11, ELIXIR = 15;
// score.ts's flat bonus for the Sorcerer's death; the Elixir's permanent bonus (reduce.ts, SC-EXT-22).
const SORCERER_BONUS = 30, ELIXIR_FS = 2;

/** The celebrations for one action's events, in event order (one per feat). Pure presentation: the
 *  engine already emits each event; nothing here changes the game. */
export function featsFromEvents(events: GameEvent[]): FeatView[] {
  const feats: FeatView[] = [];
  const powerless = events.some((e) => e.type === "statuePowerless");
  for (const e of events) {
    switch (e.type) {
      case "dragonSlain": {
        const who = `Your ${ALL_CREATURES[e.creatureId]?.name ?? "fighter"}`;
        const card = { category: "creature" as const, entityId: DRAGON, name: "Dragon" };
        feats.push(e.kills === 1
          ? {
              id: "dragon-slain", title: "Dragon-slayer!", motion: "flip", card,
              headline: `${who} has felled a dragon single-handed!`,
              detail: "The dragon's card is turned and kept with its slayer — +1 fighting strength, for ever after.",
            }
          : {
              id: "dragon-slain", title: "Dragon-slayer!", motion: "flip", card, badge: `×${e.kills}`,
              headline: `${who} fells yet another dragon!`,
              detail: `Dragon-slayer ×${e.kills} — +${e.kills} fighting strength in all.`,
            });
        break;
      }
      case "sorcererSlain":
        feats.push({
          id: "sorcerer-slain", title: "The Sorcerer falls!", motion: "fall", badge: `+${SORCERER_BONUS}`,
          card: { category: "creature", entityId: SORCERER, name: "The Sorcerer" },
          headline: "You have vanquished the master of the cave!",
          detail: `A feat few adventurers ever achieve — congratulations, hero! (+${SORCERER_BONUS} to your final score)`,
          aside: "The Sorcerer's curses die with him — every curse upon your party is lifted.",
        });
        break;
      case "rubyTaken":
        feats.push({
          id: "ruby-wrested", title: "The Lost Ruby!", motion: "rise",
          card: { category: "treasure", entityId: LOST_RUBY, name: "Lost Ruby" },
          headline: powerless
            ? "The Lost Ruby is yours — the statue stands powerless before you!"
            : "You wrest the Lost Ruby from the guardian statue!",
          detail: `A jewel of great price — +${ALL_TREASURES[LOST_RUBY]!.points} points.`,
        });
        break;
      case "elixirDrunk":
        if (e.outcome !== "strength") break; // death / nothing have their own die-overlay lines
        feats.push({
          id: "elixir-strength", title: "The Elixir works!", motion: "rise",
          card: { category: "treasure", entityId: ELIXIR, name: "Elixir" },
          headline: `${ALL_CREATURES[e.creatureId]?.name ?? "A companion"} feels power settle into their bones.`,
          detail: `+${ELIXIR_FS} fighting strength, for ever after.`,
        });
        break;
    }
  }
  return feats;
}
