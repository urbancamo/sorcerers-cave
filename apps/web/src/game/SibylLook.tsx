import { useRef, useState } from "react";
import { decodeArea, unpackCoord, type GameAction, type GameState } from "@sorcerers-cave/engine";
import { useManifestArt } from "../data/useManifestCards";
import { tileForCard } from "../view/projection";

type Look = Extract<GameAction, { type: "examineArea" }>;

const SPECIAL_NAME: Record<number, string> = {
  1: "Gateway", 2: "Deep Pool", 3: "Viper Pit", 4: "Tomb", 5: "Great Hall", 6: "Chasm",
  7: "Bell Rope", 8: "Lair", 9: "Whirlpool", 10: "Gallery", 11: "Well",
};

/** A tile card as one readable line: its kind (or special) and the ways out, e.g. "Tunnel — north, south". */
export function describeTile(card: number): string {
  const d = decodeArea(card);
  const ways = [d.n && "north", d.e && "east", d.s && "south", d.w && "west", d.stairUp && "stairs up", d.stairDown && "stairs down"]
    .filter((w): w is string => typeof w === "string");
  const kind = SPECIAL_NAME[d.special] ?? (d.chamber ? "Chamber" : "Tunnel");
  return `${kind} — ${ways.length ? ways.join(", ") : "no exits"}`;
}

const INTRO = "The Sibyl shows you what lies hidden.";
const INTRO_KEY = "scv-sibyl-intro";

/** The Sibyl's line is said on the first look of a browser session only. Storage can be blocked (private
 *  windows, previews); then the line simply shows each time rather than throwing. */
function takeIntro(): boolean {
  try {
    if (sessionStorage.getItem(INTRO_KEY)) return false;
    sessionStorage.setItem(INTRO_KEY, "1");
  } catch { /* storage unavailable — show it */ }
  return true;
}

/** The Sibyl's free look (SC-SIB-8): the top of the large pack, or any face-down tile on the map. The
 *  card is read from `state` here, in this client only — the action's event carries no card content, so
 *  in multiplayer rivals learn only that this seat consulted her. The revealed tile appears as a
 *  see-through card that fades in and out over the view; the text readout stays as a record. All of it is
 *  local UI state. */
export function SibylLook({ state, actions, dispatch }: { state: GameState; actions: Look[]; dispatch: (a: GameAction) => void }) {
  const [seen, setSeen] = useState<string | null>(null);
  const [peek, setPeek] = useState<{ n: number; file: string } | null>(null);
  const looks = useRef(0);
  const art = useManifestArt();
  if (actions.length === 0) return null;
  const pack = actions.find((a) => a.area === undefined);
  const tiles = actions.filter((a) => a.area !== undefined);

  /** Show what was revealed: the fading card (when the manifest has art for it) and the text record. */
  const reveal = (label: string, card: number) => {
    const tile = art ? tileForCard(card, art.tiles) : null;
    // A new `n` remounts the card, so a second look restarts the fade instead of stacking.
    setPeek(tile ? { n: ++looks.current, file: tile.file } : null);
    setSeen(`${takeIntro() ? `${INTRO} ` : ""}${label}: ${describeTile(card)}`);
  };
  const lookPack = () => {
    if (!pack) return;
    dispatch(pack);
    reveal("Top of the pack", state.largePack[state.largeIdx]!);
  };
  const lookTile = (value: string) => {
    const act = tiles.find((a) => String(a.area) === value);
    if (!act) return;
    dispatch(act);
    reveal("Tile", state.areas[act.area!]!.card);
  };

  return (
    <div className="scv-enc-assign">
      <span className="scv-enc-row-nm">The Sibyl</span>
      {pack && <button className="scv-enc-btn" onClick={lookPack}>Look at the top of the pack</button>}
      {tiles.length > 0 && (
        <select className="scv-enc-select" aria-label="Look at a face-down tile" value="" onChange={(e) => lookTile(e.target.value)}>
          <option value="">Face-down tile — choose…</option>
          {tiles.map((a) => {
            const { level, x, y } = unpackCoord(state.areas[a.area!]!.coord); // where it lies on the map
            return <option key={a.area} value={a.area}>{`Level ${level} (${x}, ${y})`}</option>;
          })}
        </select>
      )}
      {seen && <p className="scv-enc-line" data-testid="sibyl-readout">{seen}</p>}
      {peek && (
        <div
          key={peek.n}
          className="scv-sibyl-peek"
          data-testid="sibyl-peek"
          role="img"
          aria-label="The card the Sibyl shows you"
          onAnimationEnd={() => setPeek(null)}
        >
          <img src={peek.file} alt="" />
        </div>
      )}
    </div>
  );
}
