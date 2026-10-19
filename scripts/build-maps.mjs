/**
 * Builds data/** from geoBoundaries admin boundaries — every country it
 * publishes, as deep as it publishes them.
 *
 * One map per drillable area: a country lists its states, a state its
 * districts, and so on down. Each map is projected and fitted into its own
 * canvas, so it fills the box on its own without the viewer having to know
 * anything about geography.
 *
 * geoBoundaries ships no parent link on a feature, so each child is matched to
 * the parent that contains most of its outline.
 *
 * Below the deepest boundary level sit the settlements: cities, towns and
 * villages from OpenStreetMap, filed under the deepest area that contains them.
 * Admin maps carry their cities and towns; an area with nothing deeper than
 * itself gets a map of its own listing every settlement in it. See the PLACES
 * notes below.
 *
 *   node scripts/build-maps.mjs            # every country
 *   node scripts/build-maps.mjs IND USA    # just these, plus the world tiers
 *   MAPS_PLACES=0 node scripts/build-maps.mjs IND   # boundaries only, no Overpass
 *
 * Downloads are cached in .cache/, so a re-run is offline and fast.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { COUNTRY_DEPTH, fileOf, isPacked } from "../src/lib/pack.mjs";
import { CONTINENTS, continentName, continentOf } from "./lib/continents.mjs";
import {
	bbox,
	bboxOverlaps,
	centralMeridian,
	fitProjection,
	pointInRings,
	ringArea,
	ringsOf,
	splitAtAntimeridian,
	toPath,
	uniqueSlug,
} from "./lib/geo.mjs";
import { ALL_KINDS, loadPlaces, NOTABLE_KINDS } from "./lib/osm-places.mjs";
import {
	fileInto,
	gather,
	PLACE_CAP,
	searchRows,
	select,
	tupleOf,
	viewOf,
} from "./lib/places.mjs";

// National datasets are hundreds of MB parsed — India's villages alone are a
// 467 MB file — so re-exec with room to hold them.
if (!process.env.MAPS_BUILD_HEAP) {
	const heap = process.env.MAPS_HEAP_MB ?? "8192";
	execFileSync(
		process.execPath,
		[`--max-old-space-size=${heap}`, ...process.argv.slice(1)],
		{ stdio: "inherit", env: { ...process.env, MAPS_BUILD_HEAP: "1" } },
	);
	process.exit(0);
}

/**
 * How deep to drill: everything geoBoundaries publishes. ADM5 is village level,
 * and India's 649,771 villages are most of it. `MAPS_MAX_LEVEL=3` makes a quick
 * local build that skips them.
 */
const MAX_LEVEL = Number(process.env.MAPS_MAX_LEVEL ?? 5);
const LEVELS = Array.from({ length: MAX_LEVEL + 1 }, (_, i) => `ADM${i}`);

/**
 * Levels left out of a country's ladder because they do not nest in it.
 *
 * India's ADM4 is the community development block, a rural-development unit
 * that divides a district in parallel with the sub-district rather than inside
 * it. Filed by containment it left 891 sub-districts with no children and put
 * the villages under the wrong parent. A village belongs to a sub-district.
 */
const SKIP_LEVELS = { IND: [4] };

/**
 * Areas this many segments deep or shallower are searchable by name from
 * anywhere in their country. Deeper ones — villages — are found on their own
 * parent's map: an index of every village is tens of megabytes.
 */
const SEARCH_DEPTH = 6;

/**
 * Whether to build the settlement layer. `MAPS_PLACES=0` leaves it out — no
 * Overpass requests, no `places` in any map — for a quick local build of just
 * the boundaries.
 */
const PLACES = process.env.MAPS_PLACES !== "0";

/**
 * geoBoundaries' ADM5 is village polygons, published for India, France, Rwanda
 * and the Central African Republic. A country that has them gets no OSM
 * villages at all — they would duplicate the polygons — and no settlement maps
 * under its ADM5 areas; its cities and towns still go on the admin maps.
 */
const VILLAGE_LEVEL = 5;

/**
 * Countries whose settlement layer could not be fetched, as ISO3 codes. They are
 * built without it rather than failing, and named in index.json.
 */
