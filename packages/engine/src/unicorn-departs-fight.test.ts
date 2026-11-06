import { describe, expect, it } from "vitest";
import { reconcileUnicorns } from "./effects";
import { makeState } from "./testkit";
import type { GameState, PartyMember } from "./state";

// Invariant soak, B-03: a Unicorn that departs in the middle of a fight (its last Woman fell) shrinks the party array, and every party
// index the fight holds must follow. They did not, and the next look at the fight threw.
const WOMAN = 6, MAN = 5, UNICORN = 13;
const m = (creatureId: number, status: PartyMember["status"] = 0): PartyMember => ({ creatureId, status, dragonKills: 0, treasure: [] });

describe("a Unicorn departing mid-fight (B-03)", () => {
  it("moves down every fight index that pointed past it, and settles a casualty pair it was part of", () => {
    const s = makeState({ party: [m(WOMAN, 3), m(MAN), m(UNICORN), m(MAN)] });
    s.fight = {
      surprise: -1, round: 1, focus: 0, casualtyQueue: [[2, 1], [3, 1]],
      rev: { attacker: "strangers", matches: [{ pf: [2, 1], pb: [], sf: [0], sb: [] }, { pf: [3], pb: [], sf: [], sb: [] }], deployed: { party: [2, 3], strangers: [] }, step: "wrap", surplusTurn: 2, progress: true, cursor: 2, killed: [] },
    } as unknown as GameState["fight"];
    s.fightDrops = [{ mi: 2, tid: 1 }, { mi: 3, tid: 2 }];
    const events = reconcileUnicorns(s);
    expect(events).toEqual([{ type: "unicornDeparted", creatureId: UNICORN }]);
    expect(s.party.map((p) => p.creatureId)).toEqual([WOMAN, MAN, MAN]);
    expect(s.fight!.casualtyQueue).toEqual([[2, 1]]);       // the pair the Unicorn was in is settled; the other pair follows the shift
    expect(s.fight!.rev!.matches.map((x) => x.pf)).toEqual([[1], [2]]);
    expect(s.fight!.rev!.deployed.party).toEqual([2]);
    expect(s.fightDrops).toEqual([{ mi: 2, tid: 2 }]);
  });
});
