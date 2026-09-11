import { useState } from "react";
import {
  ALL_CREATURES, ALL_TREASURES, ALL_HAZARD_NAMES,
  CREATURES, TREASURES, HAZARD_NAMES,
  SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_TOMB, SPECIAL_GREAT_HALL,
  SPECIAL_CHASM, SPECIAL_BELL_ROPE, SPECIAL_LAIR, SPECIAL_WHIRLPOOL, SPECIAL_GALLERY, SPECIAL_WELL,
  TILE_CHAMBER, TILE_TUNNEL_NE, TILE_TUNNEL_NS, TILE_TUNNEL_NW, TILE_TUNNEL_EW, TILE_TUNNEL_SW,
  TILE_TUNNEL_NES, TILE_TUNNEL_NEW, TILE_TUNNEL_NSW, TILE_TUNNEL_ESW, TILE_TUNNEL_NESW, TILE_TUNNEL_ES,
  DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN,
  type GameState, type GameAction,
} from "@sorcerers-cave/engine";

const SPECIAL_AREA_OPTIONS = [
  { id: SPECIAL_DEEP_POOL, label: "Deep Pool" },
  { id: SPECIAL_VIPER_PIT, label: "Viper Pit" },
  { id: SPECIAL_TOMB, label: "Tomb of Kings" },
  { id: SPECIAL_GREAT_HALL, label: "Great Hall" },
  { id: SPECIAL_CHASM, label: "The Chasm" },
  { id: SPECIAL_BELL_ROPE, label: "The Bell Rope" },
  { id: SPECIAL_LAIR, label: "The Lair" },
  { id: SPECIAL_WHIRLPOOL, label: "The Whirlpool" },
  { id: SPECIAL_GALLERY, label: "The Gallery" },
  { id: SPECIAL_WELL, label: "The Well" },
];
// Select any area tile (2026-09-11): one normal chamber, plus one tunnel per exit shape that
// actually exists in the deck — every 2/3/4-way junction of N/E/S/W (SC-Test-8). TILE_TUNNEL_ES is
// the sole kit-only shape (it exists only on an extension-kit tile).
const PLAIN_TILE_OPTIONS = [
  { id: TILE_CHAMBER, label: "Normal chamber" },
  { id: TILE_TUNNEL_NE, label: "Tunnel NE" },
  { id: TILE_TUNNEL_NS, label: "Tunnel NS" },
  { id: TILE_TUNNEL_NW, label: "Tunnel NW" },
  { id: TILE_TUNNEL_EW, label: "Tunnel EW" },
  { id: TILE_TUNNEL_SW, label: "Tunnel SW" },
  { id: TILE_TUNNEL_NES, label: "Tunnel NES" },
  { id: TILE_TUNNEL_NEW, label: "Tunnel NEW" },
  { id: TILE_TUNNEL_NSW, label: "Tunnel NSW" },
  { id: TILE_TUNNEL_ESW, label: "Tunnel ESW" },
  { id: TILE_TUNNEL_NESW, label: "Tunnel NESW" },
  { id: TILE_TUNNEL_ES, label: "Tunnel ES" },
];
const SPECIAL_OPTIONS = [...SPECIAL_AREA_OPTIONS, ...PLAIN_TILE_OPTIONS];
const SPECIAL_LABEL = new Map(SPECIAL_OPTIONS.map((o) => [o.id, o.label]));
// Kit gating (SC-Test-6/SC-Test-8): every kit-only special (6-11) plus the one kit-only plain-tile
// shape (TILE_TUNNEL_ES) — everything else is available on a kit-off game.
const KIT_ONLY_IDS = new Set([SPECIAL_CHASM, SPECIAL_BELL_ROPE, SPECIAL_LAIR, SPECIAL_WHIRLPOOL, SPECIAL_GALLERY, SPECIAL_WELL, TILE_TUNNEL_ES]);

// Bug fix 2026-08-09 (QOTO-01): Up/Down were missing entirely, so a tester could never queue a
// special for a vertical move — e.g. to confirm the Whirlpool's own "no stairway may lead here"
// block (SC-EXT-6) actually fires rather than silently connecting.
const DIR_OPTIONS = [
  { dir: DIR_N, label: "North" },
  { dir: DIR_E, label: "East" },
  { dir: DIR_S, label: "South" },
  { dir: DIR_W, label: "West" },
  { dir: DIR_UP, label: "Up" },
  { dir: DIR_DOWN, label: "Down" },
];
const DIR_LABEL = new Map(DIR_OPTIONS.map((o) => [o.dir, o.label]));

/** One removable-chip list (strangers, treasures, or hazards) backed by local component state. */
function EntityPicker({
  label, addLabel, options, ids, onChange,
}: {
  label: string; addLabel: string; options: { id: number; name: string }[]; ids: number[]; onChange: (ids: number[]) => void;
}) {
  return (
    <div className="scv-tc-row">
      <span className="scv-tc-row-nm">{label}</span>
      <select aria-label={addLabel} value="" onChange={(e) => { if (e.target.value !== "") onChange([...ids, Number(e.target.value)]); }}>
        <option value="">{addLabel}…</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <span className="scv-tc-chips">
        {ids.map((id, i) => (
          <button key={i} type="button" className="scv-tc-chip" onClick={() => onChange(ids.filter((_, k) => k !== i))}>
            {options.find((o) => o.id === id)?.name ?? id} ×
          </button>
        ))}
      </span>
    </div>
  );
}