const placesFailed = [];

const RELEASE = "gbOpen";
const CACHE = ".cache";
const OUT = "data";

/**
 * OpenStreetMap fills the outlines geoBoundaries has no ADM0 file for — India
 * and Puerto Rico, at the time of writing.
 */
const OSM = {
	search: "https://nominatim.openstreetmap.org/search",
	// Nominatim's usage policy requires an identifying agent.
	agent:
		"open-interactive-maps data build (github.com/akshit-bansal11/open-interactive-maps)",
	license: "ODbL 1.0 (© OpenStreetMap contributors)",
};

/** Longest side of a map's canvas; the other side follows the region's shape. */
const SIZE = 1000;
const PADDING = 12;
const TOLERANCE = 0.3; // simplification tolerance, in viewBox px
const MIN_AREA = 0.3; // drop slivers smaller than this, in viewBox px²
/** Vertices sampled per child when voting for its parent. */
const VOTE_SAMPLES = 24;
/** How far a sampled vertex is pulled off the boundary, toward the centre. */
const INSET = 0.15;

async function cached(name, url, headers) {
	const file = join(CACHE, name);
	if (existsSync(file)) return readFileSync(file, "utf8");

	process.stderr.write(`  fetching ${name} …\n`);
	// A full build is about a thousand downloads; one dropped connection should
	// not cost the run.
	let failure;
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const response = await fetch(url, { headers });
			if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
			const text = await response.text();
			mkdirSync(CACHE, { recursive: true });
			writeFileSync(file, text);
			return text;
		} catch (error) {
			failure = error;
			await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
		}
	}
	throw failure;
}

/**
 * geoBoundaries' metadata for every country at every level, keyed
 * level → ISO3 → row. One request per level instead of one per country.
 */
async function loadCatalogue() {
	const catalogue = new Map();
	for (const level of LEVELS) {
		const rows = JSON.parse(
			await cached(
				`catalogue-${level}.json`,
				`https://www.geoboundaries.org/api/current/${RELEASE}/ALL/${level}/`,
			),
		);
		catalogue.set(level, new Map(rows.map((row) => [row.boundaryISO, row])));
	}
	return catalogue;
}

/** Level metadata plus features, or null when a country has no such level. */
async function loadLevel(meta, level) {
	if (!meta?.simplifiedGeometryGeoJSON) return null;

	const geojson = JSON.parse(
		await cached(`${meta.boundaryISO}-${level}.geojson`, meta.simplifiedGeometryGeoJSON),
	);

	return {
		/** The geoBoundaries level number: 5 for ADM5. */
		adm: Number(level.slice(3)),
		// A fair number of deep levels are published with no name for what they
		// are, or with the literal string "Unknown".
		label: /^(unknown)?$/i.test(meta.boundaryCanonical ?? "")
			? `Level ${level.slice(3)} division`
			: meta.boundaryCanonical,
		license: meta.boundaryLicense,
		source: meta.boundarySourceURL,
		year: meta.boundaryYearRepresented,
		areas: geojson.features
			.map((feature) => {
				const rings = ringsOf(feature);
				return {
					name: (feature.properties.shapeName || "Unnamed").trim(),
					rings,
					box: bbox(rings),
					children: [],
				};
			})
			.filter((area) => area.rings.length > 0),
	};
}

/**
 * A country's outline for the world and continent tiers: its geoBoundaries
 * ADM0, or OpenStreetMap's boundary relation where there is none.
 */
async function loadOutline(iso, name, meta) {
	if (meta) {
		const geojson = JSON.parse(
			await cached(`${iso}-ADM0.geojson`, meta.simplifiedGeometryGeoJSON),
		);
		return {
			rings: geojson.features.flatMap(ringsOf),
			license: meta.boundaryLicense,
			osm: false,
		};
	}

	const query = new URLSearchParams({
		q: name,
		format: "geojson",
		polygon_geojson: "1",
		polygon_threshold: "0.02",
		limit: "1",
	});
	const geojson = JSON.parse(
		await cached(`${iso}-osm.geojson`, `${OSM.search}?${query}`, {
			"User-Agent": OSM.agent,
		}),
	);
	const [feature] = geojson.features;
	if (feature?.properties.category !== "boundary") {
		throw new Error(`${iso}: OpenStreetMap has no boundary for "${name}"`);
	}
	return { rings: ringsOf(feature), license: OSM.license, osm: true };
}

