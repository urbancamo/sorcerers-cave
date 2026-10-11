import { useEffect, useMemo, useState } from "react";
import { legalActions, teleportDestinations, unpackCoord, type GameAction, type GameState } from "@sorcerers-cave/engine";
import { projectArea, type ArtTables } from "../view/projection";

/** What the 3D cave view needs to let the player pick a destination (view/cave3d.js `setPicker`). */
export type DestinationPicker = (opts: {
  destinations: { idx: number; col: number; row: number; level: number }[];
  onPick: (idx: number) => void;
} | null) => void;

/** The Sorcerer lies defeated (§The Sorcerer): slay him for the bounty, or spare him on condition that he teleport
 *  the party, and the treasure here, to any area already discovered. Shown for the engine's `sorcerer` phase.
 *  Slaying dispatches straight away. Sparing hands the choice to the 3D cave view — every allowed area is ringed
 *  and the player clicks one — and `onTeleport` passes the chosen area up so the teleport effect can play before
 *  the action is dispatched. */
export function SorcererTerms({ state, art, dispatch, onTeleport, setPicker }: {
  state: GameState; art: ArtTables; dispatch: (a: GameAction) => void; onTeleport: (area: number) => void;
  setPicker?: DestinationPicker;
}) {
  const [step, setStep] = useState<"terms" | "map">("terms");
  const [chosen, setChosen] = useState<number | null>(null);
  const canSpare = legalActions(state).some((a) => a.type === "spareSorcerer");
  const treasure = state.treasures.length;

  useEffect(() => {
    if (step !== "map" || !setPicker) return;
    const destinations = teleportDestinations(state).map((idx) => {
      const { level, x, y } = unpackCoord(state.areas[idx]!.coord);
      return { idx, col: x, row: y, level };
    });
    setPicker({ destinations, onPick: setChosen });
    return () => setPicker(null);
  }, [step, state, setPicker]);

  const picked = useMemo(() => {
    if (chosen === null) return null;
    const pa = state.areas[chosen]!;
    const a = projectArea(pa, chosen, state, art);
    return { name: a.destroyed ? "Collapsed area" : a.name, level: unpackCoord(pa.coord).level };
  }, [chosen, state, art]);

  if (step === "map") {
    return (
      <div className="scv-tp-bar" role="dialog" aria-label="Choose a destination" data-testid="teleport-picker">
        <p className="scv-tp-text">
          Click a ringed area in the cave. Your party{treasure ? " and the treasure" : ""} will travel with you.
        </p>
        <div className="scv-tp-actions">
          <button className="scv-primary ghost" onClick={() => { setChosen(null); setStep("terms"); }}>Back</button>
          <button className="scv-primary" disabled={picked === null} onClick={() => chosen !== null && onTeleport(chosen)}>
            {picked ? `Teleport to ${picked.name.toLowerCase()} on level ${picked.level}` : "Choose a destination"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="scv-dice-overlay" role="dialog" aria-label="The Sorcerer's terms" data-testid="sorcerer-terms">
      <div className="scv-dice-card scv-tp-card">
        <div className="scv-dice-title">The Sorcerer is defeated</div>
        <p className="scv-tp-text">
          He lies at your mercy. Slay him, and the cave is yours: a 30-point bounty, and every curse upon your party lifted.
        </p>
        <p className="scv-tp-text">
          Or spare his life on one condition — that he carry your party{treasure ? ` and the ${treasure === 1 ? "treasure" : `${treasure} treasures`} here` : ""}, by his magic,
          to any area you have discovered. He earns no bounty and lifts no curse, and he stays in this chamber.
        </p>
        <div className="scv-tp-actions">
          <button className="scv-primary danger" onClick={() => dispatch({ type: "slaySorcerer" })}>Slay the Sorcerer</button>
          <button className="scv-primary" disabled={!canSpare} onClick={() => setStep("map")}>Spare him — choose where to go</button>
        </div>
      </div>
    </div>
  );
}
