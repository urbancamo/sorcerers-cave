import { useEffect, useRef } from 'react';

/** Below this window width the open right-hand panel (card, settings, help, exit) would squeeze the fight dialog, so it is put away when a fight starts. */
export const FIGHT_NARROW_PX = 1300;

/** Renders nothing: when a fight begins in a narrow window it closes whatever right-hand panel is open, so the pairing area gets the room.
 *  Only the start of the fight counts, so a panel the player opens mid-fight stays (it then floats over the dialog; see styles.css).
 *  `onStart` is told of every fight's start, whatever the width (the party list, closed in one fight, is back for the next). */
export function AutoHideRightPanels({ fighting, hide, onStart }: { fighting: boolean; hide: () => void; onStart?: () => void }) {
  const was = useRef(false);
  useEffect(() => {
    if (fighting && !was.current) {
      onStart?.();
      if (window.matchMedia?.(`(max-width: ${FIGHT_NARROW_PX}px)`).matches) hide();
    }
    was.current = fighting;
  }, [fighting, hide, onStart]);
  return null;
}
