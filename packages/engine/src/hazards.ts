import { rollDie } from "./rng";
import { CREATURES, FLAG_GUIDES_PAST_TRAP } from "./data/creatures";
import { ALL_TREASURES } from "./data/treasures";
import {
  HAZARD_MUTINY, HAZARD_TRAP, HAZARD_EARTHQUAKE, HAZARD_MEDUSA, HAZARD_GHOULS, HAZARD_DESERTION,
} from "./data/hazards";
import { AF_DESTROYED, type GameState, type PartyMember } from "./state";
import type { GameEvent } from "./actions";
import { frontStrength } from "./combat";
import { eyeForsakenByDeath, ringInvincible } from "./effects";
import { spillCarried, sweepFallen } from "./loot";

const T_TALISMAN = 7;
const T_MAGIC_STAFF = 9;
const C_WIZARD = 8;
const C_WOLF = 20; // extension-kit creature — immune to Desertion's rolls (design US-18, SC-EXT-14)

function living(state: GameState): PartyMember[] {
  return state.party.filter((m) => m.status === 0 || m.status === 1);
}

function livingHolds(state: GameState, treasureId: number): boolean {
  return living(state).some((m) => m.treasure.includes(treasureId));
}

/** A living Wizard bearing the Magic Staff — makes Medusa powerless over the whole party (card). */
export function hasStaffWizard(state: GameState): boolean {
  return state.party.some((m) => (m.status === 0 || m.status === 1) && m.creatureId === C_WIZARD && m.treasure.includes(T_MAGIC_STAFF));
}

