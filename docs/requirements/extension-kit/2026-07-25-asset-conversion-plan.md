# Extension Kit Asset Conversion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the 30 area tiles and 30 small cards from `docs/assets/sorcerers-cave-conversion-kit-extension.pdf` into correctly-oriented PNGs following base-kit conventions, and register them in the asset manifest as inert extension categories (no gameplay change yet).

**Architecture:** A committed Python script uses PyMuPDF to enumerate per-page image *placements* (rectangle + xref), assigns slot numbers from geometry (not PDF object order — the root cause of last time's ambiguity), extracts the native embedded JPEGs, rotates them −90° (CCW) to the base-kit canonical orientations, and writes PNGs. The manifest gains `sources.extension` plus two new categories (`tilesExtension`, `cardsExtension`) that `parseManifest` ignores, so the base game is untouched until the engine work lands.

**Tech Stack:** Python 3 + PyMuPDF + Pillow (scratch venv), poppler (`pdftotext` for the instructions page), Git LFS, pnpm/vitest for regression checks.

## Global Constraints

- All work happens on branch `add-extension-kit` (already checked out).
- Canonical tile orientation: **1728×1210 landscape, double-headed direction arrow top-left (NW), pointing up** — identical to base kit. Every output tile MUST satisfy this; this was the source of the base-kit orientation bugs.
- Canonical card orientation: **700×1000 upright portrait** (name banner readable at top).
- Extract **native embedded JPEGs** (no re-render/recompression), matching the base-kit method recorded in `manifest.json → extraction`.
- One PNG per printed **slot**, even where the PDF reuses one image object for duplicates (Gold ×3, Silver ×3) — matches base-kit positional naming.
- File naming: `area-tile-x<sheet>-<slot>.png` and `small-card-x<sheet>-<slot>.png`. Prefix `x` marks the extension kit; sheets number from 01 per category (base-kit convention). Tile sheet x0N = PDF page N+2 (x01=p3 … x08=p10); card sheet x0N = PDF page N+10 (x01=p11 … x04=p14) = requirements "Page N".
- New PNGs under `docs/assets/**` are LFS-tracked automatically by `.gitattributes`; verify with `git lfs ls-files` before pushing.
- `docs/requirements/extension-kit/2026-07-25-asset-conversion.md` is the ground truth for exits/stairs/specials/titles; the PDF art is the ground truth where they disagree — flag any disagreement rather than silently picking one.
- Do NOT touch `packages/engine/src` (no engine-spec update needed). The only code change is a type-union extension in `packages/assets/src/index.ts`.

## PDF Ground Truth (surveyed 2026-07-26)

| PDF pages | Content | Raw image dims | Count |
|-----------|---------|----------------|-------|
| 1 | Instructions text (no images) | — | — |
| 2 | Sample images (1 tile + 1 card) — **exclude** | — | — |
| 3–10 | Area tiles, 2×2 per landscape page (p10 has 2) | 1210×1728 @349ppi | 30 |
| 11–14 | Small cards, 2×4 per landscape page (p14 has 6) | 1000×700 @289ppi | 30 |

Duplicate placements share PDF objects: object 72 appears 3× (Gold: card 1/4, 2/1, 2/5), object 89 appears 3× (Silver: 3/3, 3/7, 3/8). This confirms the page mapping and means slot assignment MUST come from placement rects, not image-list order.

**Slot geometry.** Pages are portrait; the doc's slot numbering applies after rotating the page **left (CCW) 90°**. Under that rotation, portrait top-right → landscape top-left. In portrait page coordinates (origin top-left, y down):

- landscape **row** (top→bottom) = x-center **descending** (2 bins),
- landscape **column** (left→right) = y-center **ascending** (2 bins for tiles, 4 for cards),
- slot = row × ncols + col + 1.

Bins must be **fixed-position** (quantized against the page grid), not rank-order, so page 14's six cards land in slots 1,2,3,5,6,7 with gaps at 4 and 8 preserved — exactly as the requirements table lists them. If the actual art occupies slots 1–6 contiguously instead, stop and reconcile with the user before naming files.

**Coordinate frame (Task 1 finding).** The pages carry `/Rotate 270`, so PyMuPDF's `page.rect` is the *rotated* (landscape) frame while `get_image_info` bboxes are in the *unrotated mediabox* (portrait) frame. All binning MUST use `page.mediabox` dimensions; binning against `page.rect` corrupts the 4-column card pages (verified: it collapses columns 3/4 and would overwrite distinct cards).

**Page 10 numbering (Task 1 finding).** Page 10's two tiles physically occupy landscape grid slots 1 and 3 (left column), but the requirements table labels them tiles 1 and 2 — and both are identical EW tunnels. Rule: **tile pages number the present tiles sequentially in slot order** (identity for full 2×2 pages), so page 10 emits `x08-1`, `x08-2`; **card pages keep raw grid slots** (page 14 emits slots 1,2,3,5,6,7 per the requirements' own numbering).

