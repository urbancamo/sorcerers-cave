import { describe, it, expect } from "vitest";
import { buildMpGame, mpReduce, partyView, type CaveState, type PartyState, type MpGameState } from "./multi";
import { buildLargePack, buildSmallPack } from "./decks";
import { shuffle, nextSeed } from "./rng";
import { GS_PLAYING, GATEWAY_START_COORD } from "./state";
import { AREA_CARDS, GATEWAY_INDEX } from "./data/areaCards";
import { packCoord } from "./coords";
import type { PartyMember, PlacedArea } from "./state";
import {
  declarePvp, expirePvp, setDefenderCasters, pvpView, type PvpFightSession,
} from "./multi-fight";

/**
 * Extension kit (SC-EXT-30): the multiplayer game-level `variants.extensionKit` flag threads into
 * `buildMpGame`'s deck builders (90/101-card caves, mirroring the solo builders — SC-EXT-4) and
 * into `compose()`'s composed `GameState.variants`, so solo kit rules and selection helpers see
 * the flag identically whether the state was built solo or composed from a multiplayer seat. This
 * is PURE THREADING — it adds no rules of its own; kit-off games stay byte-identical to today.
 */

const member = (creatureId: number, treasure: number[] = []): PartyMember =>
  ({ creatureId, status: 0, dragonKills: 0, treasure });

// A playing-phase party at the shared gateway (area 0), at rest — copied from multi.test.ts's
// local builder (this suite edits no existing test file).
const partyAt = (seat: number, over: Partial<PartyState> = {}): PartyState => ({
  seat, color: ["green", "blue", "yellow", "red"][seat]!, name: "Party " + seat, status: "exploring", kills: 0,
  gs: 0, phase: "explore", turn: 1, score: 0, curses: 0, bonusScore: 0, sorcererKilled: false,
  partyArea: 0, level: 1, prev: 0, prev2: 0, party: [member(0)], strangers: [], treasures: [], hazards: [], fight: null,
  ...over,
});

const area = (card: number, coord: number): PlacedArea =>
  ({ card, coord, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 });

// A controlled playing game with a hand-built cave (card 31 = NESW+chamber) and 2 seats.
const playing = (cave: Partial<CaveState>, parties: PartyState[], order = [0, 1]): MpGameState => ({
  phase: "playing",
  cave: {
    areas: [area(31, packCoord(1, 50, 50))],
    largePack: [], largeIdx: 0, smallPack: [], smallIdx: 0, seed: 1, ...cave,
  },
  parties, order, pickOrder: [...order].reverse(), active: 0, turnCount: 0,
});

const SEATS = [{ seat: 0, color: "green", name: "A" }, { seat: 1, color: "blue", name: "B" }];

describe("buildMpGame — extension-kit variant threading (SC-EXT-30)", () => {
  it("kit off: buildMpGame(seed, seats) is byte-identical to a pre-change reference build", () => {
    // Reference: reconstruct buildMpGame's own algorithm directly from the primitives it composes
    // (buildLargePack/buildSmallPack/shuffle/nextSeed), entirely bypassing buildMpGame itself —
    // proves the kit-off path is untouched by the new variants threading, mirroring
    // kit-data.test.ts's "byte-identical to a direct pre-kit shuffle" pattern.
    const seed = 4242;
    const mp = buildMpGame(seed, SEATS);

    const large = buildLargePack(seed);
    const small = buildSmallPack(large.seed);
    const ord = shuffle(small.seed, SEATS.map((s) => s.seat));
    const order = ord.result;
    const pickOrder = [...order].reverse();
    const gateway: PlacedArea = {
      card: AREA_CARDS[GATEWAY_INDEX]!, coord: GATEWAY_START_COORD, faceUp: true, visited: false,
      contents: [], flags: 0, indiffCount: 0,
    };
    const diceSeedFor = (seat: number): number => {
      let d = ord.seed;
      for (let i = 0; i <= seat; i++) d = nextSeed(d);
      return d;
    };
    const parties: PartyState[] = SEATS.map((s) => ({
      seat: s.seat, color: s.color, name: s.name, status: "selecting", kills: 0,
      gs: GS_PLAYING, phase: "explore", turn: 1, score: 0, curses: 0, bonusScore: 0, sorcererKilled: false,
      partyArea: 0, level: 1, prev: 0, prev2: 0, party: [], strangers: [], treasures: [], hazards: [], fight: null,
      diceSeed: diceSeedFor(s.seat),
      seenAreas: [0],
    }));
    const reference: MpGameState = {
      phase: "partySelect",
      cave: { areas: [gateway], largePack: large.pack, largeIdx: 0, smallPack: small.pack, smallIdx: 0, seed: ord.seed },
      parties, order, pickOrder, active: 0, turnCount: 0,
    };
    expect(mp).toEqual(reference);
  });

  it("kit off (undefined/{}/{extensionKit:false}) all agree with today's game, aside from the variants key itself", () => {
    const seed = 99;
    const strip = (g: MpGameState) => { const { variants: _variants, ...rest } = g; return rest; };
    const base = buildMpGame(seed, SEATS);
    const explicit = buildMpGame(seed, SEATS, undefined);
    const empty = buildMpGame(seed, SEATS, {});
    const off = buildMpGame(seed, SEATS, { extensionKit: false });
    expect(explicit).toEqual(base);
    expect(strip(empty)).toEqual(strip(base));
    expect(strip(off)).toEqual(strip(base));
  });

  it("kit on: buildMpGame produces a 90-card large pack and a 101-card small pack (mirrors solo SC-EXT-4)", () => {
    const mp = buildMpGame(4242, SEATS, { extensionKit: true });
    expect(mp.cave.largePack).toHaveLength(90);
    expect(mp.cave.smallPack).toHaveLength(101);
  });

  it("kit on: buildMpGame(seed, seats, { extensionKit: true }) stores the flag on MpGameState.variants", () => {
    const mp = buildMpGame(4242, SEATS, { extensionKit: true });
    expect(mp.variants).toEqual({ extensionKit: true });
  });
});