/** Test Mode's override controls (§Test Mode) — rendered only for a testMode:true game. Queues the
 *  next area/chamber/reaction override; the tester then plays it out with the ordinary game UI. */
export function TestControlsPanel({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const [dir, setDir] = useState(DIR_N);
  // Kit gating (SC-Test-6): default to a base special when the kit is off, so the initial
  // selection is never one the engine (and the filtered options below) would reject.
  const [special, setSpecial] = useState(state.variants?.extensionKit ? SPECIAL_WHIRLPOOL : SPECIAL_DEEP_POOL);
  const [strangers, setStrangers] = useState<number[]>([]);
  const [treasures, setTreasures] = useState<number[]>([]);
  const [hazards, setHazards] = useState<number[]>([]);
  if (!state.testMode) return null;

  // Kit gating (SC-Test-6/SC-Test-8): a kit-off game rejects kit-only content, so don't even
  // offer it — creature/treasure/hazard ids beyond the base tables' own lengths are kit-only;
  // specials/tiles are named explicitly in KIT_ONLY_IDS since that set isn't a contiguous range.
  const kitOn = !!state.variants?.extensionKit;
  const specialAreaOptions = kitOn ? SPECIAL_AREA_OPTIONS : SPECIAL_AREA_OPTIONS.filter((o) => !KIT_ONLY_IDS.has(o.id));
  const plainTileOptions = kitOn ? PLAIN_TILE_OPTIONS : PLAIN_TILE_OPTIONS.filter((o) => !KIT_ONLY_IDS.has(o.id));
  const creatureOptions = kitOn ? ALL_CREATURES : ALL_CREATURES.filter((c) => c.id < CREATURES.length);
  const treasureOptions = kitOn ? ALL_TREASURES : ALL_TREASURES.filter((t) => t.id < TREASURES.length);
  const hazardOptions = kitOn ? ALL_HAZARD_NAMES : ALL_HAZARD_NAMES.slice(0, HAZARD_NAMES.length);

  return (
    <div className="scv-tc" data-testid="test-controls">
      <h3 className="scv-tc-hd">Test Mode</h3>

      <div className="scv-tc-section">
        <div className="scv-tc-row">
          <label>
            Next area — direction
            <select aria-label="Next area — direction" value={dir} onChange={(e) => setDir(Number(e.target.value))}>
              {DIR_OPTIONS.map((o) => <option key={o.dir} value={o.dir}>{o.label}</option>)}
            </select>
          </label>
          <label>
            Next area — special
            <select aria-label="Next area — special" value={special} onChange={(e) => setSpecial(Number(e.target.value))}>
              <optgroup label="Special areas">
                {specialAreaOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </optgroup>
              <optgroup label="Plain tiles">
                {plainTileOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </optgroup>
            </select>
          </label>
          <button type="button" onClick={() => dispatch({ type: "testPlaceArea", dir, special })}>Queue next area</button>
        </div>
        {state.testNextArea && (
          <p className="scv-tc-armed">
            Armed: {SPECIAL_LABEL.get(state.testNextArea.special)} to the {DIR_LABEL.get(state.testNextArea.dir)}
          </p>
        )}
      </div>

      <div className="scv-tc-section">
        <EntityPicker
          label="Strangers" addLabel="Add a creature"
          options={creatureOptions.map((c) => ({ id: c.id, name: c.name }))}
          ids={strangers} onChange={setStrangers}
        />
        <EntityPicker
          label="Treasures" addLabel="Add a treasure"
          options={treasureOptions.map((t) => ({ id: t.id, name: t.name }))}
          ids={treasures} onChange={setTreasures}
        />
        <EntityPicker
          label="Hazards" addLabel="Add a hazard"
          options={hazardOptions.map((name, id) => ({ id, name }))}
          ids={hazards} onChange={setHazards}
        />
        <button type="button" onClick={() => dispatch({ type: "testSetChamber", strangers, treasures, hazards })}>
          Queue next chamber
        </button>
        {state.testNextChamber && (
          <p className="scv-tc-armed">
            Armed: {state.testNextChamber.strangers.length} strangers, {state.testNextChamber.treasures.length} treasures, {state.testNextChamber.hazards.length} hazards
          </p>
        )}
      </div>

      <div className="scv-tc-section">
        <span className="scv-tc-row-nm">Next reaction</span>
        {(["friendly", "indifferent", "hostile"] as const).map((outcome) => (
          <button key={outcome} type="button" onClick={() => dispatch({ type: "testForceReaction", outcome })}>
            {outcome}
          </button>
        ))}
        {state.testNextReaction && <p className="scv-tc-armed">Armed: {state.testNextReaction}</p>}
      </div>

      <button type="button" className="scv-tc-clear" onClick={() => dispatch({ type: "testClearOverrides" })}>
        Clear all overrides
      </button>
    </div>
  );
}
