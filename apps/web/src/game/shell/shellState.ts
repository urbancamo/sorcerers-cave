// The thin shell has two slots. The left holds the party list or the inventory; the right holds the
// card panel, Settings or Help. Within a slot the occupants are mutually exclusive, and pressing the active
// icon closes the slot. The test panel is not in a slot: it floats above everything and is toggled on its own.
export type LeftSlot = 'party' | 'inventory' | null;
export type RightSlot = 'card' | 'settings' | 'help' | null;

export const toggleLeft = (current: LeftSlot, pressed: Exclude<LeftSlot, null>): LeftSlot =>
  (current === pressed ? null : pressed);

export const toggleRight = (current: RightSlot, pressed: Exclude<RightSlot, null>): RightSlot =>
  (current === pressed ? null : pressed);