/**
 * Writes one map of the world or of a continent. Separate from `emit` on
 * purpose: these tiers are drawn from country outlines, projected with Equal Earth
 * rather than equirectangularly, and their children are drillable because a
 * country was built rather than because they hold children of their own.
 *
 * `children` are `{ id, name, rings, count }`, where `count` is how many areas
 * the child's own map holds — 0 for a country with no admin data yet.
 */
function emitTier({
	id,
	name,
	level,
	childLabel,
	parents,
	children,
	search,
	attribution,
	lambda0 = null,
}) {
	// Centre the map on itself, then cut anything still crossing the far side of
	// the globe: Oceania spans the antimeridian and Antarctica wraps it entirely.
	const centre = lambda0 ?? centralMeridian(children.flatMap((child) => child.rings));
	const cut = children.map((child) => ({
		...child,
		rings: splitAtAntimeridian(child.rings, centre),
	}));

	const project = fitProjection(
		cut.flatMap((child) => child.rings),
		{ size: SIZE, padding: PADDING, kind: "equal-earth" },
	);

	const features = cut.map((child) => ({
		id: child.id,
		name: child.name,
		d: toPath(child.rings, project, { tolerance: TOLERANCE, minArea: MIN_AREA }),
		children: child.count,
	}));

	writeJson(id, {
		id,
		name,
		level,
		childLabel,
		parents,
		width: project.width,
		height: project.height,
		viewBox: `0 0 ${project.width} ${project.height}`,
		projection: { ...project.params, lambda0: Number(centre.toFixed(3)) },
		features,
		...attribution,
	});

	for (const feature of features) {
		search.push([feature.name, feature.id, name, feature.children > 0 ? 1 : 0]);
	}

	const drillable = features.filter((feature) => feature.children > 0).length;
	process.stderr.write(
		`${id}: ${features.length} ${childLabel}, ${drillable} drillable\n`,
	);
	return 1;
}

/**
 * Up to `VOTE_SAMPLES` points just inside the area's largest ring, plus its
 * centre. Nudging each sampled vertex toward the centre matters: a vertex sits
 * exactly *on* the boundary, which two levels of the same dataset share
 * verbatim, and point-in-polygon on a shared edge answers at random. That is
 * what put Daman and Diu in Gujarat instead of their own union territory.
 */
function samplePoints(area) {
	const ring = area.rings.reduce((a, b) => (ringArea(a) > ringArea(b) ? a : b));
	const cx = ring.reduce((sum, p) => sum + p[0], 0) / ring.length;
	const cy = ring.reduce((sum, p) => sum + p[1], 0) / ring.length;

	const step = Math.max(1, Math.floor(ring.length / VOTE_SAMPLES));
	const points = [[cx, cy]];
	for (let i = 0; i < ring.length; i += step) {
		const [x, y] = ring[i];
		points.push([x + INSET * (cx - x), y + INSET * (cy - y)]);
	}
	return points;
}

/**
 * Files every child under the parent containing most of its outline. Voting on
 * many points rather than one centroid survives concave shapes, islands and
 * the small border mismatches between two independently simplified levels.
 */
function nest(children, parents) {
	let orphans = 0;

	for (const child of children) {
		const candidates = parents.filter((parent) => bboxOverlaps(child.box, parent.box));
		const points = samplePoints(child);

		let best = null;
		let bestScore = 0;
		for (const parent of candidates) {
			let score = 0;
			for (const [x, y] of points) {
				if (pointInRings(parent.rings, x, y)) score++;
			}
			if (score > bestScore) {
				bestScore = score;
				best = parent;
			}
		}

		// Nothing contained it — a coastal sliver or a border that moved between
		// levels. Fall back to the nearest overlapping parent by bbox centre.
		if (!best && candidates.length > 0) {
			const centre = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
			const [cx, cy] = centre(child.box);
			best = candidates.reduce((a, b) => {
				const d = (p) => Math.hypot(centre(p.box)[0] - cx, centre(p.box)[1] - cy);
				return d(a) <= d(b) ? a : b;
			});
		}

		if (best) best.children.push(child);
		else orphans++;
	}

	if (orphans > 0) process.stderr.write(`  ${orphans} area(s) left unplaced\n`);
}

