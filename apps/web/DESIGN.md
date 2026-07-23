---
name: Sorcerer's Cave
description: An antiquarian's cabinet in the dark — lantern-lit brass and vellum framing the original 1978 game art.
colors:
  depthless-dark: "#070709"
  cavern-shade: "#15151b"
  raised-shade: "#1d1d24"
  cave-iron: "#33333a"
  weathered-stone: "#b8b1a2"
  faded-stone: "#6f6a5f"
  torchlit-vellum: "#e8dbbb"
  aged-vellum: "#d7c599"
  candle-cream: "#f6efce"
  scribe-ink: "#211b12"
  gilt-ink: "#241a06"
  lantern-gold: "#c9a14e"
  bright-lantern: "#e6c578"
  old-wound-red: "#a8443a"
  cold-pool-teal: "#5f8f8a"
  vellum-hairline: "rgba(232, 219, 187, 0.13)"
  vellum-hairline-strong: "rgba(232, 219, 187, 0.26)"
  party-green: "#5bbf63"
  party-blue: "#5b9be6"
  party-yellow: "#e6c84e"
  party-red: "#d65b4a"
typography:
  display:
    fontFamily: "Cinzel, serif"
    fontSize: "clamp(34px, 7vw, 66px)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.06em"
  headline:
    fontFamily: "Cinzel, serif"
    fontSize: "clamp(28px, 5vw, 40px)"
    fontWeight: 700
    letterSpacing: "0.08em"
  title:
    fontFamily: "Cinzel, serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.2em"
  blackletter:
    fontFamily: "'Grenze Gotisch', serif"
    fontSize: "21px"
    fontWeight: 400
    lineHeight: 1.05
  flavor:
    fontFamily: "'EB Garamond', serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.35
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    letterSpacing: "0.14em"
rounded:
  xs: "6px"
  sm: "8px"
  md: "9px"
  lg: "11px"
  xl: "14px"
  2xl: "16px"
  pill: "999px"
spacing:
  2xs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.lantern-gold}"
    textColor: "{colors.gilt-ink}"
    rounded: "{rounded.lg}"
    padding: "12px 18px"
  button-ghost:
    backgroundColor: "rgba(201, 161, 78, 0.06)"
    textColor: "{colors.torchlit-vellum}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
  button-danger:
    backgroundColor: "{colors.old-wound-red}"
    textColor: "{colors.candle-cream}"
    rounded: "{rounded.lg}"
    padding: "12px 18px"
  panel:
    backgroundColor: "rgba(15, 15, 20, 0.74)"
    textColor: "{colors.torchlit-vellum}"
    rounded: "{rounded.2xl}"
    padding: "24px 26px"
  chip:
    backgroundColor: "rgba(15, 15, 20, 0.74)"
    textColor: "{colors.candle-cream}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  input:
    backgroundColor: "rgba(0, 0, 0, 0.25)"
    textColor: "{colors.candle-cream}"
    rounded: "{rounded.md}"
    padding: "9px 11px"
  die:
    backgroundColor: "#f3ead0"
    textColor: "{colors.depthless-dark}"
    rounded: "12px"
    size: "60px"
---

# Design System: Sorcerer's Cave

## Overview

**Creative North Star: "The Antiquarian's Cabinet"**

This interface is the museum-grade cabinet in which a rediscovered 1978 artifact is
displayed: dark glass, brass fittings, and vellum labels around the original card art,
which is always the exhibit and never the decoration. The room is nearly lightless —
a depthless near-black cave — and every UI surface is a pane of smoked glass floating
in it, edged with hairlines of translucent parchment and lit by the warm glow of
lantern gold. The atmosphere is immersive and hushed; the player is down in the dark,
and the interface is the small circle of civilized light they carry.

The system speaks in four typographic voices (engraved Cinzel capitals, blackletter
card names, italic Garamond flavor, and a plain system sans that does the working UI)
and one warm metal. Gold is interaction: buttons, focus, emphasis, and win-states all
glow brass, and its scarcity against the dark is what makes it feel valuable. Danger
is an old dried-blood red, never a modern alert red. Nothing in the interface is pure
white, pure black, opaque, or cool-gray.

**Key Characteristics:**
- Near-black void ground with translucent dark-glass panels (blur + vellum hairline).
- Brass/gold reserved for interaction and emphasis; dark ink text on gold fills.
- Original card art displayed whole, on parchment mats, at card aspect (63/88).
- Uppercase, letterspaced Cinzel eyebrows label every panel and stat.
- Ambient lantern-glow depth: huge soft black shadows below, brass glows around.

