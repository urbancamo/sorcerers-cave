import { describe, it, expect } from "vitest";
import { buildMpGame, choosePartyFor, mpReduce, partyView, currentSeat, type MpAction, type MpGameState } from "./multi";
import { legalActions } from "./selectors";
import { validatePlan } from "./combatPlan";
import { casterMP } from "./combat";
import { eyeActive } from "./effects";
import { scoreGame } from "./score";
import type { GameAction, GameState } from "./index";

/**
 * MP-KIT GOLDEN FIREWALL (multiplayer extension-kit milestone, Task 9).
 *
 * The multiplayer counterpart to `kit-golden.test.ts` (which is itself solo's counterpart to
 * `solo-golden.test.ts`): replays ONE fixed seed × 2-seat kit draft × deterministic policy game
 * through `mpReduce` with `variants: { extensionKit: true }`, and snapshots the full per-seat
 * action/event narrative plus a hash of the final `MpGameState`. Any engine change that alters
 * kit-on MULTIPLAYER behaviour — the deck widening (SC-EXT-30), the kit-safe MP lookups
 * (SC-EXT-31), the cave-shared kit content (SC-EXT-32), the union-scoped kit hazards (SC-EXT-34)
 * or the variant-aware draft (SC-EXT-36) — fails this test. That is the point. If a snapshot diff
 * is ever intentional (an approved rules change), update the snapshot deliberately in the same
 * commit as the change + its engine-spec.md rows, never as a side-effect. This file touches
 * NEITHER `solo-golden.test.ts`'s nor `kit-golden.test.ts`'s own fixtures — solo and solo-kit stay
 * frozen (INV-2).
 *
 * SEED / PARTIES: seed 215, seat 0 = [2, 7] (Ogre, Dwarf), seat 1 = [5, 17] (Man, Scholar) —
 * chosen by a scratchpad seed sweep (not committed; solo Task-17's own methodology) that scored
 * 16,800 seed × party-pair runs (1,200 seeds × 14 pairs) against the kit-biased policy below for
 * coverage of the milestone's required surfaces. Seat 1's Scholar (id 17) is a KIT creature, so the draft itself
 * only validates with the kit on (SC-EXT-36) — a kit-off game rejects this fixture outright, which
 * is the cheapest possible proof that the run really is kit-gated end to end.
 *
 * The run plays out to a natural finish at step #149 (both seats wiped, `phase: "finished"`,
 * turnCount 119, 45 areas placed) — no step-cap truncation. What it pins:
 *
 *   - UNION BEAT (scripted, see below; SC-MP-32/33, SC-EXT-34). Seat 0 commands, seat 1's Man and
 *     Scholar march in its array tagged `loan:1` for steps #0-#39; the union is dissolved on the
 *     commander's turn at #40 and both seats then explore independently for #41-#149.
 *   - UNION QUARREL ACROSS THE COMBINED FORCE (SC-EXT-34, the headline). #12 draws hazard 7 into
 *     the commander's chamber and the duel picks the commander's OWN Ogre (aId 2) against seat 1's
 *     LOANED Man (bId 5) — a pairing no solo game can produce. The Man loses and dies; his corpse
 *     stays in the commander's array as `status: 3` with its `loan:1` tag intact all the way to the
 *     dissolve (death does NOT end a loan), and only then goes home to seat 1 (visible at #43,
 *     where seat 1's own party holds the untagged corpse).
 *   - KIT HAZARDS, ≥2, both zombie-classified by SC-EXT-33: Harpies (SC-EXT-15) LURKS at #0 with
 *     nothing worth stealing and comes back to STRIKE at #5 on the revisit, taking the Charmed
 *     Flute (`harpiesSteal treasureIds:[12]`); Quarrel (SC-EXT-16) fires at #12 as above. Under the
 *     zombies variant SC-EXT-33 would repair the Quarrel away and let the theft stand — this golden
 *     pins the LIVING-party behaviour both classifications are measured against.
 *   - KIT SPECIAL AREAS, ≥1 — three of them, and one across seats: the Bell Rope (SC-EXT-8) is
 *     pulled once ever at #1 for a `stir` (which itself draws in an Earthquake); the Whirlpool
 *     (SC-EXT-6) is crossed nine times between the two seats (#31/#36 by the commander, then
 *     #52/#66/#88/#99/#107/#143/#145 by seat 1 alone), four of those crossings dragging a party a
 *     level down — the SAME shared tile serving both seats; and the Lair (SC-EXT-12) is finally
 *     found at #89, 84 steps and one dissolution after the theft, delivering the stolen Flute
 *     (`lairStash treasureIds:[12]`).
 *   - KIT CREATURE THROUGH THE MP COMPOSED PATH (SC-EXT-31): seat 0's expedition ends at #116
 *     against the APPRENTICE (id 14) — a kit creature met, named and fought through `mpReduce`'s
 *     composed reduce, which is exactly the base-only-table indexing Task 2 widened.
 *   - Bonus, pinned incidentally: ordinary base machinery rides along beside the kit's and is
 *     frozen with it — a chamber talked down to indifference (`pacified`, #58), the Dwarf's
 *     `trapAvoided` (#45/#112), and the Spectre that takes seat 1's last member at #149.
 *
 * POLICY: identical in shape to `kit-golden.test.ts`'s own kit-biased policy — kit specials first
 * (2-in-3 rather than outright, so a Well/Bell tile cannot pin the bot in a draw loop), then
 * artifacts 2-in-3, then `test` half the time, then `takeTreasure`, then solo-golden's uniform
 * random over the rest holding `exitCave` back. The only MP additions are (a) the acting seat is
 * whatever `currentSeat` reports (strict round-robin: `concurrent` is off), and (b) `endTurn` when
 * a seat has no legal action at all.
 *
 * THE UNION BEAT IS SCRIPTED, NOT SAMPLED. A policy bot cannot stumble into a union: the proposal
 * needs both seats co-located, at rest and un-united, and the only moment that is guaranteed is
 * before anyone has moved (both parties start on the Gateway). So the harness dispatches
 * `proposeUnion` / `respondUnion(accept)` once before step #0, and `dissolveUnion` on the
 * commander's first at-rest turn from step 40 — a fixed script around a sampled game, which is the
 * same device `conformance-vectors.test.ts` uses for its steered policies. Everything between and
 * after is the policy's own.
 */

