import { createPortal } from "react-dom";

/** A centered, enlarged card image shown while hovering/holding a card. `src` null → nothing. */
export function CardZoom({ src, alt }: { src: string | null; alt: string }) {
  if (!src) return null;
  return createPortal(
    <div className="scv-cardzoom" aria-hidden>
      <img src={src} alt={alt} />
    </div>,
    document.body,
  );
}
