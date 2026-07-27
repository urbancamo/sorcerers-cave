import { rollDie } from "./rng";
// Extension kit (SC-EXT-17): aliases `ALL_CREATURES` — the Ghouls combat-roll name and the Trap
// Dwarf-flag check both index by a living party member's `creatureId`, so a kit ally (id 14-20)
// no longer crashes them; byte-identical for ids 0-13.
import { ALL_CREATURES as CREATURES, FLAG_GUIDES_PAST_TRAP } from "./data/creatures";
import { ALL_TREASURES } from "./data/treasures";
import {
  HAZARD_MUTINY, HAZARD_TRAP, HAZARD_EARTHQUAKE, HAZARD_MEDUSA, HAZARD_GHOULS, HAZARD_DESERTION,
  HAZARD_HARPIES, HAZARD_QUARREL, HAZARD_SPELL,
} from "./data/hazards";
import { SPECIAL_GATEWAY } from "./data/areaCards";
import { decodeArea } from "./decode";
import { AF_DESTROYED, AF_UNRESOLVED, type GameState, type PartyMember } from "./state";
import type { GameEvent } from "./actions";
import { frontStrength, partyRollBonus } from "./combat";
import { eyeForsakenByDeath, ringInvincible, usesArtifactsAs } from "./effects";
import { spillCarried, sweepFallen } from "./loot";
import { stashOrDeliver } from "./chamber";

const T_TALISMAN = 7;
const T_MAGIC_STAFF = 9;
const T_EYE_OF_GOD = 13; // extension-kit theft target — Harpies stealing it forsakes the party (design Resolved-8, SC-EXT-15)
const C_WIZARD = 8;
const C_WOLF = 20; // extension-kit creature — immune to Medusa/Mutiny/Desertion (design US-18, SC-EXT-14/18); also excluded from Quarrel (SC-EXT-16)
const C_LION = 16; // extension-kit creature — excluded from Quarrel's picker (design US-15, SC-EXT-16)

function living(state: GameState): PartyMember[] {
  return state.party.filter((m) => m.status === 0 || m.status === 1);
}

function livingHolds(state: GameState, treasureId: number): boolean {
  return living(state).some((m) => m.treasure.includes(treasureId));
}

/** Any living member holds ANY artifact (kind==="artifact", base or kit, SC-EXT-2) — Harpies' park
 *  condition is "the party has no artifacts" (design US-10, SC-EXT-15). */
function livingHasArtifacts(state: GameState): boolean {
  return living(state).some((m) => m.treasure.some((t) => ALL_TREASURES[t]?.kind === "artifact"));
}

/** A living Wizard (or the Apprentice, who "uses artifacts as a Wizard" — design US-14, SC-EXT-17)
 *  bearing the Magic Staff — makes Medusa powerless over the whole party, and cracks every Gallery
 *  statue awake on entry (card; SC-EXT-11). */
export function hasStaffWizard(state: GameState): boolean {
  return state.party.some((m) => (m.status === 0 || m.status === 1) && usesArtifactsAs(m.creatureId, C_WIZARD) && m.treasure.includes(T_MAGIC_STAFF));
}

