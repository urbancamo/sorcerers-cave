import type { HelpScreen, VariantFlags } from '../../manual';
import { HelpBrowser } from '../../manual/HelpBrowser';

/** The right-hand Help slot: help for the current screen, and the whole manual to browse and search. */
export function HelpPanel({ screens, flags }: { screens: HelpScreen[]; flags?: VariantFlags }) {
  return (
    <aside className="scv-slot scv-slot-right scv-helppanel" aria-label="Help">
      <h2 className="scv-slot-hd">Help</h2>
      <HelpBrowser screens={screens} flags={flags} />
    </aside>
  );
}
