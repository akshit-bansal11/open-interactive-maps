# Open Interactive Maps

Browse the administrative map of every country, down to the village where one is
published, and take any map with you as SVG, PNG or JSON.

**https://open-interactive-maps.vercel.app**

Start at the world and click down:

```txt
World → Continent → Country → State → District → Sub-District → Village
```

Every level is a map whose areas are clickable, and every map pans and zooms —
wheel, drag, pinch, or the buttons in its corner. Punjab opens Bathinda, Bathinda
opens Talwandi Sabo, and Talwandi Sabo shows its 59 villages.

No mapping-service API key, no tile provider, no map library: the maps are
pre-projected SVG paths and the viewer is a few hundred lines of React.

## Run it

```bash
npm install
npm run dev                  # Next dev server on :3000
```

The app fetches its maps from the published data set, so that is all it takes.
To work against maps you built yourself:

```bash
MAPS_MAX_LEVEL=3 npm run data IND LUX   # a few countries, without the villages
npm run data:serve                      # serve data/ on :8080
NEXT_PUBLIC_DATA_URL=http://localhost:8080 npm run dev
```

## Checks

```bash
npm run check                # format, organise imports, lint, typecheck — writes
npm run check:ci             # the same, non-mutating; what CI runs
npm test                     # unit tests: geometry, packing, pan/zoom arithmetic
npm run data:check           # verify a data build
```

`check-maps.mjs` walks every generated map and asserts the paths are well formed
and inside their canvas, that each map is cut to its region's shape, that every
drilldown and search hit resolves to a map that exists, that the world tier's
projection puts land where it belongs, and that a handful of areas that have gone
missing before are still there. It reports every bad map, not the first.

## How it is fast

The server never renders a map. Every map address is rewritten to one static
page, and the browser fetches the map it needs straight from the data host and
keeps it. Moving between maps is a `pushState`, not a request.

Maps below a country are published in packs, so one fetch answers for many
clicks: a state's pack holds the state and all its districts, and a district's
pack holds everything beneath it. Resting the pointer on an area fetches its map
ahead of the click. Measured on the live site, a map whose pack is already held
draws in under 10 ms and one that needs a fetch in about 300 ms.

Hovering does not re-render the map: the highlight is an attribute on one
element, so a state with thousands of areas stays smooth.

## How the data is made

`npm run data` builds every country geoBoundaries publishes, as deep as it
publishes them. Downloads land in `.cache/`, so a second run is offline.

