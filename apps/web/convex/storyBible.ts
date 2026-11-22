/**
 * The story bible: what the cave is like, for the writer. EDIT THE WORDING HERE. Entries are fiction-facing (how a thing looks,
 * sounds and behaves, and what it is likely to mean in a story), never statistics or rules. Only the entries for creatures,
 * artefacts and places that appear in a game's digest are given to the model (`bibleFor`), so its attention stays on that run.
 *
 * Every entry is colour for something the record says happened. None of it is a source of events: the writer is told so in
 * the header, and the fact-checker still checks the story against the record alone.
 */

export const BIBLE_HEADER = `THE WORLD, for colour. Use it to make what the record says happened feel real: how a creature looks and carries itself, \
what an object is like in the hand, what a place does to the people in it. Nothing here happened unless the record says it did, \
so use an entry only to colour an event that is in the record, never because it appears here. Never use the record's capitalised \
names for things; say what they are in plain words.

THE CAVE. A deep place of stairs, chambers and cold air, floor under floor, that strangers have entered for treasure for longer \
than anyone remembers. It is not cruel; it is indifferent, and it rarely repeats itself. Light is scarce and sound carries. The \
creatures in it are not villains and not monsters in the usual sense: many can be talked to and some can be won over, and a party \
that goes down grows or shrinks by who it meets. Tell it plainly, as something that happened to real people.`;

/** Creatures, by the name the digest uses. */
export const CREATURE_LORE: Record<string, string> = {
  "Hero": "A seasoned adventurer, steady under pressure, whose bearing makes strangers trust a party. The natural person for a story to follow.",
  "W-Hero": "A woman hero: the equal of any hero in nerve, and strangers warm to her as readily. The record calls her 'W-Hero'; the story must say 'the heroine' or 'the woman', never 'W-Hero'.",
  "Ogre": "Huge, slow to anger and slower to be understood, with a back that carries what would break anyone else. Says little. Won over, it is the most dependable thing in the party.",
  "Troll": "Broad and stony-skinned, stolid, sullen at first meeting. Strong and hard to move; loyal once it has chosen a side.",
  "Priest": "Robed, quiet and steadier at the back of a line than the front. Brings prayer and a little power; fragile in a fight and often the one who sees what it costs.",
  "Man": "An ordinary man: neither brave nor craven by nature, which is what makes him matter. Give him one particular trait (a limp, a cracked lip) rather than a name if he has no name.",
  "Woman": "A capable ordinary woman, practical and unsentimental. Unicorns will come to her.",
  "Dwarf": "Small, stubborn, and in his element underground: he knows how stone is laid and reads a floor for a trap. A hard bargain-driver. Losing the one who knows the way is felt.",
  "Wizard": "Gaunt and dry, wary of rivals, with power held in a staff or a gesture. Carries what others cannot, and is rarely a friend to a Sorcerer.",
  "Spectre": "A cold thing with no body, felt before it is seen. Steel does nothing to it, and the party's fear of it is out of proportion to anything it does.",
  "Dragon": "The old hoard-keeper: vast, slow to turn, smelling of scorched stone, sleeping lightly on what it guards. Killing one is the kind of thing a party remembers for the rest of its life.",
  "Sorcerer": "The master of the cave, still and patient, wrapped in gems and old magic. While he lives, curses laid on a party hold; his death lifts them.",
  "Giant": "The strongest thing in the cave and mostly good-natured about it, slow-spoken, able to carry more than anyone and to wade where others cannot. A Giant in the party changes how a fight feels.",
  "Unicorn": "Pale and shy, and it comes only to women and heroines. Its joining is a rare grace, and the party that has it knows it.",
  "Apprentice": "A nervous young caster with more talent than judgement; his power frightens him as much as his enemies.",
  "Demon": "Not of this world, unhurried and wrong in the way it moves. Ordinary weapons do not trouble it; only certain things can stand against it.",
  "Lion": "Tawny, wary, a great cat that has chosen to walk with people and does not quarrel. It sees in the dark and settles near the one it trusts.",
  "Scholar": "Bookish and curious, more at home reading an inscription than holding a line. Uses a priest's tools. Fascinated by the cave in a way the others are not.",
  "Witch": "Sharp-eyed and unsentimental, with fierce magic and no patience for fools. A useful ally and an uneasy one.",
  "Thief": "Quick-handed and watchful, a person who looks at what others carry. May lift one thing from a stranger who has not noticed, and the stranger turns hostile when they do.",
  "Wolf": "Lean, silent and hard to fool; keeps close to the edge of the light. Immune to the cave's cruelest tricks (the Medusa's gaze, mutiny).",
  "Sibyl": "A seer, calm and unreadable, who has already seen how it ends and says little of it.",
  "Ghoul": "A thing that feeds on the dead, shambling and patient. Wards keep it off; nothing else does for long.",
  "Statue": "A colossal stone figure that guards the Lost Ruby, set in its forehead. It has stood for ages and does not move until someone reaches for the jewel.",
};

