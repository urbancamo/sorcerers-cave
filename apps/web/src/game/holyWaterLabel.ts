import { ALL_CREATURES, HW_STATUE_BASE, HW_MEDUSA, HW_STRANGER_BASE, type GameState } from "@sorcerers-cave/engine";

/**
 * Name a Holy Water (artifact 16) `useArtifact` target, decoding the four-pool offset encoding
 * (SC-EXT-24, design US-20): REVIVE targets a stone party member by its plain party index; WAKE
 * targets a Gallery statue at `HW_STATUE_BASE + index into state.statues`; the singleton
 * `HW_MEDUSA` destroys the area's lurking Medusa marker; DESTROY/WEAKEN target a stranger at
 * `HW_STRANGER_BASE + index into state.strangers`. Every panel that can legally offer a Holy
 * Water target (ExplorePanel/EncounterPanel/FightSurface — `holyWaterTargets`, effects.ts, is
 * offered across explore/pickup/encounter/fight) must decode through this SAME function, or an
 * offset target gets misread as a plain party/stranger index — e.g. `state.party[3000 + i]`,
 * which is `undefined` and crashes on the read that follows.
 */
export function holyWaterTargetName(state: GameState, target: number, memberLabelOf: (mi: number) => string): string {
  if (target === HW_MEDUSA) return "Medusa";
  if (target >= HW_STRANGER_BASE) return ALL_CREATURES[state.strangers[target - HW_STRANGER_BASE]!]?.name ?? "the stranger";
  if (target >= HW_STATUE_BASE) return ALL_CREATURES[(state.statues ?? [])[target - HW_STATUE_BASE]!]?.name ?? "the statue";
  return memberLabelOf(target);
}
