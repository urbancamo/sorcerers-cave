// The player's manual as structured data, so the UI can show the right part of it in context.
// Inline text supports only **bold** and *italic*; the UI renders it as React nodes.

export type CardCategory = 'area' | 'hazard' | 'creature' | 'artifact' | 'treasure';

/** A card a topic explains. `name: '*'` makes the topic general: shown for every card of that category met on the floor. */
export interface CardRef { category: CardCategory; name: string }

/** One option, or a list of which any one suffices. */
export type Requires = VariantKey | VariantKey[];

/** A game option that must be in force for help to apply: a key of the game's own `state.variants`. */
export type VariantKey = 'extensionKit' | 'forcedRedraw' | 'sorcererTeleport' | 'trapRules' | 'sibyl' | 'combatRevision' | 'statueFight';
/** The options a game runs under. `undefined` (no game: splash, tests) means "unknown", so nothing is hidden. */
export type VariantFlags = Partial<Record<VariantKey, boolean | string>>;

/** A block may be tied to one option (a house rule's wording inside a base-rule topic); it is hidden when that option is off. */
export type Block = (
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'note'; tone: 'good' | 'danger' | 'info'; tag?: string; text: string }
) & { requires?: Requires };

/** A place in the game that has help "for this screen". */
export type HelpScreen = 'explore' | 'encounter' | 'pickup' | 'fight' | 'fight-revised' | 'trap' | 'sorcerer'
  | 'party-select' | 'inventory' | 'game-over' | 'high-scores'
  | 'mp-setup' | 'mp-lobby' | 'mp-draft' | 'mp-play' | 'mp-standings' | 'mp-trade' | 'mp-pvp' | 'mp-union';

/** Which optional part of the game a topic belongs to (null/absent = the base game). */
export type Variant = 'kit' | 'sibyl' | 'house';

export interface Topic {
  id: string;            // stable, kebab-case; used for cross-references and tests
  title: string;
  variant?: Variant;
  /** One sentence for tooltips and the head of a popover. */
  brief?: string;
  /** Hidden unless this option is on. Kit and Sibyl topics are gated by their `variant` without needing this. */
  requires?: Requires;
  /** Screens whose "?" button and Help panel list this topic. */
  screens?: HelpScreen[];
  cards: CardRef[];
  blocks: Block[];
}

export interface Section {
  id: string;            // stable id (hazards, kit, …)
  numeral: string;       // the printed manual's Roman numeral
  title: string;
  topics: Topic[];
}