const packs = new Map();

function writeFile(id, value) {
	const file = join(OUT, `${id}.json`);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, JSON.stringify(value));
}

/** Shallow maps get a file each; deeper ones wait in their pack. */
function writeJson(id, value) {
	if (!isPacked(id)) return writeFile(id, value);

	const key = fileOf(id);
	if (!packs.has(key)) packs.set(key, {});
	packs.get(key)[id] = value;
}

function flushPacks() {
	for (const [key, maps] of packs) writeFile(key, maps);
	packs.clear();
}

/**
 * Fits a map's areas into their canvas and returns each area's rings as they
 * should be drawn. Two things a plain fit gets wrong:
 *
 * A country that straddles the antimeridian — Fiji, Kiribati, the United States
 * by way of the Aleutians — spans the whole globe in raw longitude, so it is
 * re-centred on its own meridian and cut at the far side first.
 *
 * And an islet too small to draw still stretches the canvas to reach it, which
 * leaves the map floating in margin: Japan fitted to Minamitorishima fills
 * seven tenths of its box. So the fit is taken again over what will actually be
 * drawn. An area's largest ring always counts, however small, or a far-flung
 * island territory would vanish from its parent's map.
 */
function fitAreas(areas, { size, padding, minArea }) {
	let sets = areas.map((area) => area.rings);
	let lambda0;
	const [west, , east] = bbox(sets.flat());
	if (east - west > 180) {
		lambda0 = centralMeridian(sets.flat());
		sets = sets.map((rings) => splitAtAntimeridian(rings, lambda0));
	}

	let project = fitProjection(sets.flat(), { size, padding });
	const drawn = sets.map((rings) => {
		const sizes = rings.map((ring) => ringArea(ring.map(project)));
		const largest = Math.max(...sizes);
		return rings.filter((_, i) => sizes[i] >= minArea || sizes[i] === largest);
	});
	if (drawn.flat().length < sets.flat().length) {
		project = fitProjection(drawn.flat(), { size, padding });
	}

	return {
		project,
		sets: drawn,
		params: {
			...project.params,
			...(lambda0 === undefined ? {} : { lambda0: Number(lambda0.toFixed(3)) }),
		},
	};
}

/**
 * The credit a map carries for its settlements, which come from a different
 * source and under a different licence than its boundaries.
 */
const creditOf = (fetched) => ({
	placesSource: `OpenStreetMap — place=city/town/village nodes via the Overpass API (${fetched})`,
	placesLicense: OSM.license,
});

/**
 * How many countries in a row may fail their fetch before the rest are skipped.
 * Each failure costs about two minutes of retries, so an Overpass outage would
 * otherwise eat the whole job; one country's bad answer is not an outage.
 */
const MAX_PLACE_FAILURES = 5;
let placeFailures = 0;

/**
 * A country's settlements from Overpass (or the cache), or null when the layer
 * is switched off or the fetch failed. A failure is logged and recorded rather
 * than thrown: a country without its cities is still a country.
 */
async function fetchPlaces(country, rings, kinds) {
	if (!PLACES) return null;
	if (placeFailures >= MAX_PLACE_FAILURES) {
		placesFailed.push(country.iso3);
		process.stderr.write(
			`  places skipped for ${country.iso3}: Overpass is not answering\n`,
		);
		return null;
	}

	try {
		const loaded = await loadPlaces({
			iso3: country.iso3,
			rings,
			kinds,
			agent: OSM.agent,
			cache: CACHE,
			log: (message) => process.stderr.write(`  ${message}\n`),
		});
		placeFailures = 0;
		return loaded;
	} catch (error) {
		placeFailures++;
		placesFailed.push(country.iso3);
		process.stderr.write(`  places FAILED ${country.iso3}: ${error.message}\n`);
		return null;
	}
}

