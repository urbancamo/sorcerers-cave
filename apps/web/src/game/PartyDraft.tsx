import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CREATURES } from "@sorcerers-cave/engine";
import { PARTY_COLOR_HEX, type PartyColor } from "./partyColors";
import { PartySelect } from "./PartySelect";

export interface DraftProjection {
  youSeat: number;
  currentPicker: number | null;
  parties: { seat: number; name: string; color: string; status: string; members: number[] }[];
  draft: { remaining: Record<number, number>; budget: number } | null;
}

/** Turn-based party draft: the current picker drafts from the shared pack's remaining cards; everyone
 *  else watches the roster fill in. */
export function PartyDraft({ gameId, proj }: { gameId: Id<"games">; proj: DraftProjection }) {
  const pick = useMutation(api.multiplayer.pickParty);
  const me = proj.parties.find((p) => p.seat === proj.youSeat);
  const myTurn = proj.currentPicker === proj.youSeat;
  const havePicked = (me?.members.length ?? 0) > 0;
  const picker = proj.parties.find((p) => p.seat === proj.currentPicker);

  if (myTurn && !havePicked && proj.draft && me) {
    return (
      <PartySelect
        title="Draft your party"
        stock={proj.draft.remaining}
        lockedColor={me.color as PartyColor}
        confirmLabel={(n) => `Confirm party (${n})`}
        onConfirm={(picks) => void pick({ gameId, picks })}
      />
    );
  }

  return (
    <section className="scv-panel scv-mp">
      <h2 className="scv-hd">Party selection</h2>
      <p className="scv-muted">{picker ? <>Waiting for <b>{picker.name}</b> to draft their party…</> : "Drafting parties…"}</p>
      <ul className="scv-lobby-seats">
        {proj.parties.map((p) => (
          <li key={p.seat} className="scv-lobby-seat">
            <span className="scv-lobby-chip" style={{ background: PARTY_COLOR_HEX[p.color as PartyColor] }} />
            <span className="scv-lobby-nm">{p.name}{p.seat === proj.youSeat && <span className="scv-muted"> (you)</span>}</span>
            <span className="scv-lobby-ready">
              {p.members.length > 0
                ? p.members.map((id) => CREATURES[id]!.name).join(", ")
                : p.seat === proj.currentPicker ? "choosing…" : "—"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
