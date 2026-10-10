# Open Interactive Maps

Browse the administrative map of every country and take any of them with you as
SVG, PNG or JSON.

Start at the world and click down:

```txt
World → Continent → Country → State/Province → District → Sub-District → …
```

Every level is a map whose areas are clickable, and every map pans and zooms —
wheel, drag, pinch, or the buttons in its corner. India goes four admin levels
deep, so Punjab opens Bathinda and Bathinda opens Rampura Phul, Talwandi Sabo
and Maur.

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
npm run data IND LUX         # build a few countries, plus the world tiers
npm run data:serve           # serve data/ on :8080
NEXT_PUBLIC_DATA_URL=http://localhost:8080 npm run dev
```

## Checks

```bash
npm run check                # format, organise imports, lint, typecheck — writes
npm run check:ci             # the same, non-mutating; what CI runs
npm test                     # unit tests for the geometry and pan/zoom arithmetic
npm run data:check           # verify a data build
```

`check-maps.mjs` walks every generated map and asserts the paths are well formed
and inside their canvas, that each map is cut to its region's shape, that every
drilldown and search hit resolves to a map that exists, that the world tier's
projection puts land where it belongs, and that a handful of areas that have gone
missing before are still there. Run it after any change to the generator.

## How the data is made

`npm run data` builds every country geoBoundaries publishes, as deep as it
publishes them, down to ADM4. Downloads land in `.cache/`, so a second run is
offline.

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

Continent membership is derived from geoBoundaries' metadata rather than filed by
hand. Its `Continent` field carries UN regions, not continents, so the Americas
are split on `UNSDG-subregion`. One override: Russia moves to Asia — it is the
only European member spanning −180 to 180, and left there it stretches Europe
from Iceland to Kamchatka.

The world and continent maps are projected with **Equal Earth**, each centred on
its own central meridian so a region straddling the antimeridian is not smeared
across the canvas. The world map pins its meridian at Greenwich. Country level
and below is equirectangular, corrected by the latitude at the centre of the
region. Every map is fitted to a canvas cut to its own aspect — longest side
1000 — so no export carries dead margin.

### What gets written

```txt
data/
  index.json                         countries, with thumbnails, and what failed
  search.json                        search index: the world down to first-level areas
  world.json                         one file per map, down to the countries
  world/asia.json
  world/asia/india.json
  world/asia/india.search.json       search index for everything inside India
  world/asia/india/punjab.json       a pack: Punjab's map and every map beneath it
```

Maps below a country are packed one file per first-level area. A quarter of a
million loose files is more than a static host wants to publish; a few thousand
packs is not, and the server reads one pack to render any page inside it.

## Coverage

| Level | Countries | Areas |
| --- | --- | --- |
| Country outlines | 232 | 232 |
| ADM1 | 199 | 3,281 |
| ADM2 | 180 | 49,363 |
| ADM3 | 81 | 105,170 |
| ADM4 | 21 | 94,251 |

Counts are geoBoundaries' own, read from its API on 2026-10-10. Thirty-three
territories publish only an outline; they are listed on their continent but have
nothing to drill into.

**ADM5 is not built.** Four countries publish it, and India's alone is 649,771
villages — more than every other level of every other country combined. Set
`MAPS_MAX_LEVEL=5` to build it anyway.

## Deploy

Two halves, deployed separately:

- **The data** is built by `.github/workflows/data.yml` and published to GitHub
  Pages. It runs on Actions rather than on the host because a full build is about
  a thousand downloads and the result is hundreds of megabytes. A full run takes
  about ten minutes.
- **The app** deploys to Vercel. It prerenders nothing: each map page is rendered
  the first time it is requested, from one fetch to the data host, and cached.

`NEXT_PUBLIC_DATA_URL` points the app at the data; it defaults to this
repository's Pages site.

## Attribution

Map data © [geoBoundaries](https://www.geoboundaries.org) (gbOpen) and its
donors, and © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors (ODbL) for the two outlines named above.

geoBoundaries terms differ by country **and by level** — India's states are
CC BY 2.5 IN via DataMeet, its districts and sub-districts are ODbL via
lgdirectory.gov.in. Several of the licences in play are share-alike. Every
generated map carries its own `source` and `license` fields, the viewer shows
them under the map, and every exported SVG repeats them in its `<desc>`. Keep
them on anything you redistribute.

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
  app/                 routes — one catch-all page renders every map
  components/          viewer, country strip
  lib/maps.ts          fetches a map, or the pack it lives in
  lib/search.ts        fetches the search indexes
  lib/use-pan-zoom.ts  pointer, wheel and pinch handling
  lib/view.mjs         the pan/zoom arithmetic (no DOM, so it can be tested)
  lib/svg.mjs          map JSON -> standalone SVG (no DOM, so it can be tested)
  types/map.ts         the shapes build-maps.mjs writes
```

## Known limits

- Search from the world or a continent reaches first-level areas only. Inside a
  country it reaches everything in that country.
- Zoom stops at 12×. The outlines are simplified for a 1000-unit canvas, and
  past that they are visibly made of straight lines; drill down instead.
- Antarctica comes out as a flat band. That is what any pseudocylindrical
  projection does with a region reaching the pole.
- Fiji and the western Aleutians appear at the far edge of the world map. They
  genuinely straddle ±180.
- A name with no Latin letters gets the path segment `area`, `area-2`, … — the
  name itself is shown as published.
- India's ADM4 (CD blocks) is filed under ADM3 (sub-districts) by containment,
  but the two are parallel divisions of a district rather than nested ones, so
  many sub-districts have no children.
