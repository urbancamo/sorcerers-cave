// The 52-card chamber deck template (spec §3.5), unshuffled.
export function smallPackTemplate(): number[] {
  const cards: number[] = [];
  const add = (code: number, n: number) => {
    for (let i = 0; i < n; i++) cards.push(code);
  };
  // Creatures (19): 100 + creatureId
  add(101, 1); // W-Hero
  add(102, 3); // Ogre
  add(103, 2); // Troll
  add(108, 3); // Wizard
  add(109, 3); // Spectre
  add(110, 3); // Dragon
  add(111, 1); // Sorcerer
  add(112, 2); // Giant
  add(113, 1); // Unicorn
  // Treasures (27): 200 + treasureId
  add(200, 6); // Silver
  add(201, 6); // Gold
  add(202, 3); // Gems
  for (let t = 3; t <= 14; t++) add(200 + t, 1); // 1 of each artifact (12)
  // Hazards (6): 300 + hazardId
  add(300, 1); // Mutiny
  add(301, 2); // Trap
  add(302, 1); // Earthquake
  add(303, 1); // Medusa
  add(304, 1); // Ghouls
  return cards;
}
