import { ALL_CREATURES as CREATURES } from "./data/creatures";
import { carriedWeight } from "./pickup";
import type { GameState, PartyMember } from "./state";
import type { GameEvent } from "./actions";
import { decodeOpen } from "./decode";
import { SPECIAL_DEEP_POOL } from "./data/areaCards";

// Sharing the Treasure Chest (rules: "Two or more creatures may join in carrying it"). docs/requirements/sharing-the-treasure-chest-load/plan.md
// A shared chest is a group of shares held on the members (`PartyMember.chestShares`), never in a `treasure` list: each share is a multiple of
// 25 kg (the lightest treasure), a group sums to the chest's 100 kg, and every bearer is alive. When any bearer is lost the whole chest is dropped.

export const CHEST = 14;
export const CHEST_KG = 100;
export const SHARE_UNIT = 25;

export const isAliveMember = (m: PartyMember | undefined): m is PartyMember => !!m && (m.status === 0 || m.status === 1);

/** Every shared-chest group id in the party, ascending. */
export function chestGroups(state: GameState): number[] {
  const ids = new Set<number>();
  for (const m of state.party) for (const s of m.chestShares ?? []) ids.add(s.chest);
  return [...ids].sort((a, b) => a - b);
}

/** A fresh group id: one past any in the party's shares or the fight-drop memory (derived, so it needs no counter that a composed multiplayer view could lose). */
export function nextChestId(state: GameState): number {
  let top = 0;
  for (const m of state.party) for (const s of m.chestShares ?? []) top = Math.max(top, s.chest);
  for (const d of state.fightDrops ?? []) top = Math.max(top, d.chest ?? 0);
  return top + 1;
}

/** The bearers of shared chest `chest`: party index and kg. */
export function chestBearers(state: GameState, chest: number): { mi: number; kg: number }[] {
  const out: { mi: number; kg: number }[] = [];
  state.party.forEach((m, mi) => { for (const s of m.chestShares ?? []) if (s.chest === chest) out.push({ mi, kg: s.kg }); });
  return out;
}

/** Can `member` take a further `kg` of heavy load without passing its carry capacity? */
export const canBear = (member: PartyMember, kg: number): boolean => carriedWeight(member) + kg <= CREATURES[member.creatureId]!.carry;

/** Is a proposed split of one chest legal? `without` gives each bearer's load excluding this chest, so a re-split is checked against what they carry otherwise. */
export function sharesProblem(state: GameState, shares: { mi: number; kg: number }[], without: (m: PartyMember, mi: number) => number): string | null {
  if (shares.length === 0) return "noBearers";
  if (new Set(shares.map((s) => s.mi)).size !== shares.length) return "duplicateBearer";
  let total = 0;
  for (const s of shares) {
    const m = state.party[s.mi];
    if (!isAliveMember(m)) return "badBearer";
    if (!Number.isInteger(s.kg) || s.kg < SHARE_UNIT || s.kg % SHARE_UNIT !== 0) return "badShare";
    if (without(m, s.mi) + s.kg > CREATURES[m.creatureId]!.carry) return "overCapacity";
    total += s.kg;
  }
  return total === CHEST_KG ? null : "badTotal";
}

/** Remove a shared chest's shares from every bearer, returning who bore what. */
export function takeShares(state: GameState, chest: number): { mi: number; kg: number }[] {
  const was = chestBearers(state, chest);
  for (const { mi } of was) {
    const m = state.party[mi]!;
    m.chestShares = (m.chestShares ?? []).filter((s) => s.chest !== chest);
    if (m.chestShares.length === 0) delete m.chestShares;
  }
  return was;
}

/** Put the chest down: every bearer's share goes and one chest lands on the floor (`working` = the live pickup floor, `contents` = left on the area
 *  card as dropped treasure, 200 + id, which a won fight reclaims). Returns who bore what, for the fight-drop memory. */
export function dropSharedChest(state: GameState, chest: number, dest: "working" | "contents"): { mi: number; kg: number }[] {
  const was = takeShares(state, chest);
  if (dest === "working") state.treasures.push(CHEST);
  else state.areas[state.partyArea]!.contents.push(200 + CHEST);
  return was;
}

/** A fighter sets down the shared chests it bears: the whole chest goes to the floor, and each bearer's share is remembered for the retake. */
export function dropSharedChestsForFight(state: GameState, mi: number, record: boolean): void {
  for (const s of [...(state.party[mi]?.chestShares ?? [])]) {
    const was = dropSharedChest(state, s.chest, "contents");
    if (record) state.fightDrops = [...(state.fightDrops ?? []), ...was.map((b) => ({ mi: b.mi, tid: CHEST, kg: b.kg, chest: s.chest }))];
  }
}

/** Housekeeping after any action: a shared chest whose bearer is gone, fallen or turned to stone (or whose shares no longer add up) is dropped whole.
 *  One place catches every way a member can leave, rather than each of them knowing about chests. */
export function settleSharedChests(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const chest of chestGroups(state)) {
    const bearers = chestBearers(state, chest);
    const sum = bearers.reduce((a, b) => a + b.kg, 0);
    if (bearers.length >= 2 && sum === CHEST_KG && bearers.every((b) => isAliveMember(state.party[b.mi]))) continue;
    dropSharedChest(state, chest, state.phase === "pickup" ? "working" : "contents");
    events.push({ type: "chestDropped" });
  }
  return events;
}

/** The dropped shared chests in the fight-drop memory, by group: who bore what. */
export function droppedChestGroups(state: GameState): Map<number, { mi: number; kg: number }[]> {
  const groups = new Map<number, { mi: number; kg: number }[]>();
  for (const d of state.fightDrops ?? []) if (d.chest !== undefined && d.kg !== undefined) groups.set(d.chest, [...(groups.get(d.chest) ?? []), { mi: d.mi, kg: d.kg }]);
  return groups;
}

/** Can a dropped shared chest be picked up again as it was: still on the floor, and every bearer alive and able to carry their share once more? */
export const chestRetakeable = (state: GameState, bearers: { mi: number; kg: number }[]): boolean =>
  state.treasures.includes(CHEST) && bearers.every((b) => { const m = state.party[b.mi]; return isAliveMember(m) && canBear(m, b.kg); });

/** Could the living party, between them, bear the whole Chest lying in the pickup (each in 25 kg shares, a Deep Pool's only Giants)? Lets the UI keep a pickup open that nobody could take alone. */
export function chestShareable(state: GameState): boolean {
  if (state.phase !== "pickup" || !state.treasures.includes(CHEST)) return false;
  const giantsOnly = decodeOpen(state.areas[state.partyArea]!).special === SPECIAL_DEEP_POOL;
  let room = 0;
  for (const m of state.party) {
    if (!isAliveMember(m) || (giantsOnly && m.creatureId !== 12)) continue;
    const free = CREATURES[m.creatureId]!.carry - carriedWeight(m);
    if (free >= SHARE_UNIT) room += Math.floor(free / SHARE_UNIT) * SHARE_UNIT;
  }
  return room >= CHEST_KG;
}