**Raw image orientation.** Raw tiles and cards are stored in portrait-page orientation, i.e. rotated +90° from upright-in-landscape-view. Correction: rotate **−90° (CCW)** — same as the base kit ("rotated -90" in `manifest.json → extraction.notes`). The contact-sheet review in Tasks 2–3 is the safety net if any placement carries its own transform.

---

### Task 1: Extraction script + placement survey

**Files:**
- Create: `docs/assets/scripts/extract_extension_kit.py`
- Read: `docs/assets/sorcerers-cave-conversion-kit-extension.pdf` (working-tree version — it is newer than the committed one)

**Interfaces:**
- Produces: CLI `python extract_extension_kit.py --report | --tiles | --cards | --sheets`, run from `docs/assets/`. Tasks 2–5 consume this script unchanged.

- [ ] **Step 1: Create scratch venv with dependencies**

```bash
python3 -m venv "$SCRATCHPAD/venv"   # use the session scratchpad dir, not /tmp
"$SCRATCHPAD/venv/bin/pip" install pymupdf pillow
```

- [ ] **Step 2: Write the script**

Create `docs/assets/scripts/extract_extension_kit.py`:

```python
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
```

- [ ] **Step 3: Run the placement survey and verify structure**

```bash
cd docs/assets && "$SCRATCHPAD/venv/bin/python" scripts/extract_extension_kit.py --report
```

Expected — treat any deviation as a blocker to reconcile before extracting:
- pages 3–9: 4 placements each; page 10: 2 placements in grid slots 1,3 (left landscape column — named `x08-1`/`x08-2` per the sequential-tile-numbering rule)
- pages 11–13: 8 placements each; page 14: **6 placements in slots 1,2,3,5,6,7** (gaps at 4 and 8)
- page 12 slots for xref of object 72 appear twice (Gold 2/1 and 2/5); page 13 object 89 three times (Silver 3/3, 3/7, 3/8)

If page 14's placements land in slots 1–6 contiguously instead of 1,2,3,5,6,7, STOP: the requirements table numbering and the physical layout disagree — ask the user which numbering to keep before writing any files.

- [ ] **Step 4: Extract the instructions page for the manifest sources block**

```bash
pdftotext -f 1 -l 1 sorcerers-cave-conversion-kit-extension.pdf - | head -40
```

Record the kit version string (base kit recorded "3.1"/"03"). If none is printed, use `null`.

- [ ] **Step 5: Commit the script**

```bash
git add docs/assets/scripts/extract_extension_kit.py
git commit -m "Extension kit: PDF extraction script (geometry-based slot mapping)"
```

---

### Task 2: Extract the 30 area tiles + orientation verification

**Files:**
- Create: `docs/assets/tiles/area-tile-x01-1.png` … `area-tile-x08-2.png` (30 files)
- Uses: `docs/assets/scripts/extract_extension_kit.py` from Task 1

