/**
 * Sanity check over data/ — run after a build: `node scripts/check-maps.mjs`.
 *
 * Guards the things that have actually gone wrong: areas silently vanishing,
 * children filed under the wrong parent, a map that doesn't fill its canvas,
 * and links that point at a file nobody wrote. Settlements get the same
 * treatment: a place off its canvas, listed twice, or searched for in a map that
 * does not list it.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileOf, isPacked } from "../src/lib/pack.mjs";
import { buildSvg } from "../src/lib/svg.mjs";
import { PLACE_CAP } from "./lib/places.mjs";

const DATA = "data";
const readFile = (id) => JSON.parse(readFileSync(join(DATA, `${id}.json`), "utf8"));

// The walk goes depth-first, so the last few packs are all that is ever needed:
// a state's, and the district's it is currently inside.
const packs = new Map();
function packOf(id) {
	const key = fileOf(id);
	if (!packs.has(key)) {
		if (packs.size >= 4) packs.delete(packs.keys().next().value);
		packs.set(key, existsSync(join(DATA, `${key}.json`)) ? readFile(key) : {});
	}
	return packs.get(key);
}

const has = (id) =>
	isPacked(id) ? id in packOf(id) : existsSync(join(DATA, `${id}.json`));
const read = (id) => {
	const map = isPacked(id) ? packOf(id)[id] : readFile(id);
	assert.ok(map, `${id}: no such map`);
	return map;
};

/** Only shape the generator emits: one or more `M x yL x y…Z` subpaths. */
const PATH = /^(M-?[\d.]+ -?[\d.]+(L-?[\d.]+ -?[\d.]+){3,}Z)+$/;

