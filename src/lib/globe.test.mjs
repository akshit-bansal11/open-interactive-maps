import assert from "node:assert/strict";
import { test } from "node:test";
import { geoArea, geoContains, geoDistance } from "d3-geo";
import { fitProjection, splitAtAntimeridian, toPath } from "../../scripts/lib/geo.mjs";
import {
	buildGlobe,
	clampTilt,
	easeInOut,
	inView,
	invertEqualEarth,
	MAX_TILT,
	parseRings,
	wrapLng,
} from "./globe.mjs";

const DEG = 180 / Math.PI;

/** Rough continent outlines, enough to be recognisably where they are. */
const AFRICA = [
	[-17, 21],
	[-6, 36],
	[10, 37],
	[32, 31],
	[43, 12],
	[51, 11],
	[40, -15],
	[35, -25],
	[19, -35],
	[12, -17],
	[9, 4],
	[-8, 4],
	[-17, 14],
];
// Reaches past 180°E, as Chukotka does, so the flat map holds it in two pieces.
const ASIA = [
	[30, 45],
	[60, 70],
	[110, 78],
	[170, 70],
	[186, 69],
	[190, 66],
	[187, 62],
	[160, 55],
	[142, 46],
	[122, 30],
	[105, 8],
	[78, 8],
	[56, 25],
	[36, 36],
];
const ANTARCTICA = [
	[-180, -90],
	[-180, -72],
	[-90, -74],
	[0, -70],
	[90, -66],
	[180, -72],
	[180, -90],
];

/** The world map the way build-maps.mjs's emitTier writes it. */
function world(continents, { lambda0 = 0, tolerance = 0 } = {}) {
	const cut = continents.map(([id, rings]) => ({
		id,
		rings: splitAtAntimeridian(rings, lambda0),
	}));
	const project = fitProjection(
		cut.flatMap((c) => c.rings),
		{ size: 1000, padding: 12, kind: "equal-earth" },
	);
	const features = cut.map(({ id, rings }) => ({
		id,
		name: id,
		d: toPath(rings, project, { tolerance, minArea: 0 }),
	}));
	return { features, projection: { ...project.params, lambda0 }, project };
}

const close = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
/** The params the build writes are rounded (scale to 4 places), so allow for it. */
const ROUNDED = 5e-3;

test("a point on the flat map comes back to where it was projected from", () => {
	const { project, projection } = world([["asia", [ASIA]]]);
	for (let lat = -88; lat <= 88; lat += 11) {
		for (let lng = -178; lng <= 178; lng += 17) {
			const [lngBack, latBack] = invertEqualEarth(project([lng, lat]), projection);
			assert.ok(close(lngBack, lng, ROUNDED), `lng ${lng},${lat} -> ${lngBack}`);
			assert.ok(close(latBack, lat, ROUNDED), `lat ${lng},${lat} -> ${latBack}`);
		}
	}
});

test("it inverts the build's own Equal Earth, not the published one", () => {
	// The published projection takes θ⁶ where the build takes θ⁸; at high
	// latitude they are a few percent apart, which is a few degrees of latitude.
	const { project, projection } = world([["asia", [ASIA]]]);
	const [, lat] = invertEqualEarth(project([100, 80]), projection);
	assert.ok(close(lat, 80, ROUNDED));
});

test("a map centred off Greenwich is inverted about its own meridian", () => {
	const { project, projection } = world([["asia", [ASIA]]], { lambda0: 100 });
	assert.equal(projection.lambda0, 100);
	// project() takes longitude relative to the centre, as emitTier arranges.
	const [lng, lat] = invertEqualEarth(project([-60, 20]), projection);
	assert.ok(close(lng, 40, ROUNDED) && close(lat, 20, ROUNDED));
});

