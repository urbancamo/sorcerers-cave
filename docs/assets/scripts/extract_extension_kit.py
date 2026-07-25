#!/usr/bin/env python3
"""Extract extension-kit tiles/cards from the conversion-kit PDF.

Slot numbering follows docs/requirements/extension-kit/2026-07-25-asset-conversion.md:
pages are viewed landscape (portrait page rotated 90 CCW); slots read top-left to
bottom-right in that view. Placement rects (not PDF object order) determine slots.
Raw images are stored sideways; rotating -90 (CCW) yields the canonical orientations
used by the base kit: tiles 1728x1210 arrow-NW-up, cards 700x1000 upright.
"""
import io
import sys
from pathlib import Path

import fitz  # PyMuPDF
from PIL import Image

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent
PDF = ASSETS / "sorcerers-cave-conversion-kit-extension.pdf"

TILE_PAGES = range(3, 11)   # PDF pages 3..10 -> sheets x01..x08
CARD_PAGES = range(11, 15)  # PDF pages 11..14 -> sheets x01..x04
TILE_RAW = (1210, 1728)     # -> 1728x1210 after CCW rotation
CARD_RAW = (1000, 700)      # -> 700x1000 after CCW rotation


def placements(page):
    """Yield (rect, xref) for each image placement on the page."""
    out = []
    for info in page.get_image_info(xrefs=True):
        out.append((fitz.Rect(info["bbox"]), info["xref"]))
    return out


def slot_of(rect, media, ncols):
    """Slot number (1-based) in the landscape view; fixed-grid binning.

    get_image_info bboxes are in the UNROTATED mediabox frame (pages carry
    /Rotate 270), so bin against page.mediabox — never page.rect (rotated).
    """
    cx = (rect.x0 + rect.x1) / 2
    cy = (rect.y0 + rect.y1) / 2
    # landscape row: right half of the portrait page is the top landscape row
    row = 0 if cx > media.width / 2 else 1
    # landscape col: portrait top -> landscape left; quantize into ncols fixed bins
    col = min(int(cy / (media.height / ncols)), ncols - 1)
    return row * ncols + col + 1


def extract_native(doc, xref):
    """Decode the native embedded image stream (no re-render)."""
    d = doc.extract_image(xref)
    return Image.open(io.BytesIO(d["image"]))


def run(kind):
    doc = fitz.open(PDF)
    pages, ncols, raw, prefix, outdir = {
        "tiles": (TILE_PAGES, 2, TILE_RAW, "area-tile-x", ASSETS / "tiles"),
        "cards": (CARD_PAGES, 4, CARD_RAW, "small-card-x", ASSETS / "cards"),
    }[kind]
    written = []
    for pno in pages:
        page = doc[pno - 1]
        sheet = pno - pages.start + 1
        placed = sorted(
            (slot_of(rect, page.mediabox, ncols), xref)
            for rect, xref in placements(page))
        names = set()
        for i, (slot, xref) in enumerate(placed):
            # Tiles: requirements number the PRESENT tiles sequentially (page 10
            # occupies grid slots 1,3 but is labelled 1,2). Cards keep raw grid
            # slots so page 14's gaps at 4 and 8 are preserved.
            num = i + 1 if kind == "tiles" else slot
            img = extract_native(doc, xref)
            assert (img.width, img.height) == raw, (
                f"p{pno} slot {slot}: raw {img.size} != expected {raw}")
            img = img.transpose(Image.Transpose.ROTATE_90)  # -90 == 90 CCW
            name = f"{prefix}{sheet:02d}-{num}.png"
            assert name not in names, f"slot collision on p{pno}: {name}"
            names.add(name)
            img.save(outdir / name)
            written.append((pno, slot, name, img.size))
    for pno, slot, name, size in written:
        print(f"p{pno:>2} slot {slot}: {name} {size[0]}x{size[1]}")
    print(f"{len(written)} {kind} written")


def report():
    doc = fitz.open(PDF)
    for pno in list(TILE_PAGES) + list(CARD_PAGES):
        page = doc[pno - 1]
        ncols = 2 if pno in TILE_PAGES else 4
        rows = []
        for rect, xref in placements(page):
            rows.append((slot_of(rect, page.mediabox, ncols), xref, rect))
        rows.sort(key=lambda r: (r[0], r[1]))  # never compare Rects (unorderable)
        print(f"page {pno}: {len(rows)} placements")
        for slot, xref, rect in rows:
            print(f"  slot {slot}: xref {xref} rect "
                  f"({rect.x0:.0f},{rect.y0:.0f})-({rect.x1:.0f},{rect.y1:.0f})")


def sheets():
    """Contact sheets for visual verification (written to scratchpad by caller cwd)."""
    for kind, pages, ncols, prefix, srcdir in (
        ("tiles", TILE_PAGES, 2, "area-tile-x", ASSETS / "tiles"),
        ("cards", CARD_PAGES, 4, "small-card-x", ASSETS / "cards"),
    ):
        for pno in pages:
            sheet = pno - pages.start + 1
            imgs = sorted(srcdir.glob(f"{prefix}{sheet:02d}-*.png"))
            if not imgs:
                continue
            thumbs = []
            for p in imgs:
                im = Image.open(p)
                im.thumbnail((420, 420))
                thumbs.append((p.name, im))
            w = max(im.width for _, im in thumbs)
            h = max(im.height for _, im in thumbs)
            cols = min(4, len(thumbs))
            rows_n = -(-len(thumbs) // cols)
            canvas = Image.new("RGB", (cols * (w + 8), rows_n * (h + 8)), "white")
            for i, (_, im) in enumerate(thumbs):
                canvas.paste(im, ((i % cols) * (w + 8), (i // cols) * (h + 8)))
            out = Path.cwd() / f"contact-{kind}-x{sheet:02d}.png"
            canvas.save(out)
            print(f"wrote {out}: {[n for n, _ in thumbs]}")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "--report"
    {"--report": report, "--tiles": lambda: run("tiles"),
     "--cards": lambda: run("cards"), "--sheets": sheets}[mode]()
