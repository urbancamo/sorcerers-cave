import { describe, it, expect } from "vitest";
import { mpReduce, type CaveState, type PartyState, type MpGameState } from "./multi";
import {
  proposeTrade, updateBasket, confirmTrade, cancelTrade, expireTrade, sessionGuard,
  grantSecretDoors, secretStairGated, showSecretDoor,
} from "./multi-trade";
import { packCoord, DIR_S, DIR_UP, DIR_DOWN } from "./coords";
import type { PartyMember, PlacedArea } from "./state";

const member = (creatureId: number, treasure: number[] = []): PartyMember =>
  ({ creatureId, status: 0, dragonKills: 0, treasure });

// A playing-phase party at the shared gateway (area 0), at rest (patterned on multi.test.ts).
const partyAt = (seat: number, over: Partial<PartyState> = {}): PartyState => ({
  seat, color: ["green", "blue", "yellow", "red"][seat]!, name: "Party " + seat, status: "exploring", kills: 0,
  gs: 0, phase: "explore", turn: 1, score: 0, curses: 0, bonusScore: 0, sorcererKilled: false,
  partyArea: 0, level: 1, prev: 0, prev2: 0, party: [member(0)], strangers: [], treasures: [], hazards: [], fight: null,
  ...over,
});

const area = (over: Partial<PlacedArea> = {}): PlacedArea =>
  ({ card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0, ...over });

// A controlled playing game with a hand-built cave (card 31 = NESW+chamber start).
const playing = (cave: Partial<CaveState>, parties: PartyState[], order = [0, 1]): MpGameState => ({
  phase: "playing",
  cave: { areas: [area()], largePack: [], largeIdx: 0, smallPack: [], smallIdx: 0, seed: 1, ...cave },
  parties, order, pickOrder: [...order].reverse(), active: 0, turnCount: 0,
});

describe("proposeTrade (spec I-5)", () => {
  it("opens the one session with empty baskets and a window on the invited seat", () => {
    const mp = playing({}, [partyAt(0), partyAt(1)]);
    const r = proposeTrade(mp, 0, 1, 1000, 60000);
    expect(r.ok).toBe(true);
    expect(r.state.session).toEqual({
      kind: "trade", area: 0, a: 0, b: 1,
      basketA: { treasure: [], members: [] }, basketB: { treasure: [], members: [] },
      confirmedA: false, confirmedB: false,
      window: { seat: 1, deadline: 61000, kind: "tradeRespond" },
    });
  });

  it("guards: not co-located, mid-encounter, session already active, terminal seat", () => {
    const apart = playing({ areas: [area(), area({ coord: packCoord(1, 51, 50) })] }, [partyAt(0), partyAt(1, { partyArea: 1 })]);
    expect(proposeTrade(apart, 0, 1, 0).reason).toBe("notColocated");

    const busy = playing({}, [partyAt(0), partyAt(1, { phase: "encounter", strangers: [10] })]);
    expect(proposeTrade(busy, 0, 1, 0).reason).toBe("midEncounter");

    const open = proposeTrade(playing({}, [partyAt(0), partyAt(1)]), 0, 1, 0).state;
    expect(proposeTrade(open, 1, 0, 0).reason).toBe("sessionActive");

    const gone = playing({}, [partyAt(0), partyAt(1, { status: "left" })]);
    expect(proposeTrade(gone, 0, 1, 0).reason).toBe("notExploring");
    expect(proposeTrade(playing({}, [partyAt(0), partyAt(1)]), 0, 0, 0).reason).toBe("self");
  });

  it("routes through mpReduce WITHOUT the turn gate — a non-active seat may propose", () => {
    const mp = playing({}, [partyAt(0), partyAt(1)]); // active seat is 0
    const r = mpReduce(mp, 1, { type: "proposeTrade", to: 0 }, 500);
    expect(r.events).toEqual([]);
    expect(r.state.session?.kind).toBe("trade");
    expect(r.state.active).toBe(0); // no turn consumed
  });
});

