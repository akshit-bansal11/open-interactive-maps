# Open Interactive Maps

Browse the administrative map of every country, down to its cities, towns and
villages, and take any map with you as SVG, PNG or JSON.

**https://open-interactive-maps.vercel.app**

Map data © [geoBoundaries](https://www.geoboundaries.org) (gbOpen) and
© [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL).
See [Attribution](#attribution).

Start at the world and click down:

```txt
World → Continent → Country → State → District → Sub-District → … → Cities, towns & villages
```

Every level is a map whose areas are clickable, and every map pans and zooms —
wheel, drag, pinch, or the buttons in its corner. Punjab opens Bathinda, Bathinda
opens Talwandi Sabo, and Talwandi Sabo shows its 59 villages.

No mapping-service API key, no tile provider, no map library: the maps are
pre-projected SVG paths and the viewer is a small React app.

## Run it

```bash
npm install
npm run dev                  # Next dev server on :3000
```

The app fetches its maps from the published data set, so that is all it takes.
To work against maps you built yourself:

```bash
MAPS_MAX_LEVEL=3 npm run data IND LUX   # a few countries, no village polygons
MAPS_PLACES=0 npm run data IND LUX      # no OpenStreetMap settlements, for a quick build
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
publishes them, and the settlements of every country from OpenStreetMap. Downloads
land in `.cache/`, so a second run is offline, except that settlement files older
than 25 days are fetched again.

**Administrative areas come from [geoBoundaries](https://www.geoboundaries.org)
(gbOpen)**, one map per drillable area. It puts no parent link on a feature, so
each child is filed under the parent containing most of its outline. Sample
points are nudged inward off the boundary first: two levels of one dataset share
their border verbatim, and point-in-polygon on a shared edge answers at random —
left alone, that files Daman and Diu under Gujarat instead of their own union
territory.

**[OpenStreetMap](https://www.openstreetmap.org) supplies the settlements and the
outlines geoBoundaries lacks.** It has no country outline for India or Puerto
Rico, so those two come from OpenStreetMap's boundary relations through Nominatim.
OpenStreetMap draws lines of actual control, so India's outline on the map of Asia
differs in Kashmir from the outline of its own states one click down.

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

### Settlements

Settlements are the OpenStreetMap nodes tagged `place=city`, `place=town` or
`place=village`. The build fetches them for each country from the Overpass API,
and files each one into the deepest geoBoundaries area containing it.

The endpoints are overpass-api.de, with kumi.systems and private.coffee as
fallbacks. Results are cached in `.cache/<ISO3>-places.tsv` and refreshed after
25 days. `MAPS_PLACES=0 npm run data …` leaves the layer out.

A failed download does not fail the country. The country still builds, and it is
listed under `placesFailed` in `index.json`.

Every lowest-level area that contains settlements becomes drillable into a
**settlement map**: its own outline, with every city, town and village in it as a
dot, listed in the panel. Admin maps, from the country down, show cities and towns
as dots too, at most 1,500 per map: cities first, then by population.

Countries whose deepest geoBoundaries level is already village polygons keep
those polygons. They are India, France, Rwanda and the Central African Republic
(ADM5). OpenStreetMap villages are not added there.

Territories with only an outline now drill straight into their settlements.

Cities and towns are searchable from their country, and cities from anywhere.
Villages are not in search; find one in the list of its settlement map.

### What gets written

```txt
data/
  index.json                              countries built, any that failed, and placesFailed
  search.json                             search index: the world down to first-level areas, and cities
  world.json                              one file per map, down to the countries
  world/asia.json
  world/asia/india.json
  world/asia/india.search.json            search index: India down to its sub-districts
  world/asia/india/punjab.json            pack: Punjab's map and its districts' maps
  world/asia/india/punjab/bathinda.json   pack: every map below Bathinda
```

Map JSON gains `places`: the settlements on the map, as
`[name, kind, x, y, population, OSM node id]`, where kind is 0 for a city, 1 for a
town and 2 for a village. Settlement maps also carry `outline`, the area's own
outline. `placesSource` and `placesLicense` give the credit for the settlements.

`src/lib/pack.mjs` decides which file holds a map, and the generator, its check
and the browser all import it.

## Coverage

The build of 2026-10-10: **944,200 areas on 41,828 maps, 208 countries
drillable, none failed.** 5,423 files, 462 MB, built in six minutes.

That build predates the settlements layer, so its numbers include no
OpenStreetMap places. The next data build reports places counts in `index.json`.

| Level | Countries | Areas |
| --- | --- | --- |
| Country outlines | 232 | 232 |
| ADM1 | 199 | 3,281 |
| ADM2 | 180 | 49,363 |
| ADM3 | 81 | 105,170 |
| ADM4 | 21 | 94,251 |
| ADM5 | 4 | 699,798 |

Counts per level are geoBoundaries' own, read from its API. Village polygons exist
only where geoBoundaries publishes them: India (649,771), France (35,010 communes),
Rwanda (14,815) and the Central African Republic (202). Twenty-four territories
publish only an outline. In that build they were listed on their continent with
nothing to drill into. With the settlements layer they drill straight into their
OpenStreetMap settlements.

## Deploy

Two halves, deployed separately:

- **The data** is built by `.github/workflows/data.yml` and published to GitHub
  Pages — on a change to the generator, monthly, or by hand. The 2026-10-10 build
  took six minutes without the settlements. The build now also queries Overpass
  for every country, so it takes longer, and the workflow timeout is 330 minutes.
  The 2026-10-10 build was 462 MB; GitHub Pages' 1 GB cap is the ceiling to watch.
- **The app** deploys to Vercel as one static page.

`NEXT_PUBLIC_DATA_URL` points the app at the data; it defaults to this
repository's Pages site.

## Attribution

Two sources supply the map data. Both need credit wherever the data appears.

**geoBoundaries** supplies the administrative areas. Cite it as:

> Runfola, D. et al. (2020) geoBoundaries: A global database of political
> administrative boundaries. PLOS ONE 15(4): e0231866.
> https://doi.org/10.1371/journal.pone.0231866

Credit: © [geoBoundaries](https://www.geoboundaries.org) (gbOpen) and its donors.
Licences vary by country **and by level** — India's states are CC BY 2.5 IN via
DataMeet; its districts, sub-districts and villages are ODbL.

**OpenStreetMap** supplies every settlement, and the country outlines geoBoundaries
lacks (India and Puerto Rico, through Nominatim). Credit: © [OpenStreetMap
contributors](https://www.openstreetmap.org/copyright). The data is available under
the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
ODbL is share-alike: it requires attribution on anything derived from the data, and
derived databases must be shared under ODbL as well.

The Overpass API instances and the Nominatim usage policy are respected. Requests
carry an identifying User-Agent, they go out one at a time, and results are cached.

The viewer shows the credit on every map and in a Credits dialog. Every generated
map carries its own `source` and `license` fields, and settlement data is credited
in `placesSource` and `placesLicense`. Every exported SVG repeats the credit in its
`<desc>`. Keep them on anything you redistribute.

The code is MIT licensed; see `LICENSE`. That licence does not cover the data.

## Layout

The map fills the window, and panels float over it. A level ladder shows every
step from World to the map on screen. An Areas and Places panel holds search and
the lists. On phones the panel becomes a bottom sheet. Place labels stay readable
at any zoom, a place card links to the place on OpenStreetMap, and light and dark
themes switch with a toggle.

```txt
scripts/
  build-maps.mjs       boundaries and settlements -> data/**.json
  check-maps.mjs       asserts the generated data is sound
  serve.mjs            zero-dependency static server for data/
  lib/geo.mjs          projections, simplification, point-in-polygon
  lib/continents.mjs   which continent a country belongs to
src/
  app/                 one page, the layout, the stylesheet and its tokens
  components/
    MapApp.tsx         the shell: holds the map and its panels, loading and error states
    MapCanvas.tsx      the SVG map, its labels, tooltip and zoom controls
    AreaPanel.tsx      the Areas and Places tabs: search and lists
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

Other components, such as the Credits dialog, sit alongside these in
`src/components/`.

## Known limits

- Villages come from OpenStreetMap wherever it maps them, so their number depends
  on the country. OpenStreetMap coverage varies. Hamlets and suburbs are not
  included.
- Villages are not in search. A village is found in the list of its settlement map.
- Search from the world or a continent reaches first-level areas and cities.
  Search from a country reaches its sub-districts, cities and towns.
- Admin maps show at most 1,500 cities and towns as dots, so on a large map the
  smallest are left off.
- Settlement data is as recent as the last Overpass fetch, refreshed after 25 days.
- Zoom stops at 12×. The outlines are simplified for a 1000-unit canvas; past
  that, drill down instead.
- Antarctica comes out as a flat band, as any pseudocylindrical projection draws
  a region reaching the pole.
- A name with no Latin letters gets the path segment `area`, `area-2`, … — the
  name itself is shown as published.
- Many geoBoundaries levels have no name for what they are; those show as
  "Level N division".
