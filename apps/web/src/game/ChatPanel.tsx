import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PARTY_COLOR_HEX, type PartyColor } from "./partyColors";

/** Reactive broadcast chat for a multiplayer game (Phase 1). */
export function ChatPanel({ gameId }: { gameId: Id<"games"> }) {
  const messages = useQuery(api.multiplayer.messages, { gameId }) ?? [];
  const send = useMutation(api.multiplayer.sendMessage);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    void send({ gameId, text: body });
  };

  return (
    <div className="scv-chat">
      <div className="scv-chat-log">
        {messages.map((m) =>
          m.kind === "action" ? (
            <p key={m._id} className="scv-chat-act">
              <span className="scv-chat-who" style={{ color: PARTY_COLOR_HEX[m.color as PartyColor] }}>{m.partyName}</span>
              <span className="scv-chat-text">{m.text}</span>
            </p>
          ) : m.seat === null ? (
            <p key={m._id} className="scv-chat-sys">{m.text}</p>
          ) : (
            <p key={m._id} className="scv-chat-msg">
              <span className="scv-chat-who" style={{ color: PARTY_COLOR_HEX[m.color as PartyColor] }}>{m.partyName}</span>
              <span className="scv-chat-text">{m.text}</span>
            </p>
          ),
        )}
        <div ref={endRef} />
      </div>
      <div className="scv-chat-row">
        <input
          className="scv-chat-input"
          value={text}
          maxLength={280}
          placeholder="Say something…"
          aria-label="chat message"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        />
        <button className="scv-primary" onClick={submit} disabled={!text.trim()}>Send</button>
      </div>
    </div>
  );
}
