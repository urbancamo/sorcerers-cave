// The single small pack (spec §3.2/§3.5), unshuffled — the ONE finite deck for the whole game.
// The exploring party is chosen FROM this pack (those cards are removed in newGame); the remainder
// is shuffled into the chamber draw pile. Counts match the physical deck (the conversion-kit art),
// so each card is finite: take the lone Woman-Hero into your party and it cannot also be drawn as a
// stranger. The variant SIBYL and blank cards are excluded from the basic game (rules §"remove the
// blank cards and the SIBYL"). Unpicked starting humans remain in the pile and may turn up as
// (indifferent) cave strangers, exactly as the rulebook intends.
export function smallPackTemplate(): number[] {
  const cards: number[] = [];
  const add = (code: number, n: number) => {
    for (let i = 0; i < n; i++) cards.push(code);
  };
  // Creatures (37): 100 + creatureId
  add(100, 1); // Hero
  add(101, 1); // Woman-Hero
  add(102, 3); // Ogre
  add(103, 3); // Troll
  add(104, 3); // Priest
  add(105, 6); // Man
  add(106, 3); // Woman
  add(107, 3); // Dwarf
  add(108, 3); // Wizard
  add(109, 3); // Spectre
  add(110, 3); // Dragon
  add(111, 1); // Sorcerer
  add(112, 3); // Giant
  add(113, 1); // Unicorn
  // Treasures (27): 200 + treasureId
  add(200, 6); // Silver
  add(201, 6); // Gold
  add(202, 3); // Gems
  for (let t = 3; t <= 14; t++) add(200 + t, 1); // 1 of each artifact (12)
  // Hazards (7): 300 + hazardId
  add(300, 1); // Mutiny
  add(301, 2); // Trap
  add(302, 2); // Earthquake
  add(303, 1); // Medusa
  add(304, 1); // Ghouls
  return cards;
}

// The extension kit's 30 small-pack codes (design §1.3, official INVENTORY): 11 creatures, 15
// treasures, 4 hazards. `buildSmallPack` (decks.ts) concatenates this onto `smallPackTemplate()`
// before the shuffle when `variants.extensionKit` is set (SC-EXT-4) — a separate function, not
// folded into `smallPackTemplate`, so the base 71-card deck is untouched byte-for-byte.
export function smallPackExtension(): number[] {
  const cards: number[] = [];
  const add = (code: number, n: number) => {
    for (let i = 0; i < n; i++) cards.push(code);
  };
  // Creatures (11): Apprentice, Demon, Lion, Scholar, Witch×3, Thief, Wolf, dup Dwarf, dup Woman
  add(114, 1); // Apprentice
  add(115, 1); // Demon
  add(116, 1); // Lion
  add(117, 1); // Scholar
  add(118, 3); // Witch
  add(119, 1); // Thief
  add(120, 1); // Wolf
  add(107, 1); // Dwarf (kit copy)
  add(106, 1); // Woman (kit copy)
  // Treasures (15): Gold×3, Silver×3, Gems, Lotus Dust, then the 7 new artifacts/heavy treasures
  add(201, 3); // Gold (kit copies)
  add(200, 3); // Silver (kit copies)
  add(202, 1); // Gems (kit copy)
  add(205, 1); // Lotus Dust (kit copy — already a base artifact; same rules, one more deck entry)
  add(215, 1); // Elixir
  add(216, 1); // Holy Water
  add(217, 1); // Magic Axe
  add(218, 1); // Idol
  add(219, 1); // Scroll
  add(220, 1); // Magic Shield
  add(221, 1); // Crypt/Gems
  // Hazards (4): Desertion, Harpies, Quarrel, Spell
  add(305, 1);
  add(306, 1);
  add(307, 1);
  add(308, 1);
  return cards;
}
