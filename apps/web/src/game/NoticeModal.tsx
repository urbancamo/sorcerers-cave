import { noticeTone, type Notice } from "./eventNotices";

/** A blocking acknowledgement modal for panel-dispatched outcomes (artifact effects, etc.)
 *  that aren't dice rolls. Mirrors the renderer's move-time "Aftermath" modal. */
export function NoticeModal({ notices, onClose }: { notices: Notice[]; onClose: () => void }) {
  return (
    <div className="scv-dice-overlay" role="dialog" aria-label="notice" data-testid="notice-modal">
      <div className="scv-dice-card">
        <div className="scv-dice-title">Aftermath</div>
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
