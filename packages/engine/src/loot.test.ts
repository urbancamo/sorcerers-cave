import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { applyHazards } from "./hazards";
import { HAZARD_MEDUSA, HAZARD_GHOULS } from "./data/hazards";
import { GS_DEAD } from "./state";
import type { GameState } from "./state";

/** Plan ④a — borne vs carried: what happens to a member's items when the flesh fails (SC-7.4-*). */

const member = (over: Record<string, unknown> = {}) =>
  ({ creatureId: 0, status: 0, dragonKills: 0, treasure: [], ...over }) as GameState["party"][number];

describe("setBorne (bear vs stow)", () => {
  it("bears and stows a borneable item (Sword/Staff/Ring)", () => {
    const s = makeState({ party: [member({ treasure: [3, 1] })] }); // Magic Sword + Gold
    const borne = reduce(s, { type: "setBorne", mi: 0, idx: 0, borne: true }).state;
    expect(borne.party[0]!.borne).toEqual([3]);
    const stowed = reduce(borne, { type: "setBorne", mi: 0, idx: 0, borne: false }).state;
    expect(stowed.party[0]!.borne).toEqual([]);
  });

  it("rejects bearing a non-borneable item, mid-fight use, and dead/stone members", () => {
    const s = makeState({ party: [member({ treasure: [1] })] }); // Gold has no borne mode
    expect(reduce(s, { type: "setBorne", mi: 0, idx: 0, borne: true }).events).toContainEqual({ type: "blocked" });
    const fight = makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, party: [member({ treasure: [3] })] });
    expect(reduce(fight, { type: "setBorne", mi: 0, idx: 0, borne: true }).events).toContainEqual({ type: "blocked" });
    const stone = makeState({ party: [member({ treasure: [3], status: 2 })] });
    expect(reduce(stone, { type: "setBorne", mi: 0, idx: 0, borne: true }).events).toContainEqual({ type: "blocked" });
  });

  it("handing over or dropping a borne item un-bears it", () => {
    const s = makeState({
      party: [member({ treasure: [3], borne: [3] }), member({ creatureId: 5, treasure: [] })],
    });
    const given = reduce(s, { type: "moveTreasure", from: 0, to: 1, idx: 0 }).state;
    expect(given.party[0]!.borne).toEqual([]);
    expect(given.party[1]!.treasure).toEqual([3]);
    expect(given.party[1]!.borne ?? []).toEqual([]); // arrives carried, not borne

    const s2 = makeState({ party: [member({ treasure: [3], borne: [3] })] });
    const dropped = reduce(s2, { type: "dropTreasure", mi: 0, idx: 0 }).state;
    expect(dropped.party[0]!.borne).toEqual([]);
  });
});

describe("stone members (Medusa petrification, plan ④a)", () => {
  const gaze = (party: GameState["party"]) => {
    // Seed 2 rolls 1-2 for the first member with makeState's default seed threading — instead force
    // determinism by scanning seeds until the target member petrifies.
    for (let seed = 1; seed < 500; seed++) {
      const s = makeState({ seed, party: structuredClone(party), hazards: [HAZARD_MEDUSA] });
      const events = applyHazards(s).events;
      const rolls = events.find((e) => e.type === "medusaGaze") as { rolls: { petrified: boolean }[] } | undefined;
      if (rolls?.rolls[0]?.petrified) return { s, events };
    }
    throw new Error("no petrifying seed found");
  };

  it("petrification spills CARRIED items to the chamber floor; BORNE items petrify with the body", () => {
    const { s, events } = gaze([member({ treasure: [3, 1, 7], borne: [3] })]); // Sword borne; Gold+Talisman carried
    expect(s.party[0]!.status).toBe(2);
    expect(s.party[0]!.treasure).toEqual([3]);            // only the borne Sword stays on the statue
    expect(s.treasures).toEqual(expect.arrayContaining([1, 7])); // carried items joined the floor
    expect(events).toContainEqual({ type: "itemsSpilled", creatureId: 0, items: [1, 7] });
  });

  it("a stone member's remaining items cannot be moved or dropped", () => {
    const s = makeState({
      party: [member({ treasure: [3], borne: [3], status: 2, stoneArea: 0 }), member({ creatureId: 5 })],
    });
    expect(reduce(s, { type: "moveTreasure", from: 0, to: 1, idx: 0 }).events).toContainEqual({ type: "blocked" });
    expect(reduce(s, { type: "dropTreasure", mi: 0, idx: 0 }).events).toContainEqual({ type: "blocked" });
  });

  it("revival returns the member with its borne items intact (they never left the body)", () => {
    // Wizard with Staff present in the same area frees the stone member on entry (reviveStoned path
    // runs in resolveArea; here use the Magic Staff artifact action directly).
    const s = makeState({
      party: [
        member({ treasure: [3], borne: [3], status: 2, stoneArea: 0 }),
        member({ creatureId: 8, treasure: [9] }), // Wizard bearing the Staff
      ],
    });
    const revived = reduce(s, { type: "useArtifact", artifact: 9, target: 0 }).state;
    expect(revived.party[0]!.status).toBe(0);
    expect(revived.party[0]!.treasure).toEqual([3]); // the borne Sword un-petrified with him
  });
});

