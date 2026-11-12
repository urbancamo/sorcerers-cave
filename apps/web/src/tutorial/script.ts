import type { CoachStep } from './runner';

// Peter's tutorial script (docs/requirements/tutorial). `until` counts actions in the engine's TUTORIAL_ROUTE (packages/engine/src/tutorial.ts):
//  0 N  1 N  2 withdraw  3 S  4 W  5 N | 6 fall  7 W | 8 test  9 take Axe | 10 pass Axe  11 wield  12 N | 13 up  14 down  15 E |
//  16 test  17 deploy  18 redeploy  19 take gems  20 E | 21 attack  22 engage  23 retake  24 take Ring
const act = (id: string, eyebrow: string, title: string, body: string, until: number, anchor?: CoachStep['anchor']): CoachStep =>
  ({ id, kind: 'act', eyebrow, title, body, until, anchor });
const info = (id: string, eyebrow: string, title: string, body: string, extra: Partial<CoachStep> = {}): CoachStep =>
  ({ id, kind: 'info', eyebrow, title, body, ...extra });
const ui = (id: string, eyebrow: string, title: string, body: string, event: string, anchor?: CoachStep['anchor']): CoachStep =>
  ({ id, kind: 'ui', eyebrow, title, body, event, anchor });
const exit = (dir: 'N' | 'E' | 'S' | 'W' | 'U' | 'D'): CoachStep['anchor'] => ({ kind: 'exit', dir });
const button = (action: string, prefer?: string): CoachStep['anchor'] => ({ kind: 'selector', selector: `[data-tutorial-action="${action}"]`, prefer: prefer && `[data-tutorial-action="${prefer}"]:not([disabled])` });
const T = (n: number) => `Step ${n} of 12`;

