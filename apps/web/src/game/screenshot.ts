import { toCanvas } from 'html-to-image';

/**
 * A picture of the game window for a bug report, at the window's native resolution (CSS size times the
 * device pixel ratio, no downscaling) as a high-quality JPEG, or null when it cannot be taken (the report
 * is still worth sending without it). Called the moment the bug button is pressed; the report form itself
 * is left out of the picture.
 *
 * It is built in layers rather than by cloning the whole page: the cave is a WebGL canvas, which a DOM
 * clone does not reliably reproduce, so the canvases are drawn straight from their pixels over the page
 * background, and the rest of the page (HUD, panels, dialogs) is captured on top with its own backgrounds
 * (the body colour and the ambient `#bg` vignette that sit behind the cave) left out.
 */
export async function captureGameWindow(): Promise<Blob | null> {
  try {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const out = document.createElement('canvas');
    out.width = Math.round(w * dpr);
    out.height = Math.round(h * dpr);
    const ctx = out.getContext('2d')!;

    const page = getComputedStyle(document.body).backgroundColor;
    ctx.fillStyle = page && page !== 'rgba(0, 0, 0, 0)' ? page : '#000';
    ctx.fillRect(0, 0, out.width, out.height);

    for (const c of document.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(c).display === 'none') continue;
      ctx.drawImage(c, r.left * dpr, r.top * dpr, r.width * dpr, r.height * dpr);
    }

    const layer = await toCanvas(document.body, {
      pixelRatio: dpr,
      width: w,
      height: h,
      style: { background: 'transparent' },
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        return !(node instanceof HTMLCanvasElement) && node.id !== 'bg' && node.dataset.testid !== 'bug-modal';
      },
    });
    ctx.drawImage(layer, 0, 0, out.width, out.height);
    return await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/jpeg', 0.92));
  } catch {
    return null;
  }
}