/** Artefacts and special treasure, by the name the digest uses, with the plain words to call them in the story. */
export const TREASURE_LORE: Record<string, string> = {
  "Magic Sword": "Call it a sword. A blade that keeps its edge and seems to pull the hand toward the work; it feels lighter than it should.",
  "Magic Carpet": "Call it a carpet. A rolled rug that, unrolled and commanded by a priest or wizard, carries a party off through the air. It is left behind afterwards.",
  "Lotus Dust": "Call it a pouch of pale dust. A pinch sends one creature to sleep for a short while; it does not last.",
  "Healing Balm": "Call it a jar of balm. It brings back someone who has only just fallen; a day later it would be too late.",
  "Talisman": "Call it a charm or a pendant worn at the throat. Keeps off the dead things that walk, and, deeper down, the cold ones.",
  "Strength Potion": "Call it a flask of something the colour of old brass. One draught, and a fighter is stronger for the length of a fight.",
  "Magic Staff": "Call it a staff. In a wizard's hands it frees what has been turned to stone and wards off the gaze that does it; it hums faintly when it works.",
  "The Ring": "Call it a ring. Worn, it turns luck slightly the party's way, and deep enough it makes the wearer hard to kill.",
  "Lost Ruby": "Call it the ruby. A great red stone set in the forehead of a statue, guarded by it, and taken at a price.",
  "Charmed Flute": "Call it a flute. Its song puts dragons and vipers to sleep, and opens hidden doors. Whoever plays it must keep their nerve.",
  "Eye of God": "Call it a gem, or the Eye. It silences magic in its reach and destroys what has no body; but whoever takes it up must keep it, or the party is cursed. A prize with a leash.",
  "Treasure Chest": "A heavy chest, hard to carry between two. What is inside is a gamble: silver, gold or gems, or sand, or something that bursts out.",
  "Elixir": "Call it a draught or a vial. One taste, and it kills, does nothing, or makes the drinker stronger for good; the party drinks and finds out.",
  "Holy Water": "Call it a vial of water. It frees what is turned to stone and destroys the cold creatures that have no body.",
  "Magic Axe": "Call it an axe. Sharper than it should be, and the only weapon that will stand against a demon.",
  "Idol": "Call it an idol. A heavy carved figure that is worth a great deal more in the light than it feels in the hand.",
  "Scroll": "Call it a scroll. Read aloud, it destroys every enemy in the room that has no magic, and curses the party that reads it.",
  "Magic Shield": "Call it a shield. The one who bears it is hard to wound with magic; it turns aside what should not be turned.",
};

/** Places and perils, matched in the digest by a plain phrase (case-insensitive). */
export const PLACE_LORE: { match: RegExp; text: string }[] = [
  { match: /pit of vipers|vipers/i, text: "The viper pit: a floor of moving black rope that no one crosses unmoved. A flute can put it to sleep; otherwise it is a matter of luck and nerve." },
  { match: /deep pool/i, text: "The deep pool: black, wide, with no far bank a lamp can find. Heavy treasure does not cross it easily, and nobody wants to be the first to try." },
  { match: /chasm/i, text: "The chasm: a gap in the floor with no bottom that light reaches. A way down for those willing to jump." },
  { match: /whirlpool/i, text: "The whirlpool: water that turns and pulls. A party that enters it is carried, and does not choose where." },
  { match: /gallery of statues/i, text: "The gallery: a hall of figures that were once living strangers, now stone, silent and waiting." },
  { match: /\blair\b/i, text: "The lair: a harpies' roost, with a hoard of what they have stolen from others." },
  { match: /\bwell\b/i, text: "The well: a shaft with a bucket on a rope, in the middle of the dark." },
  { match: /bell rope/i, text: "The bell rope: a rope that hangs from the dark, and to pull it is to ask a question of something." },
  { match: /\btomb\b/i, text: "The tomb: a sealed chamber of the long dead, undisturbed until now." },
  { match: /great hall/i, text: "The great hall: a vast empty room whose size is its own threat." },
  { match: /mutiny/i, text: "A mutiny: part of the party turns on the rest, leaves, and drops what it carries. It can be won back by those with the standing to do it, but not by force." },
  { match: /\(trap\)|trap sprang|trap\b/i, text: "A trap: a floor that gives way, dropping the party to a lower floor with no way to climb back from where it fell. A dwarf in the party may know the way round." },
  { match: /earthquake/i, text: "An earthquake: the cave shakes, the ceiling runs with dust, and the party may be split or hurt in the dark." },
  { match: /medusa/i, text: "Medusa: a gaze that turns whoever meets it to stone. The only defence is not to look: eyes down, or something that stands between." },
  { match: /ghoul/i, text: "Ghouls: dead things that attack in a rush. Wards keep them away." },
  { match: /desertion|deserted/i, text: "Desertion: someone in the party simply stops and goes, in a moment of fear or doubt, carrying what they hold." },
  { match: /harpies/i, text: "Harpies: they steal treasure from the party and carry it off to the lair." },
  { match: /quarrel/i, text: "A quarrel: two members of the party fall out and one has to give way." },
];

/** Does this name appear in the digest as a word, allowing a plural 's' (the digest writes "2 Dwarfs") and not as part of a hyphenated name? */
const mentions = (text: string, name: string): boolean => new RegExp(`(?<![\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?(?![\\w-])`).test(text);

/** The bible entries for what appears in this digest, ready to put in a prompt; empty when nothing matches. */
export function bibleFor(digestText: string): string {
  // The Ruby's statue is not a creature the digest names; it appears as "the statue guarding the Ruby" (not the Gallery's statues).
  const creatures = Object.entries(CREATURE_LORE).filter(([name]) => name === "Statue" ? /statue guarding the Ruby/.test(digestText) : mentions(digestText, name));
  const treasures = Object.entries(TREASURE_LORE).filter(([name]) => mentions(digestText, name));
  const places = PLACE_LORE.filter((p) => p.match.test(digestText));
  if (!creatures.length && !treasures.length && !places.length) return "";
  return [
    BIBLE_HEADER,
    ...(creatures.length ? ["", "WHO IS IN IT:", ...creatures.map(([n, t]) => `- ${n}: ${t}`)] : []),
    ...(treasures.length ? ["", "WHAT THEY CARRY:", ...treasures.map(([n, t]) => `- ${n}: ${t}`)] : []),
    ...(places.length ? ["", "PLACES AND PERILS:", ...places.map((p) => `- ${p.text}`)] : []),
  ].join("\n");
}