export const TUTORIAL_SCRIPT: CoachStep[] = [
  info('gateway', T(3), 'The Gateway',
    'You start at the Gateway, the way in and, at the end, the way out. The cave is unexplored: every tile is laid face down as you find it, and your party stands on the tile you are looking at.'),
  info('fullscreen', T(3), 'Full screen',
    'The Full screen button fills the browser window, which gives the cave more room. Press it again, or Esc, to come back. (Some browsers, such as iPhone Safari, offer no full screen, and the button is not shown there.)',
    { anchor: { kind: 'selector', selector: '[aria-label="Full screen"], [aria-label="Exit full screen"]' } }),
  info('settings', T(3), 'Settings',
    'Settings holds your game code, the level you are on and the turn, the story-voice descriptions, the auto-roll option and the Game log: a record of every move you make.',
    { anchor: { kind: 'selector', selector: '[aria-label="Settings"]' } }),
  info('exit', T(3), 'Saving and leaving',
    'Exit lets you save the game, which gives you a four-letter code to resume with later, or abandon the expedition. A real game is saved after every move, so you can also just close the page. This tutorial is not saved to your games.',
    { anchor: { kind: 'selector', selector: '[aria-label="Exit"]' } }),
  info('party-panel', T(3), 'The Party panel',
    'The Party panel lists who is with you and what each carries. Press its Party button to show or hide it.',
    { anchor: { kind: 'selector', selector: '.scv-partylist' } }),
  ui('party-expand', T(3), 'Widen the party list', 'Press the expand arrow beside "Party". It widens the list to show each member\'s strength, magic and charisma. Press it again to narrow the list.', 'party-expand', { kind: 'selector', selector: '.scv-pl-expand' }),
  info('arrows', T(3), 'The navigation arrows',
    'The brass arrows around your party mark the ways you can go: click one, or press its key (N, E, S or W for the four directions, U and D for stairs).',
    { anchor: exit('N') }),
  act('explore-north', T(3), 'Explore north', 'Press the arrow to the north, or the N key, to step into the unknown.', 1, exit('N')),
  info('tunnel', T(4), 'A tunnel',
    'Each area of the cave is one card, laid where you found it and joined to its neighbours at the doorways. This one is a tunnel: nothing lives here, it only joins one place to the next.'),
  info('camera', T(4), 'Moving the camera',
    'Try the camera. The view is in Home mode, which stays on your party: drag to look around them, and scroll or pinch to zoom in and out. The Home button, the one ringed, brings the camera back to the party at any time. Have a go, then press Continue and the view returns to its usual place.',
    { anchor: { kind: 'selector', selector: '#snapBtn' }, resetView: true }),
  act('north-again', T(4), 'Go north again', 'Carry on north.', 2, exit('N')),
  info('spectre', T(5), 'A Spectre',
    'A chamber, and a Spectre in it. Chambers hold strangers and treasure; this one is too dangerous to fight yet. You can always withdraw: the party steps back to where it came from.'),
  act('withdraw', T(5), 'Withdraw', 'Press Withdraw.', 3, button('withdraw')),
  act('south', T(5), 'Back to the Gateway', 'Head south, back to the Gateway.', 4, exit('S')),
  act('west', T(5), 'Explore west', 'From the Gateway, try the way west.', 5, exit('W')),
  act('north-trap', T(5), 'Then north', 'A tunnel again: carry on north.', 6, exit('N')),

  info('hazard', T(6), 'A hazard',
    'Some cards are hazards: dangers that strike the moment they are met, and are not strangers you can bargain with. This one is a Trap. A Dwarf can guide the party safely past, or you can drop through on purpose, one way, and arrive with the advantage of surprise.'),
  act('fall', T(6), 'Fall through the trap', 'The party is going down. Choose "Fall through the trap".', 7, button('fallThroughTrap')),
  info('orbit', T(6), 'Looking around',
    'You are now on level 2, deeper in the cave. The orbit button lets you look around freely: drag to swing the view around the party, and scroll or pinch to zoom.',
    { anchor: { kind: 'selector', selector: '#orbitBtn' } }),
  info('level-selector', T(6), 'The level selector',
    'The level selector shows another level of the cave. Deeper chambers hold more cards, so more danger, and more treasure.',
    { anchor: { kind: 'selector', selector: '#levelGrp' } }),
  ui('home', T(6), 'Home view', 'When you have looked around, press the Home button. It locks the view back onto the tile the party stands on, so you never lose them.', 'home', { kind: 'selector', selector: '#snapBtn' }),
  act('west-priest', T(6), 'Explore west', 'Go west, into the chamber beyond.', 8, exit('W')),

  info('card-panel', T(7), 'The Card panel',
    'Every card in the game can be read here. When you reach a chamber, the cards on its floor open on the Card panel; click a card, a tile or a party member to look at it, and click it again to tidy the panel away. It shows the card\'s strengths and abilities, with notes from the manual, and the choices you can make with it.',
    { anchor: { kind: 'selector', selector: '[aria-label="Card panel"]' } }),
  info('priest', T(7), 'A Priest and a Magic Axe',
    'A Priest, and a Magic Axe beside her. Strangers are not always enemies: test their reaction to find out whether they are friendly, indifferent or hostile.'),
  act('test-priest', T(7), 'Test her reaction', 'Press "Test reaction".', 9, button('test')),
  info('friendly', T(7), 'She is friendly',
    'A friendly stranger joins you, and you may take what she guards. Treasure is carried by one of the party: pick it up on the card panel and give it to the Woman Hero.'),
  info('party-panel', T(7), 'The Party panel',
    'Before you pick anything up, know where your party is kept. The Party button opens the list of who is with you and what each carries; the arrow on the list widens it to show strength, magic and charisma.',
    { anchor: { kind: 'selector', selector: '[aria-label="Party"]' } }),
  info('inventory-panel', T(7), 'The Inventory panel',
    'The Inventory button lists every treasure and artefact the party carries, and who holds it. Pick one to read its card, give it to someone else, or put it in use.',
    { anchor: { kind: 'selector', selector: '[aria-label="Inventory"]' } }),
  act('take-axe', T(7), 'Take the Axe', 'The Axe\'s card is on the card panel: choose to give it to the Woman Hero.', 10),
  info('pass', T(8), 'Passing treasure on',
    'Treasure can be passed between the party at any time. The Dwarf is a stronger fighter, so he should carry the Axe. Open the Axe from the inventory (the bag button), or from the Woman Hero\'s card.'),
  act('pass-axe', T(8), 'Pass the Axe to the Dwarf', 'On the Axe\'s card, choose "Pass to" and pick the Dwarf.', 11, button('moveTreasure')),
  act('wield', T(8), 'Wield it', 'Carrying the Axe is not enough: its bonus only counts while it is in use. On the Axe\'s card, press the Wield button, so it adds to the Dwarf\'s fighting strength. (Stow puts it away again.)', 12, button('setBorne')),
  act('north-tunnel', T(8), 'Go north', 'North to a tunnel with a stair.', 13, exit('N')),

  info('stairs', T(9), 'Stairs and secret doors',
    'The stairs lead up to another level. Stairs always come with a way back; a secret door at the far end links back to this one, so you can never be trapped on the wrong side of a stair.'),
  act('up', T(9), 'Climb the stair', 'Press the up arrow.', 14, exit('U')),
  act('down', T(9), 'And back down', 'Use the secret door to come back down.', 15, exit('D')),
  act('east', T(9), 'Go east', 'Explore east from the stair tunnel.', 16, exit('E')),

  info('troll', T(10), 'A Troll',
    'A Troll, guarding gems. Testing its reaction, you find it is hostile. Because you came on it by surprise, the party strikes first with a bonus.'),
  act('test-troll', T(10), 'Test its reaction', 'Press "Test reaction".', 17, button('test')),
  info('fight', T(10), 'The fight',
    'A fight is rounds of dice. Each side adds its fighters\' strength (plus any magic) to one roll of the die. The Troll scores 4 + 1 + its die; your party, with the Axe, 4 + 4 + its die. Deploy the Woman Hero and the Dwarf to the front line; the Priest stays behind.'),
  act('deploy', T(10), 'Deploy the front line', 'Your fighters stand in the front line; the rest wait behind. Pick the Woman Hero and the Dwarf from the party panel: click one, then the other, to select both at once. Then drag them onto the green front-line area, or just click that area, and press "Stand in the front line" to confirm. The Priest stays behind.', 18, button('frontline', 'deploy')),
  act('roll', T(10), 'Roll the round', 'Put the Dwarf in the front line against the Troll, then roll the round.', 19, button('redeploy')),
  info('won', T(10), 'Victory',
    'The party wins. The loser of a round is lost; the gems are yours. Take them: the winners may now pick up what the Troll guarded.'),
  act('gems', T(10), 'Take the gems', 'The gems are on the card panel. Give them to the Woman Hero: the guide needs her to carry them for the next fight.', 20),
  act('east-tomb', T(10), 'Go east', 'East, into the Tomb of Kings.', 21, exit('E')),

  info('tomb', T(11), 'The Tomb of Kings',
    'A special chamber, with an Earthquake (another hazard) and a Witch guarding a Magic Ring. The Earthquake blocks the way back, so there is no withdrawing from this one.'),
  ui('look', T(11), 'Take a closer look', 'Before you act, study what is here. The strip of small cards at the top of the card panel is every card in the chamber: click the Witch and the Ring, one after the other, to read each one.', 'cards-seen', { kind: 'selector', selector: '.scv-cp-minis' }),
  info('assess', T(11), 'Weighing it up',
    'The Ring is a high-value artefact, and its guardian, a Witch, is a strong magic user who will very likely be hostile. Walking up to test her would hand her the first blow. The better plan is a surprise attack: a party that strikes first gets a bonus to its roll.'),
  act('attack', T(11), 'Attack the Witch', 'Press "Attack": striking first gives the party its surprise bonus.', 22, button('attack')),
  act('engage', T(11), 'Join the battle', 'Build the battle line in three moves. First pair a fighter with the Witch: click the Dwarf in the party list, then click the Witch (or drag him onto her). Next add the Woman Hero beside him in the same way, so two fighters stand in front. Then place the Priest in the slot marked "behind": a magic user adds her magic from the back. When all three are placed, press "Roll the Round".', 23, button('engage')),
  act('retake', T(11), 'Retake what was dropped', 'Fighters put heavy treasure down to fight. Pick it up again.', 24, button('retakeDropped')),
  act('ring', T(11), 'Take the Ring', 'And finally, the Witch\'s Magic Ring: give it to the Woman Hero too.', 25),

  info('end', T(12), 'You are on your way',
    'That is the whole loop: explore, test strangers, fight when the odds are good, withdraw when they are not, and carry the treasure home to the Gateway. Press Finish to leave the tutorial; the full manual is behind the Help button.', { free: true }),
];
