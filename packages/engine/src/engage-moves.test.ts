import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { newGame } from "./setup";
import { driveStrangers } from "./strangerDriver";
import { legalMoves, legalPairs } from "./revisedRound";
import type { GameState } from "./state";
import type { GameAction } from "./actions";

// R1.8 (Peter, 2026-10-25): when the party attacks, `engage` may carry `moves` so that pairing and placing the spares is one action.
const PARTIES: number[][] = [[6, 7, 5], [4, 7, 7], [4, 6], [6, 7, 7, 7], [6, 7]];   // within the starting budget; the Priest can stand behind the line
const FOES: number[][] = [[5], [5, 5], [6], [7, 5]];

/** A fight with the party attacking, stopped where it must pair. */
const atEngage = (seed: number, party: number[], foes: number[]): GameState | null => {
  let s: GameState;
  try { s = { ...newGame(seed, party), variants: { combatRevision: true }, phase: "encounter", strangers: foes.slice(), treasures: [] }; } catch { return null; }
  s = driveStrangers(reduce(s, { type: "attack" }).state).state;
  const p = s.fight?.pending;
  return p && p.by === "party" && p.kind === "engage" ? s : null;
};

/** The first complete legal pairing set, greedily. */
const pairing = (s: GameState): { party: number; stranger: number }[] => {
  const out: { party: number; stranger: number }[] = [];
  // casters last, so a Priest is left over to stand behind the line
  const caster = (i: number): number => (s.party[i]!.creatureId === 4 ? 1 : 0);
  for (const p of legalPairs(s, "party").sort((a, b) => caster(a.party) - caster(b.party))) if (!out.some((o) => o.party === p.party || o.stranger === p.stranger)) out.push(p);
  return out;
};

/** The moves available once `pairs` are made, found by playing the pairings alone on a copy. */
const movesAfter = (s: GameState, pairs: { party: number; stranger: number }[]) => {
  const r = reduce(structuredClone(s), { type: "engage", pairs });
  return r.state.fight?.pending?.by === "party" && r.state.fight.pending.kind === "redeploy" ? legalMoves(r.state, "party") : [];
};

describe("engage with moves (R1.8)", () => {
  it("equals engage then redeploy, event for event and state for state, over a seeded sweep", () => {
    let withMoves = 0, backMoves = 0;
    for (let seed = 1; seed <= 40; seed++) for (const party of PARTIES) for (const foes of FOES) {
      const s = atEngage(seed, party, foes);
      if (!s) continue;
      const pairs = pairing(s), avail = movesAfter(s, pairs);
      // up to two placements: the first front move, and a caster behind if one is available
      const moves: { creature: number; match: number; back: boolean }[] = [];
      for (const mv of [...avail].sort((a, b) => Number(b.back) - Number(a.back))) if (!moves.some((m) => m.creature === mv.creature) && moves.length < 2) {
        const probe = reduce(structuredClone(s), { type: "engage", moves: [...moves, mv], pairs } as GameAction);
        if (!probe.events.some((e) => e.type === "planRejected")) moves.push(mv);
      }
      const combined = reduce(structuredClone(s), { type: "engage", pairs, moves });
      expect(combined.events.some((e) => e.type === "planRejected"), `seed ${seed}`).toBe(false);
      const step1 = reduce(structuredClone(s), { type: "engage", pairs });
      const partyPrompt = step1.state.fight?.pending?.by === "party" && step1.state.fight.pending.kind === "redeploy" && step1.state.fight.round === s.fight!.round;
      const sequential = partyPrompt ? reduce(step1.state, { type: "redeploy", moves }) : step1;
      // the same events, bar an empty `redeployed` the combined action reports when there was nothing to place and so no prompt
            expect(combined.events.filter((e) => !(e.type === "redeployed" && e.moves.length === 0)), `seed ${seed} ${party}/${foes}`)
        .toEqual(partyPrompt ? [...step1.events, ...sequential.events] : step1.events);
      expect(combined.state, `seed ${seed} ${party}/${foes}`).toEqual(sequential.state);
      if (moves.length) withMoves++;
      if (moves.some((m) => m.back)) backMoves++;
    }
    expect(withMoves).toBeGreaterThan(10);
    expect(backMoves).toBeGreaterThan(0);
  });

  it("is refused as a whole, leaving the state unchanged, when a placement is illegal", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = atEngage(seed, [6, 7, 5], [5]);
      if (!s) continue;
      const pairs = pairing(s);
      for (const moves of [[{ creature: 99, match: 0, back: false }], [{ creature: pairs[0]!.party, match: 0, back: false }], [{ creature: 0, match: 7, back: false }]]) {
        const r = reduce(s, { type: "engage", pairs, moves });
        expect(r.events[0]).toMatchObject({ type: "planRejected" });
        expect(r.state).toBe(s);
      }
      return;
    }
    throw new Error("no usable fight");
  });

  it("refuses moves with an incomplete pairing, and a plain engage is unchanged", () => {
    const s = atEngage(1, [6, 7, 5], [5])!;
    expect(reduce(s, { type: "engage", pairs: [], moves: [] }).events[0]).toMatchObject({ type: "planRejected" });
    const plain = reduce(s, { type: "engage", pairs: pairing(s) });
    expect(plain.state.fight?.pending).toMatchObject({ by: "party", kind: "redeploy" });
  });

  it("numbers the placements after matches that already stand", () => {
    // round 2: one match already stands, the new pairing is match 1, and a spare can be put into it
    for (let seed = 1; seed <= 60; seed++) {
      let s = atEngage(seed, [6, 7, 5, 7], [5, 5, 5]);
      if (!s) continue;
      const first = pairing(s).slice(0, 1);
      s = reduce(s, { type: "engage", pairs: first, moves: [] }).state;
      s = driveStrangers(s).state;
      if (s.fight?.pending?.by === "party" && s.fight.pending.kind === "engage" && s.fight.rev!.matches.length > 0) {
        const pairs = pairing(s), n = s.fight.rev!.matches.length;
        const r = reduce(s, { type: "engage", pairs, moves: [] });
        expect(r.state.fight!.rev!.matches.length).toBe(n + pairs.length);
        return;
      }
    }
  });
});
