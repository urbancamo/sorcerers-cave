import { useEffect, useRef, useState } from 'react';
import type { CaveApi } from '../view/CaveCanvas';
import type { CoachStep } from './runner';

interface Box { x: number; y: number; w: number; h: number }

// The card can be dragged by its heading; where the player left it is kept (for the session, and in localStorage where there is one)
// so it does not jump back when the card is hidden behind the dice or the next step comes up.
const POS_KEY = 'scv.tutorial.pos';
let savedPos: { x: number; y: number } | null = null;
const loadPos = () => {
  if (savedPos) return savedPos;
  try { const v = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null'); if (v && typeof v.x === 'number' && typeof v.y === 'number') savedPos = v; } catch { /* no storage: the default place */ }
  return savedPos;
};
const storePos = (p: { x: number; y: number } | null) => {
  savedPos = p;
  try { if (p) localStorage.setItem(POS_KEY, JSON.stringify(p)); else localStorage.removeItem(POS_KEY); } catch { /* ignore */ }
};

// Where the step's anchor is on screen now: an exit marker (projected from the 3D view) or an element of the page.
function anchorBox(step: CoachStep, cave: CaveApi | null): Box | null {
  const a = step.anchor;
  if (!a) return null;
  if (a.kind === 'exit') {
    const p = cave?.markerScreenPos(a.dir);
    return p ? { x: p.x - 36, y: p.y - 36, w: 72, h: 72 } : null;
  }
  const el = document.querySelector(a.selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 };
}

/**
 * The coach: a card that says what to do, a spotlight on where, and a shield over the rest of the screen so a wrong press cannot
 * happen. The shield is the visible half of the lock; the dispatch gate in the local session is the real one.
 */
export function TutorialCoach({ step, index, total, cave, hint, onContinue, onBack, onSkip, onDemo }: {
  step: CoachStep;
  index: number;
  total: number;
  cave: CaveApi | null;
  hint: string | null;
  onContinue: () => void;
  onBack?: () => void;
  onSkip: () => void;
  onDemo?: () => void;
}) {
  const [box, setBox] = useState<Box | null>(null);
  const [pos, setPos] = useState(loadPos); // null: the default place (top centre)
  const cardRef = useRef<HTMLElement>(null);
  // Keep the card on screen: a saved position from a bigger window is pulled back in.
  const clamp = (p: { x: number; y: number }) => {
    const w = cardRef.current?.offsetWidth ?? 440, h = cardRef.current?.offsetHeight ?? 200;
    return { x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - w)), y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - h)) };
  };
  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0 || !cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (m: PointerEvent) => setPos(clamp({ x: m.clientX - dx, y: m.clientY - dy }));
    const up = (m: PointerEvent) => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); storePos(clamp({ x: m.clientX - dx, y: m.clientY - dy })); };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    e.preventDefault();
  };
  // Markers bob and the camera glides, so follow the anchor every frame (state only changes when it has moved).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const next = anchorBox(step, cave);
      setBox((cur) => (cur && next && Math.abs(cur.x - next.x) < 1 && Math.abs(cur.y - next.y) < 1 && cur.w === next.w ? cur : next));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [step, cave]);

  const acting = step.kind === 'act';
  const free = !!step.free;
  const shields: Box[] = [];
  if (!free) {
    const W = window.innerWidth, H = window.innerHeight;
    if (acting && !box) {
      // nothing to spotlight (the control lives in a panel): the dispatch gate alone holds the lock
    } else if (acting && box) {
      shields.push({ x: 0, y: 0, w: W, h: Math.max(0, box.y) }, { x: 0, y: box.y + box.h, w: W, h: Math.max(0, H - box.y - box.h) },
                   { x: 0, y: box.y, w: Math.max(0, box.x), h: box.h }, { x: box.x + box.w, y: box.y, w: Math.max(0, W - box.x - box.w), h: box.h });
    } else {
      shields.push({ x: 0, y: 0, w: W, h: H });
    }
  }
  return (
    <div className="scv-tut" data-testid="tutorial-coach">
      {shields.map((b, i) => (
        <div key={i} className="scv-tut-shield" style={{ left: b.x, top: b.y, width: b.w, height: b.h }} />
      ))}
      {box && !free && <div className="scv-tut-ring" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
      <section ref={cardRef} className={'scv-tut-card' + (pos ? ' moved' : '')} role="dialog" aria-label="Tutorial" aria-live="polite"
               style={pos ? { left: clamp(pos).x, top: clamp(pos).y } : undefined}>
        <div className="scv-tut-grip" onPointerDown={startDrag} onDoubleClick={() => { setPos(null); storePos(null); }}
             title="Drag to move this window; double-click to put it back">
          <span aria-hidden="true" className="scv-tut-dots">⠿</span>
          <p className="scv-tut-eyebrow">{step.eyebrow}</p>
        </div>
        <h2 className="scv-tut-title">{step.title}</h2>
        <p className="scv-tut-body">{step.body}</p>
        {step.demo && onDemo && <p><button type="button" className="scv-ghost" onClick={onDemo}>Watch a demo game first</button></p>}
        {hint && <p className="scv-tut-hint" role="status">{hint}</p>}
        <div className="scv-tut-actions">
          {onBack && <button type="button" className="scv-ghost" onClick={onBack}>Back</button>}
          <button type="button" className="scv-ghost scv-tut-skip" onClick={onSkip}>Skip tutorial</button>
          {!acting && <button type="button" className="scv-primary" onClick={onContinue}>{free ? 'Finish' : 'Continue'}</button>}
        </div>
        <p className="scv-tut-count">{index + 1} / {total}</p>
      </section>
    </div>
  );
}
