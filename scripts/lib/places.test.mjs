import assert from "node:assert/strict";
import { test } from "node:test";
import { bbox, fitProjection } from "./geo.mjs";
import {
	fileInto,
	gather,
	PLACE_CAP,
	placeId,
	rank,
	searchRows,
	select,
	tupleOf,
	viewOf,
} from "./places.mjs";

const square = (x, y, size) => [
	[x, y],
	[x + size, y],
	[x + size, y + size],
	[x, y + size],
	[x, y],
];

/** An area as build-maps nests them. */
const area = (name, rings, children = []) => ({
	name,
	rings,
	box: bbox(rings),
	children,
});

const place = (osm, lng, lat, kind = 0, pop = 0, name = `P${osm}`) => ({
	osm,
	name,
	kind,
	lat,
	lng,
	pop,
});

test("ids carry the map and the node", () => {
	assert.equal(placeId("world/asia/india/punjab", 123), "world/asia/india/punjab/~n123");
});

test("cities rank before towns before villages, then by population", () => {
	const list = [
		place(1, 0, 0, 2, 9000),
		place(2, 0, 0, 1, 50),
		place(3, 0, 0, 0, 10),
		place(4, 0, 0, 0, 20),
		place(5, 0, 0, 1, 50),
	];
	assert.deepEqual(
		list.sort(rank).map((p) => p.osm),
		[4, 3, 2, 5, 1],
	);
});

test("each point is filed under the deepest area containing it", () => {
	const d1 = area("D1", [square(0, 0, 5)]);
	const d2 = area("D2", [square(5, 0, 5)]);
	const west = area("West", [square(0, 0, 10)], [d1, d2]);
	const east = area("East", [square(20, 0, 10)]);

	const points = [
		place(1, 2, 2), // D1
		place(2, 7, 2), // D2
		place(3, 25, 5), // East, which has no children
		place(4, 50, 50), // nowhere
		place(5, 2, 8), // West, but in neither district: a border sliver
	];
	assert.deepEqual(fileInto(points, [west, east]), { filed: 4, dropped: 1 });

	assert.deepEqual(
		points.map((p) => p.area?.name),
		["D1", "D2", "East", undefined, "West"],
	);
	assert.deepEqual(
		d1.filed.map((p) => p.osm),
		[1],
	);
	assert.deepEqual(
		west.filed.map((p) => p.osm),
		[5],
	);
});

test("a hole in an area is not part of it", () => {
	const ring = [square(0, 0, 10), square(4, 4, 2)];
	const outer = area("Ring", ring);
	const points = [place(1, 5, 5), place(2, 1, 1)];
	fileInto(points, [outer]);
	assert.deepEqual(
		outer.filed.map((p) => p.osm),
		[2],
	);
});

test("an archipelago is filed by the ring a point is in", () => {
	const islands = area(
		"Islands",
		Array.from({ length: 50 }, (_, i) => square(i * 3, 0, 2)),
	);
	const points = [place(1, 30.5, 1), place(2, 32.5, 1)]; // on an island, then in the sea
	fileInto(points, [islands]);
	assert.deepEqual(
		islands.filed.map((p) => p.osm),
		[1],
	);
});

test("only cities and towns are gathered up the tree, from every depth", () => {
	const leaf = area("Leaf", [square(0, 0, 5)]);
	const parent = area("Parent", [square(0, 0, 10)], [leaf]);
	const points = [
		place(1, 1, 1, 0), // city in the leaf
		place(2, 1, 2, 2), // village in the leaf
		place(3, 8, 8, 1), // town in the parent's sliver
	];
	fileInto(points, [parent]);

	assert.deepEqual(
		gather(parent)
			.map((p) => p.osm)
			.sort(),
		[1, 3],
	);
	assert.deepEqual(
		gather(leaf).map((p) => p.osm),
		[1],
	);
});

/** A 100×100 canvas over lng/lat 0..10, no padding. */
function viewOver(extent = square(0, 0, 10)) {
	const project = fitProjection([extent], { size: 100, padding: 0 });
	return viewOf(project, undefined);
}

test("places are projected, rounded to a tenth and ranked", () => {
	const view = viewOver();
	const [city, town] = select([place(1, 5, 5, 1, 3), place(2, 2.55, 7.77, 0, 1)], view);

	assert.deepEqual(tupleOf(city).slice(0, 2), ["P2", 0]);
	assert.deepEqual(tupleOf(town).slice(0, 2), ["P1", 1]);
	const [x, y] = view.project([2.55, 7.77]);
	assert.deepEqual([city.x, city.y], [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
	assert.equal(city.x, Number(city.x.toFixed(1)));
	assert.deepEqual(tupleOf(town).slice(4), [3, 1]);
});

test("a place off the canvas is dropped", () => {
	const kept = select([place(1, 5, 5), place(2, 11, 5), place(3, 5, -1)], viewOver());
	assert.deepEqual(
		kept.map((k) => k.place.osm),
		[1],
	);
});

test("the cap keeps the most important places, not the first ones", () => {
	const crowd = Array.from({ length: 10 }, (_, i) =>
		place(i + 1, 1 + i * 0.5, 5, i < 2 ? 1 : 0, i * 10),
	);
	// Cities by population, then the two towns.
	assert.deepEqual(
		select(crowd, viewOver(), 5).map((k) => k.place.osm),
		[10, 9, 8, 7, 6],
	);
	assert.equal(select(crowd, viewOver()).length, 10);
	assert.equal(PLACE_CAP, 1500);
});

test("a map re-centred across the antimeridian projects with its own meridian", () => {
	// A strip from 170°E to 170°W (190°E), as fitAreas would have cut it.
	const lambda0 = 180;
	const ring = [
		[-10, 0],
		[10, 0],
		[10, 10],
		[-10, 10],
		[-10, 0],
	];
	const project = fitProjection([ring], { size: 200, padding: 0 });
	const view = viewOf(project, lambda0);

	const [west, east] = select([place(1, 175, 5), place(2, -175, 5)], view);
	// 175°E sits 5° west of the meridian, 175°W 5° east of it.
	// Mirrored about the middle of the canvas, and in order.
	assert.equal(west.place.osm, 1);
	assert.ok(west.x < east.x);
	assert.ok(Math.abs(west.x + east.x - project.width) < 0.2);
	assert.equal(
		select([place(3, 0, 5)], view).length,
		0,
		"Greenwich is far across the globe",
	);
});

test("search rows: cities and towns that a map lists, names of where they are", () => {
	const district = area("Bathinda", [square(0, 0, 10)]);
	const points = [
		place(1, 1, 1, 0, 100, "Big"),
		place(2, 2, 2, 1, 50, "Small"),
		place(3, 3, 3, 2, 10, "Village"),
		place(4, 4, 4, 1, 5, "Unlisted"),
	];
	fileInto(points, [district]);
	points[0].home = "world/x/y/bathinda";
	points[1].home = "world/x/y";
	points[2].home = "world/x/y/bathinda";

	const { rows, cities } = searchRows(points);
	assert.deepEqual(rows, [
		["Big", "world/x/y/bathinda/~n1", "Bathinda", 0],
		["Small", "world/x/y/~n2", "Bathinda", 0],
	]);
	assert.deepEqual(cities, [rows[0]]);
});
