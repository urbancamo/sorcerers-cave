import { useState } from "react";

/**
 * A button that requires a second tap before it acts — the "blocking confirm popup" pattern the
 * extension kit design calls for repeatedly (descendChasm US-02, drawFromWell US-07, enterCrypt
 * US-08, pullBellRope US-03, the Elixir US-19): tap the action once, read the consequence, then
 * confirm or back out. Reusable by both `ExplorePanel` and `EncounterPanel` (the same action can be
 * legal in either phase — see selectors.ts's Chasm/Well/Bell Rope mid-encounter latitude) so the
 * confirm behaviour and its markup live in exactly one place.
 */
export function ConfirmButton({
  label,
  confirmText,
  className = "scv-enc-btn",
  onConfirm,
}: {
  label: string;
  confirmText: string;
  className?: string;
  onConfirm: () => void;
}) {
  const [pending, setPending] = useState(false);

  if (!pending) {
    return (
      <button type="button" className={className} onClick={() => setPending(true)}>
        {label}
      </button>
    );
  }

  return (
    <div className="scv-confirm" data-testid="confirm-prompt">
      <p className="scv-confirm-text">{confirmText}</p>
      <div className="scv-confirm-actions">
        <button type="button" className={className} onClick={() => { setPending(false); onConfirm(); }}>
          Confirm
        </button>
        <button type="button" className="scv-enc-btn ghost" onClick={() => setPending(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * A member-picker dropdown that requires a confirm before acting — the Bell Rope's own pattern
 * (design US-03: "Assignment dropdown … to choose the puller, then a confirm. Declining is always
 * allowed."). Generalized over any small set of `{ label, action }` options rather than hardcoded
 * to `pullBellRope`, so it composes with the same EncounterPanel-style row used for takeTreasure/
 * useArtifact dropdowns.
 */
export function ConfirmPicker<T>({
  rowLabel,
  placeholder,
  options,
  confirmText,
  onConfirm,
}: {
  rowLabel: string;
  placeholder: string;
  options: { label: string; value: T }[];
  confirmText: (value: T) => string;
  onConfirm: (value: T) => void;
}) {
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const picked = pickedIdx !== null ? options[pickedIdx] : undefined;

  if (!picked) {
    return (
      <label className="scv-enc-row">
        <span className="scv-enc-row-nm">{rowLabel}</span>
        <select
          className="scv-enc-select"
          aria-label={rowLabel}
          value=""
          onChange={(e) => { if (e.target.value !== "") setPickedIdx(Number(e.target.value)); }}
        >
          <option value="">{placeholder}</option>
          {options.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
        </select>
      </label>
    );
  }

  return (
    <div className="scv-confirm" data-testid="confirm-prompt">
      <p className="scv-confirm-text">{confirmText(picked.value)}</p>
      <div className="scv-confirm-actions">
        <button type="button" className="scv-enc-btn" onClick={() => { setPickedIdx(null); onConfirm(picked.value); }}>
          Confirm
        </button>
        <button type="button" className="scv-enc-btn ghost" onClick={() => setPickedIdx(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
