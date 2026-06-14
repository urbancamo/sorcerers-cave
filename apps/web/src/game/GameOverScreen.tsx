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
    <div className="flex flex-col items-center gap-4 text-stone-100" data-testid="game-over">
      <h2 className="text-2xl font-semibold">{OUTCOME[state.gs] ?? "The expedition ends."}</h2>
      <p className="text-4xl font-bold text-amber-400">{score}</p>
      <p className="text-stone-400">points</p>
      <ul className="text-sm text-stone-300">
        {survivors.map((m, i) => (
          <li key={i}>
            {CREATURES[m.creatureId]!.name}
            {m.treasure.length > 0 && <> — {m.treasure.map((t) => TREASURES[t]!.name).join(", ")}</>}
          </li>
        ))}
      </ul>
      <button className="rounded bg-amber-700 px-4 py-2 font-semibold" onClick={onNewGame}>New game</button>
    </div>
  );
}
