import { toCanvas } from 'html-to-image';

/**
 * A picture of the game window for a bug report, at the window's native resolution (CSS size times the
 * device pixel ratio, no downscaling) as a high-quality JPEG, or null when it cannot be taken (the report
 * is still worth sending without it). Called the moment the bug button is pressed; the report form itself
 * is left out of the picture.
 */
export async function captureGameWindow(): Promise<Blob | null> {
  try {
    const canvas = await toCanvas(document.documentElement, {
      pixelRatio: window.devicePixelRatio || 1,
      width: window.innerWidth,
      height: window.innerHeight,
      filter: (node) => !(node instanceof HTMLElement && node.dataset.testid === 'bug-modal'),
    });
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  } catch {
    return null;
  }
}
