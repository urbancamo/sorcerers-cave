import { CREATURES, TREASURES, carriedWeight, legalActions, type GameState, type GameAction } from "@sorcerers-cave/engine";

// The `fight` phase is owned by the FightSurface (drag-card pairing); this panel keeps encounter + pickup.
const ACTIVE = new Set<GameState["phase"]>(["encounter", "pickup"]);

const RETREAT_DIR: Record<number, string> = { 1: "north", 2: "east", 3: "south", 4: "west", 5: "up the stair", 6: "down the stair" };

// Verb shown in an artefact's "use on…" prompt, by treasure id.
const ART_VERB: Record<number, string> = { 5: "put to sleep", 6: "revive", 8: "strengthen", 9: "free from stone" };

/** Disambiguate identical option labels (e.g. two Men) by appending “ #2”, “ #3” to the repeats. */
function dedupeLabels(labels: string[]): string[] {
  const total = new Map<string, number>();
  labels.forEach((l) => total.set(l, (total.get(l) ?? 0) + 1));
  const seen = new Map<string, number>();
  return labels.map((l) => {
    if ((total.get(l) ?? 0) <= 1) return l;
    const n = (seen.get(l) ?? 0) + 1; seen.set(l, n);
    return `${l} #${n}`;
  });
}

/** Human label for a legal action button. */
function label(a: GameAction, state: GameState): string {
  switch (a.type) {
    case "test": return "Test reaction";
    case "attack": return "Attack";
    case "withdraw": return "Withdraw";
    case "retreat": return `Retreat ${RETREAT_DIR[a.dir] ?? ""}`.trim();
    case "leaveTreasure": return "Leave the treasure";
    case "retakeDropped": return "Retake dropped treasure (as before)";
    case "chooseCasualty": {
      const m = state.party[a.idx]!;
      const carried = m.treasure.length;
      // Name + carried-count so two same-creature members can be told apart when choosing.
      return `Let ${CREATURES[m.creatureId]!.name} fall` + (carried ? ` (carrying ${carried})` : "");
    }
    case "takeTreasure": {
      const tid = state.treasures[a.ti]!;
      const tname = TREASURES[tid]?.name ?? "treasure";
      const member = CREATURES[state.party[a.mi]!.creatureId]!.name;
      // The Lost Ruby (id 11) is guarded by a strength-8 statue that must be beaten to claim it (§16).
      return tid === 11
        ? `Seize the ${tname} — ${member} must defeat the guardian statue`
        : `Take ${tname} → ${member}`;
    }
    case "useArtifact": {
      const tname = TREASURES[a.artifact]?.name ?? `artifact ${a.artifact}`;
      // Member-targeting revives — name the member so each option is distinct.
      if (a.target !== undefined) {
        if (a.artifact === 6) return `${tname} — revive ${CREATURES[state.party[a.target]!.creatureId]!.name}`;
        if (a.artifact === 9) return `${tname} — free ${CREATURES[state.party[a.target]!.creatureId]!.name} from stone`;
      }
      return `Use ${tname}`;
    }
    default: return a.type;
  }
}

