import { useEffect, useState, type ReactNode } from 'react';
import type { LeftSlot, RightSlot } from './shellState';

const Icon = ({ children }: { children: ReactNode }) => (
  <svg className="scv-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const GLYPHS = {
  party: <Icon><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></Icon>,
  inventory: <Icon><path d="M6 8h12l1 13H5L6 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></Icon>,
  card: <Icon><path d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2V5z" /><path d="M20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 0 2-2V5z" /></Icon>,
  settings: <Icon><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></Icon>,
  help: <span className="scv-ic scv-ic-t" aria-hidden="true">?</span>,
  fullscreen: <Icon><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></Icon>,
  test: <span className="scv-ic scv-ic-t" aria-hidden="true">T</span>,
};

// What each icon opens, shown as its tooltip (the aria-label stays the short name).
const BRIEF: Partial<Record<keyof typeof GLYPHS, string>> = {
  party: 'the living members and what each carries',
  inventory: 'every item the party carries, and who has it',
  card: 'the card under focus, with what the manual says about it',
  settings: 'game code, level, turn, and Save and Game log',
  help: 'help for this screen, and the whole manual',
  fullscreen: 'fill the browser window',
};

function IconButton({ id, label, active, onClick, disabled }: { id: keyof typeof GLYPHS; label: string; active: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={'scv-tb-btn' + (active ? ' on' : '')} aria-label={label} aria-pressed={active}
            title={disabled ? `${label} (not available in a fight)` : BRIEF[id] ? `${label} — ${BRIEF[id]}` : label} disabled={disabled} onClick={onClick}>
      {GLYPHS[id]}
    </button>
  );
}

/** Toggles browser full screen. Hidden where the browser offers none (iPhone Safari); the state follows Esc and F11 too. */
function FullscreenButton() {
  const [on, setOn] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  if (!document.fullscreenEnabled) return null;
  return (
    <IconButton id="fullscreen" label={on ? 'Exit full screen' : 'Full screen'} active={on}
                onClick={() => { void (on ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}); }} />
  );
}

/** The thin title bar: left icons open the party list or the inventory, right icons the card panel, Settings and (test mode only) the test panel. */
export function TitleBar({ left, right, testMode, testOpen, inFight, onLeft, onRight, onTest }: {
  left: LeftSlot;
  right: RightSlot;
  testMode: boolean;
  testOpen?: boolean; // the floating test panel is showing; it is independent of the slots
  inFight?: boolean; // the left slot is the combat list, so the party and inventory icons are off
  onLeft: (pressed: Exclude<LeftSlot, null>) => void;
  onRight: (pressed: Exclude<RightSlot, null>) => void;
  onTest?: () => void;
}) {
  return (
    <header className="scv-titlebar">
      <div className="scv-tb-group">
        <IconButton id="party" label="Party" active={left === 'party'} disabled={inFight} onClick={() => onLeft('party')} />
        <IconButton id="inventory" label="Inventory" active={left === 'inventory'} disabled={inFight} onClick={() => onLeft('inventory')} />
      </div>
      <div className="scv-tb-title">SORCERER'S CAVE</div>
      <div className="scv-tb-group">
        <IconButton id="card" label="Card panel" active={right === 'card'} onClick={() => onRight('card')} />
        <IconButton id="settings" label="Settings" active={right === 'settings'} onClick={() => onRight('settings')} />
        <IconButton id="help" label="Help" active={right === 'help'} onClick={() => onRight('help')} />
        <FullscreenButton />
        {testMode && <IconButton id="test" label="Test panel" active={!!testOpen} onClick={() => onTest?.()} />}
      </div>
    </header>
  );
}