const C_SPECTRE = 9;
const C_DEMON = 15;
const T_MAGIC_SWORD = 3;
const T_MAGIC_AXE = 17;

const SEATS = [
  { seat: 0, color: "green", name: "A" },
  { seat: 1, color: "blue", name: "B" },
];

/** Greedy, always-valid battle plan — `kit-golden.test.ts`'s own `buildPlan`, verbatim: one capable
 *  free member per stranger, in order, with the magic-only gate widened to the Demon (SC-EXT-21)
 *  alongside the Spectre. It runs against a COMPOSED seat view, so under a union it plans for the
 *  combined force exactly as the commander would. */
function buildPlan(state: GameState): { front: number[]; backers: number[]; strangers: number[] }[] {
  const usedM = new Set<number>();
  const matches: { front: number[]; backers: number[]; strangers: number[] }[] = [];
  const capable = (mi: number, si: number): boolean => {
    const m = state.party[mi]!;
    const sid = state.strangers[si];
    if (sid !== C_SPECTRE && sid !== C_DEMON) return true;
    const sword = m.treasure.includes(T_MAGIC_SWORD) && [0, 1, 5, 6].includes(m.creatureId);
    const axe = sid === C_DEMON && m.treasure.includes(T_MAGIC_AXE);
    const magicItem = !eyeActive(state) && (sword || axe);
    return casterMP(m, state) > 0 || magicItem;
  };
  for (let s = 0; s < state.strangers.length; s++) {
    const mi = state.party.findIndex((m, i) => (m.status === 0 || m.status === 1) && !usedM.has(i) && capable(i, s));
    if (mi >= 0) { usedM.add(mi); matches.push({ front: [mi], backers: [], strangers: [s] }); }
  }
  return matches;
}

/** Tiny deterministic LCG so the policy varies per step without Math.random (solo-golden's own). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s; };
}

/** One-line code for an action — `kit-golden.test.ts`'s own `actionCode` plus the three
 *  multiplayer-only codes this harness can dispatch (`endTurn` falls through to the default). */
function actionCode(a: MpAction): string {
  switch (a.type) {
    case "move": return `move:${a.dir}`;
    case "retreat": return `retreat:${a.dir}`;
    case "takeTreasure": return `take:${a.ti}>${a.mi}`;
    case "chooseCasualty": return `casualty:${a.idx}`;
    case "useArtifact": return `use:${a.artifact}${a.target !== undefined ? ">" + a.target : ""}${a.dir !== undefined ? "@" + a.dir : ""}`;
    case "resolveRound": return `fight:${a.matches.map((m) => `${m.front.join("+")}v${m.strangers.join("+")}`).join(",")}`;
    case "pullBellRope": return `bellrope:${a.mi}`;
    case "proposeUnion": return `union:propose>${a.commander}+${a.invited.join(",")}`;
    case "respondUnion": return `union:${a.accept ? "accept" : "refuse"}`;
    case "dissolveUnion": return "union:dissolve";
    default: return a.type;
  }
}