export function EncounterPanel({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  if (!ACTIVE.has(state.phase)) return null;
  const actions = legalActions(state);
  const strangers = state.strangers.map((id) => CREATURES[id]!.name);
  const treasures = state.treasures.map((id) => TREASURES[id]!.name);

  // Collapse the action explosion into one control per treasure / per artefact:
  //  - each treasure is listed once, with a dropdown of the members who can carry it;
  //  - each artefact is listed once, with a dropdown of the targets it can be used on.
  // Everything else (test, attack, withdraw, leave, retake) stays a plain button.
  const takeByTi = new Map<number, number[]>();        // treasure index -> member indices that can carry it
  const artByArtifact = new Map<number, GameAction[]>(); // artefact id -> its target actions
  const simple: GameAction[] = [];
  for (const a of actions) {
    if (a.type === "takeTreasure") (takeByTi.get(a.ti) ?? takeByTi.set(a.ti, []).get(a.ti)!).push(a.mi);
    else if (a.type === "useArtifact") (artByArtifact.get(a.artifact) ?? artByArtifact.set(a.artifact, []).get(a.artifact)!).push(a);
    else simple.push(a);
  }

  const memberName = (mi: number) => {
    const m = state.party[mi]!, c = CREATURES[m.creatureId]!;
    return c.carry > 0 ? `${c.name} (${carriedWeight(m)}/${c.carry}kg)` : c.name;
  };
  // An artefact action's target, named: Lotus Dust (5) targets a stranger; the others a party member.
  const artTargetName = (a: Extract<GameAction, { type: "useArtifact" }>) =>
    a.target === undefined ? "the party"
      : a.artifact === 5 ? CREATURES[state.strangers[a.target]!]!.name
      : CREATURES[state.party[a.target]!.creatureId]!.name;

  return (
    <div className="scv-enc" data-testid="encounter-panel">
      <h3 className="scv-enc-hd">{state.phase}</h3>
      {strangers.length > 0 && (
        <p className="scv-enc-line scv-enc-strangers"><span className="k">Strangers: </span>{strangers.join(", ")}</p>
      )}
      {treasures.length > 0 && (
        <p className="scv-enc-line scv-enc-treasure"><span className="k">Treasure: </span>{treasures.join(", ")}</p>
      )}
      {state.fight && <p className="scv-enc-round">Round {state.fight.round}</p>}
      {state.fight?.casualtyQueue?.length ? (
        <p className="scv-enc-line scv-enc-strangers">Two fell together — choose who is lost.</p>
      ) : null}

      {/* Treasure: one row per item; pick a member to give it to, or leave it. */}
      {takeByTi.size > 0 && (
        <div className="scv-enc-assign">
          {[...takeByTi].map(([ti, mis]) => {
            const labels = dedupeLabels(mis.map(memberName));
            return (
              <label key={`t${ti}`} className="scv-enc-row">
                <span className="scv-enc-row-nm">{TREASURES[state.treasures[ti]!]!.name}</span>
                <select
                  className="scv-enc-select"
                  aria-label={`Assign ${TREASURES[state.treasures[ti]!]!.name}`}
                  value=""
                  onChange={(e) => { if (e.target.value !== "") dispatch({ type: "takeTreasure", ti, mi: mis[Number(e.target.value)]! }); }}
                >
                  <option value="">Leave in chamber</option>
                  {labels.map((lbl, k) => <option key={mis[k]} value={k}>Give to {lbl}</option>)}
                </select>
              </label>
            );
          })}
        </div>
      )}

      {/* Artefacts: one row per artefact; pick the target to use it on. */}
      {artByArtifact.size > 0 && (
        <div className="scv-enc-assign">
          {[...artByArtifact].map(([artifact, acts]) => {
            const aname = TREASURES[artifact]?.name ?? `artifact ${artifact}`;
            const labels = dedupeLabels(acts.map((a) => artTargetName(a as Extract<GameAction, { type: "useArtifact" }>)));
            return (
              <label key={`a${artifact}`} className="scv-enc-row">
                <span className="scv-enc-row-nm">{aname}</span>
                <select
                  className="scv-enc-select"
                  aria-label={`Use ${aname}`}
                  value=""
                  onChange={(e) => { if (e.target.value !== "") dispatch(acts[Number(e.target.value)]!); }}
                >
                  <option value="">{`${aname} — ${ART_VERB[artifact] ?? "use"}…`}</option>
                  {labels.map((lbl, k) => <option key={k} value={k}>{lbl}</option>)}
                </select>
              </label>
            );
          })}
        </div>
      )}

      {simple.length > 0 && (
        <div className="scv-enc-actions">
          {simple.map((a, i) => (
            <button key={i} className="scv-enc-btn" onClick={() => dispatch(a)}>
              {label(a, state)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