/**
 * The map of one lowest-level area: its own outline with every settlement in it
 * on top, in the same projection fitted to the area itself. Null when the area
 * has nothing to show — no places, or none of them land on its canvas — in
 * which case it stays an undrillable leaf.
 *
 * Returns the map and the places it lists, so the caller can tell search where
 * each one lives.
 */
function settlementMap(area, id, label, trail, attribution, credit) {
	if (!area.filed?.length) return null;

	const { project, sets, params } = fitAreas([area], {
		size: SIZE,
		padding: PADDING,
		minArea: MIN_AREA,
	});
	// A degenerate outline — every vertex the same — fits to nothing.
	if (!(project.width > 0 && project.height > 0)) return null;

	const kept = select(area.filed, viewOf(project, params.lambda0));
	const outline = toPath(sets[0], project, { tolerance: TOLERANCE, minArea: MIN_AREA });
	if (kept.length === 0 || !outline) return null;

	return {
		kept,
		map: {
			id,
			name: area.name,
			level: label,
			childLabel: "Settlements",
			parents: trail,
			width: project.width,
			height: project.height,
			viewBox: `0 0 ${project.width} ${project.height}`,
			projection: params,
			features: [],
			outline,
			places: kept.map(tupleOf),
			...attribution,
			...credit,
		},
	};
}

/**
 * Writes the map of `area`'s children, then recurses into each child that has
 * children of its own. Appends every area it names to `search`. Returns the
 * number of files written.
 *
 * With `credit` set the settlement layer is on. The map then lists its cities
 * and towns, most important first and capped, and every child with nothing
 * deeper than itself gets a settlement map of its own — which makes it
 * drillable — except at the village level, where the polygons already are the
 * villages. Each place remembers the deepest map that listed it as `home`, which
 * is where search sends you.
 */
function emit(area, id, ownLabel, trail, levels, attribution, search, credit) {
	const level = levels[0];
	const { project, sets, params } = fitAreas(area.children, {
		size: SIZE,
		padding: PADDING,
		minArea: MIN_AREA,
	});
	const nextTrail = [...trail, { id, name: area.name }];

	// An area whose path comes out empty is genuinely sub-pixel at this zoom
	// (Lakshadweep on a map of India). It stays in the list and keeps its own
	// map file — it just isn't drawn here.
	const taken = new Set();
	const features = area.children.map((child, i) => {
		const slug = uniqueSlug(child.name, taken);
		const featureId = `${id}/${slug}`;
		const settlement =
			credit && child.children.length === 0 && level.adm !== VILLAGE_LEVEL
				? settlementMap(child, featureId, level.label, nextTrail, attribution, credit)
				: null;
		return {
			child,
			settlement,
			id: featureId,
			name: child.name,
			d: toPath(sets[i], project, {
				tolerance: TOLERANCE,
				minArea: MIN_AREA,
			}),
			children: settlement ? settlement.map.places.length : child.children.length,
		};
	});

	const kept = credit
		? select(gather(area), viewOf(project, params.lambda0), PLACE_CAP)
		: [];

	writeJson(id, {
		id,
		name: area.name,
		level: ownLabel,
		childLabel: level.label,
		parents: trail,
		width: project.width,
		height: project.height,
		viewBox: `0 0 ${project.width} ${project.height}`,
		projection: params,
		features: features.map(({ child: _child, settlement: _settlement, ...rest }) => rest),
		...(kept.length > 0 ? { places: kept.map(tupleOf) } : {}),
		...attribution,
		...(kept.length > 0 ? credit : {}),
	});
	// Deeper maps claim their places later and win: a place's home is the deepest
	// map that lists it.
	for (const { place } of kept) place.home = id;

	let written = 1;
	for (const feature of features) {
		if (feature.settlement) {
			writeJson(feature.id, feature.settlement.map);
			for (const { place } of feature.settlement.kept) place.home = feature.id;
			written++;
			if (feature.id.split("/").length <= SEARCH_DEPTH) {
				search.push([feature.name, feature.id, area.name, 1]);
			}
			continue;
		}

		// Only a feature with its own map is worth offering as a search hit.
		const drillable = levels.length > 1 && feature.children > 0;
		if (feature.id.split("/").length <= SEARCH_DEPTH) {
			search.push([feature.name, feature.id, area.name, drillable ? 1 : 0]);
		}
		if (!drillable) continue;
		written += emit(
			feature.child,
			feature.id,
			level.label,
			nextTrail,
			levels.slice(1),
			attribution,
			search,
			credit,
		);
	}
	return written;
}

