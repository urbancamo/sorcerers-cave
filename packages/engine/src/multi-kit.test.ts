import { describe, it, expect } from "vitest";
import { buildMpGame, choosePartyFor, mpReduce, partyView, type CaveState, type PartyState, type MpGameState } from "./multi";
import { buildLargePack, buildSmallPack } from "./decks";
import { shuffle, nextSeed, rollDie } from "./rng";
import { GS_PLAYING, GATEWAY_START_COORD, AF_BELL_SPENT } from "./state";
import { AREA_CARDS, GATEWAY_INDEX, SPECIAL_LAIR, SPECIAL_GALLERY, SPECIAL_WHIRLPOOL, SPECIAL_WELL, SPECIAL_BELL_ROPE } from "./data/areaCards";
import { packCoord, unpackCoord } from "./coords";
import { legalActions } from "./selectors";
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

// ---------------------------------------------------------------------------------------------
// SC-EXT-32: shared kit content across seats — pinning tests for the six behaviors named in the
// multiplayer plan's Task 3 brief. Per the plan's architecture note (INV-2), the solo reducer
// already implements every kit mechanic; MP composes it unchanged, so most of the six pin BY
// CONSTRUCTION (no code change). The Crypt is the one genuine seam this task closes — see its own
// describe block below for the fix and rationale.
// ---------------------------------------------------------------------------------------------

const DIR_E = 2;

const MAN = 5;
const WIZARD = 8;
const C_DEMON = 15;
const GOLD = 1;
const MAGIC_STAFF = 9;
const T_CRYPT = 21;

/** Sweep seeds until `rollDie` produces a value satisfying `want` (kit-descents.test.ts's pattern,
 *  reused by every kit test file that needs to pin a die roll). */
function seedForRoll(want: (v: number) => boolean, start = 1): number {
  for (let seed = start; seed < 100000; seed++) {
    if (want(rollDie(seed).value)) return seed;
  }
  throw new Error("no matching seed found");
}

