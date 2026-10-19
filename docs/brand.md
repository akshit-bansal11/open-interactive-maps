# Open Interactive Maps — brand sheet

The mark, the wordmark and the palette. Everything here is implemented: the mark in
[`src/components/Logo.tsx`](../src/components/Logo.tsx) and
[`src/app/icon.svg`](../src/app/icon.svg), the palette in
[`src/app/globals.css`](../src/app/globals.css) (raw scales, then semantic roles), and the
export palette in [`src/lib/svg.mjs`](../src/lib/svg.mjs).

Files in [`docs/brand/`](brand): `logo-mark.svg`, `logo-horizontal.svg`, `palette.svg`.

## Concept: drill-down

The product has one idea: start with the whole planet and keep going until you are standing in a
single village. The mark draws that as a set of nested discs, each internally tangent to the one
before it at a single point, with the last one reduced to a small solid dot. Read as a globe, the big
disc has a meridian and a lit limb; read as a contour map, the crescents between the discs are
terraces that tighten toward one summit; read as a zoom funnel, every level converges on the dot.

## Construction

![The mark](brand/logo-mark.svg)

Built on a 64-unit grid, tile corner radius 14 (about 22%).

| Element | Geometry | Colour |
|---|---|---|
| Tile | 64 × 64, r 14 | `ocean-950` (`ocean-900` in the dark theme) |
| Disc 1, the world | r 26, centre 32, 32 | `ocean-600` |
| Meridian | ellipse rx 12, ry 26, clipped to disc 1, 1.2 stroke, 50% | `ocean-300` |
| Disc 2, the region | r 17, centre 38.36, 38.36 | `ocean-300` |
| Disc 3, the district | r 9.5, centre 43.67, 43.67 | `ocean-50` |
| Keyline | r 5.8 at the dot, tile colour | tile |
| Dot, the village | r 4, centre 47.56, 47.56 | `saffron-400` |

- The three discs and the dot share one tangent point, T = (50.38, 50.38), on the 45° axis: the
  centre of each is T minus its radius along the diagonal. Radii step roughly ×0.65, ×0.56, ×0.42.
- The keyline cuts the dot out of the discs so it survives at 16 px, where the crescents merge.
- No text lives in the mark. The marigold is used once, on the dot.

### Wordmark

"Open Interactive Maps" is live text in Geist (the app font), never outlines: "Open" at weight 380
in the muted text colour, "Interactive Maps" at 720 in the text colour, tracking about −0.04 em, set on
one line. In the header it sits beside the mark at 16 px with a 36 px tile. `docs/brand/logo-horizontal.svg`
references Geist with a system-ui fallback.

### Clear space and minimum size

- **Clear space:** keep at least a quarter of the tile's width (16 units, one dot diameter and a bit)
  free on every side of the mark; between mark and wordmark leave 0.2× the tile width.
- **Minimum size:** the mark alone 16 px (favicon). The horizontal lockup 120 px wide (tile 24 px).
  Below 24 px use the tile version, never the bare discs.
- Delivered sizes: `icon.svg` (any), `apple-icon.png` 180 × 180 full-bleed (the system rounds it),
  `opengraph-image.png` 1200 × 630.

### Do and don't

| Do | Don't |
|---|---|
| Use the tile mark on any background; the tile carries its own contrast. | Recolour the discs or put the dot on anything but `saffron-400`. |
| Keep marigold for the dot, the active area and drill affordances. | Use marigold as body-text colour; use `accent-ink` for the rare amber text. |
| Set the wordmark in Geist, "Open" light, the rest heavy. | Outline the wordmark, stretch it, add a drop shadow or a gradient. |
| Leave the clear space; keep it upright. | Rotate the mark, add a pin, a magnifier or a globe grid, or enclose it in a circle. |
| Let places differ in lightness and size as well as hue. | Rely on hue alone to tell a city from a town. |

## Palette

Abyssal ocean teal is the base; marigold is the single warm note; glacier aqua is for places and links;
four mineral tones colour the land. Scales are generated in OKLCH (even lightness steps, chroma eased at
both ends) and snapped to sRGB. Components never name a raw colour: they use roles.

### Raw scales

| Step | Ocean | Saffron | Glacier | Mist |
|---|---|---|---|---|
| 50 | `#eef9fc` | `#fcf6ea` | `#edfaf9` | `#f5f7f7` |
| 100 | `#daf2f8` | `#fcefd5` | `#d8f3f2` | `#eaeeee` |
| 200 | `#b9e7f4` | `#fde1ab` | `#b4eae9` | `#d8dfe0` |
| 300 | `#8ed6e8` | `#fdce77` | `#85dada` | `#c1cbcc` |
| 400 | `#5cbed4` | `#fab92c` | `#4ac3c3` | `#a4b1b2` |
| 500 | `#2ca2b9` | `#e6a614` | `#0fa7a8` | `#879597` |
| 600 | `#0c8498` | `#c68c00` | `#0e8788` | `#6c797a` |
| 700 | `#066877` | `#9d6d09` | `#096a6b` | `#545f60` |
| 800 | `#03505b` | `#765001` | `#045153` | `#404849` |
| 900 | `#003941` | `#533700` | `#003a3b` | `#2d3334` |
| 950 | `#002126` | `#341f00` | `#002122` | `#181d1d` |

