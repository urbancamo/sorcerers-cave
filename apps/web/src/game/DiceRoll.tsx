import { useEffect, useState } from "react";

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
  onContinue,
}: {
  title: string;
  lanes: Lane[];
  message?: string;
  tone: "good" | "bad" | "neutral";
  onContinue: () => void;
}) {
  const [tick, setTick] = useState(0);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    setSettled(false);
    setTick(0);
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
  }, [lanes]);

  let dieIdx = 0;
  const die = (spec: DieSpec, big: boolean) => {
    const i = dieIdx++;
    const face = settled ? spec.value : ((tick + i) % 6) + 1;
    return (
      <div className="scv-dice-side">
        {spec.name && <span className="scv-dice-name">{spec.name}</span>}
        <div
          className={
            "scv-die" +
            (big ? " big" : "") +
            (settled ? " settled" : "") +
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
        <div className="scv-dice-title">{title}</div>
        <div className={"scv-dice-lanes" + (versus ? " versus" : "")}>
          {lanes.map((lane, i) =>
            lane.party ? (
              <div className="scv-dice-lane" key={i}>
                {die(lane.party, false)}
                <span className="scv-dice-vs">vs</span>
                {die(lane.enemy, false)}
              </div>
            ) : (
              <div className="scv-dice-lane" key={i}>
                {die(lane.enemy, true)}
              </div>
            ),
          )}
        </div>
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
