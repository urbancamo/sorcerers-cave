import { describe, it, expect, afterEach } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { gearOf } from "./strangerGear";
import { applyStrangerDecision, awaitingRequest, driveStrangers, markAwaiting } from "./strangerDriver";
import { registerStrategy, unregisterStrategy, type StrangerStrategy } from "./strategy";
import { externalStrategy } from "./externalLevels";
import type { GameAction } from "./actions";
import type { GameState, PartyMember } from "./state";

// Stage 6.2 (docs/requirements/combat/2026-10-13-stage-6-external-strategy-plan.md): a decision an external level has not yet answered
// stays pending between mutations, with a record of when it was asked, so a late or duplicate answer can be recognised.

const HERO = 0, OGRE = 2, TROLL = 3, MAN = 5;
const SWORD = 3, GOLD = 5;
const member = (creatureId: number): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure: [] });
const META = { strategyId: "ext", strategyVersion: 1 };

const registered: string[] = [];
const register = (s: StrangerStrategy) => { registerStrategy(s); registered.push(s.id); };
afterEach(() => { while (registered.length) unregisterStrategy(registered.pop()!); });
const ext = () => register(externalStrategy({ id: "ext", version: 1, budget: { deadlineMs: 2500 } }));

const loadoutBase = (): GameState =>
  makeState({ phase: "encounter", strangers: [HERO, OGRE], treasures: [SWORD, GOLD], party: [member(HERO), member(MAN)], variants: { strangerLevel: "ext" } });
const loadoutFight = (): GameState => reduce(loadoutBase(), { type: "attack" }).state;
const deployFight = (): GameState =>
  reduce(makeState({ phase: "encounter", strangers: [OGRE, TROLL], treasures: [], party: [member(HERO), member(MAN)], variants: { combatRevision: true, strangerLevel: "ext" } }), { type: "attack" }).state;

describe("markAwaiting: recording the request", () => {
  it("stamps the pending decision with the request id, the time asked and the level's deadline", () => {
    ext();
    const state = markAwaiting(loadoutFight(), "req-1", 1_000);
    expect(state.fight!.pending).toEqual({ by: "strangers", kind: "loadout", request: { id: "req-1", at: 1_000, deadlineMs: 2500 } });
    expect(awaitingRequest(state)).toEqual({ id: "req-1", at: 1_000, deadlineMs: 2500 });
  });

  it("does not change the state it is given", () => {
    ext();
    const before = loadoutFight();
    const snapshot = structuredClone(before);
    markAwaiting(before, "req-1", 1);
    expect(before).toEqual(snapshot);
  });

  it("works for a pairing decision as well", () => {
    ext();
    const state = markAwaiting(deployFight(), "req-2", 5);
    expect(state.fight!.pending).toMatchObject({ by: "strangers", kind: "deploy", min: 2, request: { id: "req-2", at: 5, deadlineMs: 2500 } });
  });

  it("refuses when nothing is pending for the strangers", () => {
    expect(() => markAwaiting(makeState({ phase: "encounter", strangers: [OGRE], party: [member(HERO)] }), "r", 1)).toThrow(/pending/);
  });

  it("refuses a level that declares no deadline (a built-in is never awaited)", () => {
    const state = reduce(makeState({ phase: "encounter", strangers: [HERO, OGRE], treasures: [SWORD], party: [member(HERO)], variants: { strangerLevel: "standard" } }), { type: "attack" }).state;
    expect(() => markAwaiting(state, "r", 1)).toThrow(/deadline/);
  });

  it("awaitingRequest is null when there is nothing awaited or no request was recorded", () => {
    ext();
    expect(awaitingRequest(makeState({ phase: "encounter", strangers: [OGRE], party: [member(HERO)] }))).toBeNull();
    expect(awaitingRequest(loadoutFight())).toBeNull();
  });
});