**Interfaces:**
- Produces: 30 tile PNGs, all 1728×1210, arrow NW-up; a per-tile `tileType` classification list consumed by Task 4.

- [ ] **Step 1: Run tile extraction**

```bash
cd docs/assets && "$SCRATCHPAD/venv/bin/python" scripts/extract_extension_kit.py --tiles
```

Expected: `30 tiles written`, every line `1728x1210`. The in-script assert guarantees raw dims; the printout confirms rotated dims.

- [ ] **Step 2: Generate contact sheets and review them visually (Read each PNG)**

```bash
cd "$SCRATCHPAD" && "$SCRATCHPAD/venv/bin/python" \
  /Users/msw/code/retro/sorcerers-cave/docs/assets/scripts/extract_extension_kit.py --sheets
```

Read `contact-tiles-x01.png` … `contact-tiles-x08.png` and check EVERY tile:

1. **Orientation invariant** (the base-kit bug class): the double-headed direction arrow sits in the **top-left (NW) corner pointing up**. Any tile failing this means the rotation or slot mapping is wrong — fix the script, re-extract, re-verify. Do not hand-rotate individual files.
2. **Exits match the requirements table** (N=top, E=right, S=bottom, W=left in the stored landscape image):

| Sheet-slot | Exits | Stairs | Special | | Sheet-slot | Exits | Stairs | Special |
|---|---|---|---|---|---|---|---|---|
| x01-1 | NE | — | — | | x05-1 | ESW | — | — |
| x01-2 | NES | — | — | | x05-2 | ESW | down | — |
| x01-3 | NE | — | — | | x05-3 | ES | — | — |
| x01-4 | NES | — | — | | x05-4 | ESW | — | — |
| x02-1 | NES | up | — | | x06-1 | SW | — | — |
| x02-2 | NESW | — | — | | x06-2 | NESW | — | The Chasm |
| x02-3 | NES | down | — | | x06-3 | ESW | up | — |
| x02-4 | NEW | — | — | | x06-4 | NESW | — | The Bell Rope |
| x03-1 | NESW | — | — | | x07-1 | NESW | — | The Lair |
| x03-2 | NESW | — | — | | x07-2 | NESW | — | The Whirlpool |
| x03-3 | NESW | — | — | | x07-3 | NESW | — | The Gallery |
| x03-4 | NESW | — | — | | x07-4 | NESW | — | The Well |
| x04-1 | NW | — | — | | x08-1 | EW | — | — |
| x04-2 | NSW | up | — | | x08-2 | EW | — | — |
| x04-3 | NESW | — | — | | | | | |
| x04-4 | NSW | — | — | | | | | |

(Exits already canonicalised to N,E,S,W order; `U`/`D` from the requirements became the stairs column. Stair art conventions from the base kit: up = doorway-topped staircase, down = light-to-dark fade.)

3. **Record `tileType` per tile** (chamber / tunnel — base kit has exactly one gateway and this kit is not expected to add one): write the 30 classifications into `$SCRATCHPAD/tile-types.md` as `x01-1: tunnel` etc. Specials are expected to be chambers — verify rather than assume. Also note whether The Chasm's art shows a literal down-stair (expected: no — its descend rule is a special, `stairDown: false`).

Any exits/stairs mismatch between art and table: STOP and report to the user (last time a mislabel here caused the rendering bug).

- [ ] **Step 3: Verify LFS picks the files up**

```bash
git add docs/assets/tiles/area-tile-x*.png
git lfs status | grep -c "area-tile-x"   # expect 30
```

- [ ] **Step 4: Commit**

```bash
git commit -m "Extension kit: extract 30 area tiles (x01-x08), canonical arrow-NW orientation"
```

---

### Task 3: Extract the 30 small cards + verification

**Files:**
- Create: `docs/assets/cards/small-card-x01-1.png` … `small-card-x04-7.png` (30 files; sheet x04 has slots 1,2,3,5,6,7)
- Uses: `docs/assets/scripts/extract_extension_kit.py` from Task 1

