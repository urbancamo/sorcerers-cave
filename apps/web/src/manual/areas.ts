import { p, note, cards } from './blocks';
import type { Section } from './types';

// Manual §IV Special Areas, plus the Extension Kit's six special areas (§XIII).
export const AREAS: Section = {
  id: 'special', numeral: 'IV', title: 'Special Areas',
  topics: [
    { id: 'area-gateway', title: 'The Gateway', cards: cards('area', 'The Gateway'), blocks: [
      p('Where you enter — and the way out. Any stairway up from level 1 leaves the cave for good.'),
    ] },
    { id: 'area-deep-pool', title: 'The Deep Pool', cards: cards('area', 'Deep Pool'), blocks: [
      p('To cross, heavy treasure is dropped into the water (recoverable on the way back) unless a **Giant** carries it across.'),
    ] },
    { id: 'area-viper-pit', title: 'The Viper Pit', cards: cards('area', 'Viper Pit'), blocks: [
      p('Cross the narrow ledge and a careless step can pitch a member — and their treasure — into the snakes. Arriving by stair or trap lands you safely on the island.'),
      p('Holding the **Charmed Flute** lulls the Vipers so the party crosses unharmed.'),
    ] },
    { id: 'area-tomb', title: 'Tomb of Kings', cards: cards('area', 'Tomb of Kings'), blocks: [
      p('Draw **one extra card** on entry.'),
    ] },
    { id: 'area-great-hall', title: 'The Great Hall', cards: cards('area', 'Great Hall'), blocks: [
      p('Draw **two extra cards** on entry — rich, and dangerous.'),
    ] },
    { id: 'area-chamber', title: 'Chambers and tunnels', cards: cards('area', 'Chamber', 'Tunnel'), blocks: [
      p('The first time you enter a **chamber** you draw small cards onto its floor, and the deeper you are the more the cave throws at you: 1 card on level 1, 2 on level 2, 3 on level 3, 4 on level 4 and deeper.'),
      p('A doorway only leads somewhere if its edge matches the area beyond it. If it does not, you have found a **dead end**: that exit closes, but you may try another.'),
    ] },
    { id: 'area-whirlpool', title: 'The Whirlpool', variant: 'kit', cards: cards('area', 'The Whirlpool'), blocks: [
      p('Enters like an ordinary chamber. Leave by any doorway but the one you came in by and the shallows roll a d6: **1–2** drags the party down a level; **3–6** and the crossing is safe.'),
      p('You wade one ledge at a time: if the doorway you try turns out to be a dead end, you still make the crossing roll, and on a 3–6 you end up on that ledge (the dead end now revealed), from where you can wade on in a separate move.'),
      p('No stairway can lead into a Whirlpool. Take one that would, and the party finds only a high balcony in the rock — a dead end with a view of the Whirlpool below — and can only retrace its steps.'),
    ] },
    { id: 'area-chasm', title: 'The Chasm', variant: 'kit', cards: cards('area', 'The Chasm'), blocks: [
      p('A one-way plunge on demand — no roll needed. You cannot walk across it: from the way you came in you may only plunge down or step back out by that same way.'),
      p('Descend it any turn, in or out of an encounter; any strangers or treasure waiting there are left parked for later. It never dries up.'),
    ] },
    { id: 'area-well', title: 'The Well', variant: 'kit', cards: cards('area', 'The Well'), blocks: [
      p('Draw **one extra small card** straight into the chamber — no move required. Legal any turn, as many times as the small pack allows.'),
    ] },
    { id: 'area-bell-rope', title: 'The Bell Rope', variant: 'kit', cards: cards('area', 'The Bell Rope'), blocks: [
      p('Pull it once per visit and a d6 decides the toll: a **1** spirits the puller away for good, with everything they carried; **2–3** is nothing but an eerie sound; **4–6** draws two cards at once.'),
    ] },
    { id: 'area-gallery', title: 'The Gallery', variant: 'kit', cards: cards('area', 'The Gallery'), blocks: [
      p('Every creature drawn here on a fresh visit arrives as a **stone statue**, not a living stranger — free to loot around, no fight.'),
      p('A Wizard bearing the **Magic Staff** cracks the whole room awake at a glance; **Holy Water** wakes a single statue (with a reaction roll of its own).'),
    ] },
    { id: 'area-lair', title: 'The Lair', variant: 'kit', cards: cards('area', 'The Lair'), blocks: [
      p('An unremarkable chamber on its own — until **Harpies** come calling. Once placed and entered, it is the one address their stolen hoard is ever delivered to.'),
    ] },
    { id: 'area-secret-door', title: 'Secret doors', cards: cards('area', '*'), blocks: [
      note('info', 'Stairways', 'When you descend onto a chamber that shows no stair up — or climb onto one with no stair down — your party learns of a **secret door** there and can use it to retrace their steps. Each is marked with a lettered door card (A, B, C…) in the order you find them.'),
      note('info', 'Multiplayer', 'Secret-door knowledge is personal in a shared cave: you may use a hidden stair only once your party has used it or watched a party standing with you use it — or if you hold the Charmed Flute.'),
    ] },
  ],
};
