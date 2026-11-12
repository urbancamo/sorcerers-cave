import type { CoachStep } from './runner';

// Peter's steps 1-2: the demo, then the new-game screen (starting a game, base set vs Extension set, choosing the party, reading a card).
// The steps wait for the player's own choices, which the party screen reports; see TutorialParty.
const info = (id: string, eyebrow: string, title: string, body: string, extra: Partial<CoachStep> = {}): CoachStep =>
  ({ id, kind: 'info', eyebrow, title, body, ...extra });
const ui = (id: string, eyebrow: string, title: string, body: string, event: string, selector: string): CoachStep =>
  ({ id, kind: 'ui', eyebrow, title, body, event, anchor: { kind: 'selector', selector } });

export const PARTY_SCRIPT: CoachStep[] = [
  info('intro', 'Step 1 of 12', 'Welcome to the cave',
    'The Sorcerer\'s Cave is a solo game: you lead a party down through the levels of a cave, gather treasure, and try to bring it out alive. This short guide plays one small game with you, step by step. It is the real game, and the guide only tells you what to press.', { demo: true }),
  info('new-game', 'Step 2 of 12', 'Starting a game',
    'On the title screen you press Start Solitaire Game, and this is where it takes you: the screen where you choose who goes into the cave.'),
  info('extension', 'Step 2 of 12', 'Base set and Extension set',
    'The game has a base set of cards. The Extension kit adds 30 more area tiles and 30 more cards, with new starting creatures, strangers and hazards. You choose whether to play with it, and the choice is made here, before the game starts.',
    { anchor: { kind: 'selector', selector: '[data-tutorial-action="kit"]' } }),
  ui('kit', 'Step 2 of 12', 'Play with the Extension kit', 'The tutorial uses the Extension kit. Tick "Extension kit".', 'kit', '[data-tutorial-action="kit"]'),
  info('creatures', 'Step 2 of 12', 'Choosing your party',
    'Each card is a creature you can take with you. Its cost counts against a budget of 6, so you cannot take everyone. Click a card to read its strength, magic and abilities on the card panel; click it again to put the panel away.',
    { anchor: { kind: 'selector', selector: '.scv-cards' } }),
  ui('whero', 'Step 2 of 12', 'Choose the Woman-Hero', 'Press + under the W-Hero card (the Woman-Hero): a strong fighter, and the key to befriending a Unicorn.', 'whero', '[aria-label="add W-Hero"]'),
  ui('dwarf', 'Step 2 of 12', 'Choose the Dwarf', 'Press + under the Dwarf. The Dwarf is a modest fighter, but cheap, and he can guide a party safely past a trap.', 'dwarf', '[aria-label="add Dwarf"]'),
  ui('start', 'Step 2 of 12', 'Enter the cave', 'That is the whole 6-point budget. Scroll down, then press "Enter the cave" to start.', 'start', '[data-tutorial-action="start"]'),
];