**Interfaces:**
- Produces: 30 card PNGs, all 700×1000 upright; a confirmed name list (incl. the untitled 2/4 artifact) consumed by Task 4.

- [ ] **Step 1: Run card extraction**

```bash
cd docs/assets && "$SCRATCHPAD/venv/bin/python" scripts/extract_extension_kit.py --cards
```

Expected: `30 cards written`, every line `700x1000`, sheet x04 files named `-1,-2,-3,-5,-6,-7`.

- [ ] **Step 2: Contact sheets + visual review (Read each PNG)**

```bash
cd "$SCRATCHPAD" && "$SCRATCHPAD/venv/bin/python" \
  /Users/msw/code/retro/sorcerers-cave/docs/assets/scripts/extract_extension_kit.py --sheets
```

Read `contact-cards-x01.png` … `contact-cards-x04.png` and check every card is **upright** (name banner readable at top) and its printed title matches:

| File | Title | | File | Title |
|---|---|---|---|---|
| x01-1 | Crypt / Gems | | x03-1 | Quarrel |
| x01-2 | Desertion | | x03-2 | Scroll |
| x01-3 | Elixir | | x03-3 | Silver |
| x01-4 | Gold | | x03-4 | Spell |
| x01-5 | Apprentice | | x03-5 | Magic Shield |
| x01-6 | Demon | | x03-6 | Scholar |
| x01-7 | Dwarf | | x03-7 | Silver |
| x01-8 | Gems | | x03-8 | Silver |
| x02-1 | Gold | | x04-1 | Witch |
| x02-2 | Holy Water | | x04-2 | Witch |
| x02-3 | Lion | | x04-3 | Woman |
| x02-4 | *(untitled in requirements — expected: Magic Axe)* | | x04-5 | Thief |
| x02-5 | Gold | | x04-6 | Witch |
| x02-6 | Harpies | | x04-7 | Wolf |
| x02-7 | Idol | | | |
| x02-8 | Lotus Dust | | | |

Two specific confirmations to record for Task 4:
1. **x02-4**: the requirements row has no title, but a "Magic Axe" rules section exists with no table row — read the card's banner and record the printed name. If it is not Magic Axe, report to the user.
2. **Duplicates are pixel-identical where the PDF reuses an object**: the three Golds (x01-4, x02-1, x02-5) and three Silvers (x03-3, x03-7, x03-8) should be byte-identical PNGs (`md5 docs/assets/cards/small-card-x0{1-4,2-1,2-5}.png` style check). Distinct Witch objects (x04-1/2/6) may differ.

- [ ] **Step 3: Verify LFS + commit**

```bash
git add docs/assets/cards/small-card-x*.png
git lfs status | grep -c "small-card-x"   # expect 30
git commit -m "Extension kit: extract 30 small cards (x01-x04), upright portrait"
```

---

### Task 4: Manifest + asset types

**Files:**
- Modify: `docs/assets/manifest.json` (add `sources.extension`, `categories.tilesExtension`, `categories.cardsExtension`)
- Modify: `packages/assets/src/index.ts` (extend `TileSpecial` union)
- Test: `packages/assets/src/index.test.ts` (new case pinning the extension specials)

**Interfaces:**
- Consumes: Task 2's `tile-types.md` classifications and Chasm stair finding; Task 3's confirmed x02-4 name.
- Produces: manifest categories named exactly `tilesExtension` / `cardsExtension` with the same item shape as `tiles` / `cards`; specials `"chasm" | "bell-rope" | "lair" | "whirlpool" | "gallery" | "well"`. The later engine milestone consumes these names.

**Design note (why new categories):** `parseManifest` (`apps/web/src/data/manifest.ts:50-51`) reads only `categories["tiles"]` and `categories["cards"]`, and `resolveTile` matches purely on exits/stairs/special. Appending extension tiles to `tiles` would immediately leak extension art into the base solitaire game and break the rot-0 coverage invariant in `tileOrientation.test.ts`. Separate categories keep this change inert, which is what "optional addition to the base game" requires at this stage.

