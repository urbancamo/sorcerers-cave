import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord, DIR_N } from "./coords";
import { HAZARD_TRAP } from "./data/hazards";
import { SPECIAL_CHASM } from "./data/areaCards";
import type { GameState, PartyMember, PlacedArea } from "./state";

/**
 * Guide lost (`variants.trapRules`, spec 2026-10-11-dwarf-deliberate-trap-fall, Task 4): "If a party guided by
 * a dwarf becomes involved in a fight in a chamber where there is a trap, and the dwarf is killed, the party
 * falls down the trap as soon as it tries to leave the chamber." A party standing in a chamber that holds a
 * standing trap, with no living Dwarf, falls (accidentally — no surprise) when it tries to leave by `move`,
 * `withdraw` or `retreat`.
 */

const MAN = 5;
const DWARF = 7;
const STRANGER = 110; // parked stranger code (100 + creature 10)
const TRAP = 300 + HAZARD_TRAP;
const ON = { trapRules: true };
const member = (creatureId: number, status: 0 | 1 | 2 | 3 = 0): PartyMember => ({ creatureId, status, dragonKills: 0, treasure: [] });
const area = (card: number, coord: number, over: Partial<PlacedArea> = {}): PlacedArea =>
  ({ card, coord, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0, ...over });

// B (the trap chamber, exits NESW) sits at index 1; A (west of it) is `prev`; C lies north; L is the chamber below.
const B = packCoord(1, 51, 50);
function inTrapChamber(party: PartyMember[], over: Partial<GameState> = {}, bContents: number[] = [TRAP]): GameState {
  return makeState({
    variants: ON,
    party,
    areas: [
      area(2, packCoord(1, 50, 50)),                                   // 0 A: exit E (prev)
      area(15 | 16, B, { contents: bContents }),                       // 1 B: the trap chamber
      area(4 | 16, packCoord(1, 51, 49)),                              // 2 C: north of B, a chamber with a south door
      area(8 | 16, packCoord(2, 51, 50), { contents: [STRANGER], visited: false }), // 3 L: below B
    ],
    partyArea: 1, prev: 0, prev2: 0, level: 1,
    ...over,
  });
}
const deadDwarfParty = () => [member(MAN), member(DWARF, 3)];

describe("guide lost — move", () => {
  it("with the Dwarf alive the party leaves normally", () => {
    const { state } = reduce(inTrapChamber([member(MAN), member(DWARF)]), { type: "move", dir: DIR_N });
    expect(state.level).toBe(1);
    expect(state.partyArea).toBe(2);
  });

  it("with the Dwarf dead the party falls instead of leaving: no tile placed, the turn counts", () => {
    const s = inTrapChamber(deadDwarfParty());
    const { state, events } = reduce(s, { type: "move", dir: DIR_N });
    expect(events).toContainEqual({ type: "trapSprung", level: 2, guideLost: true });
    expect(state.level).toBe(2);
    expect(state.partyArea).toBe(3);
    expect(state.fellThroughTrap).toBe(true);
    expect(state.turn).toBe(s.turn + 1);
    expect(state.areas).toHaveLength(s.areas.length);
    expect(state.largeIdx).toBe(s.largeIdx);
  });

  it("the fall is accidental: no deliberateFall and no surprise below", () => {
    const { state } = reduce(inTrapChamber(deadDwarfParty()), { type: "move", dir: DIR_N });
    expect(state.deliberateFall).toBeUndefined();
    expect(state.phase).toBe("encounter");
    expect(state.surpriseReady).toBe(false);
  });

  it("the trap stays standing for the next party", () => {
    const { state } = reduce(inTrapChamber(deadDwarfParty()), { type: "move", dir: DIR_N });
    expect(state.areas[1]!.contents.filter((c) => c === TRAP)).toHaveLength(1);
  });

  it("a direction with no doorway is just blocked — no fall", () => {
    const s = inTrapChamber(deadDwarfParty(), {}, [TRAP]);
    s.areas[1]!.card = 2 | 16; // only an east exit
    const { state, events } = reduce(s, { type: "move", dir: DIR_N });
    expect(state.level).toBe(1);
    expect(events).not.toContainEqual(expect.objectContaining({ type: "trapSprung" }));
  });

  it("petrified, deserted or vanished Dwarf is the same as a dead one", () => {
    for (const party of [[member(MAN), member(DWARF, 2)], [member(MAN)]]) {
      const { state } = reduce(inTrapChamber(party), { type: "move", dir: DIR_N });
      expect(state.level).toBe(2);
    }
  });

  it("leaving an indifferent encounter by a doorway falls too, leaving the strangers parked above", () => {
    const s = inTrapChamber(deadDwarfParty(), { phase: "encounter", indiffLeaveOpen: true, strangers: [10], surpriseReady: false });
    const { state } = reduce(s, { type: "move", dir: DIR_N });
    expect(state.level).toBe(2);
    expect(state.indiffLeaveOpen).toBeUndefined();
    expect(state.areas[1]!.contents).toContain(STRANGER);
  });
});

