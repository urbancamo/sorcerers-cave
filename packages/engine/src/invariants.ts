import { ALL_CREATURES } from "./data/creatures";
import { ALL_TREASURES } from "./data/treasures";
import { smallPackExtension, smallPackSibyl, smallPackTemplate } from "./data/smallPack";
import { unpackCoord } from "./coords";
import { GS_PLAYING, type GameState, type PartyMember } from "./state";

// Engine rules validation, pilot (docs/requirements/engine-rules-validation/plan.md): a pure checker for the conditions that must hold in
// EVERY reachable state, whatever the rules of the moment. It is the oracle of the invariant soak (`invariants.soak.ts`) and is tested
// against deliberately corrupted states (`invariants.test.ts`) so a silent checker cannot pass. Returns one message per violation;
// empty means the state is sound. It states only things the book or the data model guarantee — a message from here is a bug or a wrong
// invariant, and either way worth a look.
const living = (m: PartyMember) => m.status === 0 || m.status === 1;
const weightOf = (m: PartyMember) => m.treasure.reduce((n, t) => n + (ALL_TREASURES[t]?.weight ?? 0), 0);

export function checkInvariants(s: GameState): string[] {
  const bad: string[] = [];
  const need = (ok: boolean, msg: string) => { if (!ok) bad.push(msg); };

  // The party: legal creatures, statuses and treasure, and nothing carried that the book says it could not be.
  s.party.forEach((m, i) => {
    need(Number.isInteger(m.status) && m.status >= 0 && m.status <= 3, `party[${i}] has status ${m.status}`);
    need(!!ALL_CREATURES[m.creatureId], `party[${i}] is creature ${m.creatureId}, which does not exist`);
    need(Number.isInteger(m.dragonKills) && m.dragonKills >= 0, `party[${i}] has dragonKills ${m.dragonKills}`);
    for (const t of m.treasure) need(Number.isInteger(t) && !!ALL_TREASURES[t], `party[${i}] carries treasure ${t}, which does not exist`);
    // A fallen member's `borne` list is not cleared when it dies (its treasure is spilled or lost); nothing reads it, so only the living are held to it.
    if (living(m)) for (const t of m.borne ?? []) need(m.treasure.includes(t), `party[${i}] has ${t} in use but is not carrying it`);
    if (living(m) && ALL_CREATURES[m.creatureId]) {
      need(weightOf(m) <= ALL_CREATURES[m.creatureId]!.carry, `party[${i}] (${ALL_CREATURES[m.creatureId]!.name}) carries ${weightOf(m)} kg, over its ${ALL_CREATURES[m.creatureId]!.carry}`);
    }
    if (m.status === 2) need(m.stoneArea !== undefined && m.stoneArea >= 0 && m.stoneArea < s.areas.length, `party[${i}] is stone but not in a valid area (${m.stoneArea})`);
  });

  // The map and the party's place on it.
  for (const [name, idx] of [["partyArea", s.partyArea], ["prev", s.prev], ["prev2", s.prev2]] as const) {
    need(Number.isInteger(idx) && idx >= 0 && idx < s.areas.length, `${name} ${idx} is not an area (there are ${s.areas.length})`);
  }
  const here = s.areas[s.partyArea];
  if (here) need(unpackCoord(here.coord).level === s.level, `the party is on level ${s.level} but its area is on level ${unpackCoord(here.coord).level}`);
  need(new Set(s.areas.map((a) => a.coord)).size === s.areas.length, "two areas share a map cell");

  // The packs: cursors inside their packs, and no treasure card in play more often than the pack holds it.
  need(s.smallIdx >= 0 && s.smallIdx <= s.smallPack.length, `smallIdx ${s.smallIdx} is outside the small pack (${s.smallPack.length})`);
  need(s.largeIdx >= 0 && s.largeIdx <= s.largePack.length, `largeIdx ${s.largeIdx} is outside the large pack (${s.largePack.length})`);
  const stock = new Map<number, number>();
  let template = smallPackTemplate();
  if (s.variants?.extensionKit) template = template.concat(smallPackExtension());
  if (s.variants?.sibyl) template = template.concat(smallPackSibyl());
  for (const code of template) if (code >= 200 && code < 300) stock.set(code - 200, (stock.get(code - 200) ?? 0) + 1);
  const seen = new Map<number, number>();
  const see = (t: number) => seen.set(t, (seen.get(t) ?? 0) + 1);
  for (const m of s.party) m.treasure.forEach(see);
  s.treasures.forEach(see);
  for (const a of s.areas) {
    for (const c of a.contents) if (c >= 200 && c < 300) see(c - 200);
    (a.dropped ?? []).forEach(see);
    for (const sunk of a.sunkTreasure ?? []) sunk.items.forEach(see);
  }
  for (const [t, n] of seen) need(n <= (stock.get(t) ?? 0), `treasure ${t} (${ALL_TREASURES[t]?.name}) appears ${n} times in play; the pack holds ${stock.get(t) ?? 0}`);

  // Where the game stands.
  need(Number.isInteger(s.curses) && s.curses >= 0, `curses is ${s.curses}`);
  need((s.gs === GS_PLAYING) === (s.phase !== "gameOver"), `gs ${s.gs} and phase "${s.phase}" disagree about whether the game is over`);
  if (s.gs === GS_PLAYING) need(s.party.some(living), "the game is still on but no member of the party is alive");
  // R-07/R-10: a party with allies but no original member picks a leader at once; it only stays that way inside a fight, a pause or the end.
  if (s.gs === GS_PLAYING && !("seat" in s) && !["fight", "leader", "quarrel", "trap", "medusa"].includes(s.phase)) {
    need(s.party.some((m) => m.status === 0) || !s.party.some((m) => m.status === 1), "the party has allies but no original member, and no leader is being chosen");
  }
  if (s.phase === "fight") need(s.fight !== null && s.fight !== undefined, 'phase is "fight" but there is no fight');
  return bad;
}
