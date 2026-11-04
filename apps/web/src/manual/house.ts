import { p, list, note } from './blocks';
import type { Section } from './types';

// Manual §XV House Rules: optional rules the server switches on for a whole game. Each topic is gated by the option
// it needs, so a game only ever shows the rules it is actually playing. (Hazard, creature and artefact wording that
// a house rule changes lives in those topics, as blocks gated by the same option.)
export const HOUSE: Section = {
  id: 'house', numeral: 'XV', title: 'House Rules',
  topics: [
    { id: 'house-overview', title: 'House rules in this game', brief: 'The optional rules this game is being played with.', requires: ['forcedRedraw', 'sorcererTeleport', 'trapRules', 'combatRevision'], cards: [], screens: ['explore'], blocks: [
      p('A game keeps the rules it was started with. These optional rules are in force in this one:'),
      p('**The Dead End rule** — a dead end that would box the party in is swapped for another card.', 'forcedRedraw'),
      p('**The Sorcerer\'s terms** — a beaten Sorcerer may be spared in return for a teleport.', 'sorcererTeleport'),
      p('**Standing traps and the Dwarf\'s choice** — traps stay in their chamber, and a Dwarf lets you fall on purpose.', 'trapRules'),
      p('**The revised combat** — fights are played round by round on a formation screen.', 'combatRevision'),
      p('Everything else in the manual applies unchanged.'),
    ] },
    { id: 'house-dead-end', title: 'The Dead End rule', brief: 'A dead end that would leave the party boxed in is swapped for another card.', requires: 'forcedRedraw', cards: [], screens: ['explore'], blocks: [
      p('Normally a card that fails to connect just closes that exit and you try another. It can, rarely, leave a party boxed in with nowhere left to go. With this rule on, the game checks before accepting a dead end.'),
      list(
        'It looks at **every tile your party can still walk back to** through doors that work. An untried doorway or stairway counts as a way on — a door onto empty space (while the pack lasts), or one that points at a tile already on the table but does not connect (trying it is free). Working doors you have already used, collapsed tiles, and a stairway up out of the cave do *not* count; neither does dropping through a trap or crossing a Whirlpool.',
        'If any way on exists, the dead end stands as usual.',
        'If none does, the card that made the dead end goes back into the pack at a random place and another is drawn for the same door, until a way opens or the cards run out. The same rescue applies to a card that *does* connect but would shut the party into a loop with no way out.',
        'A failed **retreat** is never rescued — it still costs another round of the fight. If the rule finds no way on at all you are told *“There are no viable exits left”* and may play on, or quit.',
      ),
      p('A small badge on the map marks a card that was swapped.'),
    ] },
    { id: 'house-sorcerer-terms', title: 'The Sorcerer\'s terms', brief: 'Slay him for the bounty, or spare him in return for a teleport.', requires: 'sorcererTeleport', cards: [], screens: ['sorcerer'], blocks: [
      p('Beat the Sorcerer and, before anything else, you choose his fate:'),
      list(
        '**Slay him** — the usual: the +30 bounty, every curse lifted, any Apprentice turning on you.',
        '**Spare him** — on condition that he **teleports** you, and the treasure in the chamber, to any area you have already discovered. A map of the cave lets you pick the destination. Sparing him forfeits the bounty and lifts no curse. He stays behind in the chamber you left.',
      ),
      p('You can choose any discovered area on any level, except one that has collapsed, that is not yet turned face-up, or that has no firm floor to land on (a Whirlpool, Deep Pool or Viper Pit). No turn is spent, but magic leaves no way back: you cannot withdraw from where you land.'),
      note('info', 'The Eye of God', 'If the Eye of God is present he cannot be spared — he is slain.'),
    ] },
    { id: 'house-standing-traps', title: 'Standing traps and the Dwarf\'s choice', brief: 'Guided past the trap, or fall through it on purpose and arrive with surprise.', requires: 'trapRules', cards: [], screens: ['trap'], blocks: [
      p('Under the printed rules a trap “continues in effect”. With this rule on, it really does.'),
      list(
        'A drawn trap **stays in its chamber** after it fires or is avoided, and meets you again whenever you return.',
        'When the traps in a chamber resolve for a party whose living **Dwarves** can cover every one of them, play pauses and asks: **Guided past the trap**, or **Fall through the trap**. Falling drops the whole party one level, one way, as any trap does, but it counts as *deliberate*.',
        'A **deliberate fall gains surprise** (+1 in the first round, if you attack at once) on the chamber below — even one you have visited, and even one whose strangers you once retreated from, in which case it is *your* party that has surprise. So does a party that knowingly walks back into a trap chamber without a Dwarf and falls again. A trap drawn on this very entry is a surprise to you, and earns none.',
        '**One Dwarf, one trap.** A party with *n* Dwarves can pass *n* traps in a chamber. With more traps than Dwarves the party falls; that is not a choice, so it earns no surprise.',
        '**If a Dwarf is lost** and the party is left with fewer Dwarves than there are traps, the first time it tries to leave (by a doorway, stairway, withdrawal or retreat) it falls, and that fall is an accident with no surprise. Leaving by Magic Carpet, by the Sorcerer\'s teleport or down the Chasm does not trigger it.',
      ),
      note('danger', 'No way back', 'There is no withdrawing or retreating back up after any trap fall.'),
    ] },
    { id: 'rc-overview', title: 'The revised combat', brief: 'Rounds on a formation screen, with a fresh set of choices each round.', requires: 'combatRevision', cards: [], screens: ['fight-revised'], blocks: [
      p('A fight is played as a series of **rounds**, and each round the game asks you for a few decisions in turn. Whoever started the fight is the **attacker** and stays so; the other side is the **defender**.'),
      list(
        '**The Scroll** (attacker only, if carried).',
        '**Defender: the front line** — some of its free creatures stand in front.',
        '**Attacker: pairings and spares** — each free creature is matched one-to-one against the front line.',
        '**Extra creatures** — either side may send a spare into a match, or a caster behind it.',
        '**A look before the dice**, then **the matches are fought**.',
      ),
      p('The Ring and curses add to or take from your dice as usual, and the first round carries the surprise bonus. A match you lose costs you its front line, with the same choice of who falls when two stood together. A match you win removes the foe.'),
      note('info', 'Provisional', 'These are Peter\'s reformulated fighting rules and parts are still provisional. A game played with the revised combat cannot be recorded on the leaderboard.'),
    ] },
    { id: 'rc-scroll', title: 'The Scroll', brief: 'Read it before a round to destroy the non-magical, or take +1 to surprise. It is not used up.', requires: 'combatRevision', cards: [], screens: ['fight-revised'], blocks: [
      p('If your party **attacks**, carries the Scroll with a human present, has no Eye of God, and has not used it in this area before, the fight waits before each round for you to read it, if you wish. Open the Scroll\'s card (from the party list or Inventory) and choose:'),
      list(
        '**Destroy** every stranger without magical power (a Ring-bearer on the fourth level or deeper too: the Ring falls to the floor; the Sibyl is never harmed), or',
        'in the first round only, take **+1 to surprise** instead.',
      ),
      p('Either way the party is cursed, and the Scroll cannot be read again in the same area. Nothing prompts you to read it: press *Begin the fight* to go on without it.'),
    ] },
    { id: 'rc-front-line', title: 'The front line', brief: 'The defender chooses which free creatures stand in front.', requires: 'combatRevision', cards: [], screens: ['fight-revised'], blocks: [
      p('If you defend, select the creatures you want in the party list on the left (as many as you like), then drag any one of them into the front-line box, or tap the box, to move them all at once. Choose at least the number asked, and confirm.'),
      p('When you must put *every* free creature in front there is nothing to choose, so the game does it for you.'),
    ] },
    { id: 'rc-pairing', title: 'Pairings and spares', brief: 'Tap a fighter, then the foe it will face; nothing is final until you roll.', requires: 'combatRevision', cards: [], screens: ['fight-revised'], blocks: [
      p('The attacker matches each of its free creatures one-to-one against a creature in the front line, for as long as any can be paired. Tap one of your fighters and then the foe it will face (or drag it there), and do the same with your spare creatures, dropping each onto a pairing it will join or, for a Priest or Wizard, onto its “behind” slot. The strength totals follow as you go. A magic user can only stand behind a pairing that already has a fighter in front, and if you drop a creature somewhere it cannot go, a short note under the battle says why.'),
      p('Nothing is final: tap a creature you have placed to take it back, or press *Undo pairings* to start again. Nothing is decided until you press **Roll the Round**, and the whole arrangement is checked then. When there is only one way to pair your fighters the pairing is already laid out.'),
      p('A Spectre or Demon cannot be paired with a fighter who has no magic.'),
    ] },
    { id: 'rc-extras', title: 'Extra creatures', brief: 'Send a spare into a match, or a caster behind it to lend magic.', requires: 'combatRevision', cards: [], screens: ['fight-revised'], blocks: [
      p('Either side may send a spare creature into a match (two against two is allowed, never more) or a Priest or Wizard behind it to lend magic.'),
      p('When you attack, you place yours together with your pairings. When you defend, you do so after the strangers have chosen, as a step of its own: drag a spare creature onto the match (a caster onto its “behind” slot), or tap the creature and then the match. You need not move anyone.'),
    ] },
    { id: 'rc-tags', title: 'What the numbers are made of', brief: 'Small tags under each side list what its strength total is made of.', requires: 'combatRevision', cards: [], screens: ['fight-revised'], blocks: [
      p('Under each side of every match, small tags list what its strength total is made of: artefact bonuses (Magic Sword, Axe, Staff, Strength Potion), a Dragon-slayer\'s or Elixir\'s bonus, the magic of a Priest or Wizard in front of or *behind* the line, and a Magic Shield\'s ward (which takes magic away).'),
      p('The round number on a creature\'s card is what it adds to its match *right now*: a Priest or Wizard standing behind the line shows only its magic, a caster facing a Spectre or Demon shows its magic alone, and a creature facing a Shielded foe loses its magic. Until a creature is placed in a match its card shows its full potential strength.'),
      p('Tags in italics, such as the Ring, a curse or the surprise bonus, are added to the **die** instead and are not in the total. When the Eye of God is present, a tag says that magic and artefacts are switched off. Past four tags on a side the rest fold into *+N more*; tap it to see them all.'),
      p('The left of the screen shows the same party panel as the Party icon. Creatures that can still be placed show their fighting strength (and a ✦ for a magic user) and can be selected or dragged; one already placed is dimmed. Inventory swaps the list for the items the party carries. Artefacts are used from the item\'s own card, not the foot of the fight panel.'),
    ] },
    { id: 'rc-look', title: 'A look before the dice', brief: 'A pause to see how the strangers have lined up before you roll.', requires: 'combatRevision', cards: [], screens: ['fight-revised'], blocks: [
      p('If the strangers paired up with your creatures or sent spare creatures into matches, and you have had no decision since, the game pauses once so you can see how they stand. You can only press *Roll the Round* (or retreat) then; nothing can be moved.'),
    ] },
    { id: 'rc-roll', title: 'Rolling the round', brief: 'A die per side per match; undecidable matches stay as they are.', requires: 'combatRevision', cards: [], screens: ['fight-revised'], blocks: [
      p('A die is rolled for each side of each match. A match that cannot be decided — neither side can beat the other on any roll — simply stays as it is, and matches already in play carry over from round to round.'),
      p('The fight ends when you have won, when your party is gone, or when no creature on either side can continue a match, be sent into one, or break a stalemate — and then you must *retreat*. (If you have just fallen through a trap there is no way back, so the fight simply ends: the strangers stay in the chamber and you walk on.)'),
      p('The Treasure Chest\'s Spectre fights for one round only, with no surprise, and then vanishes; anyone it kills stays dead.'),
    ] },
  ],
};