describe("guide lost — does not apply", () => {
  it("no standing trap in the chamber: leaving is unchanged", () => {
    const { state } = reduce(inTrapChamber(deadDwarfParty(), {}, []), { type: "move", dir: DIR_N });
    expect(state.level).toBe(1);
    expect(state.partyArea).toBe(2);
  });

  it("flag off: leaving is unchanged", () => {
    const { state } = reduce(inTrapChamber(deadDwarfParty(), { variants: undefined }), { type: "move", dir: DIR_N });
    expect(state.level).toBe(1);
  });

  it("a Chasm descent is its own relocation and raises no guide-lost event", () => {
    const CHASM = (SPECIAL_CHASM << 7) | 31;
    const s = inTrapChamber(deadDwarfParty());
    s.areas[1]!.card = CHASM;
    const { events, state } = reduce(s, { type: "descendChasm" });
    expect(state.level).toBe(2);
    expect(events).not.toContainEqual(expect.objectContaining({ guideLost: true }));
  });
});

describe("guide lost — withdraw", () => {
  const encounter = () => inTrapChamber(deadDwarfParty(), { phase: "encounter", strangers: [10], surpriseReady: false });

  it("falls instead of stepping back, leaving the strangers behind", () => {
    const { state, events } = reduce(encounter(), { type: "withdraw" });
    expect(events).toContainEqual({ type: "trapSprung", level: 2, guideLost: true });
    expect(state.level).toBe(2);
    expect(state.partyArea).toBe(3);
    expect(state.areas[1]!.contents).toContain(STRANGER);
  });

  it("with the Dwarf alive it withdraws to the previous tile as before", () => {
    const s = inTrapChamber([member(MAN), member(DWARF)], { phase: "encounter", strangers: [10] });
    const { state } = reduce(s, { type: "withdraw" });
    expect(state.partyArea).toBe(0);
    expect(state.level).toBe(1);
  });
});

describe("guide lost — retreat", () => {
  const fight = () => inTrapChamber(deadDwarfParty(), { phase: "fight", strangers: [10], fight: { surprise: 0, round: 2, focus: 0 } });

  it("falls instead of fleeing through the doorway, ending the fight and leaving the chamber hostile", () => {
    const { state, events } = reduce(fight(), { type: "retreat", dir: DIR_N });
    expect(events).toContainEqual({ type: "trapSprung", level: 2, guideLost: true });
    expect(state.level).toBe(2);
    expect(state.fight).toBeNull();
    expect(state.hostileAreas).toContain(1);
    expect(state.areas[1]!.contents).toContain(STRANGER);
    expect(state.fellThroughTrap).toBe(true);
  });

  it("a retreat is still refused in round one, guide lost or not", () => {
    const s = fight();
    s.fight = { surprise: 0, round: 1, focus: 0 };
    const { state } = reduce(s, { type: "retreat", dir: DIR_N });
    expect(state.level).toBe(1);
  });

  it("with the Dwarf alive it flees through the doorway as before", () => {
    const s = fight();
    s.party = [member(MAN), member(DWARF)];
    const { state } = reduce(s, { type: "retreat", dir: DIR_N });
    expect(state.level).toBe(1);
    expect(state.partyArea).toBe(2);
  });
});