- [ ] **Step 1: Write the failing type test**

In `packages/assets/src/index.test.ts`, add:

```typescript
  it("extension tile specials are valid TileSpecial values", () => {
    const specials: TileSpecial[] = [
      "chasm", "bell-rope", "lair", "whirlpool", "gallery", "well",
    ];
    expect(specials).toHaveLength(6);
  });
```

and add `TileSpecial` to the existing type-only import from `./index`.

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @sorcerers-cave/assets test
```

Expected: FAIL — TS error, `"chasm"` etc. not assignable to `TileSpecial`.

- [ ] **Step 3: Extend the union**

In `packages/assets/src/index.ts`:

```typescript
export type TileSpecial =
  | "deep-pool" | "viper-pit" | "tomb-of-kings" | "great-hall" | "gateway"
  // extension kit:
  | "chasm" | "bell-rope" | "lair" | "whirlpool" | "gallery" | "well";
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @sorcerers-cave/assets test
```

Expected: PASS.

- [ ] **Step 5: Add the manifest entries**

In `docs/assets/manifest.json`:

**5a.** Under `sources`, after `tokens`:

```json
"extension": {
  "pdf": "sorcerers-cave-conversion-kit-extension.pdf",
  "pages": 14,
  "author": "Peter Vodden",
  "version": "<from Task 1 step 4, or null>"
}
```

**5b.** Under `categories`, add `tilesExtension`. `tileType` values come from Task 2's `tile-types.md` (shown as `"<T>"` below — replace each; do not guess):

```json
"tilesExtension": {
  "dir": "tiles",
  "source": "extension",
  "count": 30,
  "description": "Extension-kit area tiles (88x126mm), LANDSCAPE with NW direction arrow up, x-prefixed sheets x01-x08 = PDF pages 3-10. Exits/stairs/specials per docs/requirements/extension-kit/2026-07-25-asset-conversion.md, verified against the art. Not yet used by the engine; kept out of 'tiles' so the base game is unchanged.",
  "items": [
    { "file": "area-tile-x01-1.png", "w": 1728, "h": 1210, "exits": "NE",   "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": false },
    { "file": "area-tile-x01-2.png", "w": 1728, "h": 1210, "exits": "NES",  "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": false },
    { "file": "area-tile-x01-3.png", "w": 1728, "h": 1210, "exits": "NE",   "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": false },
    { "file": "area-tile-x01-4.png", "w": 1728, "h": 1210, "exits": "NES",  "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": false },
    { "file": "area-tile-x02-1.png", "w": 1728, "h": 1210, "exits": "NES",  "tileType": "<T>", "special": null,        "stairUp": true,  "stairDown": false },
    { "file": "area-tile-x02-2.png", "w": 1728, "h": 1210, "exits": "NESW", "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": false },
    { "file": "area-tile-x02-3.png", "w": 1728, "h": 1210, "exits": "NES",  "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": true  },
    { "file": "area-tile-x02-4.png", "w": 1728, "h": 1210, "exits": "NEW",  "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": false },
    { "file": "area-tile-x03-1.png", "w": 1728, "h": 1210, "exits": "NESW", "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": false },
    { "file": "area-tile-x03-2.png", "w": 1728, "h": 1210, "exits": "NESW", "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": false },
    { "file": "area-tile-x03-3.png", "w": 1728, "h": 1210, "exits": "NESW", "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": false },
    { "file": "area-tile-x03-4.png", "w": 1728, "h": 1210, "exits": "NESW", "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": false },
    { "file": "area-tile-x04-1.png", "w": 1728, "h": 1210, "exits": "NW",   "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": false },
    { "file": "area-tile-x04-2.png", "w": 1728, "h": 1210, "exits": "NSW",  "tileType": "<T>", "special": null,        "stairUp": true,  "stairDown": false },
    { "file": "area-tile-x04-3.png", "w": 1728, "h": 1210, "exits": "NESW", "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": false },
    { "file": "area-tile-x04-4.png", "w": 1728, "h": 1210, "exits": "NSW",  "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": false },
    { "file": "area-tile-x05-1.png", "w": 1728, "h": 1210, "exits": "ESW",  "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": false },
    { "file": "area-tile-x05-2.png", "w": 1728, "h": 1210, "exits": "ESW",  "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": true  },
    { "file": "area-tile-x05-3.png", "w": 1728, "h": 1210, "exits": "ES",   "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": false },
    { "file": "area-tile-x05-4.png", "w": 1728, "h": 1210, "exits": "ESW",  "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": false },
    { "file": "area-tile-x06-1.png", "w": 1728, "h": 1210, "exits": "SW",   "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": false },
    { "file": "area-tile-x06-2.png", "w": 1728, "h": 1210, "exits": "NESW", "tileType": "<T>", "special": "chasm",     "stairUp": false, "stairDown": false },
    { "file": "area-tile-x06-3.png", "w": 1728, "h": 1210, "exits": "ESW",  "tileType": "<T>", "special": null,        "stairUp": true,  "stairDown": false },
    { "file": "area-tile-x06-4.png", "w": 1728, "h": 1210, "exits": "NESW", "tileType": "<T>", "special": "bell-rope", "stairUp": false, "stairDown": false },
    { "file": "area-tile-x07-1.png", "w": 1728, "h": 1210, "exits": "NESW", "tileType": "<T>", "special": "lair",      "stairUp": false, "stairDown": false },
    { "file": "area-tile-x07-2.png", "w": 1728, "h": 1210, "exits": "NESW", "tileType": "<T>", "special": "whirlpool", "stairUp": false, "stairDown": false },
    { "file": "area-tile-x07-3.png", "w": 1728, "h": 1210, "exits": "NESW", "tileType": "<T>", "special": "gallery",   "stairUp": false, "stairDown": false },
    { "file": "area-tile-x07-4.png", "w": 1728, "h": 1210, "exits": "NESW", "tileType": "<T>", "special": "well",      "stairUp": false, "stairDown": false },
    { "file": "area-tile-x08-1.png", "w": 1728, "h": 1210, "exits": "EW",   "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": false },
    { "file": "area-tile-x08-2.png", "w": 1728, "h": 1210, "exits": "EW",   "tileType": "<T>", "special": null,        "stairUp": false, "stairDown": false }
  ]
}
```

(If Task 2 found The Chasm's art has a literal down-stair, set its `stairDown` accordingly and note it in the commit message.)

**5c.** Add `cardsExtension`. Category mapping follows the base kit, where artifacts are `treasure` (e.g. Lotus Dust, Talisman); `entityId` is `null` throughout — engine entities do not exist yet:

```json
"cardsExtension": {
  "dir": "cards",
  "source": "extension",
  "count": 30,
  "description": "Extension-kit small cards (63x88mm), upright portrait, x-prefixed sheets x01-x04 = PDF pages 11-14 (sheet x04 has slots 1,2,3,5,6,7). Names/types per docs/requirements/extension-kit/2026-07-25-asset-conversion.md, verified against the printed banners. entityId null pending engine integration; artifacts categorised 'treasure' per base-kit convention. Not yet used by the engine.",
  "items": [
    { "file": "small-card-x01-1.png", "w": 700, "h": 1000, "name": "Crypt / Gems", "category": "hazard",   "entityId": null },
    { "file": "small-card-x01-2.png", "w": 700, "h": 1000, "name": "Desertion",    "category": "hazard",   "entityId": null },
    { "file": "small-card-x01-3.png", "w": 700, "h": 1000, "name": "Elixir",       "category": "treasure", "entityId": null },
    { "file": "small-card-x01-4.png", "w": 700, "h": 1000, "name": "Gold",         "category": "treasure", "entityId": null },
    { "file": "small-card-x01-5.png", "w": 700, "h": 1000, "name": "Apprentice",   "category": "creature", "entityId": null },
    { "file": "small-card-x01-6.png", "w": 700, "h": 1000, "name": "Demon",        "category": "creature", "entityId": null },
    { "file": "small-card-x01-7.png", "w": 700, "h": 1000, "name": "Dwarf",        "category": "creature", "entityId": null },
    { "file": "small-card-x01-8.png", "w": 700, "h": 1000, "name": "Gems",         "category": "treasure", "entityId": null },
    { "file": "small-card-x02-1.png", "w": 700, "h": 1000, "name": "Gold",         "category": "treasure", "entityId": null },
    { "file": "small-card-x02-2.png", "w": 700, "h": 1000, "name": "Holy Water",   "category": "treasure", "entityId": null },
    { "file": "small-card-x02-3.png", "w": 700, "h": 1000, "name": "Lion",         "category": "creature", "entityId": null },
    { "file": "small-card-x02-4.png", "w": 700, "h": 1000, "name": "<from Task 3 — expected Magic Axe>", "category": "treasure", "entityId": null },
    { "file": "small-card-x02-5.png", "w": 700, "h": 1000, "name": "Gold",         "category": "treasure", "entityId": null },
    { "file": "small-card-x02-6.png", "w": 700, "h": 1000, "name": "Harpies",      "category": "hazard",   "entityId": null },
    { "file": "small-card-x02-7.png", "w": 700, "h": 1000, "name": "Idol",         "category": "treasure", "entityId": null },
    { "file": "small-card-x02-8.png", "w": 700, "h": 1000, "name": "Lotus Dust",   "category": "treasure", "entityId": null },
    { "file": "small-card-x03-1.png", "w": 700, "h": 1000, "name": "Quarrel",      "category": "hazard",   "entityId": null },
    { "file": "small-card-x03-2.png", "w": 700, "h": 1000, "name": "Scroll",       "category": "treasure", "entityId": null },
    { "file": "small-card-x03-3.png", "w": 700, "h": 1000, "name": "Silver",       "category": "treasure", "entityId": null },
    { "file": "small-card-x03-4.png", "w": 700, "h": 1000, "name": "Spell",        "category": "treasure", "entityId": null },
    { "file": "small-card-x03-5.png", "w": 700, "h": 1000, "name": "Magic Shield", "category": "treasure", "entityId": null },
    { "file": "small-card-x03-6.png", "w": 700, "h": 1000, "name": "Scholar",      "category": "creature", "entityId": null },
    { "file": "small-card-x03-7.png", "w": 700, "h": 1000, "name": "Silver",       "category": "treasure", "entityId": null },
    { "file": "small-card-x03-8.png", "w": 700, "h": 1000, "name": "Silver",       "category": "treasure", "entityId": null },
    { "file": "small-card-x04-1.png", "w": 700, "h": 1000, "name": "Witch",        "category": "creature", "entityId": null },
    { "file": "small-card-x04-2.png", "w": 700, "h": 1000, "name": "Witch",        "category": "creature", "entityId": null },
    { "file": "small-card-x04-3.png", "w": 700, "h": 1000, "name": "Woman",        "category": "creature", "entityId": null },
    { "file": "small-card-x04-5.png", "w": 700, "h": 1000, "name": "Thief",        "category": "creature", "entityId": null },
    { "file": "small-card-x04-6.png", "w": 700, "h": 1000, "name": "Witch",        "category": "creature", "entityId": null },
    { "file": "small-card-x04-7.png", "w": 700, "h": 1000, "name": "Wolf",         "category": "creature", "entityId": null }
  ]
}
```

If the contact-sheet review corrected any printed name (e.g. "Crypt" vs "Crypt / Gems"), use the printed name.

- [ ] **Step 6: Validate the manifest mechanically**

```bash
python3 - <<'EOF'
import json, os
m = json.load(open('docs/assets/manifest.json'))
for key in ('tilesExtension', 'cardsExtension'):
    c = m['categories'][key]
    assert c['count'] == len(c['items']) == 30, key
    for it in c['items']:
        p = os.path.join('docs/assets', c['dir'], it['file'])
        assert os.path.exists(p), p
