import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { makeState, inUseGear } from "./testkit";
import { packCoord } from "./coords";
import { decodeArea } from "./decode";
import { stashOrDeliver } from "./chamber";
import { HW_STATUE_BASE, HW_PARKED_STATUE_BASE, HW_MEDUSA, STAFF_WAKE_ALL } from "./effects";
import { SPECIAL_LAIR, SPECIAL_GALLERY } from "./data/areaCards";
import { GS_PLAYING, type GameState, type PartyMember } from "./state";
import type { GameEvent } from "./actions";

/**
 * Extension kit — the Lair's Harpies-stash landing (US-04, SC-EXT-12) and the Gallery's
 * stone-strangers/Staff-wake mechanic (US-06, Resolved-14, SC-EXT-10/SC-EXT-11). Both are ordinary
 * chambers (no draw modifier) whose special behaviour lives in the DRAW-CLASSIFY step
 * (`chamber.ts`) and the entry hook (`reduce.ts`'s `resolveArea`/`resolveAreaLoop`) — kit-descents
 * and kit-well-bell's force-placed-special-tile fixture style is reused here.
 */

const HERO = 0;
const MAN = 5;
const WIZARD = 8;
const SPECTRE = 9;
const SORCERER = 11;
const GOLD = 1;
const GEMS = 2;
const MAGIC_STAFF = 9;

const DIR_E = 2;
const DIR_W = 4;

const member = (creatureId: number, treasure: number[] = []): PartyMember => ({
  creatureId,
  status: 0,
  dragonKills: 0,
  treasure,
  borne: inUseGear(treasure),
});

// A start tile with only an EAST doorway (bit 2) — the party begins here and moves east onto the
// freshly-drawn special tile, matching kit-descents.test.ts's PLAIN_WEST_TUNNEL / PLAIN_NORTH_TUNNEL
// convention (a minimal tile whose single exit points at the special tile under test).
const START_CARD = 2;

// ---------------------------------------------------------------------------------------------
// The Lair (US-04, SC-EXT-12)
// ---------------------------------------------------------------------------------------------

const LAIR_CARD = (SPECIAL_LAIR << 7) | 31; // NESW chamber, matching EXT_AREA_CARDS' x07-1 tile (1055)

