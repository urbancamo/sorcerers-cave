import { p, list, note } from './blocks';
import type { Section } from './types';

// Manual §XI Leaving the Cave & Scoring.
export const SCORING: Section = {
  id: 'scoring', numeral: 'XI', title: 'Leaving the Cave & Scoring',
  topics: [
    { id: 'scoring', title: 'How the score is reckoned', brief: 'Survivors and the treasure they carry, with bounties and penalties.', cards: [], screens: ['game-over'], blocks: [
      p('Climb any stairway up from level 1 to leave the cave and bank your score. Leaving is one-way: once your party steps out, the expedition is over, and you are shown a roll call of who made it out and what each carried.'),
      list(
        'The points value of every member who **walks out alive** (stone and fallen members count for nothing).',
        'Plus the points value of all treasure they carry.',
        '**Dragon-slayers** who killed a dragon single-handed count double.',
        'Plus any loot banked from the Treasure Chest, and **+30** for slaying the Sorcerer.',
        '**−30** if the party is under a curse.',
      ),
    ] },
    { id: 'score-dragon-slayer', title: 'Dragon-slayers', brief: 'A hero who slew a Dragon single-handed counts double.', cards: [], screens: ['game-over'], blocks: [
      p('A hero who killed a Dragon single-handed has their worth **doubled** at scoring, for ever.'),
    ] },
    { id: 'score-bounty', title: 'Sorcerer slain', brief: 'Slaying the Sorcerer is worth a 30-point bounty and lifts every curse.', cards: [], screens: ['game-over'], blocks: [
      p('Slaying the Sorcerer earns a **+30** bounty, and because a curse has no effect once the Sorcerer is dead, it also lifts every curse on your party.'),
    ] },
    { id: 'score-chest', title: 'Treasure Chest loot', brief: 'Loot banked from opening the Treasure Chest.', cards: [], screens: ['game-over'], blocks: [
      p('Silver, Gold or Gems found by opening the Treasure Chest are banked at scoring.'),
    ] },
    { id: 'score-curse', title: 'Curses', brief: 'A single flat −30 however many curses you carry; slaying the Sorcerer erases it.', cards: [], screens: ['game-over'], blocks: [
      p('**−30** if the party is under a curse — a single flat penalty, however many curses you carry. Slaying the Sorcerer lifts every curse and erases this penalty.'),
    ] },
    { id: 'all-or-nothing', title: 'All or nothing', brief: 'A party wiped out underground scores nothing.', cards: [], screens: ['game-over'], blocks: [
      note('danger', 'All or nothing', 'A party wiped out underground scores **zero**. Greed is the surest way to lose everything — know when to turn for the surface.'),
      p('Only a party that climbs back out can record a score on the high-score board.'),
    ] },
    { id: 'quit-abandon', title: 'Quitting', brief: 'Quitting abandons the party to the cave; it does not climb out.', cards: [], screens: ['game-over'], blocks: [
      p('You can end a run at any time with **Abandon** (in Settings) — but quitting *abandons* your party to the cave: they do not climb out. The score they had gathered is still tallied (a wiped party, of course, scores nothing), but an abandoned party cannot record a score.'),
    ] },
    { id: 'high-score-tables', title: 'The high-score tables', brief: 'Eight tables, because solo, multiplayer, kit and Sibyl games cannot fairly be compared.', cards: [], screens: ['high-scores', 'game-over'], blocks: [
      p('Enter a name to record an escaped party on the shared **high-score board**. It keeps separate tables for solitaire and multiplayer games, for base-game and Extension Kit games, and for games with or without the Sibyl — **eight tables** in all, because those games cannot fairly be compared. Switch between them with the buttons above the table.'),
      p('A game played with the revised combat cannot be recorded on the leaderboard.', 'combatRevision'),
    ] },
    { id: 'feats', title: 'Great feats', brief: 'A single-handed Dragon kill, felling the Sorcerer, freeing the Lost Ruby, drinking the Elixir.', cards: [], blocks: [
      p('Great feats — a single-handed Dragon kill, felling the Sorcerer, freeing the Lost Ruby, drinking the Elixir — are celebrated on screen as they happen.'),
    ] },
  ],
};
