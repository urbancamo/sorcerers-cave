import { useState } from "react";
import { ALL_CREATURES, type GameAction, type GameState } from "@sorcerers-cave/engine";
import { HelpButton } from "../manual/HelpButton";

/** A Quarrel finds several members equally strong for the last place(s) in it (engine phase `quarrel`, ruling R-14): the player chooses
 *  which of the equals take part. Those clearly stronger are already in it. Blocking, like the trap choice. */
export function QuarrelChoice({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const pause = state.quarrelPause;
  const [picked, setPicked] = useState<number[]>([]);
  if (!pause) return null;
  const name = (i: number) => ALL_CREATURES[state.party[i]?.creatureId ?? -1]?.name ?? "A member";
  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : p.length < pause.slots ? [...p, i] : p));
  const ready = picked.length === pause.slots;
  return (
    <div className="scv-dice-overlay"
         role="dialog"
         aria-label="A quarrel"
         data-testid="quarrel-choice">
      <div className="scv-dice-card scv-tp-card">
        <div className="scv-dice-title">
          A quarrel breaks out <HelpButton topics={["hazard-quarrel"]} label="Help with the quarrel" />
        </div>
        <p className="scv-tp-text">
          {pause.fixed.length > 0 && <>{pause.fixed.map(name).join(" and ")} will be in it. </>}
          {pause.candidates.length} members are equally strong for the {pause.slots === 1 ? "other place" : `other ${pause.slots} places`}. Choose {pause.slots}.
        </p>
        <div className="scv-tp-actions">
          {pause.candidates.map((i) => (
            <button key={i}
                    className={picked.includes(i) ? "scv-primary danger" : "scv-primary"}
                    aria-pressed={picked.includes(i)}
                    onClick={() => toggle(i)}>
              {name(i)}
            </button>
          ))}
        </div>
        <div className="scv-tp-actions">
          <button className="scv-primary"
                  disabled={!ready}
                  onClick={() => dispatch({ type: "chooseQuarrel", members: picked })}>
            Let them quarrel
          </button>
        </div>
      </div>
    </div>
  );
}