**Everything comes from [geoBoundaries](https://www.geoboundaries.org)
(gbOpen)**, one map per drillable area. It puts no parent link on a feature, so
each child is filed under the parent containing most of its outline. Sample
points are nudged inward off the boundary first: two levels of one dataset share
their border verbatim, and point-in-polygon on a shared edge answers at random —
left alone, that files Daman and Diu under Gujarat instead of their own union
territory.

**[OpenStreetMap](https://www.openstreetmap.org) fills what geoBoundaries
lacks.** It has no country outline for India or Puerto Rico, so those two come
from OpenStreetMap's boundary relations through Nominatim. OpenStreetMap draws
lines of actual control, so India's outline on the map of Asia differs in Kashmir
from the outline of its own states one click down.

**India's villages hang off the sub-district.** geoBoundaries publishes a level
in between, the community development block, but it divides a district in
parallel with the sub-district rather than inside it, so it is left out of
India's ladder (`SKIP_LEVELS` in `build-maps.mjs`).

Continent membership is derived from geoBoundaries' metadata rather than filed by
hand. Its `Continent` field carries UN regions, not continents, so the Americas
are split on `UNSDG-subregion`. One override: Russia moves to Asia — it is the
only European member spanning −180 to 180, and left there it stretches Europe
from Iceland to Kamchatka.

The world and continent maps are projected with **Equal Earth**; country level
and below is equirectangular, corrected by the latitude at the centre of the
region. Any map that straddles the antimeridian — Fiji, Kiribati, the United
States by way of the Aleutians — is re-centred on its own meridian and cut at the
far side. Every map is fitted to a canvas cut to its own aspect, longest side
1000, and fitted a second time over what will actually be drawn, so an islet too
small to show does not leave the map floating in margin.

### What gets written

```txt
data/
  index.json                              countries built, and any that failed
  search.json                             search index: the world down to first-level areas
  world.json                              one file per map, down to the countries
  world/asia.json
  world/asia/india.json
  world/asia/india.search.json            search index: India down to its sub-districts
  world/asia/india/punjab.json            pack: Punjab's map and its districts' maps
  world/asia/india/punjab/bathinda.json   pack: every map below Bathinda
```

`src/lib/pack.mjs` decides which file holds a map, and the generator, its check
and the browser all import it.

## Coverage

The build of 2026-10-10: **944,200 areas on 41,828 maps, 208 countries
drillable, none failed.** 5,423 files, 462 MB, built in six minutes.

| Level | Countries | Areas |
| --- | --- | --- |
| Country outlines | 232 | 232 |
| ADM1 | 199 | 3,281 |
| ADM2 | 180 | 49,363 |
| ADM3 | 81 | 105,170 |
| ADM4 | 21 | 94,251 |
| ADM5 | 4 | 699,798 |

Counts per level are geoBoundaries' own, read from its API. Village level exists
only where geoBoundaries publishes it: India (649,771), France (35,010 communes),
Rwanda (14,815) and the Central African Republic (202). Twenty-four territories
publish only an outline; they are listed on their continent with nothing to
drill into.

## Deploy

Two halves, deployed separately:

- **The data** is built by `.github/workflows/data.yml` and published to GitHub
  Pages — on a change to the generator, monthly, or by hand.
- **The app** deploys to Vercel as one static page.

`NEXT_PUBLIC_DATA_URL` points the app at the data; it defaults to this
repository's Pages site.

## Attribution

Map data © [geoBoundaries](https://www.geoboundaries.org) (gbOpen) and its
donors, and © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors (ODbL) for the two outlines named above.

geoBoundaries terms differ by country **and by level** — India's states are
CC BY 2.5 IN via DataMeet; its districts, sub-districts and villages are ODbL.
Several of the licences in play are share-alike. Every generated map carries its
own `source` and `license` fields, the viewer shows them under the map, and every
exported SVG repeats them in its `<desc>`. Keep them on anything you
redistribute.

The code is MIT licensed; see `LICENSE`. That licence does not cover the data.

## Layout

```txt
scripts/
  build-maps.mjs       boundaries -> data/**.json
  check-maps.mjs       asserts the generated data is sound
  serve.mjs            zero-dependency static server for data/
  lib/geo.mjs          projections, simplification, point-in-polygon
  lib/continents.mjs   which continent a country belongs to
src/
  app/                 one page, the layout, the stylesheet and its tokens
  components/
    MapApp.tsx         the shell: bar, breadcrumbs, loading and error states
    MapCanvas.tsx      the SVG map, its tooltip and zoom controls
    AreaPanel.tsx      search and the list of areas
    ExportMenu.tsx     SVG, PNG and JSON export
  lib/maps.ts          fetches a map or its pack, once
  lib/pack.mjs         which file holds a map
  lib/route.ts         the map on screen is the URL path
  lib/search.ts        fetches the search indexes
  lib/use-pan-zoom.ts  pointer, wheel and pinch handling
  lib/use-marked.ts    highlights one element without a re-render
  lib/view.mjs         the pan/zoom arithmetic
  lib/svg.mjs          map JSON -> standalone SVG
  types/map.ts         the shapes build-maps.mjs writes
```

## Known limits

- Villages are not in the search index — there are most of a million. Search
  reaches sub-districts from anywhere in a country; a village is found by
  searching the map of its sub-district.
- Search from the world or a continent reaches first-level areas only.
- An address with no map still answers 200 and says so on the page, because
  every map address serves the same static file.
- Zoom stops at 12×. The outlines are simplified for a 1000-unit canvas; past
  that, drill down instead.
- Antarctica comes out as a flat band, as any pseudocylindrical projection draws
  a region reaching the pole.
- A name with no Latin letters gets the path segment `area`, `area-2`, … — the
  name itself is shown as published.
- Many geoBoundaries levels have no name for what they are; those show as
  "Level N division".
