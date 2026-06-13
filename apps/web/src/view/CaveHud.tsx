import type { RefObject } from "react";
import "./cave.css";

/**
 * The HUD shell ported from `design_handoff_cave_view/reference/shell.html`.
 * Every element id queried by the vanilla renderer (`cave3d.js`) and the
 * discovery overlay (`reveal.js`) is preserved verbatim. The `#scene` div
 * receives the React container ref so `boot` can append its WebGL canvas there.
 */
export function CaveHud({ mountRef }: { mountRef: RefObject<HTMLDivElement | null> }) {
  return (
    <>
      <div id="bg"></div>
      <div id="app">
        <div id="scene" ref={mountRef}></div>

        <div id="hud">
          <div className="brand">
            <div className="title">Sorcerer's Cave</div>
            <div className="mode">
              <span className="pulse"></span>
              <span id="modelabel">Free orbit</span>
            </div>
          </div>

          <div className="stats">
            <div className="chip">
              <span className="k">Depth</span>
              <span className="v" id="st-depth">
                Level 3
              </span>
            </div>
            <div className="chip">
              <span className="k">Turn</span>
              <span className="v" id="st-turn">
                1
              </span>
            </div>
            <div className="chip">
              <span className="k">Party</span>
              <span className="v" id="st-party">
                3
              </span>
            </div>
            <div className="chip">
              <span className="k">Deck</span>
              <span className="v warn" id="st-tiles">
                47
              </span>
            </div>
          </div>

          <div className="compass" title="Camera orientation">
            <div className="rose" id="rose">
              <span className="n">N</span>
              <span className="s">S</span>
              <span className="e">E</span>
              <span className="w">W</span>
              <span className="needle"></span>
            </div>
          </div>

          <div className="hint">
            <div className="row">
              <span className="mk">Doorway</span> Click to explore
            </div>
            <div className="row">
              <span className="mk">N E S W</span> Move party
            </div>
            <div className="row">
              <span className="mk">U / D</span> Stairs up / down
            </div>
            <div className="row">
              <span className="mk">Drag · Scroll</span> Orbit · zoom
            </div>
          </div>

          <div className="roster" id="roster">
            <div className="roster-hd">Party</div>
            <div className="roster-body" id="rosterBody"></div>
          </div>

          <div className="prompt" id="prompt">
            <span className="p-ic">◈</span>
            <span id="promptText">Choose a glowing doorway to explore.</span>
          </div>

          <div className="toast" id="toast"></div>

          <div className="dock">
            <button className="btn primary" id="snapBtn">
              <svg
                className="ic"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 9l9-6 9 6" />
                <path d="M5 8v11h14V8" />
                <path d="M9 19v-6h6v6" />
              </svg>
              Snap to current tile
            </button>
            <button className="btn active" id="orbitBtn">
              <svg
                className="ic"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <ellipse cx="12" cy="12" rx="10" ry="4.3" />
                <ellipse cx="12" cy="12" rx="4.3" ry="10" />
              </svg>
              Free orbit
            </button>
            <div className="sep"></div>
            <span className="lbl">Levels</span>
            <div className="grp" id="levelGrp"></div>
            <div className="sep"></div>
            <button className="btn" id="resetBtn">
              <svg
                className="ic"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Restart cave
            </button>
          </div>

          <div className="cardpanel" id="cardpanel">
            <div className="frame">
              <img id="cardimg" alt="" />
              <div className="emptybox" style={{ display: "none" }}>
                <div>
                  <div className="glyph">✦</div>
                </div>
              </div>
              <div className="meta">
                <div className="where">
                  <span id="cardwhere">Dragon's Lair</span>
                </div>
                <div className="nm" id="cardname">
                  Dragon
                </div>
                <div className="kind" id="cardkind">
                  <span className="kindtag" id="cardtag">
                    <span className="d"></span>
                    <span id="cardtaglabel">Creature</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="selinfo" id="selinfo">
            <div className="nm" id="sel-nm">
              Dragon's Lair
            </div>
            <div className="sub" id="sel-sub">
              Level 3 · party is here
            </div>
          </div>
        </div>
      </div>

      <div id="reveal" className="reveal">
        <div className="reveal-head">
          <span className="rv-eyebrow">Discovered in</span>
          <span className="rv-name" id="rv-name">
            Chamber
          </span>
          <span className="rv-sub" id="rv-sub">
            drew cards
          </span>
        </div>
        <div className="disco-banner" id="rv-banner"></div>
        <div className="disco-actions" id="rv-actions"></div>
        <div className="reveal-foot">
          Reaction &amp; combat are abstracted here — the engine drives the real rounds. Esc to
          dismiss.
        </div>
      </div>

      <div id="loader">
        <div className="inner">
          <div className="ttl">SORCERER'S CAVE</div>
          <div className="sub">Lighting the torches…</div>
          <div className="bar">
            <i></i>
          </div>
        </div>
      </div>
    </>
  );
}
