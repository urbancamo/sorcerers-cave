import { describe, expect, it } from "vitest";
import { reduce } from "./reduce";
import { applyHazards } from "./hazards";
import { legalActions } from "./selectors";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { HAZARD_QUARREL } from "./data/hazards";
import type { PartyMember } from "./state";

// Rulings R-07/R-10 (MSW, 2026-11-06): when the party has no original member left, by any cause, the player picks a new leader
// from the remaining members; that member counts as original from then on. R-14: a Quarrel tie between equals is the player's choice.
const MAN = 5, WOMAN = 6, DWARF = 7, HERO = 1, OGRE = 3;
const m = (creatureId: number, status: PartyMember["status"] = 0): PartyMember => ({ creatureId, status, dragonKills: 0, treasure: [] });
const area = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 };

describe("choosing a new leader (R-07/R-10)", () => {
  it("a single remaining ally is made the leader at once", () => {
    const s = makeState({ phase: "pickup", areas: [{ ...area }], party: [m(MAN, 3), m(WOMAN, 1)], treasures: [] });
    const { state, events } = reduce(s, { type: "leaveTreasure" });
    expect(state.party[1]!.status).toBe(0);
    expect(state.phase).toBe("explore");
    expect(events).toContainEqual({ type: "leaderChosen", creatureId: WOMAN });
  });

  it("several allies make the player choose; only chooseLeader (or quit) is accepted meanwhile", () => {
    const s = makeState({ phase: "pickup", areas: [{ ...area }], party: [m(MAN, 3), m(WOMAN, 1), m(DWARF, 1)], treasures: [] });
    const { state } = reduce(s, { type: "leaveTreasure" });
    expect(state.phase).toBe("leader");
    expect(legalActions(state)).toEqual([{ type: "chooseLeader", idx: 1 }, { type: "chooseLeader", idx: 2 }]);
    expect(reduce(state, { type: "leaveTreasure" }).events.some((e) => e.type === "blocked")).toBe(true);
    const done = reduce(state, { type: "chooseLeader", idx: 2 });
    expect(done.state.party.map((x) => x.status)).toEqual([3, 1, 0]);
    expect(done.state.phase).not.toBe("leader");
    expect(done.events).toContainEqual({ type: "leaderChosen", creatureId: DWARF });
  });

  it("chooseLeader refuses a member who is not a living ally", () => {
    const s = makeState({ phase: "pickup", areas: [{ ...area }], party: [m(MAN, 3), m(WOMAN, 1), m(DWARF, 1)], treasures: [] });
    const { state } = reduce(s, { type: "leaveTreasure" });
    expect(reduce(state, { type: "chooseLeader", idx: 0 }).events.some((e) => e.type === "blocked")).toBe(true);
  });

  it("nothing is asked while an original member lives", () => {
    const s = makeState({ phase: "pickup", areas: [{ ...area }], party: [m(MAN), m(WOMAN, 1), m(DWARF, 1)], treasures: [] });
    expect(reduce(s, { type: "leaveTreasure" }).state.phase).toBe("explore");
  });
});

describe("a Quarrel tie is the player's choice (R-14)", () => {
  const tiedAtTheTop = () => makeState({ hazards: [HAZARD_QUARREL], party: [m(HERO), m(OGRE), m(HERO)], areas: [{ ...area }] });

  it("asks when equals compete for the last place, and fixes those clearly stronger", () => {
    const s = makeState({ hazards: [HAZARD_QUARREL], party: [m(OGRE), m(MAN), m(MAN)], areas: [{ ...area }] });
    const r = applyHazards(s);
    expect(r.quarrelAsk).toEqual({ fixed: [0], candidates: [1, 2], slots: 1 });
    expect(r.events.some((e) => e.type === "quarrel")).toBe(false);
    expect(s.hazards).toEqual([HAZARD_QUARREL]); // still to be dealt with once the player has chosen
  });

  it("uses the chosen members, then carries on", () => {
    const s = tiedAtTheTop();
    s.quarrelChosen = [0, 2];
    const r = applyHazards(s);
    expect(r.quarrelAsk).toBeUndefined();
    const q = r.events.find((e) => e.type === "quarrel") as { aId: number; bId: number };
    expect([q.aId, q.bId]).toEqual([HERO, HERO]);
    expect(s.quarrelChosen).toBeUndefined();
  });

  it("chooseQuarrel resumes the chamber with the player's two", () => {
    const s = tiedAtTheTop();
    const ask = applyHazards(s).quarrelAsk!;
    const paused = makeState({ ...s, phase: "quarrel", quarrelPause: { freshEntry: false, announceLull: false, ...ask } });
    expect(legalActions(paused).map((a) => a.type)).toEqual(Array(3).fill("chooseQuarrel"));
    const out = reduce(paused, { type: "chooseQuarrel", members: [0, 2] });
    expect(out.events.some((e) => e.type === "quarrel")).toBe(true);
    expect(out.state.phase).not.toBe("quarrel");
    expect(out.state.quarrelPause).toBeUndefined();
  });

  it("refuses a pick that is not among the candidates or the wrong size", () => {
    const s = tiedAtTheTop();
    const ask = applyHazards(s).quarrelAsk!;
    const paused = makeState({ ...s, phase: "quarrel", quarrelPause: { freshEntry: false, announceLull: false, ...ask } });
    expect(reduce(paused, { type: "chooseQuarrel", members: [0] }).events.some((e) => e.type === "blocked")).toBe(true);
    expect(reduce(paused, { type: "chooseQuarrel", members: [0, 7] }).events.some((e) => e.type === "blocked")).toBe(true);
  });

  it("a clear order needs no choice", () => {
    const s = makeState({ hazards: [HAZARD_QUARREL], party: [m(HERO), m(OGRE), m(MAN)], areas: [{ ...area }] });
    expect(applyHazards(s).quarrelAsk).toBeUndefined();
  });
});

describe("a member revived by the Healing Balm (B-06)", () => {
  it("is not listed as using what its fall spilled on the floor", () => {
    const fallen: PartyMember = { creatureId: MAN, status: 3, dragonKills: 0, treasure: [], borne: [7], diedTurn: 0, diedArea: 0 };
    const s = makeState({ phase: "explore", turn: 0, partyArea: 0, areas: [{ ...area }], party: [m(WOMAN, 0), fallen] });
    s.party[0]!.treasure = [6];
    const r = reduce(s, { type: "useArtifact", artifact: 6, target: 1 });
    expect(r.state.party[1]!.status).toBe(0);
    expect(r.state.party[1]!.borne ?? []).toEqual([]);
  });
});

describe("the turncoat Apprentice parting company (found by the final soak)", () => {
  it("a party left with one ally after she goes still gets its leader", async () => {
    const g = (await import("./fixtures/leader-after-apprentice-parts.json")).default;
    const { replay } = await import("./replay");
    const { checkInvariants } = await import("./invariants");
    const frames = replay(g.seed, g.picks, g.actions as never, g.variants as never);
    const last = frames[frames.length - 1]!.state;
    expect(frames[frames.length - 1]!.events.some((e) => e.type === "apprenticeParts")).toBe(true);
    expect(last.party.some((x) => x.status === 0)).toBe(true);
    for (const f of frames) expect(checkInvariants(f.state)).toEqual([]);
  });
});
