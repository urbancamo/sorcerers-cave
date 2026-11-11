import { p, list, note } from './blocks';
import type { Section } from './types';

// Manual §II Building Your Party, and the Extension Kit and Sibyl switches that sit on the party screen (§XIII, §XIV).
export const PARTY: Section = {
  id: 'party', numeral: 'II', title: 'Building Your Party',
  topics: [
    { id: 'party-leader', title: 'A new leader', brief: 'When the last original member falls, you choose which ally leads on.', cards: [], screens: ['explore'], blocks: [
      p('The party is led by its original adventurers. If the last of them is lost — killed, turned to stone, or gone through Desertion or Mutiny — you are asked to **choose a new leader** from the allies who remain. If only one ally is left, that ally simply takes the lead.'),
      p('The new leader counts as an **original** member from then on, no longer an ally: Desertion and Mutiny cannot touch them.'),
    ] },
    { id: 'party-budget', title: 'Your party and its budget', brief: 'Spend up to 6 selection points on your expedition before you enter.', cards: [], screens: ['party-select'], blocks: [
      p('Spend up to **6 selection points** recruiting your expedition before you enter. Each creature costs points to recruit and is worth points if it survives the cave. Stronger, more valuable creatures cost more, so a typical party is a careful mix — muscle to fight, backs to carry treasure, and a specialist or two.'),
      p('You may take up to twelve members, but the 6-point budget is the real limit. Carrying capacity matters: an Ogre or a Giant can haul far more treasure home than a Dwarf.'),
      list(
        '**Charisma** (Hero, Woman Hero) adds **+1** to every reaction roll, making strangers friendlier.',
        'A **Dwarf** can steer the party around a single trap.',
        'A **Priest** contributes *magical power* in fights even while standing safely behind the front line.',
      ),
      p('Click a creature\'s card to read about it. Pick a **party colour** for your markers, then descend.'),
      note('info', 'Tips', 'Bring a strong back (Ogre, Troll) — treasure left behind scores nothing. A Woman or Woman Hero is the key to a Unicorn.'),
    ] },
    { id: 'kit-overview', title: 'The Extension Kit', variant: 'kit', brief: 'Adds 30 tiles and 30 cards, five new recruits and new artefacts; scores go in their own tables.', cards: [], screens: ['party-select'], blocks: [
      p('An optional expansion: six new special areas, four new hazards, five new recruits (plus two you will only ever meet), and new artefacts and treasures.'),
      p('Tick the **Extension kit** box before you set out — solo, or as the host in a multiplayer lobby — and the decks grow by 30 tiles and 30 small cards for that game only. Leave it unticked and none of it applies.'),
      list(
        'Five new creatures join the roster: the **Witch**, **Scholar**, **Thief**, **Lion** and **Wolf**.',
        'The Woman and Dwarf stocks rise from 3 to 4. (The **Ogre** costs 4 and the **Troll** 3 in every game.)',
        'Switching the kit keeps the picks you have made; only kit-only creatures are dropped when it goes off, and costs and stock update.',
        'Scores for kit games go in their own high-score tables.',
      ),
    ] },
    { id: 'sibyl-overview', title: 'The Sibyl', variant: 'sibyl', brief: 'Adds an optional seer who never fights and shows you what lies hidden.', cards: [], screens: ['party-select'], blocks: [
      p('Tick the **Sibyl** box and one extra card, the Sibyl, is shuffled into the small pack for that game. Leave it unticked and nothing about her applies.'),
      p('She is met only after a chamber\'s other strangers are dealt with, and joins you on a roll of 5–6. She cannot fight, carry or be harmed, and while she travels with you she can show you the top of the area pack or a face-down tile. Like the Extension Kit she changes the game\'s results, so scores for Sibyl games go in their own tables.'),
    ] },
  ],
};