function points(d) {
	const nums = d.match(/-?[\d.]+/g).map(Number);
	const out = [];
	for (let i = 0; i < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
	return out;
}

let maps = 0;
let areas = 0;
let unplotted = 0;
let places = 0;

/**
 * Problems found on the walk are collected rather than thrown: there are tens
 * of thousands of maps, and one bad map per run is a slow way to find them all.
 */
const problems = [];

function checkMap(id, expectedName) {
	try {
		checkOne(id, expectedName);
	} catch (error) {
		if (!(error instanceof assert.AssertionError)) throw error;
		problems.push(error.message);
	}
}

/**
 * Every place on a map: a 6-tuple of name, kind, x, y, population and OSM node
 * id, on the canvas, once each. An admin map carries cities and towns only, and
 * no more than the cap; a settlement map carries whatever its area holds.
 */
function checkPlaces(map, settlement) {
	const id = map.id;
	assert.ok(Array.isArray(map.places), `${id}: places is not a list`);
	if (!settlement) {
		assert.ok(
			map.places.length <= PLACE_CAP,
			`${id}: lists ${map.places.length} places, over the cap of ${PLACE_CAP}`,
		);
	}
	assert.ok(map.placesSource && map.placesLicense, `${id}: places without a credit`);

	const seen = new Set();
	for (const place of map.places) {
		assert.ok(
			Array.isArray(place) && place.length === 6,
			`${id}: place is not a 6-tuple: ${JSON.stringify(place)}`,
		);
		const [name, kind, x, y, population, osm] = place;
		assert.ok(name && typeof name === "string", `${id}: unnamed place ${osm}`);
		assert.ok([0, 1, 2].includes(kind), `${id}: ${name} has kind ${kind}`);
		if (!settlement) {
			assert.ok(kind < 2, `${id}: ${name} is a village on an admin map`);
		}
		assert.ok(Number.isFinite(x) && Number.isFinite(y), `${id}: ${name} has no position`);
		assert.ok(
			x >= 0 && x <= map.width && y >= 0 && y <= map.height,
			`${id}: ${name} at ${x},${y} is outside the ${map.width}×${map.height} canvas`,
		);
		assert.ok(
			Number.isInteger(population) && population >= 0,
			`${id}: ${name} has population ${population}`,
		);
		assert.ok(Number.isInteger(osm) && osm > 0, `${id}: ${name} has OSM id ${osm}`);
		assert.ok(!seen.has(osm), `${id}: place ${osm} (${name}) is listed twice`);
		seen.add(osm);
		places++;
	}
}

function checkOne(id, expectedName) {
	const map = read(id);
	maps++;

	assert.equal(map.id, id, `${id}: id mismatch`);
	if (expectedName) assert.equal(map.name, expectedName, `${id}: name mismatch`);
	assert.equal(map.viewBox, `0 0 ${map.width} ${map.height}`);

	// A settlement map has no areas to draw: its one shape is the outline of the
	// area it lists settlements for, and the places are the point of it.
	const settlement = map.outline !== undefined;
	if (settlement) {
		assert.equal(map.features.length, 0, `${id}: a settlement map has no features`);
		assert.ok(map.places?.length > 0, `${id}: a settlement map with no places`);
		assert.equal(map.childLabel, "Settlements", `${id}: wrong child label`);
		assert.match(map.outline, PATH, `${id}: malformed outline`);
	} else {
		assert.ok(map.features.length > 0, `${id}: no features`);
	}
	if (map.places !== undefined) checkPlaces(map, settlement);

	const slugs = new Set();
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	/** Folds a path's points into the extent, checking each is on the canvas. */
	const extend = (d, label) => {
		for (const [x, y] of points(d)) {
			assert.ok(
				x >= 0 && x <= map.width && y >= 0 && y <= map.height,
				`${label}: point ${x},${y} outside the ${map.width}×${map.height} canvas`,
			);
			if (x < minX) minX = x;
			if (y < minY) minY = y;
			if (x > maxX) maxX = x;
			if (y > maxY) maxY = y;
		}
	};
	if (settlement) extend(map.outline, `${id}: outline`);

	for (const feature of map.features) {
		areas++;
		const slug = feature.id.split("/").pop();
		assert.equal(feature.id, `${id}/${slug}`, `${id}: bad child id ${feature.id}`);
		assert.ok(!slugs.has(slug), `${id}: duplicate slug ${slug}`);
		slugs.add(slug);
		assert.ok(feature.name, `${feature.id}: unnamed`);

		if (!feature.d) {
			// Legitimate only for something genuinely sub-pixel at this zoom.
			unplotted++;
		} else {
			assert.match(feature.d, PATH, `${feature.id}: malformed path`);
			extend(feature.d, feature.id);
		}

		if (feature.children > 0) {
			assert.ok(
				has(feature.id),
				`${feature.id}: claims ${feature.children} children but has no map file`,
			);
			checkMap(feature.id, feature.name);
		}
	}

	// The canvas is cut to the region's own aspect, so the geometry has to reach
	// the padding on *both* axes. Slack on either one means the fit is wrong and
	// every export of this map carries dead margin. Not all of it: an atoll that
	// is its area's only land holds the canvas open and can still round away to
	// nothing, which is how Yap comes up a sixth short.
	const slack = 0.8;
	assert.ok(
		maxX - minX > (map.width - 24) * slack && maxY - minY > (map.height - 24) * slack,
		`${id}: geometry spans ${Math.round(maxX - minX)}×${Math.round(maxY - minY)} inside ${map.width}×${map.height} — canvas isn't cut to fit`,
	);
}

// One walk from the world down: continents, then countries, then admin levels.
checkMap("world", "World");
if (problems.length > 0) {
	console.error(
		`${problems.length} map(s) failed:\n${problems.slice(0, 200).join("\n")}`,
	);
	process.exit(1);
}

const index = readFile("index");
assert.ok(index.countries.length > 0, "no countries built");
// One upstream file going bad should not block a publish; a pattern should.
assert.ok(
	index.failed.length <= 5,
	`${index.failed.length} countries failed to build: ${index.failed.join("; ")}`,
);
// Settlements are best-effort: a country whose Overpass fetch failed is built
// without them. A pattern of that is the service being down, and a build with no
// cities in it should not replace one that had them.
assert.ok(Array.isArray(index.placesFailed), "index.json lists no placesFailed");
assert.ok(
	index.placesFailed.length <= Math.max(5, index.countries.length / 2),
	`${index.placesFailed.length} countries have no settlements: ${index.placesFailed.join(", ")}`,
);
for (const country of index.countries) {
	assert.ok(has(country.id), `index lists ${country.id} but no map file exists`);
	assert.match(
		country.id,
		/^world\/[a-z-]+\/[a-z0-9-]+$/,
		`${country.id}: a country sits under world/<continent>`,
	);
}

// The world and continent tiers, which are drawn from country outlines in Equal
// Earth rather than from admin levels in equirectangular.
const world = read("world");
assert.equal(world.level, "World");
assert.equal(world.projection.kind, "equal-earth", "the world needs a real projection");
assert.deepEqual(world.parents, [], "the world has no parent");
assert.equal(
	world.features.length,
	index.continents.length,
	"every continent with countries is on the world map",
);
for (const continent of index.continents) {
	const map = read(continent.id);
	assert.equal(map.level, "Continent", `${continent.id}: not a continent`);
	assert.equal(map.projection.kind, "equal-earth", `${continent.id}: wrong projection`);
	assert.deepEqual(map.parents, [{ id: "world", name: "World" }]);
	assert.equal(
		map.features.length,
		continent.countries,
		`${continent.id}: country count disagrees with the index`,
	);
}

// Every search hit has to lead somewhere: its own map, or its parent's list.
// The world's index stops at first-level areas; each country carries the rest.
const parentOf = (id) => id.split("/").slice(0, -1).join("/");
let searchable = 0;
for (const file of ["search", ...index.countries.map((c) => `${c.id}.search`)]) {
	// A place row is "<map id>/~n<osm id>": its map has to exist and list it. The
	// rows are checked map by map, in id order, so each pack is read once rather
	// than once per row.
	const listed = new Map();
	for (const [name, id, , drillable] of readFile(file)) {
		searchable++;
		const marker = id.indexOf("/~n");
		if (marker !== -1) {
			const mapId = id.slice(0, marker);
			if (!listed.has(mapId)) listed.set(mapId, []);
			listed.get(mapId).push([name, Number(id.slice(marker + 3))]);
			continue;
		}
		const target = drillable ? id : parentOf(id);
		assert.ok(has(target), `${file}: "${name}" → ${target} missing`);
	}

	for (const [mapId, wanted] of [...listed].sort(([a], [b]) => (a < b ? -1 : 1))) {
		assert.ok(has(mapId), `${file}: places point at ${mapId}, which has no map`);
		const osmIds = new Set((read(mapId).places ?? []).map((place) => place[5]));
		for (const [name, osm] of wanted) {
			assert.ok(osmIds.has(osm), `${file}: "${name}" (${osm}) is not listed on ${mapId}`);
		}
	}
}

// The world tier is the one place the projection itself can be wrong without any
// map looking obviously broken, so pin it down numerically.
const spanOf = (name) => {
	const feature = world.features.find((f) => f.name === name);
	assert.ok(feature?.d, `${name} is missing from the world map`);
	const xs = points(feature.d).map(([x]) => x);
	const ys = points(feature.d).map(([, y]) => y);
	return { minX: Math.min(...xs), maxX: Math.max(...xs), maxY: Math.max(...ys) };
};

const africa = spanOf("Africa");
assert.ok(
	africa.minX < world.width / 2 && africa.maxX > world.width / 2,
	`Africa spans ${africa.minX.toFixed(0)}..${africa.maxX.toFixed(0)} but straddles Greenwich, so it must straddle the centre of a world map centred on it`,
);
// 2.7 px per degree of longitude across Africa's 83° — Cabo Verde at 25°W to
// Rodrigues at 58°E, now that its islands are drawn. A full turn has to come back
// to roughly the canvas width, which it cannot if the projection is wrong.
const perDegree = (africa.maxX - africa.minX) / 83;
assert.ok(
	Math.abs(perDegree * 360 - world.width) < world.width * 0.1,
	`longitude scales at ${perDegree.toFixed(2)} px/deg, so 360° is ${(perDegree * 360).toFixed(0)} px against a ${world.width} px canvas`,
);
assert.ok(
	spanOf("Antarctica").maxY > spanOf("Africa").maxY,
	"Antarctica has to come out south of Africa",
);

/**
 * The one that catches a wrong central meridian. Centre the world on the mean of
 * its land instead of on Greenwich and the cut falls at 164°W, which wraps the
 * Americas onto the opposite edge while every individual map still looks fine.
 *
 * Only South America can be pinned this way. Asia, Oceania and Antarctica are
 * genuinely split by the antimeridian, and so is North America: the last of the
 * Aleutians sit at 172°E, and geoBoundaries draws them.
 */
const southAmerica = spanOf("South America");
assert.ok(
	southAmerica.maxX - southAmerica.minX < world.width * 0.55,
	`South America spans ${(southAmerica.maxX - southAmerica.minX).toFixed(0)} px of ${world.width} — it has wrapped around the antimeridian`,
);
const aspect = world.width / world.height;
assert.ok(
	aspect > 1.8 && aspect < 2.1,
	`world aspect ${aspect.toFixed(3)} — Equal Earth fitted to land should land near 2`,
);

// Regressions worth naming, all of which have bitten this pipeline before.
const INDIA = "world/asia/india";
assert.ok(has(INDIA), "India was not built — its regressions cannot be checked");
const india = read(INDIA);
assert.equal(india.features.length, 36, "India should list 36 states and UTs");
assert.equal(
	india.projection.kind,
	"equirectangular",
	"country scale stays equirectangular",
);
assert.deepEqual(
	india.parents,
	[
		{ id: "world", name: "World" },
		{ id: "world/asia", name: "Asia" },
	],
	"India hangs off Asia, which hangs off the world",
);
assert.ok(
	read("world/asia").features.some((f) => f.id === INDIA && f.children === 36),
	"Asia should list India as drillable",
);
assert.ok(
	read(`${INDIA}/dadra-and-nagar-haveli-and-daman-and-diu`).features.length === 3,
	"Daman, Diu and Dadra & Nagar Haveli belong to their own UT, not Gujarat",
);
assert.ok(
	!read(`${INDIA}/gujarat`).features.some((f) => /^(Daman|Diu)$/.test(f.name)),
	"Gujarat has picked up an enclave that isn't its",
);
assert.ok(
	read(`${INDIA}/punjab/bathinda`).features.some((f) => f.name === "Talwandi Sabo"),
	"Bathinda should drill down to its sub-districts",
);
// Village level, when it was built: villages hang off the sub-district, not off
// the community development block that geoBoundaries publishes in between.
const talwandi = `${INDIA}/punjab/bathinda/talwandi-sabo`;
if (has(talwandi)) {
	const villages = read(talwandi);
	assert.equal(villages.childLabel, "village", "a sub-district holds villages");
	assert.ok(
		villages.features.length > 20,
		`Talwandi Sabo lists ${villages.features.length} villages — too few to be right`,
	);
}

// Settlements, when they were built (a MAPS_PLACES=0 build has none, and so does
// one where India's Overpass fetch failed): Punjab is the state with the most
// cities anyone would look for first. Gurmukhi spellings for the case OSM's
// `name` is the local one.
if (index.places > 0 && !index.placesFailed.includes("IND")) {
	const punjab = read(`${INDIA}/punjab`);
	assert.ok(
		punjab.places?.some(([name]) => /ludhiana|amritsar|ਲੁਧਿਆਣਾ|ਅੰਮ੍ਰਿਤਸਰ/i.test(name)),
		"Punjab should list Ludhiana or Amritsar among its places",
	);
}

// The export has to stand on its own: well-formed, self-describing, and with
// nothing of the viewer left in it.
const exported = buildSvg(read(`${INDIA}/punjab/bathinda`));
assert.match(exported, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
assert.ok(!exported.includes("data-drillable"), "export leaked viewer hooks");
assert.equal(
	(exported.match(/<path /g) ?? []).length,
	read(`${INDIA}/punjab/bathinda`).features.filter((f) => f.d).length,
	"export dropped or duplicated a path",
);
assert.equal(
	(exported.match(/</g) ?? []).length,
	(exported.match(/>/g) ?? []).length,
	"unbalanced tags — a name was not escaped",
);
assert.ok(exported.includes("Talwandi Sabo"), "export lost its area names");

console.log(
	`ok — ${maps} maps, ${areas} areas, ${places} places, ${index.countries.length} countries, ${searchable} search entries` +
		(unplotted ? `, ${unplotted} sub-pixel at their parent's scale` : ""),
);