describe("the pending decision persists", () => {
  it("survives a JSON round trip, as it does when stored", () => {
    ext();
    const state = markAwaiting(loadoutFight(), "req-1", 7);
    const stored = JSON.parse(JSON.stringify(state)) as GameState;
    expect(stored).toEqual(state);
    expect(driveStrangers(stored)).toMatchObject({ applied: [], awaiting: "loadout" });
  });

  it("is resumed by the answer, which clears the request with the pending decision", () => {
    ext();
    const stored = JSON.parse(JSON.stringify(markAwaiting(loadoutFight(), "req-1", 7))) as GameState;
    const { state } = applyStrangerDecision(stored, { allocations: [{ artifact: SWORD, stranger: 0 }] }, META);
    expect(gearOf(state, 0)).toEqual([SWORD]);
    expect(state.fight!.pending).toBeUndefined();
    expect(awaitingRequest(state)).toBeNull();
  });

  it("a request never reaches the log and changes nothing about the outcome (P6)", () => {
    ext();
    const answer = { allocations: [{ artifact: SWORD, stranger: 0 }] };
    const marked = applyStrangerDecision(markAwaiting(loadoutFight(), "req-1", 7), answer, META);
    const unmarked = applyStrangerDecision(loadoutFight(), answer, META);
    expect(marked.state).toEqual(unmarked.state);
    expect(marked.applied).toEqual(unmarked.applied);
    expect(JSON.stringify(marked.applied)).not.toContain("req-1");
  });
});

describe("while a decision is awaited nothing else is accepted (P7)", () => {
  const blocked = (state: GameState, action: GameAction) => {
    const r = reduce(state, action);
    expect(r.events, JSON.stringify(action)).toEqual([{ type: "blocked" }]);
    expect(r.state, JSON.stringify(action)).toEqual(state);
  };

  it("refuses the player's actions", () => {
    ext();
    const state = markAwaiting(loadoutFight(), "req-1", 1);
    for (const a of [{ type: "attack" }, { type: "retreat" }, { type: "resolveRound", matches: [] }, { type: "proceed" }, { type: "move", dir: 0 }] as GameAction[]) blocked(state, a);
  });

  it("refuses the party's pairing actions", () => {
    ext();
    const state = markAwaiting(deployFight(), "req-2", 1);
    for (const a of [{ type: "deploy", creatures: [0, 1] }, { type: "engage", pairs: [] }, { type: "redeploy", moves: [] }] as GameAction[]) blocked(state, a);
  });

  it("refuses a stranger action of the wrong kind", () => {
    ext();
    const loadout = markAwaiting(loadoutFight(), "req-1", 1);
    blocked(loadout, { type: "strangersDeploy", ...META, creatures: [0, 1] });
    blocked(loadout, { type: "strangersNominate", ...META, nominated: 0 });
    const deploy = markAwaiting(deployFight(), "req-2", 1);
    blocked(deploy, { type: "strangersAssignArtefacts", ...META, allocations: [] });
    blocked(deploy, { type: "strangersEngage", ...META, pairs: [] });
  });

  it("refuses an illegal answer of the right kind", () => {
    ext();
    blocked(markAwaiting(loadoutFight(), "req-1", 1), { type: "strangersAssignArtefacts", ...META, allocations: [{ artifact: 99, stranger: 0 }] });
    blocked(markAwaiting(deployFight(), "req-2", 1), { type: "strangersDeploy", ...META, creatures: [0] });
  });

  it("refuses any stranger action when no decision is pending, in every phase", () => {
    const actions: GameAction[] = [
      { type: "strangersAssignArtefacts", ...META, allocations: [] },
      { type: "strangersDeploy", ...META, creatures: [0] },
      { type: "strangersEngage", ...META, pairs: [] },
      { type: "strangersRedeploy", ...META, moves: [] },
      { type: "strangersNominate", ...META, nominated: 0 },
    ];
    for (const phase of ["explore", "medusa", "trap", "encounter", "fight", "pickup", "sorcerer"] as const) {
      const state = makeState({ phase, strangers: [OGRE], party: [member(HERO)] });
      for (const a of actions) blocked(state, a);
    }
  });
});
