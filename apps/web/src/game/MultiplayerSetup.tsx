import { useState, type CSSProperties } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { PARTY_COLORS, PARTY_COLOR_HEX, type PartyColor } from "./partyColors";

const REASON: Record<string, string> = {
  not_found: "No game found with that code.",
  started: "That game has already started.",
  full: "That game is full (4 players).",
  name_taken: "That party name is taken — pick another.",
  name_required: "Enter a party name.",
  color_taken: "That colour is taken — pick another.",
};

/** Create or join a multiplayer game. On success, hands the game code up to enter the lobby. */
export function MultiplayerSetup({ mode, onEnterLobby, onCancel }: {
  mode: "create" | "join";
  onEnterLobby: (code: string) => void;
  onCancel: () => void;
}) {
  const createGame = useMutation(api.multiplayer.createMultiplayer);
  const join = useMutation(api.multiplayer.joinByCode);
  const [code, setCode] = useState("");
  const [partyName, setPartyName] = useState("");
  const [color, setColor] = useState<PartyColor | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const codeReady = /^[A-Z]{4}$/.test(code);
  // For joining, preview the lobby reactively to surface validity and which colours are free.
  const preview = useQuery(api.multiplayer.lobby, mode === "join" && codeReady ? { code } : "skip");
  const taken = new Set<string>(mode === "join" ? preview?.takenColors ?? [] : []);

  const submit = async () => {
    setErr(null);
    const name = partyName.trim();
    if (!name) { setErr("Enter a party name."); return; }
    if (!color) { setErr("Pick a colour."); return; }
    setBusy(true);
    try {
      if (mode === "create") {
        const { code: newCode } = await createGame({ partyName: name, color });
        onEnterLobby(newCode);
      } else {
        const res = await join({ code, partyName: name, color });
        if (res.ok) onEnterLobby(code);
        else setErr(REASON[res.reason] ?? "Could not join.");
      }
    } finally { setBusy(false); }
  };

  const canSubmit = !busy && !!partyName.trim() && !!color && (mode === "create" || (codeReady && preview?.lobby === "open"));

  return (
    <section className="scv-panel scv-mp">
      <h2 className="scv-hd">{mode === "create" ? "Start a multiplayer game" : "Join a multiplayer game"}</h2>

      {mode === "join" && (
        <label className="scv-mp-field">
          <span>Game code</span>
          <input
            className="scv-resume-input"
            value={code}
            maxLength={4}
            placeholder="ABCD"
            aria-label="game code"
            autoCapitalize="characters"
            onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4)); setErr(null); }}
          />
        </label>
      )}
      {mode === "join" && codeReady && preview === null && <p className="scv-resume-err">No game found with that code.</p>}
      {mode === "join" && preview && preview.lobby !== "open" && <p className="scv-resume-err">That game has already started.</p>}

      <label className="scv-mp-field">
        <span>Party name</span>
        <input
          className="scv-mp-input"
          value={partyName}
          maxLength={24}
          placeholder="The Bold"
          aria-label="party name"
          onChange={(e) => { setPartyName(e.target.value); setErr(null); }}
        />
      </label>

      <div className="scv-mp-field">
        <span>Colour</span>
        <div className="scv-mp-colors">
          {PARTY_COLORS.map((c) => {
            const isTaken = taken.has(c);
            return (
              <button
                key={c}
                type="button"
                disabled={isTaken}
                className={"scv-mp-swatch" + (color === c ? " sel" : "") + (isTaken ? " taken" : "")}
                style={{ "--swatch": PARTY_COLOR_HEX[c] } as CSSProperties}
                aria-label={c + (isTaken ? " (taken)" : "")}
                title={isTaken ? "taken" : c}
                onClick={() => { setColor(c); setErr(null); }}
              />
            );
          })}
        </div>
      </div>

      {err && <p className="scv-resume-err" role="alert">{err}</p>}

      <button className="scv-primary" disabled={!canSubmit} onClick={() => void submit()}>
        {busy ? "…" : mode === "create" ? "Create game" : "Join game"}
      </button>
      <button className="scv-primary ghost" onClick={onCancel}>Back</button>
    </section>
  );
}
