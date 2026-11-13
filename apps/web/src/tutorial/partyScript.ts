import { TUTORIAL_STEPS, type CoachStep } from './runner';

// The guide's opening: the Coach Card introducing itself, Step 1 (welcome, the aim and the scoring), then Step 2: the new-game screen
// (starting a game, base set vs Extension set, choosing the party, reading a card). The steps wait for the player's own choices, which
// the party screen reports; see TutorialParty.
const info = (id: string, eyebrow: string, title: string, body: string, extra: Partial<CoachStep> = {}): CoachStep =>
  ({ id, kind: 'info', eyebrow, title, body, ...extra });
const ui = (id: string, eyebrow: string, title: string, body: string, event: string, selector: string): CoachStep =>
  ({ id, kind: 'ui', eyebrow, title, body, event, anchor: { kind: 'selector', selector } });
const S = (n: number) => `Step ${n} of ${TUTORIAL_STEPS}`;

export const PARTY_SCRIPT: CoachStep[] = [
  info('coach', 'Your guide', 'This is a Coach Card',
    'I am a Coach Card, and I will talk you through this tutorial one step at a time. You can drag me to any position on the screen by my top bar, and double-click the bar to snap me back to where I started. Move me whenever I am in the way.'),
  info('intro', S(1), 'Welcome to the cave',
    'The Sorcerer\'s Cave is a solo game: you lead a party down through the levels of a cave, gather treasure, and try to bring it out alive. This short guide plays one small game with you, step by step. It is the real game, and the guide only tells you what to press.'),
  info('objective', S(1), 'The aim of the game',
    'You score points by bringing the party back out alive. Every member who walks back out of the cave, by the Gateway or an up staircase on level 1, counts, and so does the treasure they carry. Anyone left behind scores nothing, and a party lost underground scores nothing at all, so the way out matters as much as the way in.'),
  info('new-game', S(2), 'Starting a game',
    'On the title screen you press Start Solitaire Game, and this is where it takes you: the screen where you choose who goes into the cave.'),
  info('extension', S(2), 'Base set and Extension set',
    'The game has a base set of cards. The Extension kit adds 30 more area tiles and 30 more cards, with new starting creatures, strangers and hazards. You choose whether to play with it, and the choice is made here, before the game starts.'),
  ui('kit', S(2), 'Play with the Extension kit', 'The tutorial uses the Extension kit. Tick "Extension kit".', 'kit', '[data-tutorial-action="kit"]'),
  info('creatures', S(2), 'Choosing your party',
    'Each card is a creature you can take with you. Its cost counts against a budget of 6, so you cannot take everyone. Click a card to read its strength, magic and abilities on the card panel; click it again to put the panel away.',
    { anchor: { kind: 'selector', selector: '.scv-cards' } }),
  ui('whero', S(2), 'Choose the Woman-Hero', 'Press + under the W-Hero card (the Woman-Hero): a strong fighter, and the key to befriending a Unicorn.', 'whero', '[aria-label="add W-Hero"]'),
  ui('dwarf', S(2), 'Choose the Dwarf', 'Press + under the Dwarf. The Dwarf is a modest fighter, but cheap, and he can guide a party safely past a trap.', 'dwarf', '[aria-label="add Dwarf"]'),
  ui('start', S(2), 'Enter the cave', 'That is the whole 6-point budget. Scroll down, then press "Enter the cave" to start.', 'start', '[data-tutorial-action="start"]'),
];
