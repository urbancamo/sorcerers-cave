import { ALL_CREATURES, ALL_TREASURES } from '@sorcerers-cave/engine';

// Player-facing wording for the card panel, in the manual's own terms (apps/web/public/manual.html). Artifacts
// are written out here; creatures are built from the engine's own numbers so they cannot drift. Until the manual
// itself becomes structured data this table is the one place the card text lives.
const ARTIFACT_TEXT: Record<string, string> = {
  'Magic Sword': 'Adds +2 to a Hero or Woman Hero who wields it, and +1 to a Man, Woman or Thief. Nullified while an Eye of God is present.',
  'Magic Axe': 'Works like the Magic Sword for the party member who wields it. Nullified while an Eye of God is present.',
  'Magic Shield': 'Can be held by anyone, but its ward only works for a Hero, Woman Hero, Man or Woman. Nullified while an Eye of God is present.',
  'Magic Staff': 'Frees petrified members when used at rest or while looting after a fight. A Wizard may use it. Not used up.',
  'The Ring': 'Adds +1 while any member holds it. Invincibility applies only on level 4 and below.',
  'Talisman': 'Wards off Ghouls and, on level 4 or deeper, Spectres. Works while carried.',
  'Eye of God': 'Nullifies magic and artifact bonuses in its area and destroys Spectres. It also stills the Lost Ruby statue. The Sorcerer is the one exception.',
  'Charmed Flute': 'Lulls Dragons and Vipers in a chamber so they stop blocking you, and can reveal a secret stairway.',
  'Strength Potion': 'Adds +2 for one fight to a Man, Woman, Hero or Woman Hero. Used up.',
  'Lotus Dust': 'Puts one stranger to sleep for good (no effect on a Spectre). A sleeping stranger no longer blocks you. Used up.',
  'Healing Balm': 'Revives a member who fell this turn in this very area. Used at rest or while gathering treasure after the fight. Used up.',
  'Magic Carpet': 'Carries the party one area in a chosen direction, then is left behind. It must be carried by a Priest or Wizard.',
  'Lost Ruby': 'Guarded by a statue of strength 8. Win the wrestle, or still the statue with the Eye of God, to take it.',
  'Elixir': 'A kit artifact. See the Extension Kit section of the manual.',
  'Holy Water': 'A kit artifact, used by a Human or Priest. See the Extension Kit section of the manual.',
  'Scroll': 'A kit artifact, used in an encounter. See the Extension Kit section of the manual.',
  'Treasure Chest': 'Heavy (100 kg). Opening it rolls a die and may bring a curse or a Spectre as well as treasure.',
  'Idol': 'Heavy (50 kg). Its worth is a die roll, revealed only at the end of the game.',
};

const plural = (n: number, unit: string) => `${n} ${unit}`;

/** The wording for a card, or null when there is none to show. `category` is the card's own category. */
export function cardText(category: string, name: string): string | null {
  if (category === 'creature') {
    const c = ALL_CREATURES.find((x) => x.name === name);
    if (!c) return null;
    const parts = [`Fighting strength ${c.fs}`];
    if (c.mp > 0) parts.push(`magic ${c.mp}`);
    if (c.carry > 0) parts.push(`carries ${plural(c.carry, 'kg')}`);
    return `${parts.join(', ')}.`;
  }
  if (category === 'artifact' || category === 'treasure') {
    const known = ARTIFACT_TEXT[name];
    if (known) return known;
    const t = ALL_TREASURES.find((x) => x.name === name);
    if (!t) return null;
    return t.kind === 'heavy' ? `Heavy treasure (${plural(t.weight, 'kg')}), worth ${t.points} points.` : null;
  }
  return null;
}
