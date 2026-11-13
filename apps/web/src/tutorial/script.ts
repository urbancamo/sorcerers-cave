import { TUTORIAL_STEPS, type CoachStep } from './runner';

// Peter's tutorial script (docs/requirements/tutorial). `until` counts actions in the engine's TUTORIAL_ROUTE (packages/engine/src/tutorial.ts):
//  0 N  1 N  2 withdraw  3 S  4 W  5 N (the Trap, avoided) | 6 W  7 N (the Whirlpool)  8 W (wade, and fall) | 9 W  10 test  11 take Axe |
//  12 pass Axe  13 wield  14 N | 15 up  16 down  17 E | 18 test  19 deploy  20 redeploy  21 take gems  22 E | 23 attack  24 engage
//  25 retake  26 take Ring
// The coach never says what the next card will be: a card of text follows what has been drawn, never what is about to be.
const act = (id: string, eyebrow: string, title: string, body: string, until: number, anchor?: CoachStep['anchor']): CoachStep =>
  ({ id, kind: 'act', eyebrow, title, body, until, anchor });
const info = (id: string, eyebrow: string, title: string, body: string, extra: Partial<CoachStep> = {}): CoachStep =>
  ({ id, kind: 'info', eyebrow, title, body, ...extra });
const ui = (id: string, eyebrow: string, title: string, body: string, event: string, anchor?: CoachStep['anchor']): CoachStep =>
  ({ id, kind: 'ui', eyebrow, title, body, event, anchor });
const exit = (dir: 'N' | 'E' | 'S' | 'W' | 'U' | 'D'): CoachStep['anchor'] => ({ kind: 'exit', dir });
const button = (action: string, prefer?: string): CoachStep['anchor'] => ({ kind: 'selector', selector: `[data-tutorial-action="${action}"]`, prefer: prefer && `[data-tutorial-action="${prefer}"]:not([disabled])` });
const T = (n: number) => `Step ${n} of ${TUTORIAL_STEPS}`;

