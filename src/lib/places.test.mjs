import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseLabels, formatPopulation, placeLatLon, rankPlaces } from "./places.mjs";

const map = (projection) => /** @type {any} */ ({ projection });

test("placeLatLon inverts the equirectangular projection", () => {
	// Forward, as scripts/lib/geo.mjs does it: x = lng * cosLat * scale + offsetX.
	const projection = {
		kind: "equirectangular",
		scale: 40,
		offsetX: 12,
		offsetY: 700,
		cosLat: 0.8,
	};
	const x = 75.5 * 0.8 * 40 + 12;
	const y = -30.25 * 40 + 700;
	const got = placeLatLon(map(projection), x, y);
	assert.ok(got);
	assert.ok(Math.abs(got.lng - 75.5) < 1e-9);
	assert.ok(Math.abs(got.lat - 30.25) < 1e-9);
});

test("placeLatLon re-wraps a map centred across the antimeridian", () => {
	const projection = {
		kind: "equirectangular",
		scale: 10,
		offsetX: 500,
		offsetY: 500,
		cosLat: 1,
		lambda0: 180,
	};
	// 5 degrees east of the centre meridian is 185, which is -175.
	const got = placeLatLon(map(projection), 550, 500);
	assert.ok(got);
	assert.ok(Math.abs(got.lng - -175) < 1e-9);
});

test("placeLatLon does not invert Equal Earth", () => {
	assert.equal(
		placeLatLon(
			map({ kind: "equal-earth", scale: 1, offsetX: 0, offsetY: 0, lambda0: 0 }),
			1,
			1,
		),
		null,
	);
});

test("rankPlaces puts cities first, then the most populous", () => {
	const places = [
		["village", 2, 0, 0, 900, 1],
		["small town", 1, 0, 0, 50, 2],
		["big town", 1, 0, 0, 5000, 3],
		["city", 0, 0, 0, 0, 4],
	];
	assert.deepEqual(rankPlaces(/** @type {any} */ (places)), [3, 2, 1, 0]);
});

test("chooseLabels keeps labels apart and inside the screen", () => {
	const at = (x, y) => ({ x, y, r: 4, w: 60, h: 14 });
	const placed = chooseLabels(
		[at(100, 100), at(110, 104), at(500, 100), at(595, 300)],
		600,
		400,
		10,
	);
	const kept = placed.map((p) => p.index);
	// The second collides with the first on both sides; the last only fits left.
	assert.deepEqual(kept, [0, 2, 3]);
	assert.equal(placed[2]?.side, -1);
});

test("chooseLabels honours its limit", () => {
	const row = Array.from({ length: 8 }, (_, i) => ({
		x: 20 + i * 100,
		y: 50,
		r: 3,
		w: 50,
		h: 12,
	}));
	assert.equal(chooseLabels(row, 1000, 100, 3).length, 3);
});

test("formatPopulation says nothing about an unknown population", () => {
	assert.equal(formatPopulation(0), "");
	assert.equal(formatPopulation(1204000), "1,204,000");
	assert.equal(formatPopulation(1204000, true), "1.2M");
});