test("the poles and the edges clamp instead of returning NaN", () => {
	const { projection } = world([["asia", [ASIA]]]);
	for (const point of [
		[-1e5, -1e5],
		[1e5, 1e5],
		[projection.offsetX, projection.offsetY - 1e4],
	]) {
		const [lng, lat] = invertEqualEarth(point, projection);
		assert.ok(Number.isFinite(lng) && Number.isFinite(lat));
		assert.ok(Math.abs(lat) <= 90);
	}
});

test("path data parses back into its rings", () => {
	assert.deepEqual(parseRings("M0 0L10.5 -2L3 4ZM1 1L2 2L3 1Z"), [
		[
			[0, 0],
			[10.5, -2],
			[3, 4],
		],
		[
			[1, 1],
			[2, 2],
			[3, 1],
		],
	]);
	assert.deepEqual(parseRings(""), []);
});

test("a continent's outline survives the round trip through the flat map", () => {
	const { features, projection } = world([["africa", [AFRICA]]]);
	const [africa] = buildGlobe(features, projection);
	assert.ok(africa);
	const ring = africa.land.coordinates[0]?.[0] ?? [];
	// Closed, so one more than the outline; the wound-up copy may run either way.
	assert.equal(ring.length, AFRICA.length + 1);
	for (const [lng, lat] of AFRICA) {
		const nearest = Math.min(...ring.map((p) => geoDistance([lng, lat], p) * DEG));
		assert.ok(nearest < 0.25, `${lng},${lat} is ${nearest}° from its inversion`);
	}
});

test("every ring is a polygon that encloses its own side of the globe", () => {
	const { features, projection } = world([
		["africa", [AFRICA]],
		// Wound the other way round, which must still come out small.
		["asia", [ASIA.toReversed()]],
		["antarctica", [ANTARCTICA]],
	]);
	const continents = buildGlobe(features, projection);
	assert.equal(continents.length, 3);
	for (const { id, land } of continents) {
		assert.ok(land.coordinates.length > 0, id);
		for (const polygon of land.coordinates) {
			const area = geoArea({ type: "Polygon", coordinates: polygon });
			assert.ok(area < 2 * Math.PI, `${id} covers ${area} sr`);
		}
	}
});

test("land contains the places it should and none of the sea", () => {
	const { features, projection } = world([
		["africa", [AFRICA]],
		["asia", [ASIA]],
		["antarctica", [ANTARCTICA]],
	]);
	const byId = Object.fromEntries(buildGlobe(features, projection).map((c) => [c.id, c]));
	assert.ok(geoContains(byId.africa.land, [20, 5]));
	assert.ok(geoContains(byId.asia.land, [90, 50]));
	assert.ok(geoContains(byId.antarctica.land, [0, -85]));
	assert.ok(geoContains(byId.antarctica.land, [123, -89.9]));
	// The sea: mid-Atlantic, the Pacific, and the far side of each continent.
	assert.ok(!geoContains(byId.africa.land, [-30, 10]));
	assert.ok(!geoContains(byId.africa.land, [-100, 40]));
	assert.ok(!geoContains(byId.asia.land, [-30, 10]));
	assert.ok(!geoContains(byId.antarctica.land, [20, 30]));
});

test("a continent cut at the antimeridian is whole again on the sphere", () => {
	const { features, projection } = world([["asia", [ASIA]]]);
	const [asia] = buildGlobe(features, projection);
	assert.ok(asia);
	// ASIA reaches 190°E, so the flat map holds a piece at each edge.
	assert.ok(asia.land.coordinates.length >= 2);
	assert.ok(geoContains(asia.land, [175, 68]));
	assert.ok(geoContains(asia.land, [-175, 67]));
});

test("the seams are not part of the coast", () => {
	const lambda0 = -10;
	const { features, projection } = world(
		[
			["asia", [ASIA]],
			["antarctica", [ANTARCTICA]],
		],
		{ lambda0 },
	);
	// The flat map's edge, the data's own antimeridian (Antarctica closes along it),
	// and the pole.
	const edge = (lng, lat) =>
		Math.abs(wrapLng(lng - lambda0)) > 179.5 || Math.abs(lng) > 179.5 || lat < -89.5;
	for (const { id, coast } of buildGlobe(features, projection)) {
		assert.ok(coast.coordinates.length > 0, `${id} has a coast`);
		for (const line of coast.coordinates) {
			for (let i = 1; i < line.length; i++) {
				const [a, b] = [line[i - 1], line[i]];
				assert.ok(!(edge(...a) && edge(...b)), `${id} draws a seam at ${a} -> ${b}`);
			}
		}
	}
});