function lairState(over: Partial<GameState>): GameState {
  return makeState({
    gs: GS_PLAYING,
    phase: "explore",
    areas: [
      { card: START_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
    ],
    partyArea: 0,
    prev: 0,
    largePack: [LAIR_CARD],
    largeIdx: 0,
    smallPack: [],
    smallIdx: 0,
    ...over,
  });
}

describe("The Lair — Harpies-stash landing (US-04, SC-EXT-12)", () => {
  it("spills a pending harpyStash onto the Lair's floor the moment it is placed and entered", () => {
    const s = lairState({ party: [member(HERO)], harpyStash: [GOLD] });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });

    expect(state.lairCoord).toBe(packCoord(1, 51, 50));
    expect(events).toContainEqual({ type: "lairStash", treasureIds: [GOLD] });
    expect(state.treasures).toEqual([GOLD]); // on the floor, ready to pick up THIS visit
    expect(state.harpyStash).toEqual([]);
    expect(state.phase).toBe("pickup");
  });

  it("registers lairCoord even with no pending stash, and fires no lairStash event", () => {
    const s = lairState({ party: [member(HERO)] });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });

    expect(state.lairCoord).toBe(packCoord(1, 51, 50));
    expect(events.some((e) => e.type === "lairStash")).toBe(false);
    expect(state.treasures).toEqual([]);
    expect(state.phase).toBe("explore"); // nothing drawn, nothing stashed — the party moves straight through
  });

  it("delivers a LATER stash straight onto an already-placed Lair via stashOrDeliver, not queued", () => {
    const s = lairState({ party: [member(HERO)] });
    const placed = reduce(s, { type: "move", dir: DIR_E });
    expect(placed.state.lairCoord).toBe(packCoord(1, 51, 50));

    const next = structuredClone(placed.state);
    const events: GameEvent[] = [];
    stashOrDeliver(next, [GOLD, GEMS], events);

    expect(events).toContainEqual({ type: "lairStash", treasureIds: [GOLD, GEMS] });
    expect(next.harpyStash ?? []).toEqual([]);
    const lair = next.areas.find((a) => a.coord === next.lairCoord)!;
    expect(lair.contents).toEqual(expect.arrayContaining([200 + GOLD, 200 + GEMS]));
  });

  it("queues into harpyStash via stashOrDeliver when the Lair has not been found yet", () => {
    const s = lairState({ party: [member(HERO)] }); // Lair not yet placed at all
    const events: GameEvent[] = [];
    stashOrDeliver(s, [GOLD], events);

    expect(events).toEqual([]); // nothing has landed anywhere yet
    expect(s.harpyStash).toEqual([GOLD]);
    expect(s.lairCoord).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// The Gallery (US-06, Resolved-14, SC-EXT-10/SC-EXT-11)
// ---------------------------------------------------------------------------------------------

const GALLERY_CARD = (SPECIAL_GALLERY << 7) | 31; // NESW chamber, matching EXT_AREA_CARDS' x07-3 tile (1311)

function galleryState(over: Partial<GameState>): GameState {
  return makeState({
    gs: GS_PLAYING,
    phase: "explore",
    level: 4, // draw = min(level,4): level 4 lets a single entry draw up to 4 codes
    areas: [
      { card: START_CARD, coord: packCoord(4, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
    ],
    partyArea: 0,
    prev: 0,
    largePack: [GALLERY_CARD],
    largeIdx: 0,
    smallPack: [],
    smallIdx: 0,
    ...over,
  });
}

describe("The Gallery — creatures arrive as stone, except Sorcerer/Spectre (US-06, SC-EXT-10)", () => {
  // Task 11 (SC-EXT-21) closes the seam this suite's own comments and `chamber.ts` flagged: the
  // Demon no longer arrives as a plain exempt stranger here — it never joins ANY chamber, Gallery
  // included, and instead relocates (see `kit-apprentice-demon.test.ts`'s dedicated coverage).
  it("an ordinary creature arrives as a statue (500+id); the Sorcerer/Spectre arrive as normal strangers", () => {
    const s = galleryState({ party: [member(HERO)], smallPack: [100 + MAN, 100 + SPECTRE, 100 + SORCERER] });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });

    expect(state.statues).toEqual([MAN]);
    expect(state.strangers).toEqual([SPECTRE, SORCERER]);
    expect(events).toContainEqual({ type: "galleryStone", creatureIds: [MAN] });
    expect(state.phase).toBe("encounter"); // the exempt strangers still drive a standard encounter
  });

  it("treasure is freely collectible alongside statues; ONLY statues+treasure behaves like no strangers at all", () => {
    const s = galleryState({ party: [member(HERO)], smallPack: [100 + MAN, 200 + GOLD] });
    const { state } = reduce(s, { type: "move", dir: DIR_E });

    expect(state.statues).toEqual([MAN]);
    expect(state.strangers).toEqual([]);
    expect(state.treasures).toEqual([GOLD]);
    expect(state.phase).toBe("pickup"); // no reaction test — statues are scenery, not live strangers
    expect(legalActions(state)).not.toContainEqual({ type: "test" });
    expect(legalActions(state)).not.toContainEqual({ type: "attack" });
    expect(legalActions(state)).toContainEqual({ type: "takeTreasure", ti: 0, mi: 0 });
  });

  it("fires no galleryStone notice when nothing was petrified (all-exempt draw)", () => {
    const s = galleryState({ party: [member(HERO)], smallPack: [100 + SPECTRE, 100 + SORCERER] });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });

    expect(state.statues).toEqual([]);
    expect(events.some((e) => e.type === "galleryStone")).toBe(false);
  });

  it("persists statues across exit/re-entry without re-petrifying an already-established stranger", () => {
    const s = galleryState({ party: [member(HERO)], smallPack: [100 + MAN, 100 + SORCERER, 200 + GOLD] });
    const entered = reduce(s, { type: "move", dir: DIR_E });
    expect(entered.state.statues).toEqual([MAN]);
    expect(entered.state.strangers).toEqual([SORCERER]);
    expect(entered.state.phase).toBe("encounter");

    // Leave without resolving the Sorcerer encounter — everything parks back on the tile.
    const withdrawn = reduce(entered.state, { type: "withdraw" });
    expect(withdrawn.state.phase).toBe("explore");
    const gallery = withdrawn.state.areas.find((a) => decodeArea(a.card).special === SPECIAL_GALLERY)!;
    expect(gallery.contents).toEqual(expect.arrayContaining([500 + MAN, 100 + SORCERER, 200 + GOLD]));

    // Re-enter: the persisted Sorcerer reloads as an ORDINARY stranger, not re-petrified.
    const left = reduce(withdrawn.state, { type: "move", dir: DIR_W });
    const reentered = reduce(left.state, { type: "move", dir: DIR_E });
    expect(reentered.state.statues).toEqual([MAN]);
    expect(reentered.state.strangers).toEqual([SORCERER]);
  });

  // SC-EXT-11 (issue #105): the Staff-Wizard no longer wakes the statues on entry — the player chooses, singly (one per turn) or all.
  const STAFF = (target: number) => ({ type: "useArtifact", artifact: MAGIC_STAFF, target }) as const;
  const staffGallery = () => reduce(galleryState({ party: [member(HERO), member(WIZARD, [MAGIC_STAFF])], smallPack: [100 + MAN, 100 + MAN, 200 + GOLD] }), { type: "move", dir: DIR_E }).state;

  it("entering with a Staff-Wizard no longer wakes the statues by itself; the choices are offered instead", () => {
    const state = staffGallery();
    expect(state.statues).toEqual([MAN, MAN]);
    expect(state.strangers).toEqual([]);
    expect(state.phase).toBe("pickup"); // statues stay scenery until the player decides
    const acts = legalActions(state);
    expect(acts).toContainEqual(STAFF(HW_STATUE_BASE));
    expect(acts).toContainEqual(STAFF(HW_STATUE_BASE + 1));
    expect(acts).toContainEqual(STAFF(STAFF_WAKE_ALL)); // two or more: a group wake too
  });

  it("the Staff-Wizard may wake just ONE statue; the other stays stone and can be woken on a later turn", () => {
    const state = staffGallery();
    const one = reduce(state, STAFF(HW_STATUE_BASE));
    expect(one.events).toContainEqual({ type: "staffWake", creatureIds: [MAN] });
    expect(one.state.strangers).toEqual([MAN]);
    expect(one.state.statues).toEqual([MAN]); // the other is still stone
    expect(one.state.phase).toBe("encounter"); // one reaction test for the one woken
    expect(legalActions(one.state)).toContainEqual({ type: "test" });
  });

  it("the Staff-Wizard may wake the whole group at once: every statue becomes a stranger, with ONE reaction test", () => {
    const all = reduce(staffGallery(), STAFF(STAFF_WAKE_ALL));
    expect(all.events).toContainEqual({ type: "staffWake", creatureIds: [MAN, MAN] });
    expect(all.state.statues).toEqual([]);
    expect(all.state.strangers).toEqual([MAN, MAN]);
    expect(all.state.phase).toBe("encounter");
  });

  it("the Staff-Wizard may leave the statues alone and walk on; nobody is woken", () => {
    const state = staffGallery();
    const loot = reduce(state, { type: "takeTreasure", ti: 0, mi: 0 });
    expect(loot.state.strangers).toEqual([]);
    expect(loot.events.some((e) => e.type === "staffWake")).toBe(false);
    // The room settles to rest, parking both statues back on the tile (still stone, still wakeable later).
    const tile = loot.state.areas.find((x) => decodeArea(x.card).special === SPECIAL_GALLERY)!;
    expect(tile.contents.filter((c) => c === 500 + MAN)).toHaveLength(2);
  });

  it("offers no wake when there is nothing to wake (all-exempt draw), and a bogus target is refused", () => {
    const state = reduce(galleryState({ party: [member(WIZARD, [MAGIC_STAFF])], smallPack: [100 + SORCERER] }), { type: "move", dir: DIR_E }).state;
    expect(legalActions(state).some((a) => a.type === "useArtifact" && a.artifact === MAGIC_STAFF && (a.target ?? 0) >= HW_STATUE_BASE)).toBe(false);
    expect(reduce(staffGallery(), STAFF(HW_STATUE_BASE + 7)).events).toEqual([{ type: "blocked" }]);
    expect(reduce(staffGallery(), STAFF(HW_MEDUSA)).events).toEqual([{ type: "blocked" }]); // not a statue target
  });

  it("a lone statue parked on the tile can be woken by a Staff-Wizard who arrives later, singly (no 'all' for one)", () => {
    const s = galleryState({ party: [member(HERO)], smallPack: [100 + MAN] });
    const firstVisit = reduce(s, { type: "move", dir: DIR_E });
    expect(firstVisit.state.phase).toBe("explore");
    const parkedGallery = firstVisit.state.areas.find((a) => decodeArea(a.card).special === SPECIAL_GALLERY)!;
    expect(parkedGallery.contents).toContain(500 + MAN);

    const withStaff: GameState = { ...firstVisit.state, party: [member(WIZARD, [MAGIC_STAFF])] };
    const idx = parkedGallery.contents.indexOf(500 + MAN);
    const acts = legalActions(withStaff);
    expect(acts).toContainEqual(STAFF(HW_PARKED_STATUE_BASE + idx));
    expect(acts).not.toContainEqual(STAFF(STAFF_WAKE_ALL));

    const woke = reduce(withStaff, STAFF(HW_PARKED_STATUE_BASE + idx));
    expect(woke.events).toContainEqual({ type: "staffWake", creatureIds: [MAN] });
    expect(woke.state.strangers).toEqual([MAN]);
    expect(woke.state.areas.find((a) => decodeArea(a.card).special === SPECIAL_GALLERY)!.contents).not.toContain(500 + MAN);
  });
});