describe("compose() — variants pass-through into the composed GameState (SC-EXT-30)", () => {
  it("kit on: a composed seat's GameState.variants.extensionKit is true", () => {
    const mp0 = buildMpGame(4242, SEATS, { extensionKit: true });
    const view = partyView(mp0, 0);
    expect(view.variants).toEqual({ extensionKit: true });
  });

  it("kit off: a composed seat's GameState.variants is absent — byte-identical to before this flag existed", () => {
    const mp0 = buildMpGame(4242, SEATS);
    const view = partyView(mp0, 0);
    expect(view.variants).toBeUndefined();
  });
});

describe("kit-stranger smoke draw (SC-EXT-30) — the deck-threaded path resolves through mpReduce", () => {
  it("a kit creature (Lion, id 16) drawn as a stranger in an MP game reaches encounter → fight → a round, cleanly", () => {
    // card 17 = N+chamber (multi.test.ts convention); smallPack[0] = 116 = 100+16, a kit Lion
    // (SC-EXT-2) as the sole stranger — a plain hostile creature with no bespoke reaction logic,
    // so this exercises the generic composed-reduce path, not any creature-specific rule.
    const mp: MpGameState = {
      ...playing({ largePack: [17], smallPack: [116] }, [partyAt(0), partyAt(1)]),
      variants: { extensionKit: true },
    };
    const drawn = mpReduce(mp, 0, { type: "move", dir: 3 }); // DIR_S
    expect(drawn.events.some((e) => e.type === "drewChamber")).toBe(true);
    expect(drawn.state.parties[0]!.strangers).toEqual([16]);
    expect(drawn.state.parties[0]!.phase).toBe("encounter");

    const attacked = mpReduce(drawn.state, 0, { type: "attack" });
    expect(attacked.events.some((e) => e.type === "blocked")).toBe(false);
    expect(attacked.state.parties[0]!.phase).toBe("fight");

    const round = { type: "resolveRound" as const, matches: [{ front: [0], backers: [], strangers: [0] }] };
    const resolved = mpReduce(attacked.state, 0, round);
    expect(resolved.events.some((e) => e.type === "blocked")).toBe(false); // resolves cleanly, no crash
  });
});

describe("PvP kit-creature lookups (SC-EXT-31) — no base-only CREATURES[]/TREASURES[] indexing", () => {
  it("a PvP fight where a kit creature (Witch, id 18) fights does not crash and previews her name", () => {
    // pvpView's per-engagement `nameOf` used to index the base-only `CREATURES` table directly —
    // `CREATURES[18]` is undefined, so this would throw before this task's fix.
    const mp: MpGameState = {
      ...playing({}, [
        partyAt(0, { party: [member(18)], prev: 2 }), // a lone Witch, surprise via a differing prev
        partyAt(1, { party: [member(0)] }),
      ]),
      variants: { extensionKit: true },
    };
    const declared = declarePvp(mp, 0, 1, 0, 1000);
    // Auto-default both layout windows exactly as multi-fight.test.ts's pvpView suite does — the
    // fairness/engagement machinery is unrelated to creature identity.
    const e1 = expirePvp(declared.state, 2000, 1000);
    const e2 = expirePvp(e1.state, 4000, 1000);
    const done = setDefenderCasters(e2.state, 1, [], 0, 1000);
    const session = done.state.session as PvpFightSession;
    expect(() => pvpView(session, done.state)).not.toThrow();
    const v = pvpView(session, done.state);
    expect(v.engagements.some((e) => e.attackerNames.includes("Witch"))).toBe(true);
  });
});