async function buildCountry(country, id, parents, catalogue) {
	process.stderr.write(`${country.name} (${country.iso3}) → ${id}\n`);

	const levels = [];
	for (let i = 1; i <= MAX_LEVEL; i++) {
		if (SKIP_LEVELS[country.iso3]?.includes(i)) continue;
		const level = await loadLevel(catalogue.get(`ADM${i}`).get(country.iso3), `ADM${i}`);
		// A gap is skipped rather than ending the ladder, so a country published
		// at ADM2 only still gets a map.
		if (!level) continue;
		process.stderr.write(`  ADM${i}: ${level.areas.length} ${level.label}\n`);
		levels.push(level);
	}
	if (levels.length === 0) throw new Error(`${country.iso3}: no boundary data`);

	for (let i = levels.length - 1; i > 0; i--) {
		nest(levels[i].areas, levels[i - 1].areas);
		const empty = levels[i - 1].areas.filter((a) => a.children.length === 0);
		if (empty.length > 0) {
			process.stderr.write(
				`  ${empty.length} ${levels[i - 1].label} with no ADM${i + 1} children: ${empty
					.slice(0, 6)
					.map((a) => a.name)
					.join(", ")}\n`,
			);
		}
	}

	const root = {
		name: country.name,
		rings: levels[0].areas.flatMap((a) => a.rings),
		children: levels[0].areas,
	};

	// A country with village polygons has no use for OSM's villages.
	const loaded = await fetchPlaces(
		country,
		root.rings,
		levels.some((level) => level.adm === VILLAGE_LEVEL) ? NOTABLE_KINDS : ALL_KINDS,
	);
	if (loaded) {
		const { filed, dropped } = fileInto(loaded.places, root.children);
		process.stderr.write(
			`  places: ${loaded.places.length} fetched, ${filed} filed, ${dropped} outside every area\n`,
		);
	}

	// Flat index for the site's search box: [name, id, parent, drillable].
	const search = [];
	const areas = levels.reduce((total, level) => total + level.areas.length, 0);
	const files = emit(
		root,
		id,
		"Country",
		parents,
		levels,
		{
			source: `geoBoundaries ${RELEASE} — ${levels.map((l) => `${l.label} (${l.year})`).join(", ")}`,
			sourceUrl: "https://www.geoboundaries.org/countryDownloads.html",
			// Levels of one country can come from different donors under
			// different terms — India's states and its districts do. Anything
			// redistributing this geometry has to carry all of them.
			license: [...new Set(levels.map((l) => l.license))].join(" · "),
		},
		search,
		loaded ? creditOf(loaded.fetched) : null,
	);
	flushPacks();

	// Cities and towns are searchable by name from anywhere in their country;
	// villages are found in their settlement map's own list.
	const found = loaded ? searchRows(loaded.places) : { rows: [], cities: [] };
	search.push(...found.rows);

	// A country's own search index: the whole world's is far too big to hand a
	// browser in one piece.
	writeFile(`${id}.search`, search);
	const listed = loaded ? loaded.places.filter((place) => place.home).length : 0;
	if (loaded) {
		process.stderr.write(
			`  places: ${listed} listed on a map, ${found.rows.length} searchable\n`,
		);
	}

	return {
		id,
		name: country.name,
		iso3: country.iso3,
		areas,
		/** How many areas the country's own map holds, for the continent listing. */
		topLevel: levels[0].areas.length,
		files,
		search,
		cities: found.cities,
		places: listed,
	};
}

/**
 * A country geoBoundaries has an outline for but no admin levels: one settlement
 * map at the country's own id, drawn from the outline, listing every city, town
 * and village in it. Null when it has no places (or the layer is off), in which
 * case it stays listed on its continent, undrillable.
 *
 * Its entry in the index has `areas` set to the number of places on the map —
 * there are no admin areas, and the number is what its continent shows as the
 * count to drill into.
 */
