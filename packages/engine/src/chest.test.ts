import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { scoreGame } from "./score";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { GS_ESCAPED } from "./state";

const member = (creatureId: number, treasure: number[] = []) => ({ creatureId, status: 0 as 0 | 1 | 2 | 3, dragonKills: 0, treasure });
const area = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 };

describe("openChest (spec §11/§16)", () => {
  it("removes the chest and applies the rolled result, across seeds", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = makeState({ phase: "explore", areas: [area], party: [member(0, [14])], seed });
      const { state, events } = reduce(s, { type: "openChest" });
      const opened = events.find((e) => e.type === "chestOpened") as { type: "chestOpened"; result: number } | undefined;
      expect(opened).toBeDefined();
      expect(state.party[0]!.treasure).not.toContain(14); // chest consumed
      if (opened!.result === 1) expect(state.curses).toBe(1);
      if (opened!.result === 2) { expect(state.phase).toBe("fight"); expect(state.strangers).toContain(9); }
      if (opened!.result === 4) expect(state.bonusScore).toBe(20);
      if (opened!.result === 5) expect(state.bonusScore).toBe(40);
      if (opened!.result === 6) expect(state.bonusScore).toBe(80);
    }
  });

  it("is rejected outside explore or when no living member carries the chest", () => {
    const noChest = makeState({ phase: "explore", areas: [area], party: [member(0)] });
    expect(reduce(noChest, { type: "openChest" }).events).toContainEqual({ type: "blocked" });
    const wrongPhase = makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [10], party: [member(0, [14])] });
    expect(reduce(wrongPhase, { type: "openChest" }).events).toContainEqual({ type: "blocked" });
  });

  it("scoreGame includes banked chest loot", () => {
    const s = makeState({ gs: GS_ESCAPED, bonusScore: 40, party: [member(0)] }); // Hero 10 + 40
    expect(scoreGame(s)).toBe(50);
  });
});

// Bug DOFO (2026-10-11): an Ogre carrying the Eye of God opened the Treasure Chest, rolled a Spectre — and
// it fought on and slew him. The Eye destroys Spectres on sight and the Talisman drives them off on level 4+,
// but the chest conjured its Spectre straight into a fight, past both checks that guard every other arrival.
describe("a Spectre from the chest meets the Eye and the Talisman like any other (bug DOFO)", () => {
  const T_EYE = 13, T_TALISMAN = 7;
  /** Open the chest for each seed until the die gives the Spectre (2); return those results. */
  const spectreRolls = (party: ReturnType<typeof member>[], level = 1) => {
    const out: { state: ReturnType<typeof reduce>["state"]; events: ReturnType<typeof reduce>["events"] }[] = [];
    for (let seed = 1; seed <= 60; seed++) {
      const s = makeState({ phase: "explore", areas: [{ ...area, coord: packCoord(level, 50, 50) }], level, party: structuredClone(party), seed });
      const r = reduce(s, { type: "openChest" });
      if ((r.events.find((e) => e.type === "chestOpened") as { result: number }).result === 2) out.push(r);
    }
    return out;
  };

  it("control: with neither, the Spectre appears and attacks", () => {
    const rolls = spectreRolls([member(5, [14])]);
    expect(rolls.length).toBeGreaterThan(0);
    for (const { state } of rolls) { expect(state.phase).toBe("fight"); expect(state.strangers).toEqual([9]); }
  });

  it("the Eye, held by any living member, destroys it on sight: no fight, nothing slain", () => {
    const rolls = spectreRolls([member(5, [14]), member(2, [T_EYE])]); // the Eye is NOT on the chest's bearer
    expect(rolls.length).toBeGreaterThan(0);
    for (const { state, events } of rolls) {
      expect(events).toContainEqual({ type: "annihilated", creatureId: 9 });
      expect(events.some((e) => e.type === "fightStarted")).toBe(false);
      expect(state.phase).toBe("explore");
      expect(state.strangers).toEqual([]);
      expect(state.fight ?? null).toBeNull();
      expect(state.party.every((m) => m.status === 0)).toBe(true);
    }
  });

  it("the Eye on the chest's own bearer works too (the DOFO case: the Ogre held both)", () => {
    const rolls = spectreRolls([member(2, [14, T_EYE])]);
    expect(rolls.length).toBeGreaterThan(0);
    for (const { state, events } of rolls) {
      expect(events).toContainEqual({ type: "annihilated", creatureId: 9 });
      expect(state.phase).toBe("explore");
      expect(state.party[0]!.treasure).toContain(T_EYE); // still carrying it, no curse for keeping it
      expect(state.curses).toBe(0);
    }
  });

  it("the Talisman drives it off on level 4 or deeper, but not above", () => {
    const deep = spectreRolls([member(5, [14, T_TALISMAN])], 4);
    expect(deep.length).toBeGreaterThan(0);
    for (const { state, events } of deep) {
      expect(events).toContainEqual({ type: "wardedOff", creatureId: 9 });
      expect(state.phase).toBe("explore");
    }
    const shallow = spectreRolls([member(5, [14, T_TALISMAN])], 3);
    for (const { state } of shallow) expect(state.phase).toBe("fight");
  });
});

// Peter, 10-OCT-2026 (Q6): the chest Spectre gets NO surprise attack — the Consolidated Rules say it "attacks", not
// "surprise attacks". The engine used to start that fight with the strangers holding surprise (-1).
describe("the chest Spectre fights without surprise (Peter, Q6)", () => {
  it("starts the fight with surprise 0 on either side", () => {
    let seen = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = makeState({ phase: "explore", areas: [area], party: [member(5, [14])], seed });
      const { state, events } = reduce(s, { type: "openChest" });
      if ((events.find((e) => e.type === "chestOpened") as { result: number }).result !== 2) continue;
      seen++;
      expect(state.phase).toBe("fight");
      expect(state.fight?.surprise).toBe(0);
      expect(events).toContainEqual({ type: "fightStarted", surprise: 0 });
    }
    expect(seen).toBeGreaterThan(0);
  });
});
