import { p, list, note, cards } from './blocks';
import type { Section } from './types';

// Manual §II party table, §VI Strangers & Reactions, §VII Fights (the two foes), §VIII The Sorcerer,
// the Extension Kit creatures (§XIII) and §XIV The Sibyl. Raw numbers (strength, cost…) are shown from the
// engine by the card panel itself; this is the manual's wording about what each creature does.
export const CREATURES: Section = {
  id: 'strangers', numeral: 'VI', title: 'Creatures, Strangers & Fights',
  topics: [
    { id: 'encounter-choices', title: 'Meeting strangers', brief: 'Withdraw, attack, or test their reaction — and decide before touching any treasure.', cards: cards('creature', '*'), screens: ['encounter'], blocks: [
      p('When a chamber holds creatures you must decide how to meet them before touching any treasure there. You have three choices, taken in the same turn:'),
      list(
        '**Withdraw** — back out the way you came, leaving the strangers and any treasure behind.',
        '**Attack** — fight at once. Striking the instant you enter a fresh chamber gains you the advantage of surprise.',
        '**Test their reaction** — approach and roll to see how they feel about you.',
      ),
    ] },
    { id: 'reaction-roll', title: 'The reaction roll', brief: 'One die for the group\'s leader; charisma helps, curses hurt, a natural 1 is always hostile.', cards: cards('creature', '*'), screens: ['encounter'], blocks: [
      p('One stranger leads the group, by this order: Spectre › Dragon › Wizard › Hero / Woman Hero › Priest › Man / Woman › Giant › Ogre › Troll › Dwarf. Roll a die for the leader; the rest react the same way.'),
      p('**Charisma** adds +1 and each **curse** subtracts 1 (curses stop biting once the Sorcerer is dead), but a natural **1 is always hostile**, whatever the bonuses.'),
      note('info', 'Who reacts how', 'Gentle folk are easily befriended; a Dragon or Spectre almost never is. A charismatic leader, and no curses, swing the odds your way.'),
    ] },
    { id: 'reaction-results', title: 'Friendly, indifferent, hostile', brief: 'Friends join you; the indifferent can be tested again; the hostile strike first.', cards: cards('creature', '*'), screens: ['encounter'], blocks: [
      list(
        '**Friendly** — they join your party as allies, and the chamber\'s treasure is yours.',
        '**Indifferent** — they ignore you for now. Next turn you may test again, attack, or leave. Test to indifferent **three times** and they become *permanently* indifferent: you may walk on out by any exit, though the treasure stays guarded, and they stay indifferent if you return.',
        '**Hostile** — they attack at once, and a round is fought with the strangers holding the advantage of surprise.',
      ),
    ] },
    { id: 'fight-overview', title: 'How a fight runs', brief: 'One round per turn until a side is wiped out, put to sleep, or you retreat.', cards: cards('creature', '*'), screens: ['fight'], blocks: [
      p('A fight runs one round per turn until one side is wiped out, put to sleep, or your party retreats. Each fighter is matched against a stranger and a die is rolled for each side; total strength plus the die decides the winner, and the loser is slain. A tie kills no one.'),
    ] },
    { id: 'fight-surprise', title: 'Surprise', brief: 'The side with surprise adds +1 to all its rolls in the first round.', cards: cards('creature', '*'), screens: ['fight', 'fight-revised'], blocks: [
      p('The side with surprise adds **+1** to all its rolls in the **first round**. Your party gains it by attacking immediately on entering a chamber by a fresh doorway (or by magic carpet). You do *not* get it if you stopped to test the strangers first, or if you fell in through a trap. Strangers gain surprise when they turn hostile on being approached.'),
      p('A party that drops through a trap **on purpose** arrives with surprise.', 'trapRules'),
    ] },
    { id: 'fight-pairing', title: 'Pairing off', brief: 'Match fighters to foes; outnumber them and two can gang up on one.', cards: cards('creature', '*'), screens: ['fight'], blocks: [
      list(
        'If you **outnumber** the strangers, two of your members may gang up on one foe.',
        'If they **outnumber you**, a single member can be set against at most two foes at once; any further strangers stand idle that round, and you face the strongest combination they can form.',
        '**Priests and wizards** may fight hand-to-hand or hang back, adding their magical power to a front-line fighter. Any number of casters can pool their power against one enemy.',
        'Enemy priests, wizards and the Sorcerer do likewise: leftover enemy casters lend their power to the foes you *are* fighting, shown behind the front foes, marked “lends magic”.',
      ),
    ] },
    { id: 'fight-armed', title: 'Strangers come armed', brief: 'Strangers pick up any usable artefact lying in the chamber when a fight begins.', cards: [], screens: ['fight', 'fight-revised'], blocks: [
      p('Fighting artefacts lying among a chamber\'s treasure are not safe from the creatures guarding it. When a fight begins, the strangers **pick up whatever they can use** — the Magic Sword, the Magic Staff and The Ring (and, with the Extension Kit, the Magic Axe and Magic Shield).'),
      list(
        'What a stranger bears **counts**: a Sword or Axe adds to its strength, a Staff to its magic, and a stranger\'s **Shield** cancels the magic of whoever faces it. A stranger wearing **The Ring** adds +1 to *every* stranger\'s die. The fight panel lists each as a modifier.',
        'Kill a bearer and its gear **drops to the floor**; a surviving stranger may snatch it up for the next round. Win the fight and anything dropped is yours to loot.',
        'If you **retreat**, every artefact the strangers carried is returned to the floor before you go.',
        'A Ring-bearer on **level 4 or deeper** is invincible, but if it still loses its match it vanishes with the Ring, leaving its other gear behind.',
        'The **Eye of God** switches all of this off.',
      ),
    ] },
    { id: 'fight-who-falls', title: 'Choosing who falls', brief: 'When two of yours lose together, a roll of 4–6 lets you choose which is lost.', cards: [], screens: ['fight', 'fight-revised'], blocks: [
      p('When two of your members lose a fight together, you decide which one is lost. State your preference and roll: on a **4, 5 or 6** you get your wish; otherwise the other falls. The Ring protects its bearer.'),
    ] },
    { id: 'fight-retreat', title: 'Retreat', brief: 'After one round you may retreat by any exit; the strangers stay hostile for good.', cards: cards('creature', '*'), screens: ['fight', 'fight-revised'], blocks: [
      p('After at least one round has been fought you may **retreat** by *any* of the tile\'s doorways or stairways, even one you have not explored yet (a tile is drawn for it). The strangers and any treasure dropped in the fight are left behind.'),
      p('If that way turns out to be a **dead end**, the party cannot escape and must **fight another round** this turn. You cannot retreat before the first round, nor back up a trap you fell through.'),
      note('danger', 'They remember', 'Strangers you retreat from stay **hostile to your party for the rest of the game**: return and they attack on sight, with no chance to test them.'),
      note('info', 'Standing traps', 'The one exception: a party that comes back by deliberately dropping through a trap catches them off guard, and it is **your** party that has surprise.', 'trapRules'),
    ] },
    { id: 'creature-hero', title: 'Hero', brief: 'Charismatic and strong: +1 to every reaction roll.', cards: cards('creature', 'Hero'), blocks: [
      p('**Charisma:** adds +1 to every reaction roll, making strangers friendlier. A Hero is human, so may use Lotus Dust and wield the Magic Sword (+2).'),
    ] },
    { id: 'creature-w-hero', title: 'Woman Hero', brief: 'Charismatic; befriends the Unicorn.', cards: cards('creature', 'W-Hero'), blocks: [
      p('**Charisma:** adds +1 to every reaction roll. She **befriends the Unicorn**, and counts as a Hero for artefacts (Sword +2).'),
    ] },
    { id: 'creature-ogre', title: 'Ogre', brief: 'Strong back: carries 100 kg.', cards: cards('creature', 'Ogre'), blocks: [
      p('A strong back: with 100 kg capacity, an empty-handed Ogre can carry the Treasure Chest. In the leadership order an Ogre ranks below a Giant and above a Troll.'),
    ] },
    { id: 'creature-troll', title: 'Troll', brief: 'Solid muscle with a good back.', cards: cards('creature', 'Troll'), blocks: [
      p('Solid muscle with a good back, but no special talent. Trolls and Ogres can carry Lotus Dust but not throw it.'),
    ] },
    { id: 'creature-priest', title: 'Priest', brief: 'A caster who lends magic from behind the line.', cards: cards('creature', 'Priest'), blocks: [
      p('A caster: contributes **magical power** in fights even while standing safely behind the front line. A Priest may command the **Magic Carpet**, use the Healing Balm, and the Magic Staff adds +1 to his magic.'),
    ] },
    { id: 'creature-man', title: 'Man', brief: 'An all-rounder who can use most artefacts.', cards: cards('creature', 'Man'), blocks: [
      p('An all-rounder. May wield the Magic Sword (+1), the Strength Potion, Lotus Dust and the Charmed Flute, and may bear the Magic Shield.'),
    ] },
    { id: 'creature-woman', title: 'Woman', brief: 'Befriends the Unicorn.', cards: cards('creature', 'Woman'), blocks: [
      p('**Befriends the Unicorn** — a Unicorn joins only a party with a living Woman or Woman Hero. May also use the Healing Balm.'),
    ] },
    { id: 'creature-dwarf', title: 'Dwarf', brief: 'Guides the party safely past a trap.', cards: cards('creature', 'Dwarf'), blocks: [
      p('**Guides the party safely past a trap.** Cheap and weak in a fight, but valuable for the trap alone. With the Extension Kit a Dwarf wielding the Magic Axe gains +3.'),
    ] },
    { id: 'creature-wizard', title: 'Wizard', brief: 'A powerful caster who uses the Magic Staff and Carpet.', cards: cards('creature', 'Wizard'), blocks: [
      p('A powerful caster who leads any group he joins, bar a Dragon or Spectre. In a Wizard\'s hands the **Magic Staff** adds +2 magic, frees petrified creatures and wards off Medusa. A Wizard may command the Magic Carpet.'),
    ] },
    { id: 'creature-giant', title: 'Giant', brief: 'Carries the most, and can carry treasure across the Deep Pool.', cards: cards('creature', 'Giant'), blocks: [
      p('Carries more than anyone else, so a Giant can haul the Treasure Chest and can carry heavy treasure across the **Deep Pool**.'),
    ] },
    { id: 'creature-dragon', title: 'Dragon', cards: cards('creature', 'Dragon'), blocks: [
      p('The deadliest common foe (fighting strength 6) — but slay one **single-handed** and that hero\'s worth is **doubled** at scoring forever.'),
      p('A **Charmed Flute**, played from its card when you meet a dragon, lulls dragons to sleep so the party can walk straight past them.'),
    ] },
    { id: 'creature-spectre', title: 'Spectre', cards: cards('creature', 'Spectre'), blocks: [
      p('Cannot be harmed by ordinary blows. Without magic or the **Magic Sword** in hand, it slays your strongest member each round.'),
      p('The **Eye of God** destroys spectres outright; the **Talisman** drives them off on level 4 or deeper.'),
    ] },
    { id: 'creature-sorcerer', title: 'The Sorcerer', cards: cards('creature', 'Sorcerer'), blocks: [
      p('Fighting strength 4 and **magical power 9**: he fights at an effective strength of **13**, far beyond a Dragon. As the highest-ranking creature he always **leads** any group he joins and turns it **hostile**. He is never befriended and carries no point value of his own.'),
      p('**Lotus Dust** and the **Eye of God** *each reduce his Strength by only 2*; bring both and his 13 drops to 9. Without them, withdraw if you still can.'),
      note('good', 'If you can fell him', 'Slaying the Sorcerer is the cave\'s crowning feat: a **+30** bounty at scoring, and it **lifts every curse** on your party.'),
      note('info', 'House rule', 'Where the **Sorcerer\'s terms** are on, a beaten Sorcerer may be spared in return for a **teleport** to any area you have discovered. Sparing him earns neither the bounty nor the curse relief.', 'sorcererTeleport'),
    ] },
    { id: 'creature-unicorn', title: 'The Unicorn', cards: cards('creature', 'Unicorn'), blocks: [
      p('Fighting strength 4, no magic, carries nothing, worth 4 points if it walks out with you. You cannot recruit it — you can only meet it. Tested on its own it is **always friendly**.'),
      list(
        '**It needs a Woman.** A Unicorn joins only a party with a living Woman or Woman Hero.',
        '**Without one it stays to guard.** The chamber is quiet for you from then on and its treasure stays out of reach, unless you choose to attack the guardians.',
        '**It leaves with the last Woman.** When the last living Woman or Woman Hero falls, the Unicorn departs.',
        '**As an ally** it fights in the front line at strength 4 and cannot carry treasure.',
      ),
    ] },
    { id: 'creature-apprentice', title: 'The Apprentice', variant: 'kit', cards: cards('creature', 'Apprentice'), blocks: [
      p('Her loyalty is a bet on the Sorcerer\'s life: while he lives, only a roll of six wins her reaction over, hostile the rest of the way — no indifferent middle ground. The moment he falls, that same six turns hostile too, and she turns on the party wherever she stands, taking nothing with her.'),
      p('She is worth nothing at the final count; even a clean escape leaves her behind.'),
      p('Under the revised combat she does not turn at once: she stays at your side while you decide. **Leave the area** (by any route) and she is left behind, harmless; **stay** and she turns, and she and every stranger in the area attack you *with surprise*.', 'combatRevision'),
    ] },
    { id: 'creature-demon', title: 'The Demon', variant: 'kit', cards: cards('creature', 'Demon'), blocks: [
      p('The Demon never takes a seat among a chamber\'s ordinary strangers. Drawn from the small pack, it steps into whichever area the party has just left and waits there, springing the instant they return — no reaction test, just a fight.'),
      p('Only magic reaches it, and so, in any hand at all, does the **Magic Axe**. Without either, it cuts down the party\'s strongest member. **Holy Water** destroys it. Win, and it collapses to ash.'),
    ] },
    { id: 'creature-witch', title: 'Witch', brief: 'Uses artefacts as a Priest; strong magic.', variant: 'kit', cards: cards('creature', 'Witch'), blocks: [
      p('Uses artefacts exactly as a Priest does. Weak in melee but strong in magic. Ranks beside the Priest when deciding who leads a group.'),
    ] },
    { id: 'creature-scholar', title: 'Scholar', brief: 'Uses artefacts as a Priest.', variant: 'kit', cards: cards('creature', 'Scholar'), blocks: [
      p('Uses artefacts exactly as a Priest does. Ranks beside the Priest when deciding who leads a group.'),
    ] },
    { id: 'creature-thief', title: 'Thief', brief: 'Can lift treasure from a chamber of permanent indifference.', variant: 'kit', cards: cards('creature', 'Thief'), blocks: [
      p('Plays a Man\'s part with the Charmed Flute and the Magic Sword (+1). Uniquely, the Thief can walk treasure out of a chamber the party has talked down to **permanent indifference** — no fight, no test.'),
    ] },
    { id: 'creature-lion', title: 'Lion', brief: 'Cheap muscle; will not quarrel.', variant: 'kit', cards: cards('creature', 'Lion'), blocks: [
      p('Pure, cheaply-priced muscle. Touches no artefact and carries nothing, and **will not quarrel**. Ranks beside an Ogre for leadership.'),
    ] },
    { id: 'creature-wolf', title: 'Wolf', brief: 'Immune to Medusa, Mutiny, Desertion and Quarrel.', variant: 'kit', cards: cards('creature', 'Wolf'), blocks: [
      p('The hardiest constitution in the kit: **immune** to Medusa, Mutiny, Desertion and Quarrel. Touches no artefact and carries nothing. Ranks beside a Troll for leadership.'),
    ] },
    { id: 'creature-sibyl', title: 'The Sibyl', variant: 'sibyl', cards: cards('creature', 'Sibyl'), blocks: [
      p('An optional seer who never fights. She waits to one side and you meet her only **after the other strangers have been dealt with**. You may test her once: **5–6** and she joins you; **1–4** and she stays, never to be asked again. She is never hostile.'),
      p('She **cannot fight, carry or be harmed**, cannot mutiny or desert, is worth no points, never counts as a living member and will not leave the cave.'),
      p('While she travels with you, choose *Party* in the title bar and click her to **look** at the top of the area pack, or at a face-down tile. It costs no turn. In multiplayer only you see what she shows.'),
    ] },
  ],
};
