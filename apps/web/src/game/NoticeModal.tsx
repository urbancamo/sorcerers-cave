import { ALL_HAZARD_NAMES } from "@sorcerers-cave/engine";
import { noticeTone, type Notice } from "./eventNotices";
import { HazardCardPiece } from "./HazardCardPiece";
import type { CardArt } from "../data/manifest";

/** A blocking acknowledgement modal for panel-dispatched outcomes (artifact effects, etc.)
 *  that aren't dice rolls. Mirrors the renderer's move-time "Aftermath" modal. */
export function NoticeModal({ notices, onClose, cards }: { notices: Notice[]; onClose: () => void; cards?: CardArt[] }) {
  // A spent hazard card is the set piece: shown with its outcome, then discarded when the player continues.
  const hazard = notices.find((n) => n.hazard !== undefined)?.hazard;
  return (
    <div className="scv-dice-overlay" role="dialog" aria-label="notice" data-testid="notice-modal">
      <div className="scv-dice-card">
        {hazard !== undefined && cards && <HazardCardPiece hazard={hazard} cards={cards} />}
        <div className="scv-dice-title">{hazard !== undefined ? ALL_HAZARD_NAMES[hazard] ?? "Aftermath" : "Aftermath"}</div>
        <div className={"scv-dice-msg " + noticeTone(notices)}>
          {notices.map((n, i) => (
            <p key={i}>{n.text}</p>
          ))}
        </div>
        <button className="scv-primary" onClick={onClose}>Continue</button>
      </div>
    </div>
  );
}
