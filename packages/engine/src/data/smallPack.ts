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
