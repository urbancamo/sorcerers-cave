import { useCallback, useEffect, useState } from 'react';

/** Browser full-screen state and toggle, shared by the title bar and the replay viewer. `supported` is false where the
 *  browser offers none (iPhone Safari) so callers can hide their button; `on` follows Esc and F11 too, not just the toggle. */
export function useFullscreen() {
  const [on, setOn] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggle = useCallback(() => {
    void (on ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  }, [on]);
  return { supported: !!document.fullscreenEnabled, on, toggle };
}
