import { CREATURES, TREASURES, scoreGame, GS_ESCAPED, GS_DEAD, GS_QUIT, type GameState } from "@sorcerers-cave/engine";

const OUTCOME: Record<number, string> = {
  [GS_ESCAPED]: "Your party escaped the cave!",
  [GS_DEAD]: "The party perished in the dark.",
  [GS_QUIT]: "You abandoned the expedition.",
};

export function GameOverScreen({ state, onNewGame }: { state: GameState; onNewGame: () => void }) {
  const score = scoreGame(state);
  const survivors = state.party.filter((m) => m.status === 0 || m.status === 1);
  return (
    <section className="scv-panel" data-testid="game-over">
      <h2 className="scv-hd">{OUTCOME[state.gs] ?? "The expedition ends."}</h2>
      <p className="scv-score">{score}</p>
      <p className="scv-points">points</p>
      {survivors.length > 0 && (
        <ul className="scv-survivors">
          {survivors.map((m, i) => (
            <li key={i}>
              {CREATURES[m.creatureId]!.name}
              {m.treasure.length > 0 && <> — {m.treasure.map((t) => TREASURES[t]!.name).join(", ")}</>}
            </li>
          ))}
        </ul>
      )}
      <button className="scv-primary" onClick={onNewGame}>New game</button>
    </section>
  );
}
