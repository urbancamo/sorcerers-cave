import { useState, type ReactNode } from 'react';
import { niceScale } from './format';

// Hand-rolled SVG charts for the analytics tab (no chart library). Marks follow the data-viz specs: columns and bars at most 24px
// thick with a 2px surface gap between touching segments, hairline recessive grid, text in text tokens (never the series colour),
// a per-mark hover tooltip, a legend for two or more series, and a table view of every figure.

export interface Seg { key: string; label: string; color: string; value: number }
export interface Item { label: string; segs: Seg[]; note?: string }

const GAP = 2;
const THICK = 22;
const total = (it: Item) => it.segs.reduce((n, s) => n + s.value, 0);

/** The chart's frame: title, optional legend, the figure with its hover tooltip, and a table view. */
function Frame({ title, sub, items, legend, children, tip }: {
  title: string; sub?: string; items: Item[]; legend?: Seg[]; children: ReactNode; tip: { x: number; y: number; text: string } | null;
}) {
  const keys = [...new Map(items.flatMap((i) => i.segs).map((s) => [s.key, s.label])).entries()];
  return (
    <figure className="scv-an-chart">
      <figcaption><h3>{title}</h3>{sub && <p>{sub}</p>}</figcaption>
      {legend && legend.length > 1 && (
        <ul className="scv-an-legend">{legend.map((l) => <li key={l.key}><i style={{ background: l.color }} />{l.label}</li>)}</ul>
      )}
      <div className="scv-an-plot">
        <div className="scv-an-svgbox">{children}</div>
        {tip && <div className="scv-an-tip" style={{ left: tip.x, top: tip.y }} role="status">{tip.text}</div>}
      </div>
      <details className="scv-an-table">
        <summary>Table view</summary>
        <table className="scv-hs-table">
          <thead><tr><th>{title}</th>{keys.map(([k, l]) => <th key={k} className="scv-hs-num">{l}</th>)}</tr></thead>
          <tbody>{items.map((it) => (
            <tr key={it.label}><td>{it.label}</td>{keys.map(([k]) => <td key={k} className="scv-hs-num">{it.segs.find((s) => s.key === k)?.value ?? 0}</td>)}</tr>
          ))}</tbody>
        </table>
      </details>
    </figure>
  );
}

function useTip() {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const bind = (text: string) => ({
    onMouseMove: (e: React.MouseEvent) => {
      const box = (e.currentTarget.closest('.scv-an-plot') as HTMLElement).getBoundingClientRect();
      setTip({ x: e.clientX - box.left + 12, y: e.clientY - box.top - 8, text });
    },
    onMouseLeave: () => setTip(null),
  });
  return { tip, bind };
}

const tipText = (it: Item) => `${it.label}: ${it.segs.filter((s) => s.value).map((s) => `${s.value} ${it.segs.length > 1 ? s.label.toLowerCase() : ''}`.trim()).join(', ') || '0'}${it.note ? ` · ${it.note}` : ''}`;

/** Vertical columns, optionally stacked. One colour per series; the y axis starts at zero. */
export function Columns({ title, sub, items, tickEvery = 1, height = 170 }: { title: string; sub?: string; items: Item[]; tickEvery?: number; height?: number }) {
  const { tip, bind } = useTip();
  const W = 560, L = 34, B = 22, T = 8;
  const { top, ticks } = niceScale(Math.max(0, ...items.map(total)));
  const slot = (W - L - 6) / Math.max(1, items.length);
  const bw = Math.min(24, Math.max(3, slot - GAP));
  const y = (v: number) => T + (height - T - B) * (1 - v / top);
  const legend = items.find((i) => i.segs.length > 1)?.segs;
  return (
    <Frame title={title} sub={sub} items={items} legend={legend} tip={tip}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W} y1={y(t)} y2={y(t)} className="scv-an-grid" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="scv-an-axis">{t}</text>
          </g>
        ))}
        {items.map((it, i) => {
          const x = L + i * slot + (slot - bw) / 2;
          let acc = 0;
          return (
            <g key={it.label}>
              {it.segs.filter((s) => s.value > 0).map((s, si, vis) => {
                const y1 = y(acc + s.value), y0 = y(acc) - (si > 0 ? GAP : 0);
                acc += s.value;
                const h = Math.max(1, y0 - y1);
                // The cap of the topmost segment is rounded (4px), the baseline end square.
                return <path key={s.key} d={si === vis.length - 1 ? roundedTop(x, y1, bw, h) : `M${x},${y1}h${bw}v${h}h${-bw}z`} style={{ fill: s.color }} />;
              })}
              <rect x={L + i * slot} y={T} width={slot} height={height - T - B} fill="transparent" {...bind(tipText(it))} />
              {i % tickEvery === 0 && <text x={x + bw / 2} y={height - 6} textAnchor="middle" className="scv-an-axis">{it.label}</text>}
            </g>
          );
        })}
      </svg>
    </Frame>
  );
}

function roundedTop(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}a${r},${r} 0 0 1 ${r},${-r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}V${y + h}z`;
}

/** Horizontal bars, optionally stacked, labelled at the tip (or beside the stack). Rows run from a single left baseline. */
export function Bars({ title, sub, items, labelWidth = 92 }: { title: string; sub?: string; items: Item[]; labelWidth?: number }) {
  const { tip, bind } = useTip();
  const W = 560, R = 46, rowH = 30;
  const max = Math.max(1, ...items.map(total));
  const scale = (W - labelWidth - R) / max;
  const legend = items.find((i) => i.segs.length > 1)?.segs;
  return (
    <Frame title={title} sub={sub} items={items} legend={legend} tip={tip}>
      <svg viewBox={`0 0 ${W} ${items.length * rowH + 4}`} role="img" aria-label={title}>
        {items.map((it, i) => {
          const y = i * rowH + 4;
          let x = labelWidth;
          const t = total(it);
          return (
            <g key={it.label}>
              <text x={labelWidth - 8} y={y + THICK / 2 + 4} textAnchor="end" className="scv-an-axis">{it.label}</text>
              {it.segs.filter((s) => s.value > 0).map((s, si, vis) => {
                const w = Math.max(2, s.value * scale - (si < vis.length - 1 ? GAP : 0));
                const x0 = x;
                x += s.value * scale;
                return <path key={s.key} d={si === vis.length - 1 ? roundedRight(x0, y, w, THICK) : `M${x0},${y}h${w}v${THICK}h${-w}z`} style={{ fill: s.color }} />;
              })}
              <text x={x + 6} y={y + THICK / 2 + 4} className="scv-an-value">{t}</text>
              <rect x={0} y={y - 3} width={W} height={rowH} fill="transparent" {...bind(tipText(it))} />
            </g>
          );
        })}
      </svg>
    </Frame>
  );
}

function roundedRight(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h / 2);
  return `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}z`;
}
