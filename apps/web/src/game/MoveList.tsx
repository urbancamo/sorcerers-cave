import type { Dir, Move } from "../view/ports";

export function MoveList({ moves, onMove }: { moves: Move[]; onMove: (dir: Dir) => void }) {
  if (moves.length === 0) return <p className="text-stone-400">No moves available.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {moves.map((m) => (
        <button
          key={`${m.dir}:${m.target.level},${m.target.col},${m.target.row}`}
          className="rounded bg-amber-700 px-3 py-1 font-semibold"
          onClick={() => onMove(m.dir)}
        >
          {m.dir} <span className="text-amber-200 text-xs">({m.kind})</span>
        </button>
      ))}
    </div>
  );
}
