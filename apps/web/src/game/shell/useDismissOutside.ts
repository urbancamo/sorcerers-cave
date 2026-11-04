import { useEffect } from 'react';

/** While `active`, any press outside the elements matching `keepSelector` calls `onDismiss` — for a menu that should vanish
 *  the moment the player turns to something else. Listens in the capture phase so the 3D scene cannot swallow the press. */
export function useDismissOutside(active: boolean, keepSelector: string, onDismiss: () => void) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: Event) => {
      if (e.target instanceof Element && e.target.closest(keepSelector)) return;
      onDismiss();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [active, keepSelector, onDismiss]);
}
