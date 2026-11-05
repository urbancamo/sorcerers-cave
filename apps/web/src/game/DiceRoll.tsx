import { useEffect, useState } from "react";
import { readAutoRoll } from "./autoRoll";
import { HazardCardPiece } from "./HazardCardPiece";
import type { CardArt } from "../data/manifest";

export type DieSpec = { value: number; name?: string; total?: number; outcome?: "win" | "lose" | "tie" };
/** A reaction lane has only `enemy`; a combat lane has both sides (shown side by side). */
export type Lane = { party?: DieSpec; enemy: DieSpec };

const TICKS = 11;
const TICK_MS = 80;

/** A modal that tumbles every die, settles them on their values, then reveals the outcome. */
export function DiceRoll({
  title,
  lanes,
  message,
  tone,
  partyLeft,
  stakes,
  autoRoll,
  hazard,
  cards,
  onContinue,
}: {
  title: string;
  lanes: Lane[];
  message?: string;
  tone: "good" | "bad" | "neutral";
  /** Revised fights show the party on the left; the older fight surface puts the foe there. */
  partyLeft?: boolean;
  /** What is riding on the roll. When given, the dice wait, unthrown, for the player's "Roll the dice" click
   *  (unless they have chosen to auto-roll); the values shown are already decided, the click only reveals them. */
  stakes?: string;
  autoRoll?: boolean;
  /** A once-only hazard card this roll plays out (Mutiny, Desertion, Quarrel, Spell, Harpies): shown as the set piece, then discarded. */
  hazard?: number;
  cards?: CardArt[];
  onContinue: () => void;
}) {
  const [tick, setTick] = useState(0);
  const [settled, setSettled] = useState(false);
  const gated = !!stakes && !(autoRoll ?? readAutoRoll());
  const [thrown, setThrown] = useState(!gated);

  useEffect(() => {
    setSettled(false);
    setTick(0);
    if (!thrown) return;
    let n = 0;
    const iv = setInterval(() => {
      n += 1;
      if (n >= TICKS) {
        clearInterval(iv);
        setSettled(true);
      } else {
        setTick((t) => t + 1);
      }
    }, TICK_MS);
    return () => clearInterval(iv);
  }, [lanes, thrown]);

  let dieIdx = 0;
  const die = (spec: DieSpec, big: boolean) => {
    const i = dieIdx++;
    const face = !thrown ? "?" : settled ? spec.value : ((tick + i) % 6) + 1;
    return (
      <div className="scv-dice-side">
        {spec.name && <span className="scv-dice-name">{spec.name}</span>}
        <div
          className={
            "scv-die" +
            (big ? " big" : "") +
            (settled ? " settled" : "") +
            (!thrown ? " waiting" : "") +
            (settled && spec.outcome ? " " + spec.outcome : "")
          }
          data-testid="die"
        >
          {face}
        </div>
        {settled && spec.total !== undefined && <span className="scv-dice-total">= {spec.total}</span>}
      </div>
    );
  };

  const versus = lanes.some((l) => l.party);

  return (
    <div className="scv-dice-overlay" role="dialog" aria-label="dice roll">
      <div className="scv-dice-card">
        {hazard !== undefined && cards && <HazardCardPiece hazard={hazard} cards={cards} />}
        <div className="scv-dice-title">{title}</div>
        {!thrown && stakes && <p className="scv-dice-stakes">{stakes}</p>}
        <div className={"scv-dice-lanes" + (versus ? " versus" : "")}>
          {lanes.map((lane, i) =>
            lane.party ? (
              // Matches the fight dialog: the revised one has the party on the left, the older one "them vs me".
              <div className="scv-dice-lane" key={i}>
                {partyLeft ? die(lane.party, false) : die(lane.enemy, false)}
                <span className="scv-dice-vs">vs</span>
                {partyLeft ? die(lane.enemy, false) : die(lane.party, false)}
              </div>
            ) : (
              <div className="scv-dice-lane" key={i}>
                {die(lane.enemy, true)}
              </div>
            ),
          )}
        </div>
        {!thrown && <button className="scv-primary" onClick={() => setThrown(true)}>Roll the dice</button>}
        {settled && (
          <>
            {message && <p className={"scv-dice-msg " + tone}>{message}</p>}
            <button className="scv-primary" onClick={onContinue}>Continue</button>
          </>
        )}
      </div>
    </div>
  );
}
