import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { handFit, HAND_CARD } from "./handFit";

/** The party's hand in a fight (Peter's 2026-10-21 impressions): one flat row that never wraps or scrolls, each card overlapped by the
 *  side by side up to about 8 cards (shrinking a little to fit), then each overlapped by the one to its right so its top-left numbers show. The card under the pointer, focus or selection rises to
 *  full size. The splash screen's fan is the model, minus the curve. */
export function FightHand({ children, testId }: { children: ReactNode[]; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);
  const n = children.length, empty = n === 0;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => { const cs = getComputedStyle(el); setAvail(el.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0")); };
    measure();
    if (typeof ResizeObserver === "undefined") return;   // no observer (a test DOM): the size measured once stands
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [empty]);   // the row is measured once it exists: it is not drawn at all while the hand is empty

  if (empty) return null;
  const { cw, stride } = handFit(avail, n);
  const style = { "--hand-cw": `${cw}px`, "--hand-scale": String(Math.max(1, HAND_CARD / cw) * 1.12) } as CSSProperties;
  return (
    <div ref={ref} className="scv-fight-tray scv-hand" data-testid={testId} style={style}>
      {children.map((c, i) => (
        <div key={i} className="scv-hand-slot" style={{ width: i === n - 1 ? cw : stride, zIndex: i + 1 }}>{c}</div>
      ))}
    </div>
  );
}
