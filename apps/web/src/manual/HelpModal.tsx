import { useEffect } from 'react';
import { HelpBrowser } from './HelpBrowser';
import type { HelpScreen, VariantFlags } from './types';

/** The manual in a modal, for screens outside the in-game shell (the title screen). With no `flags` it is not tied to a game, so it shows every rule. */
export function HelpModal({ onClose, screens = ['explore'], flags, title = 'How to play' }: { onClose: () => void; screens?: HelpScreen[]; flags?: VariantFlags; title?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="scv-dice-overlay" role="dialog" aria-label={title} data-testid="help-modal">
      <div className="scv-help-modal">
        <div className="scv-help-modal-hd">
          <h2>{title}</h2>
          <button type="button" className="scv-hb-close" aria-label="Close help" onClick={onClose}>×</button>
        </div>
        <HelpBrowser screens={screens} flags={flags} />
      </div>
    </div>
  );
}
