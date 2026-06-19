import type { PlanMatch } from "@sorcerers-cave/engine";

export type Role = "front" | "backer";

/** The in-progress pairing: for each engaged stranger, the front fighters and backing casters.
 *  One stranger per match — the engine forms the strangers' strongest combination when out-numbered. */
export interface PlanDraft {
  byStranger: Record<number, { front: number[]; backers: number[] }>;
}

export const emptyDraft = (): PlanDraft => ({ byStranger: {} });

/** Which stranger (if any) a party member is currently assigned to. */
export function strangerOf(draft: PlanDraft, memberIdx: number): number | null {
  for (const [s, g] of Object.entries(draft.byStranger)) {
    if (g.front.includes(memberIdx) || g.backers.includes(memberIdx)) return Number(s);
  }
  return null;
}

/** Remove a member from every match (immutably). */
export function unplace(draft: PlanDraft, memberIdx: number): PlanDraft {
  const byStranger: PlanDraft["byStranger"] = {};
  for (const [s, g] of Object.entries(draft.byStranger)) {
    byStranger[Number(s)] = {
      front: g.front.filter((i) => i !== memberIdx),
      backers: g.backers.filter((i) => i !== memberIdx),
    };
  }
  return { byStranger };
}

/** Assign a member to a stranger as front (max 2) or backer; moves it off any prior match. */
export function place(draft: PlanDraft, memberIdx: number, strangerIdx: number, role: Role): PlanDraft {
  const moved = unplace(draft, memberIdx);
  const g = moved.byStranger[strangerIdx] ?? { front: [], backers: [] };
  const next = { front: [...g.front], backers: [...g.backers] };
  if (role === "front") {
    if (next.front.length >= 2 || next.front.includes(memberIdx)) return draft; // 2-v-1 cap → no-op
    next.front.push(memberIdx);
  } else {
    if (next.backers.includes(memberIdx)) return draft;
    next.backers.push(memberIdx);
  }
  return { byStranger: { ...moved.byStranger, [strangerIdx]: next } };
}

/** Serialize to the engine's BattlePlan matches. A match is kept once it has any fighter OR a backing
 *  caster, so a caster dropped behind a foe shows immediately (the plan is then invalid until a front
 *  fighter joins — validatePlan reports "needs a front fighter" — but the placement is visible). */
export function toMatches(draft: PlanDraft): PlanMatch[] {
  return Object.entries(draft.byStranger)
    .filter(([, g]) => g.front.length > 0 || g.backers.length > 0)
    .map(([s, g]) => ({ front: [...g.front], backers: [...g.backers], strangers: [Number(s)] }));
}

/** Living member indices not yet assigned anywhere (the tray). */
export function freeMembers(draft: PlanDraft, livingIdxs: number[]): number[] {
  return livingIdxs.filter((i) => strangerOf(draft, i) === null);
}
