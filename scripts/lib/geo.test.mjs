import assert from "node:assert/strict";
import { test } from "node:test";
import { continentOf } from "./continents.mjs";
import { bbox, bboxOverlaps, pointInRings, slugify, uniqueSlug } from "./geo.mjs";

const square = (x, y, size) => [
	[x, y],
	[x + size, y],
	[x + size, y + size],
	[x, y + size],
	[x, y],
];

test("a hole punches out of its polygon", () => {
	const rings = [square(0, 0, 10), square(4, 4, 2)];
	assert.equal(pointInRings(rings, 1, 1), true);
	assert.equal(pointInRings(rings, 5, 5), false);
	assert.equal(pointInRings(rings, 11, 5), false);
});

test("bounding boxes", () => {
	assert.deepEqual(bbox([square(2, 3, 4)]), [2, 3, 6, 7]);
	assert.equal(bboxOverlaps([0, 0, 2, 2], [1, 1, 3, 3]), true);
	assert.equal(bboxOverlaps([0, 0, 2, 2], [3, 3, 4, 4]), false);
});

test("slugs are route-safe, whatever the name", () => {
	assert.equal(slugify("Dadra & Nagar Haveli"), "dadra-nagar-haveli");
	assert.equal(slugify("Côte d'Ivoire"), "cote-d-ivoire");
	// A name with no Latin letters still needs a path segment…
	assert.equal(slugify("北京市"), "area");
	// …and Windows refuses these as filenames.
	assert.equal(slugify("Con"), "con-area");
});

test("duplicate names in one parent get distinct slugs", () => {
	const taken = new Set();
	assert.deepEqual(
		["Centre", "Centre", "centre"].map((name) => uniqueSlug(name, taken)),
		["centre", "centre-2", "centre-3"],
	);
});

test("the Americas split on subregion, not on the UN region", () => {
	const latin = "Latin America and the Caribbean";
	assert.equal(continentOf("BRA", latin, "South America"), "south-america");
	assert.equal(continentOf("MEX", latin, "Central America"), "north-america");
	assert.equal(continentOf("CUB", latin, "Caribbean"), "north-america");
	assert.equal(continentOf("USA", "Northern America", "Undefined"), "north-america");
	assert.equal(continentOf("ATA", "Undefined", "Undefined"), "antarctica");
	assert.equal(continentOf("RUS", "Europe", "Eastern Europe"), "asia");
	assert.equal(continentOf("XXX", "Atlantis", "Nowhere"), null);
});
