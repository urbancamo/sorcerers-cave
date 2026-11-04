import { p, list, note } from './blocks';
import type { Section } from './types';

// Manual §I The Quest, §III Exploring the Cave and §XVI Quick Reference: how to play and how to read the screen.
export const PLAY: Section = {
  id: 'play', numeral: 'I', title: 'How to Play',
  topics: [
    { id: 'quest-overview', title: 'The Quest', brief: 'Lead a party down through the cave, gather treasure, and climb back out alive.', cards: [], screens: ['explore'], blocks: [
      p('Lead a band of adventurers down through a cave of many levels, gather what treasure you can, and climb back to the surface alive.'),
      p('The cave is built one card at a time as you explore. Behind every doorway may lie an empty tunnel, a chamber heavy with gold, a sleeping dragon, or a trap that drops you into the dark below. Nothing is fixed until you turn it over.'),
      p('Your **score** is the worth of everyone who walks back out into the daylight, plus the treasure they carry. A party wiped out underground scores nothing, so the art is knowing when to press deeper and when to turn for home.'),
    ] },
    { id: 'game-code', title: 'Your game code', brief: 'Four letters that take you straight back to this exact game.', cards: [], blocks: [
      note('good', 'Your game code', 'Every game is stamped with a unique **four-letter code**, shown in Settings. Entering it under *Resume a game* on the title screen drops you back into the same game, right where you left off. Progress is saved after every move, so you do **not** need to press *Save* first — the code works at any time, even mid-turn.'),
    ] },
    { id: 'controls', title: 'Controls', brief: 'Move with N E S W or the arrow keys, U and D for stairs, or click a glowing marker.', cards: [], screens: ['explore'], blocks: [
      list(
        '**N E S W** (or the arrow keys: ↑ North, → East, ↓ South, ← West) — move through a doorway.',
        '**U / D** — climb or descend a stairway.',
        '**Click a marker** — move that way.',
        '**Drag / scroll** — orbit and zoom the cave. *Snap* gives a clean overhead view, *Levels* focuses one floor, *Orbit* shows the whole cave.',
        '**Party / Inventory icons** — the party list, or the items the party carries. The ⤢ button on the Party heading widens the same list to show each member\'s card, printed strength, magic and charisma, and a total for those able to fight; ⤡ puts it back. The party list is open when the game begins, so you can see the party you chose; close it and it stays closed.',
        '**Click a map tile** — describe that area in the card panel; click the same tile (or card, party member or item) again to put the card away. Arriving at a special chamber (the Chasm, the Well, the Bell Rope and the like) shows it there for you, and the bar of choices along the bottom takes the chamber\'s name.',
        '**Card / Settings / Exit icons** — the card panel; game information with the Game log; and Exit, which saves the game or abandons the expedition.',
        '**Full screen icon** — fills the browser window; press it again, or Esc, to leave. Not shown where the browser has no full screen (iPhone).',
        '**Abandon** (under the Exit icon) — abandon the expedition after a confirmation (the party is left behind; the score is still tallied).',
      ),
    ] },
    { id: 'moving', title: 'Moving between areas', brief: 'A doorway only leads somewhere if its edge matches the area beyond it.', cards: [], screens: ['explore'], blocks: [
      p('Click a glowing doorway marker, or press **N / E / S / W**, to step that way. **U / D** climbs or descends a stairway.'),
      p('A doorway only leads somewhere if its edge matches the area beyond it. If it does not, you have found a **dead end**: that exit closes, but you may try another.'),
      p('The card you drew is shown face up for a few seconds, then fades to a grey **fog card** with a stub on each side you have tried it from, and stays that way. From then on you must remember what it was, until a party enters it from another side or the Sibyl shows it to you.'),
      p('If a dead end would leave your party with nowhere left to go, the game checks every tile you can still walk back to. If none has a way on, the card that made the dead end goes back into the pack at a random place and another is drawn for the same door. A small badge on the map marks a card that was swapped. A failed **retreat** is never rescued. If no way on is left at all you are told so and may play on, or quit.', 'forcedRedraw'),
      p('When you descend, the floor you came from is hidden automatically so it never blocks your view of where you now stand.'),
    ] },
    { id: 'chamber-draw', title: 'Drawing a chamber', brief: 'The deeper you are, the more cards a chamber holds.', cards: [], screens: ['explore'], blocks: [
      p('The first time you enter a chamber you draw small cards onto its floor: **1** on level 1, **2** on level 2, **3** on level 3, **4** on level 4 and deeper. The Tomb of Kings adds one extra card, the Great Hall two. They may be treasure to gather, strangers to face, or a hazard that strikes at once.'),
    ] },
    { id: 'hud-tour', title: 'Reading the screen', brief: 'Title bar, Settings, area cards, compass and the card panel.', cards: [], screens: ['explore'], blocks: [
      list(
        '**Title bar** — the left icons show your *Party* list (living members and what each carries; an *ally* or *stone* badge marks befriended or petrified companions) or your *Inventory*, every item the party carries and who has it. Click an item to read it; its card holds everything you can do with it (use, wield or stow, open the Treasure Chest, give it to another member, drop it). Nothing suggests when to use an artefact — that is up to you.',
        '**Inventory colours** — an item reads *usable now* (green), *not usable now*, *wielded* or *passive* (yellow), or gray when its carrier cannot use it or it is treasure only.',
        '**Settings** — game code, level, turn, party size, the score the party would have if it left now (a carried Idol is shown as "+ Idol" — its worth is rolled only at the end), cards left in the deck, and the Game log. The **Exit** icon beside it holds Save game and Abandon. *Verbose descriptions* switches area cards from a short line to a story sentence. *Roll special dice automatically* skips the button described under **Dice** below.',
        '**Dice** — when a chamber, hazard or artefact calls for a roll (the Bell Rope, Whirlpool, Viper Pit, Crypt, Desertion, Medusa, Quarrel, Elixir and Treasure Chest), a window first says what is riding on it and waits for you to press **Roll the dice**. One press throws every die for the whole party. The rounds of a fight have their own *Roll the Round* button, and testing a stranger\'s reaction is your own choice, so neither asks twice.',
        '**Area cards** — click any tile you are not standing on and the card panel shows that area card, or the fog card for unexplored ground. It describes its kind and exits, a Demon lurking there, and any strangers you left behind.',
        '**Compass & prompt** — your orientation and a running description of what just happened.',
        '**Card panel (right)** — the card under focus, with what the manual says about it in its *Help* section. It opens by itself when a card appears on the floor.',
        '**Help (?)** — this panel: help for the screen you are on, and the whole manual to browse and search.',
      ),
    ] },
    { id: 'tip-strong-back', title: 'Tip: bring a strong back', cards: [], blocks: [p('Bring a strong back (Ogre, Troll) — treasure left behind scores nothing.')] },
    { id: 'tip-unicorn', title: 'Tip: the Unicorn needs a Woman', cards: [], blocks: [p('A Woman or Woman Hero is the key to a Unicorn: without one it will only stand guard over the treasure.')] },
    { id: 'tip-dwarf', title: 'Tip: the Dwarf', cards: [], blocks: [
      p('A Dwarf is cheap insurance against a trap. Charisma makes strangers into allies.'),
      p('Where standing traps are on, a Dwarf is also a way to drop down on purpose, with surprise.', 'trapRules'),
    ] },
    { id: 'tip-armed', title: 'Tip: keep artefacts out of reach', brief: 'Strangers pick up the artefacts that lie in the chamber.', cards: [], screens: ['fight', 'fight-revised'], blocks: [p('Leave a fight\'s best artefacts out of the strangers\' reach: they pick up what lies in the chamber.')] },
    { id: 'tip-surprise', title: 'Tip: attack on entry for surprise', brief: 'Testing first throws the surprise bonus away.', cards: [], screens: ['encounter'], blocks: [p('Attack the instant you enter for the surprise bonus — testing first throws it away.')] },
    { id: 'tip-befriend', title: 'Tip: befriend rather than fight', cards: [], screens: ['encounter'], blocks: [p('Befriending strangers is often safer (and richer) than fighting them.')] },
    { id: 'tip-depth', title: 'Tip: watch your depth', cards: [], blocks: [p('The deeper you go, the more the cave draws against you.')] },
    { id: 'tip-turn-back', title: 'Tip: turn back in time', cards: [], blocks: [p('Turn back while you can still carry your winnings into the light.')] },
  ],
};