async function buildOutlineCountry(country, parents) {
	const loaded = await fetchPlaces(country, country.rings, ALL_KINDS);
	if (!loaded) return null;

	// The outline stands in for a whole admin hierarchy of one area.
	const area = {
		name: country.name,
		rings: country.rings,
		box: bbox(country.rings),
		children: [],
	};
	const { filed, dropped } = fileInto(loaded.places, [area]);
	process.stderr.write(
		`${country.name} (${country.iso3}) → ${country.id}: outline only, ${loaded.places.length} places fetched, ${filed} filed, ${dropped} outside the border\n`,
	);

	const attribution = country.osm
		? {
				source: "OpenStreetMap — country outline",
				sourceUrl: "https://www.openstreetmap.org/copyright",
				license: OSM.license,
			}
		: {
				source: `geoBoundaries ${RELEASE} — Country outline`,
				sourceUrl: "https://www.geoboundaries.org/countryDownloads.html",
				license: country.license,
			};
	const settlement = settlementMap(
		area,
		country.id,
		"Country",
		parents,
		attribution,
		creditOf(loaded.fetched),
	);
	if (!settlement) return null;

	writeJson(country.id, settlement.map);
	for (const { place } of settlement.kept) place.home = country.id;

	const found = searchRows(loaded.places);
	writeFile(`${country.id}.search`, found.rows);

	const count = settlement.kept.length;
	process.stderr.write(`  wrote 1 settlement map, ${count} places\n`);
	return {
		id: country.id,
		name: country.name,
		iso3: country.iso3,
		areas: count,
		topLevel: count,
		files: 1,
		search: found.rows,
		cities: found.cities,
		places: count,
	};
}

/**
 * Every country geoBoundaries publishes, placed on a continent and given its
 * path segment. Slugs are assigned in name order so they stay stable between
 * releases, and uniqueness is settled per continent, which is where they have
 * to be unique.
 */
function placeCountries(catalogue) {
	const isos = new Set(LEVELS.flatMap((level) => [...catalogue.get(level).keys()]));
	const byContinent = new Map(CONTINENTS.map((c) => [c.slug, []]));
	const unplaced = [];

	const countries = [...isos]
		.map((iso3) => {
			const adm0 = catalogue.get("ADM0").get(iso3);
			// Not every country starts at the top: Puerto Rico's first file is ADM2.
			const meta = LEVELS.map((level) => catalogue.get(level).get(iso3)).find(Boolean);
			return { iso3, name: meta.boundaryName, adm0, meta };
		})
		.sort((a, b) => a.name.localeCompare(b.name));

	const taken = new Map(CONTINENTS.map((c) => [c.slug, new Set()]));
	for (const country of countries) {
		const continent = continentOf(
			country.iso3,
			country.meta.Continent,
			country.meta["UNSDG-subregion"],
		);
		if (!continent) {
			unplaced.push(`${country.name} (${country.iso3})`);
			continue;
		}
		country.continent = continent;
		country.slug = uniqueSlug(country.name, taken.get(continent));
		country.id = `world/${continent}/${country.slug}`;
		byContinent.get(continent).push(country);
	}

	return { byContinent, unplaced };
}