describe("updateBasket", () => {
  const opened = () => proposeTrade(playing({}, [
    partyAt(0, { party: [member(5, [1, 13]), member(6)] }),        // Man carrying Gold+Eye, Woman
    partyAt(1, { party: [member(2, [0])] }),                       // Ogre carrying Silver
  ]), 0, 1, 1000).state;

  it("validates offered treasure against actual holdings, count-aware", () => {
    const mp = opened();
    expect(updateBasket(mp, 0, { treasure: [2], members: [] }, 0).reason).toBe("notHeld");   // no Gems held
    expect(updateBasket(mp, 0, { treasure: [1, 1], members: [] }, 0).reason).toBe("notHeld"); // only one Gold
    expect(updateBasket(mp, 0, { treasure: [1, 13], members: [] }, 0).ok).toBe(true);
  });

  it("validates offered members: in range, living(0)/ally(1), no duplicates", () => {
    const mp = opened();
    expect(updateBasket(mp, 0, { treasure: [], members: [5] }, 0).reason).toBe("invalidMember");
    expect(updateBasket(mp, 0, { treasure: [], members: [1, 1] }, 0).reason).toBe("invalidMember");
    const stoned = { ...mp, parties: mp.parties.map((p, i) => (i === 0 ? { ...p, party: [member(5), { ...member(6), status: 2 as const }] } : p)) };
    expect(updateBasket(stoned, 0, { treasure: [], members: [1] }, 0).reason).toBe("invalidMember");
    expect(updateBasket(mp, 2, { treasure: [], members: [] }, 0).reason).toBe("notParticipant");
  });

  it("a basket edit clears BOTH confirms and re-arms the window on the other seat", () => {
    let mp = opened();
    mp = confirmTrade(mp, 0, 2000, 60000).state;
    let s = mp.session!;
    expect(s.kind === "trade" && s.confirmedA).toBe(true);
    mp = updateBasket(mp, 1, { treasure: [0], members: [] }, 5000, 60000).state;
    s = mp.session!;
    if (s.kind !== "trade") throw new Error("expected trade session");
    expect(s.confirmedA).toBe(false);
    expect(s.confirmedB).toBe(false);
    expect(s.basketB).toEqual({ treasure: [0], members: [] });
    expect(s.window).toEqual({ seat: 0, deadline: 65000, kind: "tradeRespond" }); // re-armed on the OTHER seat
  });
});