/** Resolve every hazard in the working set, in priority order (spec §7.2). */
export function applyHazards(state: GameState): { events: GameEvent[]; fell: boolean } {
  const events: GameEvent[] = [];
  let fell = false;
  // Extension kit (SC-EXT-14/15/16/28): Desertion, Harpies, Quarrel and Spell are appended strictly
  // AFTER Trap, in that numeric order — a kit-off game's `hazards` working set can never contain ids
  // 5-8 (the base small pack has no such codes), so this extension is a no-op for the base game
  // (SC-EXT-1 byte-identity); when the kit is on and several fire together, they all resolve in this
  // same pass, before the trap's fall is handled by the caller.
  const order = [
    HAZARD_EARTHQUAKE, HAZARD_MEDUSA, HAZARD_GHOULS, HAZARD_MUTINY, HAZARD_TRAP,
    HAZARD_DESERTION, HAZARD_HARPIES, HAZARD_QUARREL, HAZARD_SPELL,
  ];
  // Harpies (SC-EXT-15) actually stole this pass — as opposed to parking — so it must NOT re-park
  // below (design US-10 "After firing, the card leaves the game (no re-park)"), unlike Medusa/Ghouls
  // which always lurk again whatever happened this visit. Set only inside the HAZARD_HARPIES switch
  // case (never on the park-and-`continue` branch below), so it exactly tracks that distinction.
  let harpiesFired = false;

  for (const hz of order) {
    if (!state.hazards.includes(hz)) continue;
    if (hz === HAZARD_GHOULS && livingHolds(state, T_TALISMAN)) { events.push({ type: "ghoulsWarded" }); continue; } // the Talisman wards off Ghouls (card)
    // Harpies parks (lurk-style) instead of striking when the party has no artifacts to steal, or
    // holds the Talisman (design US-10, SC-EXT-15) — checked, like Ghouls' ward above, BEFORE the
    // generic `hazardFired` push, so a parked visit reports only its own dedicated notice.
    if (hz === HAZARD_HARPIES && (!livingHasArtifacts(state) || livingHolds(state, T_TALISMAN))) {
      events.push({ type: "harpiesLurk" });
      continue;
    }
    // Quarrel needs two eligible combatants (living, non-Wolf, non-Lion) to have anyone to pair —
    // design US-11's "if fewer than 2 eligible members: no effect" fizzle, narrated distinctly and
    // skipping the generic `hazardFired` push, same shape as the checks above.
    if (hz === HAZARD_QUARREL) {
      const eligible = living(state).filter((m) => m.creatureId !== C_WOLF && m.creatureId !== C_LION);
      if (eligible.length < 2) { events.push({ type: "quarrelFizzled" }); continue; }
    }
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
          // Extension kit (SC-EXT-18, design US-18): a Wolf is immune to Medusa's gaze — simply
          // skipped, no roll, with its own visible notice, rather than folded into `rolls` below.
          if (m.creatureId === C_WOLF) { events.push({ type: "wolfUnmoved" }); continue; }
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
        // Extension kit (SC-EXT-18, design US-18): a Wolf ally is immune to Mutiny — excluded from
        // the desertion pool entirely (same "carve it out of the population first" shape as
        // Quarrel's eligible-combatant filter, SC-EXT-16), with its own visible notice. It also
        // doesn't count toward the "one stays loyal" pool below — it was never going to desert.
        const wolves = allies.filter((m) => m.creatureId === C_WOLF);
        for (const _w of wolves) events.push({ type: "wolfUnmoved" });
        const eligible = allies.filter((m) => m.creatureId !== C_WOLF);
        // All eligible allies desert; if the party is now ALL allies, one stays loyal (spec §Mutiny).
        const desert = originals.length === 0 ? eligible.slice(1) : eligible;
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
      case HAZARD_HARPIES: {
        // Reaches here only when the park condition above did NOT fire (design US-10, SC-EXT-15):
        // the party holds at least one artifact and no Talisman. Every living member's artifacts —
        // "carried AND borne, from every member" — leave outright: filtered off `treasure`, and off
        // `borne` too since a stolen Sword/Staff/Ring can't stay listed as borne once it's gone.
        harpiesFired = true;
        const stolen: number[] = [];
        let eyeStolen = false;
        for (const m of state.party) {
          if (m.status !== 0 && m.status !== 1) continue;
          const artifacts = m.treasure.filter((t) => ALL_TREASURES[t]?.kind === "artifact");
          if (artifacts.length === 0) continue;
          if (artifacts.includes(T_EYE_OF_GOD)) eyeStolen = true;
          m.treasure = m.treasure.filter((t) => !artifacts.includes(t));
          if (m.borne) m.borne = m.borne.filter((t) => !artifacts.includes(t));
          stolen.push(...artifacts);
        }
        // The Eye of God carried off by Harpies is forsaken exactly like a slain bearer's (design
        // Resolved-8) — `state.curses += 1`, the same mutation `eyeForsakenByDeath` makes — but NOT
        // its `eyeForsaken` event: the design mandates this theft's own explicit wording ("The Eye
        // of God is torn away — its curse descends upon you."), carried as `cursed` on `harpiesSteal`
        // below rather than a second, wrongly-worded event.
        const cursed = eyeStolen;
        if (cursed) state.curses += 1;
        // Lands on the Lair's floor if it's already placed, else queues in `harpyStash` until it is
        // (SC-EXT-12); `stashOrDeliver` emits its own `lairStash` exactly when it delivers, which is
        // how the presentation layer tells "toward their lair" from "a lair you have not yet found"
        // apart (design US-10 Feedback) without a redundant field on this event.
        stashOrDeliver(state, stolen, events);
        events.push({ type: "harpiesSteal", treasureIds: stolen, cursed });
        break;
      }
      case HAZARD_QUARREL: {
        // The two highest EFFECTIVE fs living members (Wolf/Lion excluded, checked as a fizzle
        // above) turn on each other for one round (design US-11, SC-EXT-16). `frontStrength` is the
        // same "total combat strength" fights use — fs + dragon-kills + a caster's mp + Magic Sword
        // bonus — so a Priest/Wizard's magic counts exactly as it would fighting a stranger. Ranking
        // by a stable sort over roster order gives "ties by roster order" for free: `state.party`'s
        // own order is preserved among equal-fs members.
        const ranked = state.party
          .filter((m) => (m.status === 0 || m.status === 1) && m.creatureId !== C_WOLF && m.creatureId !== C_LION)
          .map((m) => ({ m, fs: frontStrength(m, state) }))
          .sort((x, y) => y.fs - x.fs);
        const a = ranked[0]!, b = ranked[1]!; // >= 2 guaranteed by the fizzle check above
        const rollBonus = partyRollBonus(state); // Ring +1 / curse −1 — "the party's dice" (design build note)
        const ra = rollDie(state.seed); state.seed = ra.seed;
        const rb = rollDie(state.seed); state.seed = rb.seed;
        const aTotal = a.fs + ra.value + rollBonus;
        const bTotal = b.fs + rb.value + rollBonus;
        const loser = aTotal < bTotal ? a : bTotal < aTotal ? b : null;
        events.push({
          type: "quarrel", aId: a.m.creatureId, bId: b.m.creatureId,
          aRoll: ra.value, bRoll: rb.value, loserId: loser ? loser.m.creatureId : null,
        });
        if (loser) {
          // Normal death (design "lower total dies"): CARRIED items spill to the floor, Balm-
          // revivable — the Ring's usual immunity to a killing roll still applies (§ Ring).
          if (ringInvincible(loser.m, state)) {
            events.push({ type: "deathPrevented", creatureId: loser.m.creatureId });
          } else {
            loser.m.status = 3;
            // No `memberDied` here — the `quarrel` event above already carries its own dedicated
            // Feedback wording ("[loser] falls to [winner]'s fury."); Ghouls sets the precedent for
            // a hazard-specific death not doubling up on the generic notice. Curse check BEFORE the
            // spill below (review fix): spillCarried strips the (never-borneable) Eye of God out of
            // `treasure` first, which would otherwise mask eyeForsakenByDeath's own check — every
            // other death site (Ghouls' own case below; combatPlan.ts; special.ts; multi-fight.ts;
            // reduce.ts) already runs the curse check before stripping.
            events.push(...eyeForsakenByDeath(state, loser.m));
            const items = spillCarried(loser.m);
            if (items.length) { state.treasures.push(...items); events.push({ type: "itemsSpilled", creatureId: loser.m.creatureId, items }); }
          }
        }
        break;
      }
      case HAZARD_SPELL: {
        // Fires once on draw (design US-22, SC-EXT-28): only an un-destroyed, non-gateway TUNNEL
        // (not chamber) `prev` is eligible, and the large pack must have a card left to draw.
        const prevArea = state.areas[state.prev];
        const dec = prevArea ? decodeArea(prevArea.card) : undefined;
        const eligible = !!prevArea && state.prev !== state.partyArea
          && (prevArea.flags & AF_DESTROYED) === 0
          && !!dec && !dec.chamber && dec.special !== SPECIAL_GATEWAY
          && state.largeIdx < state.largePack.length;
        if (!eligible) { events.push({ type: "spellRemap", fizzled: true }); break; }
        // The old tunnel's card value splices into the middle of the REMAINING large pack (not the
        // whole array — cards already drawn stay put), so it can turn up again as a later draw.
        const oldValue = prevArea!.card;
        const remaining = state.largePack.length - state.largeIdx;
        const insertAt = state.largeIdx + Math.floor(remaining / 2);
        state.largePack.splice(insertAt, 0, oldValue);
        // The map cell is replaced by the NEXT card off the pack — a fresh `PlacedArea`, so the old
        // tile's `secretDoor`/`mirroredStairs` history is gone (design), `visited:false` so its real
        // first-visit resolution (a chamber draw, or just a tunnel) and any mirrored-stair treatment
        // happen normally the next time `tryMove`/`resolveArea` actually lands there — `AF_UNRESOLVED`
        // only tells the renderer to show it face-down until then.
        const drawn = state.largePack[state.largeIdx]!;
        state.largeIdx += 1;
        state.areas[state.prev] = {
          card: drawn, coord: prevArea!.coord, faceUp: true, visited: false,
          contents: [], flags: AF_UNRESOLVED, indiffCount: 0,
        };
        events.push({ type: "spellRemap", fizzled: false });
        break;
      }
    }
  }
  // Medusa & Ghouls LURK in the chamber — re-parked into the area's contents so they reload and fire
  // again on every re-entry (§Medusa, §Ghouls). (Earthquake's scar is laid on the tile it collapsed,
  // handled in its case above.) Harpies joins this LURK set (design US-10, SC-EXT-15) only for a
  // visit that PARKED rather than fired — `harpiesFired` is true only when it actually struck, and
  // the design is explicit that a struck Harpies card "leaves the game (no re-park)".
  const here = state.areas[state.partyArea];
  if (here) {
    for (const hz of state.hazards) {
      if ((hz === HAZARD_MEDUSA || hz === HAZARD_GHOULS) && !here.contents.includes(300 + hz)) {
        here.contents.push(300 + hz);
      }
      if (hz === HAZARD_HARPIES && !harpiesFired && !here.contents.includes(300 + hz)) {
        here.contents.push(300 + hz);
      }
    }
  }
  state.hazards = [];
  return { events, fell };
}
