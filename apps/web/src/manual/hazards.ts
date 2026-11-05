import { p, note, cards } from './blocks';
import type { Section } from './types';

// Manual §V Hazards, plus the Extension Kit's four hazards (§XIII).
export const HAZARDS: Section = {
  id: 'hazards', numeral: 'V', title: 'Hazards',
  topics: [
    { id: 'hazard-order', title: 'When hazards strike', cards: cards('hazard', '*'), blocks: [
      p('A hazard strikes immediately — before any treasure or strangers are dealt with. If several appear at once they resolve in this order: **Earthquake → Medusa → Ghouls → Mutiny → Trap**.'),
      p('With the Extension Kit the order lengthens to: Earthquake → Spell → Harpies → Medusa → Ghouls → Quarrel → Desertion → Mutiny → Trap (the Trap is always last).'),
      p('Hazards that strike once and are spent — Mutiny, and with the Kit Desertion, Quarrel, Spell and the Harpies — appear in a pop-up showing the drawn card, along with any dice and what became of the party. When you continue, the card is discarded and the chamber is left clear. Ghouls, Medusa and a lurking Harpies card instead stay in the chamber and strike again.'),
    ] },
    { id: 'hazard-earthquake', title: 'Earthquake', cards: cards('hazard', 'Earthquake'), blocks: [
      p('The area you just came from collapses. It is removed from play — drawn as rubble, impassable, and the doorway back to it is sealed. You cannot return the way you came.'),
      p('The earthquake card is left lying on the rubble to mark what fell.'),
    ] },
    { id: 'hazard-medusa', title: 'Medusa', cards: cards('hazard', 'Medusa'), blocks: [
      p('Her gaze sweeps the party; a die is rolled for each member, and a **1 or 2** turns that member **to stone**. A petrified member can do nothing until freed by the **Magic Staff** (a wizard bearing the staff is immune).'),
      p('Medusa **lurks for good**: her card stays on the chamber floor, and she rolls against the party *again every time you re-enter*. When she looms and you hold Lotus Dust, her card opens in the card panel and the bar offers the throw or proceeding. If her gaze petrifies your *whole* party, the expedition ends there.'),
    ] },
    { id: 'hazard-ghouls', title: 'Ghouls', cards: cards('hazard', 'Ghouls'), blocks: [
      p('Each member fights a round against the ghouls (strength 2) at full fighting strength — a Magic Sword or Strength Potion counts — and anyone who loses is slain. There is no surprise on either side.'),
      p('The attack forces the party to **drop all heavy treasure** onto the floor, which you may reclaim once the fight is over. Like Medusa, ghouls **lurk**: their card stays in the chamber and they attack again whenever you re-enter.'),
      p('The **Talisman** wards them off entirely.'),
      note('info', 'House rule', 'Where the revised combat is on, the ghouls are a lasting hazard that fights **one round only**: one strength-2 ghoul for each creature in your party, matched one-on-one. A creature that loses its duel is slain, and any ghoul left standing then withdraws. There is no retreating from them. If the chamber also holds a Trap you fight the ghouls first and only then fall.', 'combatRevision'),
    ] },
    { id: 'hazard-mutiny', title: 'Mutiny', cards: cards('hazard', 'Mutiny'), blocks: [
      p('Your befriended allies desert — reverting to strangers and dropping any treasure they carried back onto the floor. If your party is made up entirely of allies, one loyal soul remains. You then face the deserters as you would any group of strangers.'),
      p('Only allies are affected: a party of original adventurers is untouched, and the game says so. The Mutiny card is shown in a pop-up whether or not anyone deserted, then discarded.'),
    ] },
    { id: 'hazard-trap', title: 'Trap', cards: cards('hazard', 'Trap'), blocks: [
      p('The floor gives way and the party plunges to the area directly below — and there is **no climbing back**. A **Dwarf** guides the party safely past a trap.'),
      note('danger', 'No way back', 'A trap fall is one-way. You cannot withdraw or retreat back up, so plan to find another route out — or a secret stairway down and around.'),
      note('info', 'House rule', 'Where **standing traps** are switched on, a trap stays in its chamber, each Dwarf guides one trap, and the guidance becomes a choice: you may even fall on purpose, and arrive with the advantage of surprise.', 'trapRules'),
    ] },
    { id: 'hazard-desertion', title: 'Desertion', variant: 'kit', cards: cards('hazard', 'Desertion'), blocks: [
      p('Roll a die for every ally in the party — original party members never risk this one. A roll of **1 or 2** and that ally disappears for good, taking everything they carried; nothing is left behind to loot.'),
      p('A **Wolf** ally never rolls at all. With no allies in the party nothing is rolled, and the game says so.'),
    ] },
    { id: 'hazard-harpies', title: 'Harpies', variant: 'kit', cards: cards('hazard', 'Harpies'), blocks: [
      p('If the party carries no artefacts at all, or holds the **Talisman**, they simply circle off and lurk — the same check runs again on your next visit.'),
      p('Otherwise every artefact any living member holds is gone at once, swept away to the **Lair** (onto its floor if you have already found it, or held in reserve until you do). Losing the **Eye of God** this way still curses the party.'),
    ] },
    { id: 'hazard-quarrel', title: 'Quarrel', variant: 'kit', cards: cards('hazard', 'Quarrel'), blocks: [
      p('The two members who would hit hardest in an ordinary fight — by strength, magic and artefacts combined — turn on each other for one round. Each rolls a die; the loser falls as a stranger\'s blow would, revivable by the **Healing Balm**.'),
      p('The **Wolf** and the **Lion** never take part. If no one else is left to fight, the card simply fizzles.'),
    ] },
    { id: 'hazard-spell', title: 'Spell', variant: 'kit', cards: cards('hazard', 'Spell'), blocks: [
      p('The last ordinary tunnel the party walked through — not a chamber, not the Gateway, never one already collapsed by an earthquake — is shuffled back into the large pack, and a fresh, sealed tile takes its place, to be discovered again as if for the first time. Any secret door it held vanishes with it.'),
      p('With nothing eligible behind you, or the large pack empty, the spell simply fizzles.'),
    ] },
  ],
};
