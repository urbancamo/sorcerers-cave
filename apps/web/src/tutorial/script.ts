import type { CoachStep } from './runner';

// Peter's tutorial script (docs/requirements/tutorial). `until` counts actions in the engine's TUTORIAL_ROUTE (packages/engine/src/tutorial.ts):
//  0 N  1 N  2 withdraw  3 S  4 W  5 N | 6 fall  7 W | 8 test  9 take Axe | 10 pass Axe  11 wield  12 N | 13 up  14 down  15 E |
//  16 test  17 deploy  18 redeploy  19 take gems  20 E | 21 attack  22 engage  23 retake  24 take Ring
const act = (id: string, eyebrow: string, title: string, body: string, until: number, anchor?: CoachStep['anchor']): CoachStep =>
  ({ id, kind: 'act', eyebrow, title, body, until, anchor });
const info = (id: string, eyebrow: string, title: string, body: string, extra: Partial<CoachStep> = {}): CoachStep =>
  ({ id, kind: 'info', eyebrow, title, body, ...extra });
const exit = (dir: 'N' | 'E' | 'S' | 'W' | 'U' | 'D'): CoachStep['anchor'] => ({ kind: 'exit', dir });
const button = (action: string): CoachStep['anchor'] => ({ kind: 'selector', selector: `[data-tutorial-action="${action}"]` });
const T = (n: number) => `Step ${n} of 12`;

export const TUTORIAL_SCRIPT: CoachStep[] = [
  info('intro', T(1), 'Welcome to the cave',
    'The Sorcerer\'s Cave is a solo game: you lead a party down through the levels of a cave, gather treasure, and try to bring it out alive. This short guide plays one small game for you, step by step. It is the real game, and the guide only tells you what to press.', { demo: true }),
  info('welcome', T(2), 'Your party',
    'You lead a Woman Hero and a Dwarf, chosen for you so you can start at once. Their strengths are on the party list, which you can open with the Party button.',
    { anchor: { kind: 'selector', selector: '[aria-label="Party"]' } }),
  info('gateway', T(3), 'The Gateway',
    'You start at the Gateway, the way in and, at the end, the way out. The cave is unexplored: every tile is laid face down as you find it. The brass arrows mark the ways you can go.'),
  act('explore-north', T(3), 'Explore north', 'Press the arrow to the north, or the N key, to step into the unknown.', 1, exit('N')),
  info('tunnel', T(4), 'A tunnel',
    'A tunnel: nothing lives here, it only joins one place to the next. Drag to turn the view, and scroll or pinch to zoom; the camera buttons snap it back to the party.'),
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
  info('level-two', T(6), 'Level 2',
    'You are now on level 2, deeper in the cave. Use the orbit button to look around, and the level selector to see another level. Deeper chambers hold more cards, so more danger, and more treasure.',
    { anchor: { kind: 'selector', selector: '#levelGrp' } }),
  act('west-priest', T(6), 'Explore west', 'Go west, into the chamber beyond.', 8, exit('W')),

  info('priest', T(7), 'A Priest and a Magic Axe',
    'A Priest, and a Magic Axe beside her. Strangers are not always enemies: test their reaction to find out whether they are friendly, indifferent or hostile.'),
  act('test-priest', T(7), 'Test her reaction', 'Press "Test reaction".', 9, button('test')),
  info('friendly', T(7), 'She is friendly',
    'A friendly stranger joins you, and you may take what she guards. Treasure is carried by one of the party: pick it up on the card panel and give it to the Woman Hero.'),
  act('take-axe', T(7), 'Take the Axe', 'Open the Axe card, then give it to the Woman Hero.', 10),
  info('pass', T(8), 'Passing treasure on',
    'Treasure can be passed between the party at any time. The Dwarf is a stronger fighter, so he should carry the Axe. Open the Axe from the inventory (the bag button), or from the Woman Hero\'s card.'),
  act('pass-axe', T(8), 'Pass the Axe to the Dwarf', 'Choose "Pass to" and pick the Dwarf.', 11),
  act('wield', T(8), 'Wield it', 'Carrying is not enough: press the button that puts the Axe in use, so it adds to his fighting strength.', 12),
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
  act('deploy', T(10), 'Deploy the front line', 'Choose the Woman Hero and the Dwarf, then confirm the deployment.', 18),
  act('roll', T(10), 'Roll the round', 'Put the Dwarf in the front line against the Troll, then roll the round.', 19),
  info('won', T(10), 'Victory',
    'The party wins. The loser of a round is lost; the gems are yours. Take them: the winners may now pick up what the Troll guarded.'),
  act('gems', T(10), 'Take the gems', 'Give the gems to one of the party.', 20),
  act('east-tomb', T(10), 'Go east', 'East, into the Tomb of Kings.', 21, exit('E')),

  info('tomb', T(11), 'The Tomb of Kings',
    'A special chamber, with an Earthquake (another hazard) and a Witch guarding a Magic Ring. Look at the cards on the card panel to read what each does. The Earthquake blocks the way back, so there is no withdrawing from this one.'),
  act('attack', T(11), 'Attack the Witch', 'Press "Attack": striking first gives the party its surprise bonus.', 22, button('attack')),
  act('engage', T(11), 'Join the battle', 'Bring the Priest into support behind the Dwarf, then roll the round.', 23),
  act('retake', T(11), 'Retake what was dropped', 'Fighters put heavy treasure down to fight. Pick it up again.', 24, button('retakeDropped')),
  act('ring', T(11), 'Take the Ring', 'And finally, the Witch\'s Magic Ring.', 25),

  info('end', T(12), 'You are on your way',
    'That is the whole loop: explore, test strangers, fight when the odds are good, withdraw when they are not, and carry the treasure home to the Gateway. A tutorial game is never scored. Press Finish to leave the tutorial; the full manual is behind the Help button.', { free: true }),
];