test("the pieces of a cut continent meet exactly on the seam", () => {
	const lambda0 = -10;
	const { features, projection } = world([["asia", [ASIA]]], { lambda0 });
	const [asia] = buildGlobe(features, projection);
	const seam = wrapLng(lambda0 + 180);
	const onSeam = asia?.land.coordinates
		.flatMap(([ring]) => ring ?? [])
		.filter(([lng]) => Math.abs(wrapLng(lng - lambda0)) > 179.5);
	assert.ok(onSeam && onSeam.length >= 4);
	// Rounded independently, the two sides would differ by a few hundredths.
	for (const [lng] of onSeam) assert.equal(lng, seam);
});

test("rings with no area are dropped, and features with no outline", () => {
	const [only, ...rest] = buildGlobe(
		[
			{ id: "a", name: "A", d: "M10 10L20 20Z" },
			{ id: "b", name: "B", d: "" },
			{ id: "c", name: "C", d: "M100 100L200 100L200 200L100 200Z" },
		],
		{ scale: 150, offsetX: 500, offsetY: 250, lambda0: 0 },
	);
	assert.equal(only?.id, "c");
	assert.equal(rest.length, 0);
});

test("a continent's centroid is on the continent", () => {
	const { features, projection } = world([["africa", [AFRICA]]]);
	const [africa] = buildGlobe(features, projection);
	assert.ok(africa && geoContains(africa.land, africa.centroid));
});

test("rings wholly on the far side are left out of what is drawn", () => {
	const { features, projection } = world([
		["asia", [ASIA]],
		["oceania", [AFRICA, ANTARCTICA]],
	]);
	const [asia, other] = buildGlobe(features, projection);
	assert.ok(asia && other);
	const count = (c, facing) => inView(c, facing).land.coordinates.length;
	// Facing Africa, the sliver of Asia past the date line cannot be seen.
	assert.ok(asia.parts.length >= 2);
	assert.ok(count(asia, [20, 5]) < asia.parts.length);
	assert.equal(count(asia, [-175, 66]), asia.parts.length);
	// Antarctica's cap reaches over the pole; the rest of the globe's far side does not.
	assert.equal(count(other, [20, -80]), other.parts.length);
	assert.ok(count(other, [-160, 60]) < other.parts.length);
	// Nothing that is left out has a vertex on the visible side.
	for (const facing of [
		[20, 5],
		[150, 60],
		[-100, -30],
		[0, 80],
	]) {
		for (const c of [asia, other]) {
			const shown = new Set(inView(c, facing).land.coordinates);
			for (const part of c.parts) {
				if (shown.has(part.polygon)) continue;
				for (const point of part.polygon[0] ?? []) {
					assert.ok(geoDistance(point, facing) >= Math.PI / 2, `${c.id} at ${facing}`);
				}
			}
		}
	}
});

test("longitude wraps and the tilt stops short of the poles", () => {
	assert.equal(wrapLng(190), -170);
	assert.equal(wrapLng(-190), 170);
	assert.equal(wrapLng(45), 45);
	assert.equal(clampTilt(95), MAX_TILT);
	assert.equal(clampTilt(-95), -MAX_TILT);
	assert.equal(clampTilt(12), 12);
});

test("easing starts and ends at rest and is even about the middle", () => {
	assert.equal(easeInOut(0), 0);
	assert.equal(easeInOut(1), 1);
	assert.ok(close(easeInOut(0.5), 0.5, 1e-12));
	assert.ok(easeInOut(0.1) < 0.1 && easeInOut(0.9) > 0.9);
});