Land tones. Step 150 (between 100 and 200, not in the 50 to 950 ladder) is the light-theme land colour; the dark-theme land colours are lower-chroma literals, listed under roles:

| Step | Sand | Lichen | Clay | Celadon |
|---|---|---|---|---|
| 50 | `#f8f7f3` | `#f5f8f3` | `#fbf6f3` | `#f3f8f7` |
| 100 | `#efede5` | `#eaefe6` | `#f5eae5` | `#e6efed` |
| 200 | `#e3ded0` | `#d8e2d1` | `#eddace` | `#d1e2df` |
| 300 | `#d1c8b4` | `#c0ceb6` | `#dfc2b2` | `#b5cfca` |
| 400 | `#b8ad94` | `#a3b597` | `#c9a691` | `#95b6b0` |
| 500 | `#9c9177` | `#879979` | `#ae8973` | `#779b94` |
| 600 | `#7f755c` | `#6c7c5f` | `#906e59` | `#5d7e78` |
| 700 | `#645b47` | `#536149` | `#725544` | `#47635e` |
| 800 | `#4d4635` | `#3f4b37` | `#574133` | `#354b48` |
| 900 | `#363125` | `#2c3526` | `#3e2d23` | `#253533` |
| 950 | `#1f1b13` | `#181e14` | `#251912` | `#131e1c` |

### Semantic roles

Each role is one `light-dark()` declaration, so it follows the system theme and the theme toggle.

**Surfaces**

| Role | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#c0e0e5` | `#03181e` | the sea the map sits on |
| `--bg-glow` | `#ddf1f4` | `#0a303b` | highlight of the sea gradient |
| `--solid` | `#fbfdfd` | `#0e3340` | menus, dialogs, selected tab |
| `--glass` | `#fbfdfd` @ 74% | `#071f27` @ 70% | floating cards, over a blur |
| `--field` | `#003941` @ 6% | `#d8f3f2` @ 7% | inputs, tab tray |
| `--hover` | `#003941` @ 7% | `#d8f3f2` @ 9% | hover fill |
| `--border` | `#003941` @ 10% | `#d8f3f2` @ 11% | hairlines |
| `--border-strong` | `#003941` @ 20% | `#d8f3f2` @ 22% | dividers, kbd |
| `--grid-dot` | `#03505b` @ 14% | `#85dada` @ 10% | the dot grid on the sea |

**Text, brand, link, accent**

| Role | Light | Dark | Use |
|---|---|---|---|
| `--text` | `#002126` · ocean-950 | `#eef9fc` · ocean-50 | body and headings |
| `--text-muted` | `#545f60` · mist-700 | `#c1cbcc` · mist-300 | secondary text |
| `--text-faint` | `#586c6e` | `#a4b1b2` · mist-400 | placeholders, captions |
| `--brand` | `#066877` · ocean-700 | `#5cbed4` · ocean-400 | primary button fill |
| `--on-brand` | `#ffffff` | `#002126` · ocean-950 | text on the primary button |
| `--link` | `#066877` · ocean-700 | `#85dada` · glacier-300 | links, eyebrow, secondary actions |
| `--link-soft` | `#0c8498` @ 11% | `#85dada` @ 15% | tint behind a link-coloured control |
| `--link-line` | `#0c8498` @ 45% | `#85dada` @ 50% | focus border of the search |
| `--focus` | `#0c8498` · ocean-600 | `#85dada` · glacier-300 | focus ring |
| `--accent` | `#e69004` | `#fab92c` · saffron-400 | active area, active place, current step: a fill, not text |
| `--accent-soft` | `#e6a614` @ 17% | `#fab92c` @ 17% | active list row |
| `--accent-line` | `#c68c00` @ 70% | `#fab92c` @ 60% | settlement outline, quote rule |
| `--accent-ink` | `#765001` · saffron-800 | `#fdce77` · saffron-300 | the one text-safe amber (chevron, warning icon) |
| `--on-accent` | `#341f00` · saffron-950 | `#341f00` · saffron-950 | ink on marigold |

**The map**