async function main() {
	const only = process.argv.slice(2);

	const catalogue = await loadCatalogue();
	const { byContinent, unplaced } = placeCountries(catalogue);
	const all = [...byContinent.values()].flat();
	process.stderr.write(`geoBoundaries: ${all.length} countries\n`);
	if (unplaced.length > 0) {
		process.stderr.write(`  ${unplaced.length} unplaced: ${unplaced.join(", ")}\n`);
	}

	const wanted = only.length
		? all.filter((c) => only.includes(c.iso3) || only.includes(c.slug))
		: all;
	if (wanted.length === 0) throw new Error(`no country matched ${only.join(", ")}`);

	// Outlines for the two tiers above the countries.
	const licenses = new Set();
	const fromOsm = [];
	for (const country of all) {
		const outline = await loadOutline(country.iso3, country.name, country.adm0);
		country.rings = outline.rings;
		country.license = outline.license;
		country.osm = outline.osm;
		licenses.add(outline.license);
		if (outline.osm) fromOsm.push(country.name);
	}
	const attribution = {
		source:
			`geoBoundaries ${RELEASE} — Country outlines` +
			(fromOsm.length ? `; OpenStreetMap for ${fromOsm.join(", ")}` : ""),
		sourceUrl: "https://www.geoboundaries.org/countryDownloads.html",
		license: [...licenses].join(" · "),
	};

	const search = [];
	const built = [];
	const failed = [];
	let files = 0;
	let places = 0;

	// Countries first: the continent listings need to know which of them ended up
	// drillable, and how many areas each one holds.
	const results = new Map();
	for (const country of wanted) {
		const parents = [
			{ id: "world", name: "World" },
			{ id: `world/${country.continent}`, name: continentName(country.continent) },
		];
		const hasLevels = LEVELS.slice(1).some((level) =>
			catalogue.get(level).has(country.iso3),
		);

		let result;
		try {
			// With no admin levels there is nothing to drill into except its
			// settlements, if it has any; otherwise it is listed on its continent,
			// not drillable.
			result = hasLevels
				? await buildCountry(country, country.id, parents, catalogue)
				: await buildOutlineCountry(country, parents);
			if (!result) continue;
		} catch (error) {
			// One country's bad download must not cost the other two hundred. It
			// stays on its continent, undrillable, and is named in the summary.
			packs.clear();
			failed.push(`${country.iso3}: ${error.message}`);
			process.stderr.write(`  FAILED ${country.iso3}: ${error.message}\n`);
			continue;
		}

		results.set(country.iso3, result);
		// The global index stops at first-level areas; deeper hits come from the
		// country's own file.
		search.push(
			...result.search.filter(
				([, id]) => !id.includes("/~n") && id.split("/").length === COUNTRY_DEPTH + 1,
			),
			// Plus its cities, which are what people look for first.
			...result.cities,
		);
		built.push({
			id: result.id,
			name: result.name,
			iso3: result.iso3,
			areas: result.areas,
		});
		files += result.files;
		places += result.places;
		process.stderr.write(`  wrote ${result.files} map(s), ${result.areas} areas\n`);
	}

	// One map per continent, listing its countries — drillable where one was built.
	const continents = [];
	for (const { slug, name } of CONTINENTS) {
		const countries = byContinent.get(slug);
		if (countries.length === 0) continue;

		files += emitTier({
			id: `world/${slug}`,
			name,
			level: "Continent",
			childLabel: "Country",
			parents: [{ id: "world", name: "World" }],
			children: countries.map((country) => ({
				id: country.id,
				name: country.name,
				rings: country.rings,
				count: results.get(country.iso3)?.topLevel ?? 0,
			})),
			search,
			attribution,
		});

		continents.push({ slug, name, countries });
	}

	// And the world, listing the continents. Greenwich, not the mean of the land:
	// the mean lands around 16°E, which puts the cut at 164°W and throws the tail
	// of the Aleutians onto the far east edge.
	files += emitTier({
		id: "world",
		name: "World",
		level: "World",
		childLabel: "Continent",
		parents: [],
		lambda0: 0,
		children: continents.map(({ slug, name, countries }) => ({
			id: `world/${slug}`,
			name,
			rings: countries.flatMap((country) => country.rings),
			count: countries.length,
		})),
		search,
		attribution,
	});

	writeFile("index", {
		countries: built.sort((a, b) => a.name.localeCompare(b.name)),
		continents: continents.map(({ slug, name, countries }) => ({
			id: `world/${slug}`,
			name,
			countries: countries.length,
		})),
		failed,
		places,
		placesFailed,
		builtAt: new Date().toISOString().slice(0, 10),
	});
	writeFile("search", search);

	process.stderr.write(
		`${files} map(s), ${built.length} countries drillable, ${failed.length} failed, ${places} places (${placesFailed.length} countries without)\n`,
	);
	for (const line of failed) process.stderr.write(`  ${line}\n`);
}

main();
