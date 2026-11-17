import { useFullscreen } from './useFullscreen';

/** A full-screen button in the top-right corner of every page (the splash, party choice, admin, login and so on). Where the game's own
 *  title bar or the replay transport already carries one, the stylesheet hides this so there is never a pair. Hidden where the browser
 *  offers no full screen (iPhone Safari). */
export function FullscreenCorner() {
  const { supported, on, toggle } = useFullscreen();
  if (!supported) return null;
  const label = on ? 'Exit full screen' : 'Full screen';
  return (
    <button type="button" className={'scv-tb-btn scv-fs-corner' + (on ? ' on' : '')} aria-label={label} title={label} aria-pressed={on} onClick={toggle}
            data-testid="fs-corner">
      <svg className="scv-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      </svg>
    </button>
  );
}