describe("confirmTrade — the atomic commit", () => {
  it("happy path: treasure both ways + a member one way; the Eye of God trades curse-free", () => {
    const woman: PartyMember = { creatureId: 6, status: 1, dragonKills: 2, treasure: [] }; // ally with history
    const base = playing({}, [
      partyAt(0, { party: [member(5, [13, 1]), woman] }),  // Man: Eye of God + Gold; Woman-ally
      partyAt(1, { party: [member(2, [0])] }),             // Ogre: Silver
    ]);
    let mp = proposeTrade(base, 0, 1, 0).state;
    mp = updateBasket(mp, 0, { treasure: [13, 1], members: [1] }, 0).state; // give Eye + Gold + the Woman
    mp = updateBasket(mp, 1, { treasure: [0], members: [] }, 0).state;      // give Silver back
    mp = confirmTrade(mp, 0, 0).state;
    expect(mp.session && mp.session.kind === "trade" && mp.session.confirmedA).toBe(true); // half-confirmed, nothing moved yet
    expect(mp.parties[0]!.party).toHaveLength(2);

    const r = confirmTrade(mp, 1, 0);
    expect(r.ok).toBe(true);
    expect(r.state.session).toBeNull();
    // Seat 0: Man kept, Eye+Gold gone, Woman gone, Silver received (Man carry 50 ≥ 25).
    expect(r.state.parties[0]!.party).toEqual([{ creatureId: 5, status: 0, dragonKills: 0, treasure: [0] }]);
    // Seat 1: Ogre gave the Silver, took Eye+Gold; the Woman arrived intact (status/kills kept).
    expect(r.state.parties[1]!.party).toEqual([
      { creatureId: 2, status: 0, dragonKills: 0, treasure: [13, 1] },
      { creatureId: 6, status: 1, dragonKills: 2, treasure: [] },
    ]);
    // The Eye of God changing hands in a trade brings NO curse on either side (§Trading Cards).
    expect(r.state.parties[0]!.curses).toBe(0);
    expect(r.state.parties[1]!.curses).toBe(0);
  });

  it("a traded borne item leaves the giver's borne list and arrives merely carried", () => {
    const base = playing({}, [
      partyAt(0, { party: [{ ...member(0, [3]), borne: [3] }] }), // Hero wielding the Magic Sword
      partyAt(1, { party: [member(5)] }),
    ]);
    let mp = proposeTrade(base, 0, 1, 0).state;
    mp = updateBasket(mp, 0, { treasure: [3], members: [] }, 0).state;
    mp = confirmTrade(mp, 0, 0).state;
    const r = confirmTrade(mp, 1, 0);
    expect(r.ok).toBe(true);
    expect(r.state.parties[0]!.party[0]).toMatchObject({ treasure: [], borne: [] });
    expect(r.state.parties[1]!.party[0]!.treasure).toEqual([3]);
    expect(r.state.parties[1]!.party[0]!.borne).toBeUndefined();
  });

  it("overCapacity fails the WHOLE commit and clears both confirms; nothing moves", () => {
    const base = playing({}, [
      partyAt(0, { party: [member(5, [1])] }),  // Man carrying Gold (25 kg)
      partyAt(1, { party: [member(8)] }),       // Wizard — carry capacity 0
    ]);
    let mp = proposeTrade(base, 0, 1, 0).state;
    mp = updateBasket(mp, 0, { treasure: [1], members: [] }, 0).state;
    mp = confirmTrade(mp, 0, 0).state;
    const r = confirmTrade(mp, 1, 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("overCapacity");
    const s = r.state.session!;
    if (s.kind !== "trade") throw new Error("expected trade session");
    expect(s.confirmedA).toBe(false);
    expect(s.confirmedB).toBe(false);
    expect(r.state.parties[0]!.party[0]!.treasure).toEqual([1]); // untouched
    expect(r.state.parties[1]!.party[0]!.treasure).toEqual([]);
  });
});

describe("cancel / expire / sessionGuard", () => {
  const open = () => proposeTrade(playing({ largePack: [1] }, [partyAt(0), partyAt(1), partyAt(2)], [0, 1, 2]), 1, 2, 0, 60000).state;

  it("either participant may cancel; outsiders may not", () => {
    expect(cancelTrade(open(), 2).state.session).toBeNull();
    expect(cancelTrade(open(), 1).state.session).toBeNull();
    expect(cancelTrade(open(), 0).reason).toBe("notParticipant");
  });

  it("expire fires only once the deadline has passed", () => {
    const mp = open(); // deadline 60000
    const early = expireTrade(mp, 59999);
    expect(early.fired).toBe(false);
    expect(early.state.session).not.toBeNull();
    const late = expireTrade(mp, 60000);
    expect(late.fired).toBe(true);
    expect(late.state.session).toBeNull();
  });

  it("a participant dispatching a solo action abandons the trade; outsiders do not", () => {
    const mp = open(); // session between seats 1 and 2; active seat is 0
    // Seat 0 (not in the trade) moves: the session survives.
    const other = mpReduce(mp, 0, { type: "move", dir: DIR_S }, 0);
    expect(other.state.session?.kind).toBe("trade");
    // Seat 1 (a participant) moves on its turn: the session is cancelled first.
    const handedOver = other.state; // now seat 1's turn
    const gone = mpReduce(handedOver, 1, { type: "move", dir: DIR_S }, 0); // follows into the tunnel
    expect(gone.state.parties[1]!.partyArea).toBe(1); // the move really dispatched
    expect(gone.state.session).toBeNull();
    expect(sessionGuard(mp, 1).session).toBeNull(); // and the helper alone does the same
    expect(sessionGuard(mp, 0).session).not.toBeNull();
  });
});

describe("secret-door knowledge (spec I-18)", () => {
  const coordA = packCoord(1, 50, 50);
  const coordB = packCoord(2, 50, 50);
  // Area A's stair down exists ONLY as a mirrored link (bit 64); B mirrors the stair up (bit 32).
  const secretPair = (): PlacedArea[] => [
    area({ card: 31 | 64, mirroredStairs: 64 }),
    area({ card: 31 | 32, coord: coordB, mirroredStairs: 32, secretDoor: 0 }),
  ];

  it("gates a mirrored stair for a seat without knowledge and admits one with it", () => {
    const mp = playing({ areas: secretPair() }, [partyAt(0), partyAt(1)]);
    expect(secretStairGated(mp, 0, DIR_DOWN)).toBe(true);
    const r = mpReduce(mp, 0, { type: "move", dir: DIR_DOWN });
    expect(r.events).toEqual([{ type: "blocked" }]);
    expect(r.state.parties[0]!.partyArea).toBe(0);

    const knows = playing({ areas: secretPair() }, [partyAt(0, { knownDoors: [coordA] }), partyAt(1)]);
    const ok = mpReduce(knows, 0, { type: "move", dir: DIR_DOWN });
    expect(ok.state.parties[0]!.partyArea).toBe(1);
    expect(ok.state.parties[0]!.level).toBe(2);
  });

  it("never gates a printed stair or a lateral move", () => {
    const printed = playing({ areas: [area({ card: 31 | 64 }), area({ card: 31 | 32, coord: coordB })] }, [partyAt(0), partyAt(1)]);
    expect(secretStairGated(printed, 0, DIR_DOWN)).toBe(false);
    const mixed = playing({ areas: secretPair() }, [partyAt(0), partyAt(1)]);
    expect(secretStairGated(mixed, 0, DIR_S)).toBe(false);
    expect(secretStairGated(mixed, 0, DIR_UP)).toBe(false); // mirrored bit is DOWN, not UP
  });

  it("own traversal grants BOTH end coords to the mover", () => {
    // A's stair down is printed (no gate going down); B's return stair up is the secret end.
    const areas = [area({ card: 31 | 64 }), area({ card: 31 | 32, coord: coordB, mirroredStairs: 32, secretDoor: 0 })];
    const mp = playing({ areas }, [partyAt(0), partyAt(1, { partyArea: 1 })]);
    const r = mpReduce(mp, 0, { type: "move", dir: DIR_DOWN });
    expect(r.state.parties[0]!.partyArea).toBe(1);
    expect(r.state.parties[0]!.knownDoors).toEqual([coordA, coordB]); // may climb back up later
    expect(secretStairGated(r.state, 0, DIR_UP)).toBe(false);
  });

  it("co-located witnesses in the ORIGIN area learn the door too; others do not", () => {
    const areas = [area({ card: 31 | 64 }), area({ card: 31 | 32, coord: coordB, mirroredStairs: 32, secretDoor: 0 })];
    const mp = playing({ areas }, [partyAt(0), partyAt(1), partyAt(2, { partyArea: 1 })], [0, 1, 2]);
    const r = mpReduce(mp, 0, { type: "move", dir: DIR_DOWN });
    expect(r.state.parties[1]!.knownDoors).toEqual([coordA, coordB]); // stood in the origin — witnessed
    expect(r.state.parties[2]!.knownDoors).toBeUndefined();           // stood elsewhere — learnt nothing
  });

  it("showSecretDoor: a knowledgeable co-located granter gifts the door, one-way, no turn gate", () => {
    const mp = playing({ areas: secretPair() }, [partyAt(0, { knownDoors: [coordA] }), partyAt(1)]);
    expect(showSecretDoor(mp, 1, 0).reason).toBe("unknownDoor"); // seat 1 has nothing to show
    const r = mpReduce(mp, 1, { type: "showSecretDoor", to: 0 }); // …and mpReduce blocks it likewise
    expect(r.events).toEqual([{ type: "blocked" }]);

    const shown = mpReduce(mp, 0, { type: "showSecretDoor", to: 1 }); // off-turn is fine? seat 0 IS active; try seat order swap below
    expect(shown.state.parties[1]!.knownDoors).toEqual([coordA]);
    expect(secretStairGated(shown.state, 1, DIR_DOWN)).toBe(false);

    // No turn gate: the same grant works while it is NOT the granter's turn.
    const offTurn = playing({ areas: secretPair() }, [partyAt(0), partyAt(1, { knownDoors: [coordA] })]); // active = 0
    const g = mpReduce(offTurn, 1, { type: "showSecretDoor", to: 0 });
    expect(g.state.parties[0]!.knownDoors).toEqual([coordA]);

    const apart = playing({ areas: secretPair() }, [partyAt(0, { knownDoors: [coordA] }), partyAt(1, { partyArea: 1 })]);
    expect(showSecretDoor(apart, 0, 1).reason).toBe("notColocated");
  });

  it("a Charmed-Flute reveal (secretDoorRevealed) grants the acting seat both end coords", () => {
    // A (level 1, no printed stair down) above B (level 2, printed stair up): the Flute's reveal case.
    const areas = [area(), area({ card: 31 | 32, coord: coordB })];
    const mp = playing({ areas }, [partyAt(0, { party: [member(5, [12])] }), partyAt(1)]);
    const r = mpReduce(mp, 0, { type: "useArtifact", artifact: 12, dir: DIR_DOWN });
    expect(r.events.some((e) => e.type === "secretDoorRevealed")).toBe(true);
    expect(r.state.parties[0]!.knownDoors).toEqual([coordA, coordB]);
    expect(r.state.parties[1]!.knownDoors).toBeUndefined(); // the reveal is the flautist's alone
  });

  it("grantSecretDoors is idempotent and order-preserving", () => {
    const mp = playing({}, [partyAt(0, { knownDoors: [coordA] }), partyAt(1)]);
    const g = grantSecretDoors(mp, [0], [coordA, coordB]);
    expect(g.parties[0]!.knownDoors).toEqual([coordA, coordB]);
    expect(grantSecretDoors(g, [0], [coordB]).parties[0]).toBe(g.parties[0]); // no change → same object
  });
});