describe("fallen members (death loot, I-12 / SC-9.5)", () => {
  it("on a WON fight the fallen's CARRIED items join the pickup; a borne item is lost with the body", () => {
    // Two members vs one weak stranger: member 0 (doomed) carries Talisman(7)+Gold(1), bears Sword(3).
    // Find a seed where member 0 dies in round 1 and the party wins a later round.
    for (let seed = 1; seed < 2000; seed++) {
      let s = makeState({
        seed,
        phase: "fight",
        fight: { surprise: 0, round: 1, focus: 0 },
        strangers: [3], // a Troll
        party: [
          member({ treasure: [3, 7, 1], borne: [3] }),
          member({ creatureId: 2, treasure: [] }), // Ogre
        ],
      });
      let r = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
      if (!r.events.some((e) => e.type === "memberDied")) continue; // need member 0 to fall
      s = r.state;
      // Fight on with the Ogre until the Troll falls (bounded).
      for (let round = 0; round < 20 && s.phase === "fight"; round++) {
        r = reduce(s, { type: "resolveRound", matches: [{ front: [1], backers: [], strangers: [0] }] });
        s = r.state;
      }
      if (s.gs === GS_DEAD) continue; // Ogre also died — try another seed
      // The fallen member's carried Talisman + Gold spilled into the post-win pickup; borne Sword did not.
      expect(s.treasures).toEqual(expect.arrayContaining([7, 1]));
      expect(s.treasures).not.toContain(3);
      expect(s.party[0]!.treasure).toEqual([3]); // the Sword rests with the body
      return;
    }
    throw new Error("no suitable seed found");
  });

  it("on a WIPE the fallen's carried items park on the tile for whoever comes next", () => {
    for (let seed = 1; seed < 2000; seed++) {
      const s = makeState({
        seed,
        phase: "fight",
        fight: { surprise: 0, round: 1, focus: 0 },
        strangers: [10], // a Dragon — likely to slay a lone Man
        party: [member({ creatureId: 5, treasure: [7, 3], borne: [3] })],
      });
      const r = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
      if (r.state.gs !== GS_DEAD) continue;
      expect(r.state.areas[r.state.partyArea]!.contents).toContain(200 + 7); // Talisman on the tile
      expect(r.state.areas[r.state.partyArea]!.contents).not.toContain(200 + 3); // borne Sword lost with body
      expect(r.events).toContainEqual({ type: "itemsSpilled", creatureId: 5, items: [7] });
      return;
    }
    throw new Error("no suitable seed found");
  });

  it("ghoul-slain members spill their carried artifacts onto the floor with the dropped heavy treasure", () => {
    for (let seed = 1; seed < 2000; seed++) {
      const s = makeState({
        seed,
        party: [member({ creatureId: 6, treasure: [7, 1] })], // Woman: Talisman would ward… use Priest
        hazards: [HAZARD_GHOULS],
      });
      // Talisman wards off Ghouls — so carry non-warding items instead.
      s.party[0] = member({ creatureId: 4, treasure: [8, 1] }); // Priest with Potion + Gold
      const { events } = applyHazards(s);
      const died = events.some((e) => e.type === "memberDied" || (e.type === "combatRoll" && e.result === "enemyWon"));
      if (!died || s.party[0]!.status !== 3) continue;
      expect(s.treasures).toEqual(expect.arrayContaining([8, 1])); // artifacts + heavy on the floor
      expect(events.some((e) => e.type === "itemsSpilled")).toBe(true);
      return;
    }
    throw new Error("no suitable seed found");
  });
});