| Role | Light | Dark | Use |
|---|---|---|---|
| `--land-0` | `#f0e7d2` · sand-150 | `#2b3d3f` | land, sand |
| `--land-1` | `#e0edd6` · lichen-150 | `#2c4237` | land, lichen |
| `--land-2` | `#f6e4d7` · clay-150 | `#3d3a31` | land, clay |
| `--land-3` | `#d5eeeb` · celadon-150 | `#274347` | land, celadon |
| `--land-line` | `#003941` @ 40% | `#b4eae9` @ 26% | borders |
| `--city` | `#880d0d` | `#e96351` | dot, 11 px |
| `--town` | `#0d7176` | `#57c3cf` | dot, 8 px |
| `--village` | `#6c8492` | `#e4f2f2` | dot, 5 px |
| `--label` | `#002126` · ocean-950 | `#eef9fc` · ocean-50 | place labels |
| `--halo` | `#fbfdfd` @ 88% | `#03181e` @ 88% | label halo |
| `--tip-bg` | `#002126` · ocean-950 | `#eef9fc` · ocean-50 | tooltip |
| `--tip-text` | `#eef9fc` · ocean-50 | `#002126` · ocean-950 | tooltip text |
| `--tip-muted` | `#8ed6e8` · ocean-300 | `#066877` · ocean-700 | tooltip secondary |

**The globe**

| Role | Light | Dark |
|---|---|---|
| `--globe-sea-hi` | `#7ed1de` | `#1a6c7e` |
| `--globe-sea-mid` | `#2ea2b6` | `#0b3f4d` |
| `--globe-sea-lo` | `#0d6a7e` | `#041a23` |
| `--globe-glow` | `#5cbed4` @ 50% | `#4ac3c3` @ 34% |
| `--globe-limb` | `#002126` @ 50% | `#000a0e` @ 50% |
| `--globe-shine` | `#ffffff` @ 50% | `#b4eae9` @ 18% |
| `--globe-grid` | `#ffffff` @ 28% | `#b4eae9` @ 10% |
| `--globe-rim` | `#03505b` @ 40% | `#b4eae9` @ 30% |
| `--globe-land-0` | `#f0e7d2` · land-0 | `#736847` |
| `--globe-land-1` | `#e0edd6` · land-1 | `#4b6d52` |
| `--globe-land-2` | `#f6e4d7` · land-2 | `#835747` |
| `--globe-land-3` | `#d5eeeb` · land-3 | `#416c6c` |

**The mark**: `--mark-tile`, `--mark-outer`, `--mark-mid`, `--mark-inner`, `--mark-dot`, `--mark-meridian` (the values in the construction table; only the tile changes with the theme).

**Exports** keep a fixed light palette (`STYLE` in `src/lib/svg.mjs`): land `#f0e7d2`, edge `#003941` at 40%, sea `#c0e0e5`, highlight `#e69004`, places `#880d0d` / `#0d7176` / `#6c8492`.

## Contrast

Computed with WCAG 2.x relative luminance; glass is composited over the sea it sits on. Ratios are
rounded to one decimal, and no text pair is below 4.5:1 or UI pair below 3:1 except the active fill noted below.

| Pair | Light | Dark | Needs |
|---|---|---|---|
| `text` on `solid` | 16.5:1 | 12.5:1 | 4.5 |
| `text-muted` on `solid` | 6.5:1 | 8.1:1 | 4.5 |
| `text-faint` on `solid` | 5.4:1 | 6.1:1 | 4.5 |
| `text-faint` on `glass` | 5.0:1 | 7.9:1 | 4.5 |
| `text-muted` on the sea | 4.7:1 | 11.0:1 | 4.5 |
| `link` on `solid` | 6.3:1 | 8.3:1 | 4.5 |
| `link` on `link-soft` | 5.5:1 | 5.8:1 | 4.5 |
| `text` on the active row (`accent-soft`) | 14.6:1 | 8.9:1 | 4.5 |
| `accent-ink` on `solid` | 7.0:1 | 9.1:1 | 4.5 |
| `on-brand` on `brand` | 6.5:1 | 7.8:1 | 4.5 |
| `on-accent` on `accent` | 6.2:1 | 9.0:1 | 4.5 |
| `tip-text` on `tip-bg` | 15.7:1 | 15.7:1 | 4.5 |
| `tip-muted` on `tip-bg` | 10.4:1 | 6.0:1 | 4.5 |
| `label` on the worst land tone | 13.6:1 | 9.9:1 | 4.5 |
| `focus` ring on `solid` | 4.3:1 | 8.3:1 | 3 |
| `focus` ring on the sea | 3.2:1 | 11.3:1 | 3 |
| city / town / village dot on the worst land tone | 3.2:1 | 3.2:1 | 3 |
| `accent` fill on the worst land tone | 2.0:1 | 6.1:1 | see note |

Note on the active fill. In the light theme the marigold is a luminous colour on pale land, so its
fill-to-land luminance ratio is about 2:1; what makes it stand out is the chroma (the land tones are
almost grey by comparison) and the 1.5 px ink outline, which is 12:1 against every land tone. In the dark
theme the fill is 6:1 or better against all four tones.

### Colour-blind check

Places differ in lightness, not just hue, and in size (11, 8 and 5 px). Simulating deuteranopia
(Machado, severity 1.0) and comparing CIE L*: city and town 9 L*, town and village 12 L* in the light theme;
8 L* and 23 L* in the dark theme (all at least 8 L*, a clear step). Each dot kind also
sits at least 8 L* away from the marigold highlight under the same simulation.