/** Resolve every hazard in the working set, in priority order (spec §7.2). */
export function applyHazards(state: GameState): { events: GameEvent[]; fell: boolean } {
  const events: GameEvent[] = [];
  let fell = false;
  // Extension kit (SC-EXT-14): Desertion is appended strictly AFTER Trap — a kit-off game's `hazards`
  // working set can never contain id 5 (the base small pack has no such code), so this extension is
  // a no-op for the base game (SC-EXT-1 byte-identity); when the kit is on and BOTH fire together,
  // Desertion still resolves in this same pass, before the trap's fall is handled by the caller.
  const order = [HAZARD_EARTHQUAKE, HAZARD_MEDUSA, HAZARD_GHOULS, HAZARD_MUTINY, HAZARD_TRAP, HAZARD_DESERTION];

  for (const hz of order) {
    if (!state.hazards.includes(hz)) continue;
    if (hz === HAZARD_GHOULS && livingHolds(state, T_TALISMAN)) { events.push({ type: "ghoulsWarded" }); continue; } // the Talisman wards off Ghouls (card)
    if (hz === HAZARD_MEDUSA) {
      const here = state.areas[state.partyArea];
      if (here?.medusaAsleepUntil !== undefined) {
        // Lotus Dust holds her under ("asleep for 2 turns of the player who uses it", §Lotus Dust).
        if (state.turn <= here.medusaAsleepUntil) { events.push({ type: "medusaAsleep" }); continue; }
        delete here.medusaAsleepUntil; // her two turns have run — she wakes, and her gaze fires
      }
      if (hasStaffWizard(state)) { events.push({ type: "medusaAverted" }); continue; } // the staff averts her gaze — no one stoned
    }
    events.push({ type: "hazardFired", hazard: hz });
    switch (hz) {
      case HAZARD_EARTHQUAKE: {
        const prev = state.areas[state.prev];
        if (prev && state.prev !== state.partyArea) {
          prev.flags |= AF_DESTROYED;
          prev.contents = [];
          // Lay the earthquake card on the tile it collapsed (display-only scar on the rubble).
          prev.markers = [...(prev.markers ?? []), 300 + HAZARD_EARTHQUAKE];
        }
        break;
      }
      case HAZARD_MEDUSA: {
        // (A staff-Wizard's aversion is handled above, before the gaze fires.)
        const rolls: { creatureId: number; roll: number; petrified: boolean }[] = [];
        for (const m of state.party) {
          if (m.status !== 0 && m.status !== 1) continue;
          const r = rollDie(state.seed);
          state.seed = r.seed;
          const petrified = r.value <= 2; // a 1 or 2 turns that creature to stone (§Medusa)
          if (petrified) {
            m.status = 2; m.stoneArea = state.partyArea; // left as stone in this chamber
            // Turn-to-stone affects only the living flesh (plan ④a): the member's CARRIED items drop
            // onto the chamber floor to be picked up like any find ("anything they were carrying can be
            // taken from them", §Medusa); a BORNE Sword/Staff/Ring is petrified with the body and only
            // returns when the member is revived. The party can't cart a stone comrade's goods away.
            const items = spillCarried(m);
            if (items.length) {
              state.treasures.push(...items);
              events.push({ type: "itemsSpilled", creatureId: m.creatureId, items });
            }
          }
          rolls.push({ creatureId: m.creatureId, roll: r.value, petrified });
        }
        if (rolls.length) events.push({ type: "medusaGaze", rolls });
        break;
      }
      case HAZARD_GHOULS: {
        // The attack forces everyone to drop heavy treasure to fight; it lands on the chamber floor,
        // visible and reclaimable at the end of the turn (§Ghouls). `ALL_TREASURES` (base + kit,
        // SC-EXT-2) — a kit heavy treasure (Crypt/Gems 21, Idol 18) would otherwise crash this
        // lookup against the base-only `TREASURES` table.
        for (const m of state.party) {
          if (m.status !== 0 && m.status !== 1) continue;
          const heavy = m.treasure.filter((t) => ALL_TREASURES[t]!.kind === "heavy");
          if (heavy.length) {
            m.treasure = m.treasure.filter((t) => ALL_TREASURES[t]!.kind !== "heavy");
            state.treasures.push(...heavy);
          }
        }
        // Each creature fights the ghouls (strength 2) in the normal way — full fighting strength
        // (Magic Sword / Strength Potion count), no surprise. A lost match removes that member.
        for (const m of state.party) {
          if (m.status !== 0 && m.status !== 1) continue;
          const ours = rollDie(state.seed); state.seed = ours.seed;
          const theirs = rollDie(state.seed); state.seed = theirs.seed;
          const partyTotal = frontStrength(m, state) + ours.value, enemyTotal = 2 + theirs.value;
          events.push({
            type: "combatRoll", party: CREATURES[m.creatureId]!.name, enemy: "Ghouls",
            partyRoll: ours.value, enemyRoll: theirs.value, partyTotal, enemyTotal,
            result: partyTotal > enemyTotal ? "partyWon" : enemyTotal > partyTotal ? "enemyWon" : "tie",
          });
          if (enemyTotal > partyTotal) {
            // The Ring makes its bearer immune to a killing die-roll at level >= 4 (negated by the Eye) — §Ring.
            if (ringInvincible(m, state)) events.push({ type: "deathPrevented", creatureId: m.creatureId });
            else { m.status = 3; events.push(...eyeForsakenByDeath(state, m)); }
          }
        }
        // The ghoul-slain spill their carried artifacts onto the floor with the dropped heavy treasure
        // ("this may be picked up at the end of the turn", §Ghouls); borne items are lost with the body.
        events.push(...sweepFallen(state, "working"));
        break;
      }
      case HAZARD_MUTINY: {
        const allies = state.party.filter((m) => m.status === 1);
        const originals = state.party.filter((m) => m.status === 0);
        // All allies desert; if the party is now ALL allies, one stays loyal (spec §Mutiny).
        const desert = originals.length === 0 ? allies.slice(1) : allies;
        const dropped: number[] = [];
        for (const a of desert) {
          state.strangers.push(a.creatureId); // revert to a stranger (retestable)
          dropped.push(...a.treasure);        // and drop their loot back into the chamber
        }
        state.treasures.push(...dropped);
        state.party = state.party.filter((m) => !desert.includes(m));
        if (desert.length > 0) {
          events.push({ type: "mutinied", deserters: desert.map((a) => a.creatureId), treasures: dropped });
        }
        break;
      }
      case HAZARD_TRAP: {
        const hasDwarf = living(state).some((m) => (CREATURES[m.creatureId]!.flags & FLAG_GUIDES_PAST_TRAP) !== 0);
        if (hasDwarf) events.push({ type: "trapAvoided" }); // the dwarf guides the party past it
        else fell = true;                                   // otherwise the party drops a level
        break;
      }
      case HAZARD_DESERTION: {
        // Extension kit (SC-EXT-14, design US-09): one visible d6 per ALLY (status 1), in roster
        // order — original (status 0) members never roll. A Wolf ally (creature 20) is immune and
        // simply skipped, with its own notice, rather than rolling (design US-18). A roll of 1-2
        // removes the ally from the game OUTRIGHT, with everything carried (borne or merely
        // carried alike) — Bell Rope's roll-1 "vanish" is the precedent (reduce.ts): not dropped to
        // the floor, not revivable, and no `memberDied` fires. Deserters are collected by reference
        // and filtered out in one pass afterward (Mutiny's own removal pattern, above) rather than
        // spliced one at a time, since splicing mid-loop would shift the roster-order indices of the
        // allies still to roll.
        const allies = state.party.filter((m) => m.status === 1);
        const deserted: PartyMember[] = [];
        for (const a of allies) {
          if (a.creatureId === C_WOLF) { events.push({ type: "wolfUnmoved" }); continue; }
          const r = rollDie(state.seed); state.seed = r.seed;
          const leaves = r.value <= 2;
          // `[...a.treasure]` snapshots what the ally is carrying at roll time (design US-09
          // Feedback: "taking [treasure list]") — taken BEFORE any removal, so it reflects exactly
          // what leaves with them; harmless to compute even when they stay (`deserted: false`).
          events.push({ type: "desertionRoll", creatureId: a.creatureId, roll: r.value, deserted: leaves, items: [...a.treasure] });
          if (leaves) deserted.push(a);
        }
        if (deserted.length > 0) state.party = state.party.filter((m) => !deserted.includes(m));
        break;
      }
    }
  }
  // Medusa & Ghouls LURK in the chamber — re-parked into the area's contents so they reload and fire
  // again on every re-entry (§Medusa, §Ghouls). (Earthquake's scar is laid on the tile it collapsed,
  // handled in its case above.)
  const here = state.areas[state.partyArea];
  if (here) {
    for (const hz of state.hazards) {
      if ((hz === HAZARD_MEDUSA || hz === HAZARD_GHOULS) && !here.contents.includes(300 + hz)) {
        here.contents.push(300 + hz);
      }
    }
  }
  state.hazards = [];
  return { events, fell };
}