export const TUTORIAL_SCRIPT: CoachStep[] = [
  info('gateway', T(3), 'The Gateway',
    'You start at the Gateway, the way in and also a way out. Any up staircase on level 1 is a way out too: when the party climbs one, or leaves by the Gateway, the expedition ends and the party is scored. The cave is unexplored: every tile is laid face down as you find it, and your party stands on the tile you are looking at.'),
  info('fullscreen', T(3), 'Full screen',
    'The Full screen button fills the browser window, which gives the cave more room. Press it again, or Esc, to come back. (Some browsers, such as iPhone Safari, offer no full screen, and the button is not shown there.)',
    { anchor: { kind: 'selector', selector: '[aria-label="Full screen"], [aria-label="Exit full screen"]' } }),
  info('settings', T(3), 'Settings',
    'Settings holds your game code, the level you are on and the turn, your score so far, the tiles left in the deck, the story-voice descriptions, the auto-roll option and the Game log: a record of every move you make. Keep an eye on the tiles left: each new area comes from that deck, and once it is empty no new area can be laid, so the party can only move over ground it has already found, and must plan its way out before then.',
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
    'Try moving the view. Click on the map, away from any buttons, and drag to move it. The view is in Home mode, which stays on your party, so you look around them; scroll or pinch to zoom in and out. The Home button, the one ringed, brings the camera back to the party at any time. Have a go, then press Continue and the view returns to its usual place.',
    { anchor: { kind: 'selector', selector: '#snapBtn' }, resetView: true }),
  act('north-again', T(4), 'Go north again', 'Carry on north.', 2, exit('N')),
  info('spectre', T(5), 'A Spectre',
    'A chamber, and a Spectre in it. Chambers hold strangers and treasure; this one is too dangerous to fight yet. You can always withdraw: the party steps back to where it came from.'),
  info('deck-counter', T(5), 'Levels and the deck',
    'That Spectre was the first card drawn from the small pack, the one that holds strangers, hazards and treasure. A chamber draws as many cards as the level you are on: one on level 1, two on level 2, and so on up to four. That is why deeper levels hold more danger, and more treasure. The Level chip shows where you are, and the Deck chip counts the area tiles still to be laid.',
    { anchor: { kind: 'selector', selector: '.chip:has(#st-depth)' } }),
  act('withdraw', T(5), 'Withdraw', 'Press Withdraw.', 3, button('withdraw')),
  act('south', T(5), 'Back to the Gateway', 'Head south, back to the Gateway.', 4, exit('S')),
  act('west', T(5), 'Explore west', 'From the Gateway, try the way west.', 5, exit('W')),
  act('north-chamber', T(5), 'Then north', 'Carry on north.', 6, exit('N')),

  info('hazard', T(6), 'A hazard',
    'That was a Trap. Some cards are hazards: dangers that strike the moment they are met, and are not strangers you can bargain with. A Trap would have dropped the party through the floor, but a Dwarf in the party spots it and guides everyone safely past.'),
  act('west-tunnel', T(6), 'Explore west', 'Try the way west.', 7, exit('W')),
  act('north-whirlpool', T(6), 'Then north', 'This tunnel has a way north. Take it.', 8, exit('N')),

  info('whirlpool', T(7), 'A Whirlpool',
    'A Whirlpool: another hazard. The party stands on a ledge at the edge of the water. To go on you must wade along the shallows to another doorway, and the current may sweep the whole party away, down to the level below.'),
  act('wade', T(7), 'Cross the shallows', 'Try to wade west along the ledge, to the next doorway.', 9, exit('W')),
  info('swept', T(7), 'Swept away',
    'The current took the party. It is now on level 2, deeper in the cave, and there is no stair back to the Whirlpool: this is a one-way trip.'),
  info('orbit', T(7), 'Looking around',
    'The orbit button lets you look around freely: drag to swing the view around the party, and scroll or pinch to zoom.',
    { anchor: { kind: 'selector', selector: '#orbitBtn' } }),
  info('level-selector', T(7), 'The level selector',
    'The level selector shows another level of the cave. Deeper chambers hold more cards, so more danger, and more treasure.',
    { anchor: { kind: 'selector', selector: '#levelGrp' } }),
  ui('home', T(7), 'Home view', 'When you have looked around, press the Home button. It locks the view back onto the tile the party stands on, so you never lose them.', 'home', { kind: 'selector', selector: '#snapBtn' }),
  act('west-priest', T(7), 'Explore west', 'Go west.', 10, exit('W')),

  info('card-panel', T(8), 'The Card panel',
    'Every card in the game can be read here. When you reach a chamber, the cards on its floor open on the Card panel; click a card, a tile or a party member to look at it, and click it again to tidy the panel away. It shows the card\'s strengths and abilities, with notes from the manual, and the choices you can make with it.',
    { anchor: { kind: 'selector', selector: '[aria-label="Card panel"]' } }),
  info('priest', T(8), 'A Priest and a Magic Axe',
    'A Priest, and a Magic Axe beside her. Strangers are not always enemies: test their reaction to find out whether they are friendly, indifferent or hostile.'),
  act('test-priest', T(8), 'Test her reaction', 'Press "Test reaction".', 11, button('test')),
  info('friendly', T(8), 'She is friendly',
    'A friendly stranger joins you, and you may take what she guards. Treasure is carried by one of the party: pick it up on the card panel and give it to the Woman Hero.'),
  info('party-panel-again', T(8), 'The Party panel',
    'Before you pick anything up, know where your party is kept. The Party button opens the list of who is with you and what each carries; the arrow on the list widens it to show strength, magic and charisma.',
    { anchor: { kind: 'selector', selector: '[aria-label="Party"]' } }),
  info('inventory-panel', T(8), 'The Inventory panel',
    'The Inventory button lists every treasure and artefact the party carries, and who holds it. Pick one to read its card, give it to someone else, or put it in use.',
    { anchor: { kind: 'selector', selector: '[aria-label="Inventory"]' } }),
  act('take-axe', T(8), 'Take the Axe', 'The Axe\'s card is on the card panel: choose to give it to the Woman Hero.', 12),
  info('pass', T(9), 'Passing treasure on',
    'Treasure can be passed between the party at any time. The Dwarf is a stronger fighter, so he should carry the Axe. Open the Axe from the inventory (the bag button), or from the Woman Hero\'s card.'),
  act('pass-axe', T(9), 'Pass the Axe to the Dwarf', 'On the Axe\'s card, choose "Pass to" and pick the Dwarf.', 13, button('moveTreasure')),
  act('wield', T(9), 'Wield it', 'Carrying the Axe is not enough: its bonus only counts while it is in use. On the Axe\'s card, press the Wield button, so it adds to the Dwarf\'s fighting strength. (Stow puts it away again.)', 14, button('setBorne')),
  act('north-tunnel', T(9), 'Go north', 'Explore north.', 15, exit('N')),

  info('stairs', T(10), 'Stairs and secret doors',
    'This tunnel has a stair. Stairs lead up or down to another level, and always come with a way back: a secret door at the far end links back to this one, so you can never be trapped on the wrong side of a stair.'),
  act('up', T(10), 'Climb the stair', 'Press the up arrow.', 16, exit('U')),
  act('down', T(10), 'And back down', 'Use the secret door to come back down.', 17, exit('D')),
  act('east', T(10), 'Go east', 'Explore east from the stair tunnel.', 18, exit('E')),

  info('troll', T(11), 'A Troll',
    'A Troll, guarding gems. A Troll will not be talked round, but testing its reaction is the only way to find out how it feels about you.'),
  act('test-troll', T(11), 'Test its reaction', 'Press "Test reaction".', 19, button('test')),
  info('hostile', T(11), 'It is hostile',
    'The Troll is hostile. Because you walked up to test it, it gets the first blow: a surprise bonus of +1 on its roll. A fight is rounds of dice: each side adds its fighters\' strength (and magic) to one roll of the die, and the higher total wins the round.'),
  info('fight', T(11), 'The fight',
    'Because the Troll has surprise, it is the Troll that chooses who it fights. You put forward the party members who step up to the front line, and the Troll picks its opponent from among them. You can then bring the rest of the party into the fight. Your side, in parts: the Woman Hero 4, the Dwarf 1 + the Axe 3 = 4, and the Priest\'s magic 2 from the back line: 10, plus your die. The Troll: strength 4, plus 1 for surprise, plus its die.'),
  act('deploy', T(11), 'Step up to the front line', 'Put forward your fighters: pick the Woman Hero, the Dwarf and the Priest from the party panel, clicking one after another to select all three. Then drag them onto the green front-line area, or just click that area, and press "Stand in the front line" to confirm. The Troll will choose which of them it fights.', 20, button('frontline', 'deploy')),
  act('roll', T(11), 'Roll the round', 'The Troll has chosen its opponent from the members who stepped up. Now bring in the others: put the Dwarf in the front line beside that fight, and the Priest behind it, then press "Roll the Round".', 21, button('redeploy')),
  info('won', T(11), 'Victory',
    'The party wins, 13 to 9. The loser of a round is lost; the gems are yours. Take them: the winners may now pick up what the Troll guarded.'),
  act('gems', T(11), 'Take the gems', 'The gems are on the card panel. Give them to the Woman Hero: the guide needs her to carry them for the next fight.', 22),
  act('east-tomb', T(11), 'Go east', 'Explore east.', 23, exit('E')),

  info('tomb', T(12), 'The Tomb of Kings',
    'A special chamber, with an Earthquake (another hazard) and a Witch guarding a Magic Ring. The Earthquake blocks the way back, so there is no withdrawing from this one.'),
  ui('look', T(12), 'Take a closer look', 'Before you act, study what is here. The strip of small cards at the top of the card panel is every card in the chamber: click the Witch and the Ring, one after the other, to read each one.', 'cards-seen', { kind: 'selector', selector: '.scv-cp-minis' }),
  info('assess', T(12), 'Weighing it up',
    'The Ring is a high-value artefact, and its guardian, a Witch, is a strong magic user who will very likely be hostile. Walking up to test her would hand her the first blow. The better plan is a surprise attack: a party that strikes first gets a bonus to its roll.'),
  info('retreat', T(12), 'If it goes wrong',
    'A word on retreat. If the party takes a casualty in a fight, it can retreat at the end of the round instead of fighting on. You will not need it here.'),
  act('attack', T(12), 'Attack the Witch', 'Press "Attack": striking first gives the party its surprise bonus.', 24, button('attack')),
  act('engage', T(12), 'Join the battle', 'Build the battle line in three moves. First pair a fighter with the Witch: click the Dwarf in the party list, then click the Witch (or drag him onto her). Next add the Woman Hero beside him in the same way, so two fighters stand in front. Then place the Priest in the slot marked "behind": a magic user adds her magic from the back. When all three are placed, press "Roll the Round".', 25, button('engage')),
  act('retake', T(12), 'Retake what was dropped', 'Fighters put heavy treasure down to fight. Pick it up again.', 26, button('retakeDropped')),
  act('ring', T(12), 'Take the Ring', 'And finally, the Witch\'s Magic Ring: give it to the Woman Hero too.', 27),

  info('end', T(13), 'You are on your way',
    'That is the whole loop: explore, test strangers, fight when the odds are good, withdraw when they are not, and carry the treasure out, by the Gateway or any up staircase on level 1. If the party walked out now it would score {score} points. Press Finish to leave the tutorial.', { free: true }),
];
