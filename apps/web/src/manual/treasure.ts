import { p, note, cards } from './blocks';
import type { Section, Topic } from './types';

// Manual §IX Treasure & Artefacts and the Extension Kit's treasure and artefacts (§XIII). Each artefact gives
// what the printed card says, then how this edition plays it.
const artefact = (name: string, id: string, says: string, plays: string, extra: Partial<Topic> = {}, more: Topic['blocks'] = []): Topic => ({
  id: `artifact-${id}`, title: name, cards: cards('artifact', name), ...extra,
  blocks: [p(`*The card says:* “${says}”`), p(plays), ...more],
});

export const TREASURE: Section = {
  id: 'treasure', numeral: 'IX', title: 'Treasure & Artefacts',
  topics: [
    { id: 'treasure-heavy', title: 'Heavy treasure', cards: cards('treasure', 'Silver', 'Gold', 'Gems'), blocks: [
      p('Silver, Gold and Gems are **heavy** — they count against a member\'s carrying capacity (25 kg each). When you pick one up, only members with spare capacity are offered. Guarded treasure waits until the strangers are befriended or beaten.'),
      note('good', 'Redistribute freely', 'Outside a fight, open an item and use *Give to* to hand it to a stronger back, or *Drop here* to leave it where you stand.'),
    ] },
    { id: 'treasure-chest', title: 'Treasure Chest', cards: [...cards('treasure', 'Treasure Chest'), ...cards('artifact', 'Treasure Chest')], blocks: [
      p('The heaviest treasure at 100 kg, so only a strong back — a Giant, or an empty-handed Ogre — can carry it. A member must be *carrying* it to open it, and then a die decides your fortune: a curse, a Spectre (which the Eye of God destroys and the Talisman drives off on level 4+), worthless sand, or Silver, Gold or Gems.'),
    ] },
    { id: 'treasure-idol', title: 'Idol', variant: 'kit', cards: cards('treasure', 'Idol'), blocks: [
      p('Fifty kilograms of stone, and it does nothing along the way. Only at the final reckoning does it speak: a die is cast for it once, and its worth is ten times whatever it shows, from 10 to 60 points. Carried out by the dead or the stone-turned, it is worth nothing.'),
    ] },
    { id: 'treasure-crypt', title: 'Crypt / Gems', variant: 'kit', cards: cards('treasure', 'Crypt/Gems'), blocks: [
      p('It does not drop onto the floor when drawn: it parks as a single spot in that chamber, and from then on, whenever you are in that chamber (even with treasure on the floor to pick up), an *Enter the crypt* option is on offer on the crypt card itself.'),
      p('One d6 decides it for good: **1–2** is an inescapable trap — the whole party falls a level, even with a Dwarf. **3–6** turns the card into the gems themselves: 25 kg, 20 points. Either roll spends the crypt.'),
    ] },
    { id: 'pickup-capacity', title: 'Picking up treasure', brief: 'Only members with spare carrying capacity are offered a piece.', cards: [], screens: ['pickup'], blocks: [
      p('Click a piece of treasure on the chamber floor, or pick it from the row of small cards in the card panel, and its card shows a *Give to* button for every member who can take it; the first piece is shown for you when the treasure comes on offer, and you can still click any other card meanwhile. *Give to…* is greyed out, with the reason, when no one can carry it. You never have to take anything: walk through any doorway and the treasure stays where it lies.'),
      p('Unguarded treasure is yours to pick up; guarded treasure waits until the strangers are befriended or beaten. When you pick a piece up, only the members who have the **spare capacity** to bear it are offered, with what they carry shown beside their name.'),
      p('Heavy treasure (Silver, Gold, Gems) weighs 25 kg each; the **Treasure Chest** is 100 kg, so only a strong back — a Giant, or an empty-handed Ogre — can carry it. Artefacts weigh nothing.'),
      p('The **Lost Ruby** sits in a statue of strength 8: win the wrestle, or still the statue with the Eye of God, to take it.'),
    ] },
    { id: 'inventory-status', title: 'The Inventory', brief: 'Every item the party carries, who has it, and whether it can be used now.', cards: [], screens: ['inventory'], blocks: [
      p('Each item shows a colour and a word: **usable now** (green), **not usable now**, **wielded**, **worn**, **carried · not wielded** (or *not worn*) or **passive** (yellow), or gray when its carrier cannot use it or it is treasure only. The line under an item\'s name says who **holds** it; the word on the right says whether it is in use. A wielded Magic Staff also shows the magic it adds (+1 for a Priest-class bearer, such as a Priest, Witch or Scholar; +2 for a Wizard-class one). Click an item to read it.'),
      p('A hero\'s earned marks, such as the upside-down Dragon card for a Dragon slain single-handed, sit among the mini-cards on their card and open the same way.'),
    ] },
    { id: 'item-actions', title: 'What you can do with an item', brief: 'Use it, wield or wear it, open the Chest, give it to another member, or drop it.', cards: [], screens: ['inventory'], blocks: [
      p('An item\'s card holds everything you can do with it: use it (choosing a target or direction), wield or wear it (or stow it again), open the Treasure Chest, give it to another member or drop it. Nothing suggests when to use an artefact; that is up to you.'),
      note('good', 'Redistribute freely', 'Outside a fight, use *Give to* to hand an item to a stronger back, or *Drop here* to drop it where you stand. *Give to…* is greyed out when no other member can carry the item; hover it for the reason. Nothing is lost with a member who falls: whether wielded, worn or carried, it spills to the floor for the party to pick up.'),
    ] },
    { id: 'wielding', title: 'Wielding and wearing', brief: 'A weapon or charm helps only while it is wielded or worn, never just because it is carried.', cards: [], screens: ['fight', 'fight-revised'], blocks: [
      p('Picking up a weapon does not arm anyone. A **Magic Sword, Axe, Staff or Shield** must be **wielded**, and **The Ring** and the **Talisman** must be **worn**, before they do anything. Use the *Wield* or *Wear* button on the item\'s card in the Party or Inventory panel (and *Stow* or *Remove* to put it away). The card says plainly whether the item is *Wielded*, *Worn* or *Carried, not wielded*. Nothing is ever wielded or worn for you, and you are best to prepare the party before a fight. During a fight you can still wield or wear for a member who has not yet been deployed, from the item\'s card in the Inventory.'),
      p('Each member has two hands. A member may wield **one attacking weapon** (the Sword, the Axe or the Staff) **and the Shield** together, never two attacking weapons; the Game tells you why when a second is refused. The Ring and the Talisman are worn in addition and use no hand.'),
      p('What needs wielding or wearing: the weapons\' strength and magic bonuses, the Sword\'s power to fight Spectres, the Axe\'s to fight Demons, the Shield\'s ward, the Ring\'s +1 and its invincibility, the Talisman\'s wards, and a Wizard\'s Staff against Medusa and for freeing the stone. The **Eye of God** works just by being carried.'),
      p('The expanded Party panel and a member\'s card show what each member fights with, as the printed number plus each bonus now in effect: for a Witch wielding the Staff, *Magic 4 + 1 (Magic Staff)*; for a Hero with a wielded Sword who has slain two Dragons, *Strength 4 + 2 (Magic Sword) + 2 (Dragon Slayer)*. A carried weapon adds nothing, so it does not appear there.'),
      note('good', 'A fight reminds you', 'If a carried item would have helped, the fight screen says so ("Magic Sword (Hero) carried, not wielded"). It only tells you: nothing is wielded for you.'),
    ] },
    { id: 'artifact-general', title: 'About artefacts', cards: cards('artifact', '*'), blocks: [
      p('Artefacts weigh nothing and grant powers. Some are used up; others serve as long as you hold them. Nothing suggests when to use one; that is up to you.'),
    ] },
    artefact('Magic Sword', 'sword', 'Adds 1 to the Strength of the Man or Woman who bears it, or 2 to a Hero. Also enables the bearer to fight Spectres.',
      'As written. It must be wielded. The Woman Hero counts as a Hero (+2). Nullified while an Eye of God is present.'),
    artefact('Magic Staff', 'staff', 'Increases the Magical Power of a Priest by 1, or of a Wizard by 2. In the hands of a Wizard, reanimates creatures turned to stone, and wards off Medusa.',
      'As written. It must be wielded, for its magic and for a Wizard\'s powers: freeing petrified members at rest or while looting after a fight, and warding Medusa. Not used up.'),
    artefact('The Ring', 'ring', 'When worn by a Man, Woman, Priest, Wizard, Hero or Dwarf, adds 1 to the die rolls of your party. Also makes the bearer invincible on the fourth level or deeper.',
      'As written. It must be worn: the +1 applies while any member wears it; invincibility only on level 4+.'),
    artefact('Talisman', 'talisman', 'Wards off Zombies and Ghouls from the party displaying it. On the fourth level or deeper, also wards off Spectres.',
      'It must be worn by any one living member to ward the whole party: Ghouls, and (on level 4+) Spectres. It also keeps the Harpies away. Zombies do not appear in this deck.'),
    artefact('Eye of God', 'eye', 'A gem which renders powerless all magic in the area, and annihilates Spectres and Zombies. Having taken it up, you must keep it; otherwise you will be cursed.',
      'Nullifies magic and destroys Spectres; also stills the Lost Ruby statue. In a fight it covers the whole area: it switches off every artefact and magic bonus on *both* sides and stops the strangers arming themselves. The Sorcerer is the one exception (−2 only).', {}, [
        note('danger', 'Keep it or be cursed', 'Once taken up, the Eye must stay with the party. Passing it to another member is fine, but drop it, or lose it with its bearer, and a curse falls on the party: **−1 to every roll** (a roll outside a fight never drops below 1) and the −30 score penalty. Each further curse stacks. Slaying the Sorcerer lifts every curse.'),
      ]),
    artefact('Charmed Flute', 'flute', 'When played by a Man, Woman, Hero, Priest or Wizard, lulls Dragons and Vipers to sleep. Also opens secret doors. Sleeping creatures are protected by a curse.',
      'When you meet a Dragon, open the Flute\'s card and choose *lull the Dragons*: they fall asleep (“Zzz”) and stop blocking you. It is not used up. At the Viper Pit it works the same way: choose *lull the Vipers* before you cross, and the party passes unharmed — the Vipers sleep until you leave. Holding the Flute is not enough; if you cross without playing it, you roll as usual. Sleeping Dragons wake again when you leave and come back. It also reveals secret stairways.'),
    artefact('Strength Potion', 'potion', 'Adds 2 to the Strength of a Man, Woman, Hero or Thief for the duration of a fight. One draught only.', 'As written. Used up.'),
    artefact('Lotus Dust', 'lotus', 'Enough to put one creature to sleep for 2 turns. Works on Medusa, but not on Ghouls, Spectres or Zombies.',
      'Sleeps one stranger (no effect on a Spectre). A slept creature stays in the chamber and no longer blocks you, but only for **two of your turns** — if you come back after that it is awake again and you must deal with it as before. Only a human or priest-class member can throw it; an Ogre, Troll or Dwarf can carry it but not use it. The Sorcerer is only weakened by 2. Used up.'),
    artefact('Healing Balm', 'balm', 'In the hands of a Wizard, Priest, or Woman, will restore to life any creature just killed. Enough for one cure only.',
      'House rule: it revives only a member who fell **this turn and in this very area** — move on, or retreat and leave them behind, and it is too late. Used at rest, or while gathering treasure after the fight. Used up.'),
    artefact('Magic Carpet', 'carpet', 'When commanded by a Priest or Wizard, will transport a party to any adjacent area in any direction (including up or down), drawing another tile if necessary. You may not withdraw, and the carpet remains behind.',
      'Transports as written and is left behind. It must be carried by a Priest or Wizard (transfer it to use it). The “may not withdraw” clause is not enforced.'),
    artefact('Lost Ruby', 'ruby', 'Set in the forehead of a colossal statue. Try to remove it at the beginning of a turn. The statue attacks with a strength of 8, and you must defeat it to win the jewel.',
      'As written. An active Eye of God stills the statue, letting you take the jewel unopposed. Once freed it is **ordinary treasure**, and the statue never challenges you again.'),
    artefact('Elixir', 'elixir', 'Any creature may drink it. Roll a die: 1 poison kills. 2-3 nothing happens. 4-6 permanently increases strength by 2.',
      'As written — may be drunk almost anywhere, except mid-fight. The Ring\'s protection still applies to a fatal draught. Used up.', { variant: 'kit' }),
    artefact('Holy Water', 'holy-water', 'Reanimate creature of STONE. Destroys MEDUSA, SPECTRE, or DEMON, or weakens SORCERER or APPRENTICE by 2. One use only.',
      'Four uses, pick one: free a petrified member, or wake a whole Gallery statue; destroy a lurking Medusa, Spectre or Demon; or weaken the Sorcerer\'s or Apprentice\'s magic by 2. Only a human or priest-class member can use it. Used up.', { variant: 'kit' }),
    artefact('Magic Axe', 'axe', 'Adds 1 to the Strength of a MAN, WOMAN, or HERO; 3 to that of a DWARF. Also enables the bearer to fight a DEMON.',
      'As written — the Woman Hero gets +1, not +3. It must be wielded, and only one attacking weapon at a time. An active Eye of God silences the bonus, but any wielder may still stand against a Demon. Not used up.', { variant: 'kit' }),
    artefact('Scroll', 'scroll', 'On being read by any HUMAN, destroys all enemies in an area other than those with Magical Power. Any party using it is CURSED.',
      'As written — no target picker, just a living human present. Anything with magical power 0 (Man, Woman, Ogre, Troll, Dwarf, Lion, Wolf, even a Dragon) falls; any caster, the Spectre and the Demon shrug it off. The curse lasts until the Sorcerer falls. Used up.', { variant: 'kit' }, [
        note('info', 'House rule', 'Under the revised combat it is read at the start of a round instead, and it is not used up.', 'combatRevision'),
      ]),
    artefact('Magic Shield', 'shield', 'When borne by a MAN, WOMAN, or HERO, nullifies the opponent\'s magical power. Reduces the power of SORCERER or APPRENTICE by 2.',
      'As written. It must be wielded (together with one attacking weapon if you like) — the Woman Hero counts too; in anyone else\'s grip it is inert. Its ward covers only the one foe paired against its bearer. An active Eye of God silences it. It also lets its bearer face a Spectre or Demon when nobody has any other way to touch it: the round is a **stalemate** and neither is harmed. Not used up.', { variant: 'kit' }),
  ],
};