print('manifest OK')
EOF
```

Expected: `manifest OK`.

- [ ] **Step 7: Commit**

```bash
git add docs/assets/manifest.json packages/assets/src/index.ts packages/assets/src/index.test.ts
git commit -m "Extension kit: register tiles/cards in manifest as inert extension categories"
```

---

### Task 5: Sync, regression suite, final verification

**Files:**
- Modify (contents only, gitignored): `apps/web/public/assets/`

- [ ] **Step 1: Force-refresh the served asset mirror**

`sync-assets.mjs` skips PNG dirs that are already non-empty, so clear them first:

```bash
rm -rf apps/web/public/assets/tiles apps/web/public/assets/cards
pnpm --filter web sync-assets
ls apps/web/public/assets/tiles | wc -l   # expect 90
ls apps/web/public/assets/cards | wc -l   # expect 102
```

- [ ] **Step 2: Run the full test suite (base game must be untouched)**

```bash
pnpm test
```

Expected: PASS across all packages — in particular `apps/web` `tileOrientation.test.ts` (rot-0 invariant) and `manifest.test.ts`, proving the new categories are inert. Any failure here means extension data leaked into base-game resolution — fix before proceeding, do not skip tests.

- [ ] **Step 3: LFS sanity before push**

```bash
git lfs ls-files | grep -c '\-x0'   # expect 60
git log --oneline main..HEAD
```

Every new PNG must appear as an LFS pointer. `git push` only when the user asks.

- [ ] **Step 4: Report**

Summarise for the user: counts, any art-vs-table discrepancies found (exits, Chasm stair, x02-4 name, page-14 slot layout), and the open follow-ups (engine entities/rules, deck composition, engine-spec updates — all explicitly out of scope here).

---

## Out of Scope (later extension-kit milestones)

- Engine entities, entity ids, and rules for the new cards/specials (Chasm, Bell Rope, Whirlpool, Gallery, Well, Crypt/Gems, Desertion, Elixir, Apprentice, Demon, Harpies, Quarrel, Scroll, Spell, Magic Axe, Magic Shield, Holy Water, Idol, Lion, Scholar, Thief, Witch, Wolf behaviours).
- Deck composition / area-card topology integration (extension tiles joining `resolveTile`).
- Any `docs/specs/engine-spec.md` changes (no engine code is touched by this plan).
- An opt-in toggle for the extension kit in the UI.

## Known Judgement Calls (flag to the user if they disagree)

1. **`x` filename prefix** with per-category sheet numbering from 01 (mirrors base-kit `s` convention; keeps `tileId`/`cardId` namespaces disjoint). Alternative rejected: continuing `s16+`/`s10+` would hide kit membership.
2. **Separate manifest categories** rather than a `kit` field on merged categories — keeps the base game provably unchanged today; merging is an engine-milestone decision.
3. **Artifacts categorised `treasure`** — follows the base kit (Lotus Dust, Talisman are `treasure`); the requirements' lowercase "artifact" type is not a manifest category.
4. **x02-4 assumed Magic Axe** pending the art check (requirements have an untitled artifact row and an unreferenced Magic Axe rules section).
5. **Chasm `stairDown: false`** — its one-way descent is a special rule, not stair art (verify in Task 2).
6. **Card stats stay out of the manifest** — Weight/Score/Strength/Magic and the rules text belong to the engine data milestone (base-kit convention: the manifest carries only file/name/category/entityId; stats live in `packages/engine/src/data`). The requirements tables remain the source for that later work.