/** FNV-1a hash of a JSON-serialised value (solo-golden's own state fingerprint). */
function fnv(value: unknown): string {
  const s = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

const MAX_STEPS = 300;
/** First step at which the commander may dissolve the union (it waits for its own at-rest turn). */
const DISSOLVE_FROM = 40;

/** Drive one multiplayer game with the fixed script + policy above; return its narrative and a
 *  fingerprint of the whole final `MpGameState` (cave + both seats, not just one party's view). */
function run(
  seed: number, picks: number[][], variants?: { extensionKit?: boolean },
): { narrative: string[]; final: Record<string, unknown>; state: MpGameState } {
  const rnd = lcg(seed * 2654435761);
  let mp = variants === undefined ? buildMpGame(seed, SEATS) : buildMpGame(seed, SEATS, variants);
  const narrative: string[] = [];

  // Draft, in pick order (= play order reversed, SC-MP-7): one shared small pack, so this also
  // exercises `choosePartyFor`'s variant-aware `validatePicks` (SC-EXT-36).
  for (const seat of mp.pickOrder) {
    const r = choosePartyFor(mp, seat, picks[seat]!);
    if (!r.ok) throw new Error(`draft rejected for seat ${seat}: ${r.reason}`);
    mp = r.state;
    narrative.push(`draft s${seat} [${picks[seat]!.join(",")}]`);
  }

  // Scripted union beat (see header): both parties are still on the Gateway, at rest, un-united —
  // the one moment a union is guaranteed to be legal.
  const cmd = mp.order[0]!;
  const sub = mp.order[1]!;
  for (const [seat, action] of [
    [cmd, { type: "proposeUnion", commander: cmd, invited: [sub] }],
    [sub, { type: "respondUnion", accept: true }],
  ] as [number, MpAction][]) {
    const r = mpReduce(mp, seat, action);
    narrative.push(`#- s${seat} ${actionCode(action)} => ${r.events.map((e) => e.type).join(",") || "-"}`);
    mp = r.state;
  }

  let dissolved = false;
  let stuck = 0;
  for (let step = 0; step < MAX_STEPS && mp.phase === "playing"; step++) {
    const seat = currentSeat(mp);
    if (seat === null) break;

    let action: MpAction | null = null;
    if (!dissolved && step >= DISSOLVE_FROM && seat === cmd &&
        mp.parties[cmd]!.phase === "explore" && !mp.session) {
      action = { type: "dissolveUnion" };
      dissolved = true;
    }

    const state = partyView(mp, seat);
    if (!action && state.phase === "fight" && !state.fight?.casualtyQueue?.length) {
      const acts = legalActions(state);
      const fightUses = acts.filter((a) => a.type === "useArtifact");
      if (fightUses.length && rnd() % 2 === 0) {
        action = fightUses[rnd() % fightUses.length]!;
      } else {
        const matches = buildPlan(state);
        const plan: GameAction = { type: "resolveRound", matches };
        // buildPlan is valid by construction (incl. the forced-Spectre/Demon empty plan); guard anyway.
        action = validatePlan(state, { matches }).ok ? plan : null;
      }
    }
    if (!action) {
      const acts = legalActions(state);
      if (acts.length === 0) {
        action = { type: "endTurn" }; // nothing at all on offer — pass rather than dead-stop
      } else {
        const kitSpecial = acts.filter(
          (a) => a.type === "descendChasm" || a.type === "drawFromWell" || a.type === "pullBellRope" || a.type === "enterCrypt",
        );
        const uses = acts.filter((a) => a.type === "useArtifact");
        const tests = acts.filter((a) => a.type === "test");
        const takes = acts.filter((a) => a.type === "takeTreasure");
        if (kitSpecial.length && rnd() % 3 !== 0) action = kitSpecial[rnd() % kitSpecial.length]!;
        else if (uses.length && rnd() % 3 !== 0) action = uses[rnd() % uses.length]!;
        else if (tests.length && rnd() % 2 === 0) action = tests[rnd() % tests.length]!;
        else if (takes.length) action = takes[rnd() % takes.length]!;
        else {
          const pool = acts.filter((a) => a.type !== "exitCave");
          const from = step < MAX_STEPS - 20 && pool.length > 0 ? pool : acts;
          action = from[rnd() % from.length]!;
        }
      }
    }

    let r = mpReduce(mp, seat, action);
    let code = actionCode(action);
    // `legalActions` reads a COMPOSED solo view, so it cannot see the multiplayer-only gates
    // (a per-seat secret door, a session lock). Those return the state unchanged; pass the turn
    // instead of re-offering the same barred action forever. (It does not fire on this fixture's
    // seed — the narrative below has no `!endTurn` — but a golden harness must always terminate.)
    if (r.state === mp) {
      const passed = mpReduce(mp, seat, { type: "endTurn" });
      if (passed.state === mp) { if (++stuck > 3) break; }
      code = `${code}!endTurn`;
      r = { state: passed.state, events: [...r.events, ...passed.events] };
    } else stuck = 0;
    narrative.push(`#${step} s${seat} ${code} => ${r.events.map((e) => e.type).join(",") || "-"}`);
    mp = r.state;
  }

  return {
    narrative,
    state: mp, // not snapshotted — the kit-off spot-check below compares whole states directly
    final: {
      phase: mp.phase, turnCount: mp.turnCount, areas: mp.cave.areas.length,
      unions: (mp.unions ?? []).length,
      seats: mp.parties.map((p) => ({
        seat: p.seat, status: p.status, level: p.level, area: p.partyArea, kills: p.kills,
        alive: p.party.filter((m) => m.status === 0 || m.status === 1).length,
        score: scoreGame(partyView(mp, p.seat)),
      })),
      stateHash: fnv(mp),
    },
  };
}

// Seed × seat parties chosen by a scratchpad seed sweep — see the header doc comment.
const SEED = 215;
const PICKS = [[2, 7], [5, 17]];
// The kit-OFF identity spot-check runs the same harness on a base-only draft (Ogre+Dwarf,
// Man+Woman). Its own seed is picked purely for LENGTH — seed 215's base cave wipes both parties
// inside sixteen steps, which would make "identical" a weak claim; seed 234 runs 300 steps to a
// natural finish, so the three variants shapes are compared over a whole game.
const KIT_OFF_SEED = 234;
const KIT_OFF_PICKS = [[2, 7], [5, 6]];

describe("MP-kit golden firewall — kit-on multiplayer behaviour is frozen", () => {
  it(`seed ${SEED} kit-on 2-seat game (union → dissolve) plays back identically`, () => {
    const { narrative, final } = run(SEED, PICKS, { extensionKit: true });
    expect(narrative.length).toBeGreaterThan(5);          // sanity: the run actually did something
    expect(final.phase).toBe("finished");                 // a natural end, not a step-cap truncation
    expect({ final, narrative }).toMatchSnapshot();
  });

  // Kit-OFF byte-identity spot-check (SC-EXT-1's guarantee, carried through the WHOLE harness
  // rather than only through `buildMpGame` as `multi-kit.test.ts` already does): the same scripted
  // 2-seat game with a BASE-only draft must play out identically whether `variants` is omitted
  // altogether, `{}`, or `{ extensionKit: false }` — every action, every event, and the entire
  // final `MpGameState` bar the `variants` bookkeeping field itself (`{}`/`{extensionKit:false}`
  // are stored verbatim, so `strip` removes exactly that key — `multi-kit.test.ts`'s own pattern).
  // A kit-off multiplayer game is therefore untouched by this milestone.
  it("kit-off: the same scripted 2-seat game is byte-identical for absent / {} / {extensionKit:false}", () => {
    const strip = (g: MpGameState) => { const { variants: _variants, ...rest } = g; return rest; };
    const absent = run(KIT_OFF_SEED, KIT_OFF_PICKS);
    const empty = run(KIT_OFF_SEED, KIT_OFF_PICKS, {});
    const off = run(KIT_OFF_SEED, KIT_OFF_PICKS, { extensionKit: false });
    for (const other of [empty, off]) {
      expect(other.narrative).toEqual(absent.narrative);
      expect(strip(other.state)).toEqual(strip(absent.state));
    }
    // …and it is a long, real game, not a stub that would agree trivially.
    expect(absent.narrative.length).toBeGreaterThan(200);
    expect(absent.final.phase).toBe("finished");
  });

  // The kit gates the DRAFT itself (SC-EXT-36): seat 1's Scholar (id 17) is a kit creature, so the
  // golden's own fixture is unselectable with the kit off. This is what makes the snapshot above a
  // genuinely kit-on run rather than a base game that happens to carry a variants flag.
  it("kit-off: the golden's own draft is rejected — the fixture is kit-gated end to end", () => {
    const mp: MpGameState = buildMpGame(SEED, SEATS);
    expect(choosePartyFor(mp, mp.pickOrder[0]!, PICKS[1]!)).toMatchObject({ ok: false, reason: "invalid" });
  });
});
