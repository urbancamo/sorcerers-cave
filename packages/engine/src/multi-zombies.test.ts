import { describe, it, expect } from "vitest";
import { buildMpGame, mpReduce, fogFilter, distantFights, type CaveState, type PartyState, type MpGameState } from "./multi";
import { isZombieParty, riseAsZombies, zombiePostSweep } from "./multi-zombies";
import { declarePvp, setDefenderLine, setAttackerEngage, setDefenderCasters, resolveRoundPvp } from "./multi-fight";
import { HAZARD_MEDUSA, HAZARD_DESERTION, HAZARD_QUARREL, HAZARD_HARPIES } from "./data/hazards";
import { GS_PLAYING, GS_DEAD, type PartyMember, type PlacedArea } from "./state";
import { packCoord, DIR_N, DIR_E, DIR_W, DIR_DOWN } from "./coords";

/**
 * M7 (plan WS-6): the zombies option (spec I-15, rulebook §Zombies) and fog-of-war-lite (plan ⑦).
 * Builders copied from multi-concurrent.test.ts (kept local — this suite edits no existing test).
 */

const member = (creatureId: number, treasure: number[] = [], over: Partial<PartyMember> = {}): PartyMember =>
  ({ creatureId, status: 0, dragonKills: 0, treasure, ...over });

const partyAt = (seat: number, over: Partial<PartyState> = {}): PartyState => ({
  seat, color: ["green", "blue", "yellow", "red"][seat]!, name: "Party " + seat, status: "exploring", kills: 0,
  gs: GS_PLAYING, phase: "explore", turn: 1, score: 0, curses: 0, bonusScore: 0, sorcererKilled: false,
  partyArea: 0, level: 1, prev: 0, prev2: 0, party: [member(0)], strangers: [], treasures: [], hazards: [], fight: null,
  ...over,
});

const area = (card: number, coord: number, over: Partial<PlacedArea> = {}): PlacedArea =>
  ({ card, coord, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0, ...over });

// A controlled playing game with a hand-built cave (card 31 = NESW+chamber) and 2+ seats.
const playing = (cave: Partial<CaveState>, parties: PartyState[], order = [0, 1], over: Partial<MpGameState> = {}): MpGameState => ({
  phase: "playing",
  cave: {
    areas: [area(31, packCoord(1, 50, 50))],
    largePack: [], largeIdx: 0, smallPack: [], smallIdx: 0, seed: 1, ...cave,
  },
  parties, order, pickOrder: [...order].reverse(), active: 0, turnCount: 0,
  variants: { zombies: true },
  ...over,
});

const SEATS = [{ seat: 0, color: "green", name: "A" }, { seat: 1, color: "blue", name: "B" }];

// ---------------------------------------------------------------------------------------------
// Part A — the rise (I-15: wipe → forfeit a turn → the corpses walk)
// ---------------------------------------------------------------------------------------------

