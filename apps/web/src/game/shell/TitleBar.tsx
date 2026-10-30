import type { ReactNode } from 'react';
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
  test: <span className="scv-ic scv-ic-t" aria-hidden="true">T</span>,
};

function IconButton({ id, label, active, onClick, disabled }: { id: keyof typeof GLYPHS; label: string; active: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={'scv-tb-btn' + (active ? ' on' : '')} aria-label={label} aria-pressed={active}
            title={disabled ? `${label} (not available in a fight)` : label} disabled={disabled} onClick={onClick}>
      {GLYPHS[id]}
    </button>
  );
}

/** The thin title bar: left icons open the party list or the inventory, right icons the card panel, Settings and (test mode only) the test panel. */
export function TitleBar({ left, right, testMode, inFight, onLeft, onRight }: {
  left: LeftSlot;
  right: RightSlot;
  testMode: boolean;
  inFight?: boolean; // the left slot is the combat list, so the party and inventory icons are off
  onLeft: (pressed: Exclude<LeftSlot, null>) => void;
  onRight: (pressed: Exclude<RightSlot, null>) => void;
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
        {testMode && <IconButton id="test" label="Test panel" active={right === 'test'} onClick={() => onRight('test')} />}
      </div>
    </header>
  );
}