## Colors

A candlelit palette: warm vellum tones and lantern brass over a depthless cave dark,
with one dried-blood red for peril and one cold teal for the arcane.

### Primary
- **Lantern Gold** (#c9a14e): the interactive metal. Primary button fills (as the
  dark end of the brass gradient), hover borders, focus rings, selected states, the
  compass needle, brand accents. Scarcity is deliberate.
- **Bright Lantern** (#e6c578): the lit end of every brass gradient; glowing text
  accents (scores, panel headers, win-state dice), unread/emphasis highlights.

### Secondary
- **Old Wound Red** (#a8443a): peril and loss — hostile strangers, danger prompts,
  destructive buttons, the deck-low pulse, curse indicators. Darker variants
  (#8a3a34, #c2473e) build the danger button gradient; #e86b5c and #d98e84 are its
  legible on-dark text tints.

### Tertiary
- **Cold Pool Teal** (#5f8f8a): the arcane accent (`--arcane`), used sparingly for
  magical/otherworldly markers.
- **Party Green / Blue / Yellow / Red** (#5bbf63 / #5b9be6 / #e6c84e / #d65b4a):
  player-identity swatches in multiplayer chips, markers, and scoreboards only.

### Neutral
- **Depthless Dark** (#070709): the page ground and the void behind the 3D cave;
  also dark text on bone dice.
- **Cavern Shade** (#15151b) and **Raised Shade** (#1d1d24): opaque panel fills for
  modal cards and the dice overlay.
- **Torchlit Vellum** (#e8dbbb): default body text on dark surfaces.
- **Candle Cream** (#f6efce): headings, emphasized names, values — the brightest
  text tone in the system.
- **Weathered Stone** (#b8b1a2) and **Faded Stone** (#6f6a5f): secondary and muted
  text — captions, keys, disabled labels.
- **Scribe's Ink** (#211b12) and **Gilt Ink** (#241a06): dark text on parchment mats
  and on gold button fills.
- **Vellum Hairline** (rgba(232,219,187,0.13)) and **Vellum Hairline Strong**
  (rgba(232,219,187,0.26)): every border and divider in the system.

### Named Rules
**The Brass Is Interaction Rule.** Gold belongs to things the player can touch or
must notice. At most one gold-filled control per surface region; everything else
earns brass only on hover, focus, or selection.

**The No Daylight Rule.** No pure #fff or #000, no cool grays, no default blues.
Light tones are always warm vellum; darks are always the warm-black cave family.

## Typography

**Display Font:** Cinzel (serif; weights 400/600/700, Google Fonts)
**Blackletter Font:** Grenze Gotisch (serif; 400/700) — card names only
**Flavor Font:** EB Garamond (serif; roman + italic) — narrative and flavor text
**UI Font:** ui-sans-serif / system-ui stack — all working controls and labels

**Character:** Engraved Roman capitals give the cabinet its museum-plaque authority;
blackletter names the exhibits; Garamond whispers the story in italic; and a plain
system sans quietly operates the machinery underneath.

### Hierarchy
- **Display** (700, clamp(34px, 7vw, 66px), Cinzel): the splash title only, with a
  gold-and-arcane text glow.
- **Headline** (700, clamp(28px, 5vw, 40px), 0.08em, Cinzel): shell-screen titles
  (party select, game over) in Candle Cream with a soft brass text-shadow.
- **Title** (700, 12–15px, 0.16–0.2em tracking, UPPERCASE, Cinzel): panel headers,
  eyebrows, dice-overlay titles — always Bright Lantern or Weathered Stone.
- **Blackletter** (400, 17–21px, Grenze Gotisch): the revealed card's name on its
  parchment mat; the loader subtitle. Nowhere else.
- **Flavor** (italic, 14–18px, EB Garamond): discovery banners, dice messages, the
  splash parchment quote.
- **Body** (400–600, 12.5–15px, system sans): buttons, rows, chat, tables, toasts.
- **Label** (600–700, 9–12px, 0.1–0.26em tracking, UPPERCASE, system sans): stat
  keys, costs, captions — in Faded Stone.

### Named Rules
**The Four Voices Rule.** Cinzel engraves, Grenze Gotisch names cards, EB Garamond
tells the story in italic, the system sans does the work. Never swap their jobs;
never introduce a fifth voice.

**The Engraved Eyebrow Rule.** Every panel announces itself with an uppercase,
heavily letterspaced (≥0.16em) Cinzel or sans label — never a sentence-case heading.

## Layout

The game is a fixed, fullscreen 3D stage (`position: fixed; inset: 0`, body
overflow hidden) with HUD furniture pinned to the corners: brand top-left, stat
chips top-center, revealed card top-right, party roster left, control dock
bottom-center, contextual overlays (encounter panel, reveal ribbon) floating above
the dock. Menu/shell screens (splash, party select, lobby, game over) are single
centered columns — `width: min(460px, 92vw)` for menus, up to `min(900px, 94vw)`
for the party panel — that scroll their own content (`justify-content: safe
center`).

Spacing is tight and consistent: 6–14px gaps inside components, 16–28px between
panel sections, 24–26px panel padding. Screen-edge margins are 20–26px on desktop,
10–14px on mobile. Breakpoints observed: ≤720px (HUD compacts: icon-only dock,
roster collapses to a handle, hint hidden), ≤600px (card grid 4→2 columns), ≤420px
(brand mode hidden), and ≤520px height (landscape-phone compaction). Portrait
phones add `(orientation: portrait)`-scoped rules only — they never alter landscape
or desktop: at ≤720px portrait the fight sheet's actions pin sticky to its bottom
edge and the prompt yields to a left band when a card is revealed; at ≤560px
portrait the corner brand hides and the multiplayer top-strip overlays step down
below the stats row. Mobile pins the dock with `env(safe-area-inset-bottom)`.

## Elevation & Depth

Depth is lantern glow over a void. There is no daylight and no material z-stack:
surfaces float over the dark on enormous, soft, negative-spread black shadows
(canonically `0 28px 70px -28px rgba(0,0,0,0.8)`; smaller furniture uses
`0 10px 30px -16px` to `0 18px 50px -18px`), while light itself radiates from brass
— gold glows (`rgba(201,161,78,0.3–0.6)`) haloing titles, selected cards, winning
dice, and primary buttons. Floating HUD surfaces are translucent dark glass:
`rgba(15,15,20,0.6–0.92)` with `backdrop-filter: blur(6–10px)`; full-screen scrims
are `rgba(7,7,9,0.55–0.92)` with a light blur. Dice add a bone-like
`inset 0 -4px 10px` underside shade.

### Shadow Vocabulary
- **Floating panel** (`box-shadow: 0 28px 70px -28px rgba(0,0,0,0.8)`): shell
  panels, modals, the dice card.
- **HUD furniture** (`box-shadow: 0 10px 30px -16px rgba(0,0,0,0.8)`): chips,
  compass, toasts, docks.
- **Brass glow** (`box-shadow: 0 8px 22px -8px rgba(201,161,78,0.6)`): under
  gold-filled primary buttons; also as `0 0 0 1px var(--brass)` + soft gold bloom on
  selected cards.

### Named Rules
**The Lantern Glow Rule.** Black shadows fall down and away (large y-offset, huge
blur, negative spread); gold light radiates outward (`0 0 Npx` glows). Never a
crisp, small, "card UI" shadow.

## Shapes

Soft-rectangle hardware with a consistent radius ladder: 6–8px on small fittings
(dice faces, card thumbs, swatch tiles), 9–11px on controls (buttons, chips,
inputs, rows), 14–16px on panels and modals, and full pills (999px / 18–20px) for
prompts, toasts, badges, and presence chips. Circles are reserved for the compass,
color swatches, and status dots. Every surface takes a 1px vellum-hairline border;
brass borders signal interactivity or selection. Two deliberate eccentricities give
the cabinet its handmade charm: the revealed-card frame sits on a parchment mat
rotated 1.1°, and the splash's parchment scroll has wooden roller ends built from
gradients.

## Components

### Buttons
- **Shape:** soft rectangle (9–11px radius), 1px border, generous 9–18px padding.
- **Primary ("brass fitting"):** vertical brass gradient (`linear-gradient(180deg,
  #e6c578, #c9a14e)`), Gilt Ink text (#241a06), brass border, gold underglow
  (`0 8px 22px -8px rgba(201,161,78,0.6)`); hover brightens the metal
  (`filter: brightness(1.06–1.07)`), disabled drops to 40% opacity and loses the glow.
- **Ghost / dock:** transparent or faint gold-tint fill (`rgba(201,161,78,0.06)`)
  with a vellum hairline; hover turns the border brass, text Candle Cream, and fill
  `rgba(201,161,78,0.08–0.14)`. Active state keeps a soft brass gradient tint.
- **Danger:** dried-blood gradient (`linear-gradient(180deg, #c2473e, #8a3a34)`)
  with Candle Cream text, or ghost form with #e6a39a text and crimson border.
- **Transitions:** 0.15s on border-color, background, and color.

### Chips (stat chips, presence chips, badges)
- **Style:** dark glass (`rgba(15,15,20,0.74–0.82)` + blur 8px), vellum hairline,
  9px radius (18px pill for presence), uppercase Faded Stone key (9.5px, 0.16em)
  over a Cinzel Candle Cream value (16px).
- **State:** warning values turn Bright Lantern; danger values turn #e86b5c and the
  chip's border pulses crimson (`deckLowPulse` 1.4s).

### Cards / Containers
- **Corner Style:** 16px (shell panels), 14px (overlays and modals), 10px
  (character-select cards).
- **Background:** translucent dark glass `rgba(15,15,20,0.74–0.96)` + backdrop blur
  for floating surfaces; opaque Cavern Shade (#15151b) for the dice card.
- **Shadow Strategy:** floating-panel shadow (see Elevation); selected cards add
  `0 0 0 1px` brass plus a gold bloom.
- **Border:** always 1px Vellum Hairline (strong variant on major panels); brass
  when selected or interactive.
- **Internal Padding:** 24px 26px on panels; 8–12px on cards and rows.
- **The parchment mat:** revealed card art sits in a parchment-gradient frame
  (`linear-gradient(180deg, #efe3c4, #d8c393)`, border #b59a63, 13px radius, 11px
  padding, rotated 1.1°) with Scribe's Ink text — the one light surface in the HUD.

### Inputs / Fields
- **Style:** near-black recessed fill (`rgba(0,0,0,0.25)`), 1px brass border, 9px
  radius, Candle Cream text; code-entry inputs switch to monospace, 0.3–0.4em
  tracking, uppercase.
- **Focus:** brass border brightens to Bright Lantern with a soft gold ring
  (`0 0 0 2px rgba(230,197,120,0.3)`); `focus-visible` outlines are 2px Bright
  Lantern, offset 2px.
- **Selects:** same recipe plus a custom brass chevron (inline SVG data URI) —
  never the native OS arrow; popped-open options render dark-on-parchment.

### Navigation (HUD dock)
- **Style:** a bottom-center floating glass bar (14px radius, blur 10px) of
  icon-only ghost buttons with 1px hairline separators; level buttons use Cinzel
  numerals. Hover follows the ghost-button recipe; the active view keeps a brass
  tint. On mobile it compacts to a wrapping, safe-area-pinned icon row.

### Dice (signature component)
- Bone-colored gradient tiles (`linear-gradient(180deg, #f3ead0, #d8c79c)`, 60px,
  12px radius) with Cinzel numerals in Depthless Dark and an inset underside shade;
  foe dice invert to a crimson gradient with cream numerals. They tumble while
  rolling (`scv-tumble` 0.18s wobble), pop 1.08× on settling, and the winner takes a
  Bright Lantern outline and glow while the loser fades to 70% and desaturates.

## Do's and Don'ts

### Do:
- **Do** build every floating surface as dark glass: `rgba(15,15,20,0.74–0.92)`,
  `backdrop-filter: blur(8px)`, 1px Vellum Hairline, and an ambient black shadow.
- **Do** give every panel an engraved eyebrow: uppercase, ≥0.16em tracking, Cinzel
  700 or sans 600, in Bright Lantern or Faded Stone.
- **Do** show card art whole — `object-fit: contain`, aspect-ratio 63/88, on a
  parchment mat or dark frame — and let it be the most saturated thing on screen.
- **Do** use the brass gradient + Gilt Ink text for exactly the one action you want
  taken, and ghost hairline buttons for everything else.
- **Do** keep state feedback in-world: brass for fortune, Old Wound Red for peril,
  stone tones for the mundane; hover transitions at 0.15s.

### Don't:
- **Don't** import modern flat-SaaS idioms: no white or light panels (except the
  parchment mat), no cool grays, no default-blue buttons, no crisp small shadows.
- **Don't** drift into cartoon fantasy: no bevelled gold UI kits, no glossy ornament,
  no faux-medieval kitsch fonts beyond the four committed voices.
- **Don't** go neon dungeon-crawler: no synthwave purples/cyans as UI chrome, no
  glitch effects (the splash's magical haze is backdrop, not chrome).
- **Don't** use pure #fff or #000 anywhere; light text is Torchlit Vellum or Candle
  Cream, dark text is Scribe's/Gilt Ink.
- **Don't** recolor, crop, filter, or caption over the original card art — it is the
  exhibit (PRODUCT.md brand commitment).
