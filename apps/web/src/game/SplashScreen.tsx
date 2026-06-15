import { useEffect, useState, type CSSProperties } from "react";
import { CREATURES } from "@sorcerers-cave/engine";
import { loadManifest, resolveCard } from "../data/manifest";
import { HighScoresModal } from "./HighScores";

// The eight recruitable creatures (ids 0–7) make the decorative fan.
const FAN_IDS = CREATURES.filter((c) => c.cost !== null).map((c) => c.id);

const REPO_URL = "https://github.com/urbancamo/sorcerers-cave";

export function SplashScreen({
  onStartSolitaire,
  onResume,
}: {
  onStartSolitaire: () => void;
  onResume?: (code: string) => Promise<boolean>;
}) {
  const [files, setFiles] = useState<string[]>([]);
  const [showScores, setShowScores] = useState(false);
  const [resumeCode, setResumeCode] = useState("");
  const [resumeErr, setResumeErr] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);

  const submitResume = async () => {
    const code = resumeCode.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) { setResumeErr("Enter a four-letter game code."); return; }
    if (!onResume) return;
    setResuming(true);
    setResumeErr(null);
    const ok = await onResume(code);
    setResuming(false);
    if (!ok) setResumeErr("No game found with that code.");
  };

  // Card art is a progressive enhancement (falls back to no fan if the manifest can't load).
  useEffect(() => {
    let alive = true;
    loadManifest()
      .then(({ cards }) => {
        if (!alive) return;
        setFiles(FAN_IDS.map((id) => resolveCard("creature", id, cards)?.file).filter((f): f is string => !!f));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const n = files.length;
  const mid = (n - 1) / 2;

  return (
    <div className="scv-splash" data-testid="splash">
      <h1 className="scv-splash-title">The Sorcerer&rsquo;s Cave</h1>

      {n > 0 && (
        <div className="scv-splash-fan" aria-hidden="true">
          {files.map((f, i) => {
            const off = i - mid;
            // The slot holds the (stationary) fan position + hit area; the inner image animates on
            // hover. Keeping the hit area still avoids the hover-lift-off-the-cursor flicker.
            const style = {
              "--rot": `${off * 6}deg`,
              "--ty": `${Math.abs(off) * 18}px`,
              "--z": String(n - Math.abs(Math.round(off))),
            } as CSSProperties;
            return (
              <span key={i} className="scv-fan-slot" style={style}>
                <img src={f} alt="" className="scv-fan-card" />
              </span>
            );
          })}
        </div>
      )}

      <blockquote className="scv-scroll">
        <p className="scv-scroll-latin">
          facilis descensus Averno: noctes atque dies patet atri ianua Ditis; sed revocare gradum
          superasque evadere ad auras, hoc opus, hic labor est.
        </p>
        <p className="scv-scroll-cite">— Vergil, Aeneid vi. 126–29</p>
        <p className="scv-scroll-en">
          “The descent to the underworld is easy: through day and night the door of black Dis lies open.
          But to retrace your steps and escape to the upper air — there is trouble and toil.”
        </p>
      </blockquote>

      <section className="scv-panel scv-start">
        <h2 className="scv-hd">Start new game</h2>
        <button className="scv-primary" onClick={onStartSolitaire}>Start Solitaire Game</button>

        <div className="scv-resume" data-testid="resume">
          <label className="scv-resume-label" htmlFor="scv-resume-code">Resume a saved game</label>
          <div className="scv-resume-row">
            <input
              id="scv-resume-code"
              className="scv-resume-input"
              value={resumeCode}
              onChange={(e) => { setResumeCode(e.target.value.toUpperCase().slice(0, 4)); setResumeErr(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") void submitResume(); }}
              maxLength={4}
              placeholder="ABCD"
              aria-label="four-letter game code"
              autoCapitalize="characters"
              spellCheck={false}
            />
            <button
              className="scv-primary"
              onClick={() => void submitResume()}
              disabled={resuming || resumeCode.trim().length !== 4}
            >
              {resuming ? "Resuming…" : "Resume"}
            </button>
          </div>
          {resumeErr && <p className="scv-resume-err" role="alert">{resumeErr}</p>}
        </div>

        <button className="scv-primary" disabled title="Coming soon">Start Multiplayer Game</button>
        <button className="scv-primary" disabled title="Coming soon">Join Multiplayer Game</button>
        <button className="scv-primary" onClick={() => setShowScores(true)}>High Scores</button>
        <a
          className="scv-primary"
          href="/manual.html"
          target="_blank"
          rel="noreferrer"
          style={{ display: "block", textAlign: "center", textDecoration: "none" }}
        >
          How to Play
        </a>
      </section>

      {showScores && <HighScoresModal onClose={() => setShowScores(false)} />}

      <footer className="scv-attrib">
        <p>
          Written by Mark Wickens using Claude Code,{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer">sorcerers-cave</a>
        </p>
        <p className="scv-attrib-hd">Acknowledgements</p>
        <p>Original game: © 1978 &amp; 1982 Terence Peter Donnelly, published by Ariel Productions Ltd / Gibsons / Philmar.</p>
        <p className="scv-attrib-hd">Graphics</p>
        <p>
          Concept and realisation by Peter Vodden. Area card artwork, small card template, tokens and
          incidental small card artwork by Peter Vodden using Dungeon Painter Studio, Epic Character
          Generator and Paint Shop. Creative Commons CC BY-NC-SA 4.0.{" "}
          <a href="https://sorcererscaveconversionkit.wordpress.com" target="_blank" rel="noreferrer">
            sorcererscaveconversionkit.wordpress.com
          </a>
        </p>
        <p className="scv-attrib-hd">Public domain attribution</p>
        <p>
          Clip-art courtesy of hiclipart.com community clip-art for non-commercial use. Item art courtesy
          of Paul Weber&rsquo;s non-commercial unofficial D&amp;D resource archive. Top-down characters
          courtesy of Steel Rat and the RPGMapShare Gallery.
        </p>
      </footer>
    </div>
  );
}