describe("Shared kit content across seats (SC-EXT-32)", () => {
  it("a Harpies stash filled for seat A lands in the Lair, and seat B recovers it on a later, unrelated visit (US-04)", () => {
    const LAIR_CARD = (SPECIAL_LAIR << 7) | 31;
    const mp: MpGameState = {
      ...playing(
        { areas: [area(2, packCoord(1, 50, 50))], largePack: [LAIR_CARD] },
        [partyAt(0, { harpyStash: [GOLD] }), partyAt(1)],
      ),
      variants: { extensionKit: true },
    };

    // Seat A finds the freshly-placed Lair — its own pending stash spills onto its floor and
    // straight into A's pickup, exactly as it would solo (SC-EXT-12).
    const found = mpReduce(mp, 0, { type: "move", dir: DIR_E });
    expect(found.events).toContainEqual({ type: "lairStash", treasureIds: [GOLD] });
    expect(found.state.parties[0]!.lairCoord).toBe(packCoord(1, 51, 50));
    expect(found.state.parties[0]!.treasures).toEqual([GOLD]);
    expect(found.state.parties[0]!.phase).toBe("pickup");

    // A leaves it on the floor rather than carrying it off — it parks back onto the SHARED tile.
    const left = mpReduce(found.state, 0, { type: "leaveTreasure" });
    expect(left.state.cave.areas[1]!.contents).toContainEqual(200 + GOLD);
    expect(left.state.parties[0]!.phase).toBe("explore");

    // Seat B — who never had a harpyStash of its own, and never touched A's — walks onto the SAME
    // (now-visited) Lair tile and recovers A's find: pure composition through the shared
    // `cave.areas` contents, not anything seat-specific (plan Part-4: "the Lair delivers stolen
    // artifacts whichever seat's Harpies filled the stash").
    const recovered = mpReduce(left.state, 1, { type: "move", dir: DIR_E });
    expect(recovered.state.parties[1]!.treasures).toEqual([GOLD]);
    expect(recovered.state.parties[1]!.lairCoord).toBe(packCoord(1, 51, 50));
    expect(recovered.state.parties[1]!.phase).toBe("pickup");
    expect(recovered.events.some((e) => e.type === "lairStash")).toBe(false); // B never had a stash queued
  });

  it("a Demon spawned by seat A's own draw ambushes seat B entering the area it spawned into (US-13)", () => {
    const PLAIN_CHAMBER = 31;
    const mp: MpGameState = {
      ...playing(
        {
          areas: [
            area(10, packCoord(1, 50, 50)), // E+W tunnel: A's start, and the area the Demon spawns INTO (prev)
            area(2, packCoord(1, 49, 50)),  // B's start, one step west — an E-only doorway back in
          ],
          largePack: [PLAIN_CHAMBER],
          smallPack: [100 + C_DEMON],
        },
        [partyAt(0, { partyArea: 0, prev: 0 }), partyAt(1, { partyArea: 1, prev: 1 })],
      ),
      variants: { extensionKit: true },
    };

    // Seat A moves east into a fresh chamber; the Demon it draws there relocates into `prev` — the
    // tile A just LEFT (area 0) — never joining A's own encounter (SC-EXT-21).
    const spawned = mpReduce(mp, 0, { type: "move", dir: DIR_E });
    expect(spawned.events).toContainEqual({ type: "demonSpawned" });
    expect(spawned.state.cave.areas[0]!.contents).toContainEqual(100 + C_DEMON);
    expect(spawned.state.parties[0]!.strangers).toEqual([]); // never a live stranger for A
    expect(spawned.state.parties[0]!.phase).toBe("explore"); // nothing else drawn — turn passes

    // Seat B — who never saw A's draw — walks east into that SAME tile and is ambushed: pure
    // composition through the shared `cave.areas` contents.
    const ambushed = mpReduce(spawned.state, 1, { type: "move", dir: DIR_E });
    expect(ambushed.events).toContainEqual({ type: "demonUnfolds" });
    expect(ambushed.state.parties[1]!.phase).toBe("fight");
    expect(ambushed.state.parties[1]!.strangers).toEqual([C_DEMON]);
    expect(ambushed.state.cave.areas[0]!.contents).not.toContainEqual(100 + C_DEMON); // pulled off the shared tile
  });

  it("Gallery statues petrified for seat A are statues for seat B, whose Staff-Wizard wakes them — the reaction test rolls on the SHARED cave stream (US-06, SC-EXT-11)", () => {
    const GALLERY_CARD = (SPECIAL_GALLERY << 7) | 31;
    const seed = seedForRoll((v) => v === 1); // hostile for a Man (hostileMax 2), no charisma bonus
    const mp: MpGameState = {
      ...playing(
        {
          areas: [area(2, packCoord(1, 50, 50))],
          largePack: [GALLERY_CARD],
          smallPack: [100 + MAN],
          seed,
        },
        [partyAt(0), partyAt(1, { party: [member(WIZARD, [MAGIC_STAFF])] })],
      ),
      variants: { extensionKit: true },
    };

    // Seat A enters the fresh Gallery — the Man arrives as a statue (scenery, no reaction test) and,
    // with nothing else to loot, the entry settles straight to explore, parking it (500+id) onto
    // the SHARED tile — exactly like `sleeping` (SC-EXT-10).
    const petrified = mpReduce(mp, 0, { type: "move", dir: DIR_E });
    expect(petrified.events).toContainEqual({ type: "galleryStone", creatureIds: [MAN] });
    expect(petrified.state.cave.areas[1]!.contents).toContainEqual(500 + MAN);
    expect(petrified.state.parties[0]!.phase).toBe("explore");

    // Seat B — a Staff-Wizard who never saw A's visit — enters the same tile: the persisted statue
    // reloads into B's own `statues`, and the Staff wakes it into an ordinary stranger for a normal
    // reaction test (SC-EXT-11).
    const woken = mpReduce(petrified.state, 1, { type: "move", dir: DIR_E });
    expect(woken.events).toContainEqual({ type: "staffWake", creatureIds: [MAN] });
    expect(woken.state.parties[1]!.strangers).toEqual([MAN]);
    expect(woken.state.parties[1]!.phase).toBe("encounter");
    expect(legalActions(partyView(woken.state, 1))).toContainEqual({ type: "test" });

    // The reaction test itself rolls on the ONE shared cave stream (`cave.seed`), not a per-seat
    // substream (that split is reserved for MULTI-layer dice — PvP — per multi.ts's own RNG-split
    // doc; a solo-composed roll like this always reads/advances the shared stream, multi.ts:41-49).
    const seedBefore = woken.state.cave.seed;
    const tested = mpReduce(woken.state, 1, { type: "test" });
    expect(tested.events).toContainEqual({ type: "reaction", outcome: "hostile", roll: 1 });
    expect(tested.state.parties[1]!.phase).toBe("fight");
    expect(tested.state.cave.seed).not.toBe(seedBefore); // the ONE shared stream advanced
  });

  it("a Whirlpool drag relocates only the crossing seat — a co-located seat is untouched (US-05)", () => {
    const WHIRLPOOL_CARD = (SPECIAL_WHIRLPOOL << 7) | 31;
    const PLAIN_WEST_TUNNEL = 8;
    const seed = seedForRoll((v) => v <= 2); // drag
    const mp: MpGameState = {
      ...playing(
        {
          areas: [
            area(WHIRLPOOL_CARD, packCoord(1, 50, 50)),
            area(2, packCoord(1, 49, 50)), // both seats' entry doorway (so moving east is a genuine crossing)
          ],
          largePack: [PLAIN_WEST_TUNNEL],
          seed,
        },
        [partyAt(0, { partyArea: 0, prev: 1 }), partyAt(1, { partyArea: 0, prev: 1 })],
      ),
      variants: { extensionKit: true },
    };
    const bBefore = mp.parties[1]!;

    const dragged = mpReduce(mp, 0, { type: "move", dir: DIR_E });

    const roll = dragged.events.find((e) => e.type === "whirlpoolRoll");
    expect(roll).toMatchObject({ dragged: true });
    expect(dragged.state.parties[0]!.level).toBe(2);
    const landing = dragged.state.cave.areas[dragged.state.parties[0]!.partyArea]!;
    expect(unpackCoord(landing.coord)).toEqual({ level: 2, x: 50, y: 50 });
    expect(dragged.state.parties[0]!.fellThroughTrap).toBe(true);

    // Seat B, co-located on the very same Whirlpool tile, is untouched, bit for bit: A's own action
    // only ever composes A's own PartyState — B's fields are never read or written by it. (The one
    // expected diff is `seenAreas`: mpReduce's always-on fog-of-war-lite ledger, M7, records EVERY
    // exploring seat's current area on every call — unrelated to the Whirlpool/kit mechanics here.)
    expect(dragged.state.parties[1]).toEqual({ ...bBefore, seenAreas: [0] });
  });

  describe("Well/Bell no-withdraw is per-seat turn state; the Bell Rope's spend is cave-shared (US-03/US-07, SC-EXT-9)", () => {
    it("a seat's own Well draw blocks only that seat's withdraw — a co-located seat's own turn state is untouched", () => {
      const WELL_CARD = (SPECIAL_WELL << 7) | 31;
      const mp: MpGameState = {
        ...playing(
          { areas: [area(WELL_CARD, packCoord(1, 50, 50))], smallPack: [100 + MAN] },
          [partyAt(0), partyAt(1)],
        ),
        variants: { extensionKit: true },
      };

      const drawn = mpReduce(mp, 0, { type: "drawFromWell" });
      expect(drawn.events).toContainEqual({ type: "wellDraw" });
      expect(drawn.state.parties[0]!.noWithdrawTurn).toBe(1); // A's OWN turn number
      expect(drawn.state.parties[0]!.phase).toBe("encounter");
      expect(mpReduce(drawn.state, 0, { type: "withdraw" }).events).toEqual([{ type: "blocked" }]);

      // Seat B — co-located on the same tile — never drew from the Well: its own no-withdraw turn
      // state is untouched (design US-03/US-07's MP note: "per-seat turn flag").
      expect(drawn.state.parties[1]!.noWithdrawTurn).toBeUndefined();
    });

    it("the Bell Rope's spend is cave-shared: once seat A pulls it, seat B is blocked on the SAME tile too", () => {
      const BELL_CARD = (SPECIAL_BELL_ROPE << 7) | 31;
      const seed = seedForRoll((v) => v === 2 || v === 3); // toll — narration only, simplest to pin
      const mp: MpGameState = {
        ...playing({ areas: [area(BELL_CARD, packCoord(1, 50, 50))], seed }, [partyAt(0), partyAt(1)]),
        variants: { extensionKit: true },
      };

      const pulled = mpReduce(mp, 0, { type: "pullBellRope", mi: 0 });
      expect(pulled.events).toContainEqual(expect.objectContaining({ type: "bellRoll", outcome: "toll" }));
      expect((pulled.state.cave.areas[0]!.flags & AF_BELL_SPENT) !== 0).toBe(true);
      expect(pulled.state.parties[0]!.phase).toBe("explore"); // the turn passes to B

      // Seat B, standing on the SAME (now-spent) tile, is blocked — the rope was never B's to pull a
      // second time; the once-per-tile-ever spend lives on the shared area, not per seat.
      expect(legalActions(partyView(pulled.state, 1))).not.toContainEqual({ type: "pullBellRope", mi: 0 });
      expect(mpReduce(pulled.state, 1, { type: "pullBellRope", mi: 0 }).events).toEqual([{ type: "blocked" }]);
    });
  });

  describe("The Crypt is cave-shared: whichever seat FIRST calls enterCrypt takes it — the real seam this task closes (US-08)", () => {
    // Unlike the Lair/Gallery/Demon (whose shared state already rides in `area.contents`), solo's
    // own `cryptCoord` (state.ts) is a per-GameState scalar with no content-code presence at all —
    // "since the card never touches area.contents" (chamber.ts's own comment on `classify`).
    // Composed naively, this made the Crypt invisible to every seat but the one whose classify()
    // call happened to park it — contradicting the plan's own ruled decision ("Harpy stash, Gallery
    // statues, the Demon, and a parked Crypt are cave-shared content: the first seat to act takes
    // the risk/reward") and this task's own brief ("a Crypt parked by seat A is enterable by seat B
    // exactly once"). Fixed in multi.ts (CaveState.cryptCoord + compose/mpReduceInner's resync) —
    // NOT in the solo reducer (chamber.ts/reduce.ts untouched), so solo/kit-golden stay
    // byte-identical (INV-2).
    it("seat B (who never drew it) can enter a crypt seat A parked, and it spends cave-wide — not even seat A can re-enter it", () => {
      const PLAIN_CHAMBER = 31;
      const seed = seedForRoll((v) => v >= 3); // find — no level-drop, simplest to assert
      const mp: MpGameState = {
        ...playing(
          { areas: [area(2, packCoord(1, 50, 50))], largePack: [PLAIN_CHAMBER], smallPack: [200 + T_CRYPT], seed },
          [partyAt(0), partyAt(1)],
        ),
        variants: { extensionKit: true },
      };

      // Seat A parks the crypt with a fresh chamber draw.
      const parked = mpReduce(mp, 0, { type: "move", dir: DIR_E });
      expect(parked.events).toContainEqual({ type: "cryptParked" });
      expect(parked.state.cave.cryptCoord).toBe(packCoord(1, 51, 50));
      expect(parked.state.parties[0]!.phase).toBe("explore"); // turn passes to B

      // Seat B walks onto the SAME (now-visited) tile — it learns of the shared crypt on entry (no
      // duplicate `cryptParked`, exactly like a same-seat revisit) and can act on it.
      const arrived = mpReduce(parked.state, 1, { type: "move", dir: DIR_E });
      expect(arrived.events.some((e) => e.type === "cryptParked")).toBe(false);
      expect(arrived.state.parties[1]!.phase).toBe("explore");

      // A takes an idle turn (still standing on the crypt's own tile) so play returns to B.
      const idled = mpReduce(arrived.state, 0, { type: "endTurn" });

      // B — not A, the seat who parked it — is the one who enters it and reaps the find.
      const entered = mpReduce(idled.state, 1, { type: "enterCrypt" });
      expect(entered.events).toContainEqual(expect.objectContaining({ type: "cryptRoll", outcome: "find" }));
      expect(entered.state.parties[1]!.treasures).toEqual([T_CRYPT]);
      expect(entered.state.cave.cryptCoord).toBeUndefined(); // spent cave-wide

      // B settles the pickup, handing the turn back to A.
      const settled = mpReduce(entered.state, 1, { type: "leaveTreasure" });

      // A — still standing on the very tile it originally parked, and still carrying its own
      // now-stale `cryptCoord` field from having parked it — cannot enter it a second time: the
      // cave's shared knowledge (not A's own leftover field) is what `enterCrypt` composes from.
      expect(settled.state.parties[0]!.cryptCoord).toBe(packCoord(1, 51, 50)); // A's own field: stale, unspent
      expect(mpReduce(settled.state, 0, { type: "enterCrypt" }).events).toEqual([{ type: "blocked" }]);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// SC-EXT-36: choosePartyFor threads mp.variants into validatePicks. Before this fix, `validatePicks`
// was called with no third argument (multi.ts:309), so ANY kit id (14-20) was rejected as
// unselectable regardless of the game's own `mp.variants.extensionKit` flag, and the kit-on
// Ogre/Troll cost revision (5→4 / 4→3, SC-EXT-29's KIT_COST_OVERRIDES) never applied to MP drafts
// either — even though `gameState`'s `draft.remaining` (Task 7) already displays kit ids as
// draftable with real stock. Currently unreachable in production (no UI sets the flag on an MP
// game yet — that's Task 8), but this MUST be fixed first so a kit-on lobby toggle doesn't ship an
// undraftable game.
// ---------------------------------------------------------------------------------------------

describe("choosePartyFor threads mp.variants into validatePicks (SC-EXT-36)", () => {
  it("kit-on: a pick containing a kit starter (Witch, id 18, cost 5) is ACCEPTED", () => {
    const mp0 = buildMpGame(4242, SEATS, { extensionKit: true });
    const first = mp0.pickOrder[0]!;
    const r = choosePartyFor(mp0, first, [18]); // Witch alone: cost 5 <= PARTY_BUDGET (6)
    expect(r.ok).toBe(true);
    expect(r.state.parties[first]!.party.map((m) => m.creatureId)).toEqual([18]);
  });

  it("kit-on: an Ogre pick validates at the revised cost 4, not the base cost 5", () => {
    const mp0 = buildMpGame(4242, SEATS, { extensionKit: true });
    const first = mp0.pickOrder[0]!;
    // Ogre(id 2) + Woman(id 6): totals 6 (= PARTY_BUDGET) only if the Ogre costs 4 (kit-on
    // override); at the base cost of 5 this would total 7 and be rejected — so ACCEPTED here
    // pins the KIT_COST_OVERRIDES threading specifically, not just "kit ids selectable at all".
    const r = choosePartyFor(mp0, first, [2, 6]);
    expect(r.ok).toBe(true);
    expect(r.state.parties[first]!.party.map((m) => m.creatureId)).toEqual([2, 6]);
  });

  it("kit-off: a kit id pick is still REJECTED — this fix does not loosen kit-off validation", () => {
    const mp0 = buildMpGame(4242, SEATS); // no variants: byte-identical to today
    const first = mp0.pickOrder[0]!;
    const r = choosePartyFor(mp0, first, [18]); // Witch: unselectable without the kit
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid");
  });
});