describe("riseAsZombies (rulebook §Zombies)", () => {
  const wiped = (party: PartyMember[], over: Partial<PartyState> = {}): PartyState =>
    partyAt(1, { status: "wiped", gs: GS_DEAD, phase: "gameOver", party, hostileAreas: [2], ...over });

  it("raises the seat's corpses treasure-free, exploring again, one turn forfeited", () => {
    const mp = playing({}, [partyAt(0), wiped([member(0, [3], { status: 3, borne: [3] }), member(7, [], { status: 3 })])]);
    const out = riseAsZombies(mp, 1);
    const p = out.parties[1]!;
    expect(p.zombie).toBe(true);
    expect(p.status).toBe("exploring");
    expect(p.gs).toBe(GS_PLAYING);
    expect(p.phase).toBe("explore");
    expect(p.party).toEqual([member(0), member(7)]); // borne Sword LOST with the rising flesh
    expect(p.forfeitTurnsOwed).toBe(1);              // "he forfeits one turn"
    expect(p.hostileAreas).toEqual([]);              // the living party's grudges die with it
    expect(isZombieParty(out, 1)).toBe(true);
  });

  it("stone members, Dragons and Spectres leave no corpses and stay down", () => {
    const mp = playing({}, [partyAt(0), wiped([
      member(0, [], { status: 3 }), member(3, [], { status: 2 }), member(10, [], { status: 3 }), member(9, [], { status: 3 }),
    ])]);
    const out = riseAsZombies(mp, 1);
    expect(out.parties[1]!.party.map((m) => m.creatureId)).toEqual([0]); // only the human corpse rises
    // …and a party with NO corpse (all stone / dragons / spectres) cannot rise at all.
    const stoneOnly = playing({}, [partyAt(0), wiped([member(3, [], { status: 2 })])]);
    expect(riseAsZombies(stoneOnly, 1)).toBe(stoneOnly);
  });

  it("no rise once any seat has slain the Sorcerer — no more may be created", () => {
    const mp = playing({}, [partyAt(0, { sorcererKilled: true }), wiped([member(0, [], { status: 3 })])]);
    expect(riseAsZombies(mp, 1)).toBe(mp);
  });

  it("mpReduce's sweep auto-rises a wiped seat on the next completed action", () => {
    const mp = playing({}, [partyAt(0), wiped([member(0, [], { status: 3 })])]);
    const r = mpReduce(mp, 0, { type: "endTurn" });
    expect(r.state.parties[1]!.zombie).toBe(true);
    expect(r.state.parties[1]!.status).toBe("exploring");
    // …but with the variant off, the wipe stays terminal.
    const off = { ...mp, variants: undefined };
    expect(mpReduce(off, 0, { type: "endTurn" }).state.parties[1]!.zombie).toBeUndefined();
  });

  it("a zombie party wiped again is terminal for good (no second rise)", () => {
    const mp = playing({}, [partyAt(0), wiped([member(0, [], { status: 3 })], { zombie: true })]);
    expect(riseAsZombies(mp, 1)).toBe(mp);
    expect(zombiePostSweep(mp).risen).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Part B — what the dead may not do (loot / strangers / water / secret doors)
// ---------------------------------------------------------------------------------------------

describe("zombie action gates (§Zombies)", () => {
  const zombie = (over: Partial<PartyState> = {}): PartyState => partyAt(0, { zombie: true, ...over });

  it("blocks looting, chests and artifact use — zombies cannot carry or use treasure", () => {
    const mp = playing({}, [zombie({ treasures: [1] }), partyAt(1)]);
    for (const action of [
      { type: "takeTreasure", ti: 0, mi: 0 } as const,
      { type: "retakeDropped" } as const,
      { type: "openChest" } as const,
      { type: "useArtifact", artifact: 7 } as const,
    ]) {
      expect(mpReduce(mp, 0, action).events).toEqual([{ type: "planRejected", reason: "zombies cannot carry or use treasure" }]);
    }
  });

  it("blocks test and attack — zombies will not attack strangers", () => {
    const mp = playing({}, [zombie({ phase: "encounter", strangers: [12] }), partyAt(1)]);
    expect(mpReduce(mp, 0, { type: "test" }).events).toEqual([{ type: "planRejected", reason: "zombies will not attack strangers" }]);
    expect(mpReduce(mp, 0, { type: "attack" }).events).toEqual([{ type: "planRejected", reason: "zombies will not attack strangers" }]);
  });

  it("will not step onto a Deep Pool tile (card 287), while the living may", () => {
    const cave = { areas: [area(31, packCoord(1, 50, 50)), area(287, packCoord(1, 51, 50))] };
    const mp = playing(cave, [zombie(), partyAt(1)]);
    expect(mpReduce(mp, 0, { type: "move", dir: DIR_E }).events).toEqual([{ type: "planRejected", reason: "zombies will not cross water" }]);
    const alive = playing(cave, [partyAt(0), partyAt(1)]);
    expect(mpReduce(alive, 0, { type: "move", dir: DIR_E }).events.some((e) => e.type === "planRejected")).toBe(false);
  });

  it("standing at a Deep Pool doorway, only the retrace back is walkable — never across", () => {
    const cave = {
      areas: [area(31, packCoord(1, 50, 50)), area(287, packCoord(1, 51, 50)), area(31, packCoord(1, 52, 50))],
    };
    const mp = playing(cave, [zombie({ partyArea: 1, prev: 0 }), partyAt(1)]);
    expect(mpReduce(mp, 0, { type: "move", dir: DIR_E }).events).toEqual([{ type: "planRejected", reason: "zombies will not cross water" }]); // across
    const back = mpReduce(mp, 0, { type: "move", dir: DIR_W });
    expect(back.events.some((e) => e.type === "planRejected")).toBe(false); // the way it came
  });

  it("secret stairs: none without the Sorcerer (knownDoors ignored), ALL with him", () => {
    // A mirrored stair-down: the card carries the traversal bit (64) but mirroredStairs marks it
    // unprinted — exactly what reduce lays down for a descend-back link (the I-18 secret door).
    const cave = {
      areas: [
        area(31 | 64, packCoord(1, 50, 50), { mirroredStairs: 64, secretDoor: 0 }),
        area(31 | 32, packCoord(2, 50, 50)),
      ],
    };
    // Even a seat that LEARNT the door (I-18) finds it shut once risen.
    const mp = playing(cave, [zombie({ knownDoors: [packCoord(1, 50, 50)] }), partyAt(1)]);
    expect(mpReduce(mp, 0, { type: "move", dir: DIR_DOWN }).events).toEqual([{ type: "planRejected", reason: "the dead find no secret doors" }]);
    // With the Sorcerer aboard, every secret door opens — no knownDoors needed.
    const led = playing(cave, [zombie({ party: [member(0), member(11)] }), partyAt(1)]);
    const r = mpReduce(led, 0, { type: "move", dir: DIR_DOWN });
    expect(r.events.some((e) => e.type === "moved")).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Part C — post-action enforcement (hazard immunity, indifferent strangers, treasure strip)
// ---------------------------------------------------------------------------------------------

describe("zombie post-action repair (§Zombies)", () => {
  it("Medusa's gaze is reverted for the risen (and her events filtered) — but petrifies the living", () => {
    // cave.seed 2 rolls a 1 first — a guaranteed petrification for a one-member party.
    const cave = {
      seed: 2,
      areas: [area(31, packCoord(1, 50, 50)), area(31, packCoord(1, 50, 49), { contents: [300 + HAZARD_MEDUSA] })],
    };
    const dead = mpReduce(playing(cave, [partyAt(0, { zombie: true }), partyAt(1)]), 0, { type: "move", dir: DIR_N });
    expect(dead.state.parties[0]!.party[0]!.status).toBe(0); // unpetrified — not affected by Medusa
    expect(dead.state.parties[0]!.gs).toBe(GS_PLAYING);
    expect(dead.events.some((e) => e.type === "medusaGaze" || e.type === "petrifiedOut" || e.type === "hazardFired")).toBe(false);
    const alive = mpReduce(playing(cave, [partyAt(0), partyAt(1)]), 0, { type: "move", dir: DIR_N });
    expect(alive.events.some((e) => e.type === "medusaGaze")).toBe(true); // control: the living are stoned
    expect(alive.state.parties[0]!.party[0]!.status).toBe(2);
  });

  it("strangers met on entry park straight back — indifferent to zombies, untested, turn over", () => {
    const cave = { areas: [area(31, packCoord(1, 50, 50)), area(31, packCoord(1, 50, 49), { contents: [112] })] };
    const r = mpReduce(playing(cave, [partyAt(0, { zombie: true }), partyAt(1)]), 0, { type: "move", dir: DIR_N });
    const p = r.state.parties[0]!;
    expect(p.phase).toBe("explore");
    expect(p.strangers).toEqual([]);
    expect(r.state.cave.areas[1]!.contents).toContain(112);     // the Giant stands where he stood
    expect(r.state.order[r.state.active]).toBe(1);              // the settled entry ended the turn
  });

  it("treasure swept up by an entry drops straight back to the floor", () => {
    const cave = { areas: [area(31, packCoord(1, 50, 50)), area(31, packCoord(1, 50, 49), { contents: [201] })] };
    const r = mpReduce(playing(cave, [partyAt(0, { zombie: true }), partyAt(1)]), 0, { type: "move", dir: DIR_N });
    const p = r.state.parties[0]!;
    expect(p.phase).toBe("explore");
    expect(p.treasures).toEqual([]);
    expect(r.state.cave.areas[1]!.contents).toContain(201);
  });
});

// ---------------------------------------------------------------------------------------------
// Part D — annihilation, unions, and PvP magic
// ---------------------------------------------------------------------------------------------

describe("zombies in the wider game", () => {
  it("the Sorcerer's death annihilates every zombie party — terminal, score-zero wipe", () => {
    const mp = playing({}, [partyAt(0, { sorcererKilled: true }), partyAt(1, { zombie: true })]);
    const r = mpReduce(mp, 0, { type: "endTurn" });
    const z = r.state.parties[1]!;
    expect(z.status).toBe("wiped");
    expect(z.gs).toBe(GS_DEAD);
    expect(r.state.order[r.state.active]).toBe(0); // the cursor never rests on the annihilated
  });

  it("zombies union only with zombies — mixed proposals never open", () => {
    const mixed = playing({}, [partyAt(0, { zombie: true }), partyAt(1)]);
    expect(mpReduce(mixed, 0, { type: "proposeUnion", commander: 0, invited: [1] }).events).toEqual([{ type: "blocked" }]);
    const deadPair = playing({}, [partyAt(0, { zombie: true }), partyAt(1, { zombie: true })]);
    const r = mpReduce(deadPair, 0, { type: "proposeUnion", commander: 0, invited: [1] });
    expect(r.state.session?.kind).toBe("unionProposal");
  });

  it("trade with the risen never opens — they cannot carry or use treasure", () => {
    const mp = playing({}, [partyAt(0), partyAt(1, { zombie: true })]);
    expect(mpReduce(mp, 0, { type: "proposeTrade", to: 1 }).events).toEqual([{ type: "blocked" }]);
    expect(mpReduce(mp, 1, { type: "proposeTrade", to: 0 }).events).toEqual([{ type: "blocked" }]);
  });

  it("a zombie command's casters lend no magical power in PvP — physical strength only", () => {
    const run = (zombie: boolean) => {
      const mp = playing({}, [
        partyAt(0, { zombie, party: [member(8), member(12)], diceSeed: 101 }), // Wizard + Giant
        partyAt(1, { party: [member(7)], diceSeed: 202, prev: 2 }),            // Dwarf (no surprise)
      ]);
      let r = declarePvp(mp, 0, 1, 0, 1000);
      r = setDefenderLine(r.state, 1, ["1:0"], 0, 1000);
      r = setAttackerEngage(r.state, 0, [{ attackers: ["0:1"], defenders: ["1:0"] }], [{ caster: "0:0", at: 0 }], 0, 1000);
      r = setDefenderCasters(r.state, 1, [], 0, 1000);
      const res = resolveRoundPvp(r.state, 0, 1000);
      const roll = res.events.find((e) => e.type === "combatRoll");
      return roll && roll.type === "combatRoll" ? roll.partyTotal : NaN;
    };
    const withMagic = run(false);
    const risen = run(true);
    expect(risen).toBeLessThan(withMagic); // the Wizard backs for ZERO once risen — same dice
  });
});

// ---------------------------------------------------------------------------------------------
// Part E — fog-of-war-lite (plan ⑦): seenAreas, fogFilter, distantFights
// ---------------------------------------------------------------------------------------------

describe("fog-of-war-lite (M7, plan ⑦)", () => {
  it("buildMpGame seeds every seat's ledger with the Gateway", () => {
    const mp = buildMpGame(7, SEATS, { fogLite: true });
    expect(mp.variants).toEqual({ fogLite: true });
    for (const p of mp.parties) expect(p.seenAreas).toEqual([0]);
    expect(buildMpGame(7, SEATS, { fogLite: true })).toEqual(mp); // still fully reproducible
    expect(buildMpGame(7, SEATS).variants).toBeUndefined();       // absent = today's behaviour
  });

  it("mpReduce records each area a party ENTERS — moves, always, variant or not", () => {
    const cave = { areas: [area(31, packCoord(1, 50, 50)), area(31, packCoord(1, 50, 49))] };
    const mp = playing(cave, [partyAt(0, { seenAreas: [0] }), partyAt(1)], [0, 1], { variants: undefined });
    const r = mpReduce(mp, 0, { type: "move", dir: DIR_N });
    expect(r.state.parties[0]!.seenAreas).toEqual([0, 1]);
    expect(r.state.parties[1]!.seenAreas).toEqual([0]); // the bystander saw nothing new
  });

  it("fogFilter masks unseen areas to face-down stubs — coordinates kept, all detail stripped", () => {
    const secret = area(31, packCoord(1, 50, 49), {
      contents: [112, 201], dropped: [1], markers: [302], mirroredStairs: 64, secretDoor: 0, visited: true,
    });
    const mp = playing({ areas: [area(31, packCoord(1, 50, 50), { contents: [205] }), secret] },
      [partyAt(0, { seenAreas: [0] }), partyAt(1, { partyArea: 1, seenAreas: [0, 1] })]);
    const view = fogFilter(mp, 0);
    expect(view.areas[0]).toEqual(mp.cave.areas[0]);   // seen: served whole (your own floor loot too)
    expect(view.areas[1]).toEqual({                    // unseen: existence + coord only
      card: secret.card, coord: secret.coord, faceUp: false, visited: false, contents: [], flags: 0, indiffCount: 0,
    });
    expect(fogFilter(mp, 1).areas[1]).toEqual(secret); // the seat that entered sees everything
  });

  it("distantFights counts OTHER seats' stranger-fights and PvP sessions you are not part of", () => {
    const strangerFight = playing({}, [partyAt(0), partyAt(1, { phase: "fight" }), partyAt(2)], [0, 1, 2]);
    expect(distantFights(strangerFight, 0)).toBe(1);
    expect(distantFights(strangerFight, 1)).toBe(0); // your own fight is no distant rumour
    const pvp = playing({}, [partyAt(0), partyAt(1), partyAt(2)], [0, 1, 2], {
      session: {
        kind: "pvp", area: 0, attacker: [1], defender: [2], round: 1, activeSide: "attacker",
        surprise: 0, stage: "defenderLine", defenderLine: [], engagements: [],
        attackerBackers: [], defenderBackers: [], window: null, stopProposedBy: null,
      },
    });
    expect(distantFights(pvp, 0)).toBe(2); // both combatants ring in the deep
    expect(distantFights(pvp, 1)).toBe(0); // a participant needs no hint
    expect(distantFights(pvp, 2)).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Part F — kit-hazard classifications for the dead (SC-EXT-33, task 4 of the extension-kit
// multiplayer milestone; the design-Part-4 proposal, pending MSW's confirmation): Desertion and
// Quarrel are the party turning on ITSELF, and the dead have none of that left in them, so both
// are run-then-undo repaired like Medusa/Ghouls (multi-zombies.ts's POST-REPAIR section 1). Crypt
// falls and Harpies' theft are ordinary hazards to a zombie party — no gate, no repair.
// ---------------------------------------------------------------------------------------------

const HERO = 0;
const OGRE = 2;
const MAGIC_SWORD = 3; // base artifact (kind "artifact") — Harpies' theft target

describe("kit-hazard classifications for the dead (SC-EXT-33)", () => {
  it("Desertion fires no rolls or removals for a zombie party — the announcement itself is repaired away", () => {
    // cave.seed 2 rolls a 1 first — a guaranteed "leaves" roll for any ally that gets to roll.
    const cave = {
      seed: 2,
      areas: [area(31, packCoord(1, 50, 50)), area(31, packCoord(1, 50, 49), { contents: [300 + HAZARD_DESERTION] })],
    };
    const dead = mpReduce(playing(cave, [partyAt(0, { zombie: true, party: [member(0), member(5)] }), partyAt(1)]), 0, { type: "move", dir: DIR_N });
    expect(dead.state.parties[0]!.party).toEqual([member(0), member(5)]); // nobody removed, nobody rolled
    expect(dead.events.some((e) => e.type === "desertionRoll")).toBe(false);
    expect(dead.events.some((e) => e.type === "hazardFired" && e.hazard === HAZARD_DESERTION)).toBe(false);
    // Control: the SAME hazard, on a living party, still announces itself — proving the zombie's
    // silence above is the repair at work, not merely the hazard having nothing to do.
    const alive = mpReduce(playing(cave, [partyAt(0, { party: [member(0), member(5)] }), partyAt(1)]), 0, { type: "move", dir: DIR_N });
    expect(alive.events.some((e) => e.type === "hazardFired" && e.hazard === HAZARD_DESERTION)).toBe(true);
  });

  it("Quarrel fizzles for a zombie party — no duel, no casualty, reverted like a Medusa/Ghouls immunity", () => {
    // cave.seed 2's first two rolls are 1 then 5 — Hero (a) rolls lower than Ogre (b) and would lose.
    const cave = {
      seed: 2,
      areas: [area(31, packCoord(1, 50, 50)), area(31, packCoord(1, 50, 49), { contents: [300 + HAZARD_QUARREL] })],
    };
    const dead = mpReduce(playing(cave, [partyAt(0, { zombie: true, party: [member(HERO), member(OGRE)] }), partyAt(1)]), 0, { type: "move", dir: DIR_N });
    const p = dead.state.parties[0]!;
    expect(p.party.map((m) => m.status)).toEqual([0, 0]); // neither duelist dies
    expect(p.gs).toBe(GS_PLAYING);
    expect(dead.events.some((e) => e.type === "quarrel")).toBe(false);
    expect(dead.events.some((e) => e.type === "hazardFired" && e.hazard === HAZARD_QUARREL)).toBe(false);
    // Control: the identical setup on a LIVING party genuinely duels and loses a member — proving
    // the roll sequence really would draw blood absent the repair.
    const alive = mpReduce(playing(cave, [partyAt(0, { party: [member(HERO), member(OGRE)] }), partyAt(1)]), 0, { type: "move", dir: DIR_N });
    const q = alive.events.find((e) => e.type === "quarrel") as { loserId: number | null } | undefined;
    expect(q?.loserId).toBe(HERO);
    expect(alive.state.parties[0]!.party.find((m) => m.creatureId === HERO)!.status).toBe(3);
  });

  it("Harpies still strips a zombie-held artifact to the stash — theft is not a hazard immunity", () => {
    const cave = { areas: [area(31, packCoord(1, 50, 50)), area(31, packCoord(1, 50, 49), { contents: [300 + HAZARD_HARPIES] })] };
    const mp = playing(cave, [partyAt(0, { zombie: true, party: [member(0, [MAGIC_SWORD])] }), partyAt(1)]);
    const r = mpReduce(mp, 0, { type: "move", dir: DIR_N });
    const p = r.state.parties[0]!;
    expect(p.party[0]!.treasure).toEqual([]); // stolen, not merely carried
    expect(r.events.some((e) => e.type === "harpiesSteal")).toBe(true);
    expect(p.harpyStash ?? []).toEqual([MAGIC_SWORD]); // queued for the not-yet-placed Lair (SC-EXT-12)
  });

  it("a Crypt trap drops a zombie party exactly like a living one — no Dwarf, no exemption", () => {
    const coord = packCoord(1, 50, 50);
    const cave = { seed: 2, cryptCoord: coord, areas: [area(31, coord)] }; // seed 2's first roll is 1 — trap
    const mp = playing(cave, [partyAt(0, { zombie: true, party: [member(0)] }), partyAt(1)]);
    const r = mpReduce(mp, 0, { type: "enterCrypt" });
    const roll = r.events.find((e) => e.type === "cryptRoll") as { roll: number; outcome: string } | undefined;
    expect(roll?.outcome).toBe("trap");
    const p = r.state.parties[0]!;
    expect(p.level).toBe(2);            // the whole party fell a level
    expect(p.fellThroughTrap).toBe(true);
    expect(r.state.cave.cryptCoord).toBeUndefined(); // spent either way
  });
});
