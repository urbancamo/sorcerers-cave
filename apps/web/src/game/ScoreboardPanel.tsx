import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Scoreboard, type ScoreboardParty } from "./Scoreboard";

type Cb = {
  onSpectate?: () => void; onViewMyRun?: () => void; onQuit?: () => void;
  onResume?: () => void; onBackToMenu?: () => void; onRowClick?: (seat: number) => void;
};

/** Subscribes to the reactive gameState and renders the pure Scoreboard. */
export function ScoreboardPanel({ gameId, frozen, ...cb }: { gameId: Id<"games">; frozen?: boolean } & Cb) {
  const proj = useQuery(api.multiplayer.gameState, { gameId });
  if (!proj || proj.phase === "lobby" || proj.phase === "partySelect") return null;
  return <Scoreboard parties={proj.parties as ScoreboardParty[]} youSeat={proj.youSeat} frozen={frozen} {...cb} />;
}
