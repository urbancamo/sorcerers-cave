import {
  ALL_CREATURES, HW_STATUE_BASE, STAFF_WAKE_ALL, HW_MEDUSA, HW_STRANGER_BASE, HW_PARKED_STATUE_BASE, type GameState,
} from "@sorcerers-cave/engine";

/**
 * Name a Holy Water (artifact 16) `useArtifact` target, decoding the five-pool offset encoding
 * (SC-EXT-24, design US-20): REVIVE targets a stone party member by its plain party index; WAKE
 * targets a Gallery statue at `HW_STATUE_BASE + index into state.statues` (live, mid-resolution) OR
 * `HW_PARKED_STATUE_BASE + index into the current area's contents` (already settled onto the tile,
 * bug fix 2026-08-09); the singleton `HW_MEDUSA` destroys the area's lurking Medusa marker;
 * DESTROY/WEAKEN target a stranger at `HW_STRANGER_BASE + index into state.strangers`. Every panel
 * that can legally offer a Holy Water target (ExplorePanel/EncounterPanel/FightSurface —
 * `holyWaterTargets`, effects.ts, is offered across explore/pickup/encounter/fight) must decode
 * through this SAME function, or an offset target gets misread as a plain party/stranger index —
 * e.g. `state.party[3000 + i]`, which is `undefined` and crashes on the read that follows. Checked
 * highest-base-first since these are open-ended `>=` ranges, not exact matches.
 */
export function holyWaterTargetName(state: GameState, target: number, memberLabelOf: (mi: number) => string): string {
  if (target === HW_MEDUSA) return "Medusa";
  if (target >= HW_PARKED_STATUE_BASE) {
    const code = state.areas[state.partyArea]?.contents[target - HW_PARKED_STATUE_BASE];
    return ALL_CREATURES[(code ?? -500) - 500]?.name ?? "the statue";
  }
  if (target >= HW_STRANGER_BASE) return ALL_CREATURES[state.strangers[target - HW_STRANGER_BASE]!]?.name ?? "the stranger";
  if (target >= HW_STATUE_BASE) return ALL_CREATURES[(state.statues ?? [])[target - HW_STATUE_BASE]!]?.name ?? "the statue";
  return memberLabelOf(target);
}

/**
 * What a Magic Staff (artifact 9) `useArtifact` target does, in words (SC-EXT-11, issue #105): a plain party index frees that stone
 * member; `STAFF_WAKE_ALL` wakes every Gallery statue here at once; any other offset target wakes that one statue (the same
 * numeric ranges Holy Water uses, so the statue is named by the same decoder). Shared by the item menu and the encounter panel.
 */
export function staffTargetPhrase(state: GameState, target: number, memberLabelOf: (mi: number) => string): string {
  if (target === STAFF_WAKE_ALL) return "wake every stone figure here";
  if (target >= HW_STATUE_BASE) return `wake the stone ${holyWaterTargetName(state, target, memberLabelOf)}`;
  return `free ${memberLabelOf(target)} from stone`;
}
