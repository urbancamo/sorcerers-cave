export const FLAG_HUMAN = 1;
export const FLAG_CHARISMA = 2;
export const FLAG_BEFRIENDS_UNICORN = 4;
export const FLAG_GUIDES_PAST_TRAP = 8;
export const FLAG_INHUMAN = 16;

export interface Creature {
  id: number;
  name: string;
  fs: number; // fighting strength
  mp: number; // magical power
  carry: number; // kg capacity
  cost: number | null; // party-selection cost; null = not selectable
  points: number;
  flags: number;
  hostileMax: number | null; // reaction thresholds (cave strangers); null = n/a
  indiffMax: number | null;
  leaderPri: number;
}

// id order is normative (spec §3.2).
export const CREATURES: readonly Creature[] = [
  { id: 0, name: "Hero", fs: 5, mp: 0, carry: 75, cost: 6, points: 10, flags: FLAG_HUMAN | FLAG_CHARISMA, hostileMax: 3, indiffMax: 3, leaderPri: 7 },
  { id: 1, name: "W-Hero", fs: 4, mp: 0, carry: 50, cost: 5, points: 10, flags: FLAG_HUMAN | FLAG_CHARISMA | FLAG_BEFRIENDS_UNICORN, hostileMax: 3, indiffMax: 3, leaderPri: 7 },
  { id: 2, name: "Ogre", fs: 5, mp: 0, carry: 100, cost: 5, points: 5, flags: FLAG_INHUMAN, hostileMax: 4, indiffMax: 5, leaderPri: 3 },
  { id: 3, name: "Troll", fs: 4, mp: 0, carry: 75, cost: 4, points: 4, flags: FLAG_INHUMAN, hostileMax: 3, indiffMax: 4, leaderPri: 2 },
  { id: 4, name: "Priest", fs: 2, mp: 2, carry: 25, cost: 4, points: 8, flags: FLAG_HUMAN, hostileMax: 1, indiffMax: 4, leaderPri: 6 },
  { id: 5, name: "Man", fs: 3, mp: 0, carry: 50, cost: 3, points: 5, flags: FLAG_HUMAN, hostileMax: 2, indiffMax: 4, leaderPri: 5 },
  { id: 6, name: "Woman", fs: 2, mp: 0, carry: 25, cost: 2, points: 5, flags: FLAG_HUMAN | FLAG_BEFRIENDS_UNICORN, hostileMax: 2, indiffMax: 4, leaderPri: 5 },
  { id: 7, name: "Dwarf", fs: 1, mp: 0, carry: 25, cost: 1, points: 2, flags: FLAG_INHUMAN | FLAG_GUIDES_PAST_TRAP, hostileMax: 0, indiffMax: 4, leaderPri: 1 },
  { id: 8, name: "Wizard", fs: 2, mp: 5, carry: 0, cost: null, points: 15, flags: FLAG_HUMAN, hostileMax: 1, indiffMax: 5, leaderPri: 8 },
  { id: 9, name: "Spectre", fs: 0, mp: 5, carry: 0, cost: null, points: 0, flags: 0, hostileMax: 5, indiffMax: 6, leaderPri: 10 },
  { id: 10, name: "Dragon", fs: 6, mp: 0, carry: 0, cost: null, points: 0, flags: FLAG_INHUMAN, hostileMax: 6, indiffMax: 6, leaderPri: 9 },
  { id: 11, name: "Sorcerer", fs: 4, mp: 9, carry: 0, cost: null, points: 0, flags: 0, hostileMax: 6, indiffMax: 6, leaderPri: 11 },
  { id: 12, name: "Giant", fs: 7, mp: 0, carry: 150, cost: null, points: 7, flags: FLAG_INHUMAN, hostileMax: 3, indiffMax: 5, leaderPri: 4 },
  { id: 13, name: "Unicorn", fs: 0, mp: 4, carry: 0, cost: null, points: 4, flags: FLAG_BEFRIENDS_UNICORN, hostileMax: 0, indiffMax: 0, leaderPri: 0 },
];

// Selectable starters (ids 0-7) and their stock counts (spec §3.2).
export const STARTING_STOCK: Readonly<Record<number, number>> = {
  0: 1, 1: 1, 2: 3, 3: 3, 4: 3, 5: 6, 6: 3, 7: 3,
};
