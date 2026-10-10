import assert from "node:assert/strict";
import { test } from "node:test";
import { clampView, IDENTITY, MAX_ZOOM, panBy, zoomAt } from "./view.mjs";

const W = 1000;
const H = 500;

test("zooming keeps the point under the pointer where it was", () => {
	const before = { x: 100, y: 50, k: 2 };
	const after = zoomAt(before, 1.5, 400, 200);
	// Where (400, 200) sits on screen, as a fraction of the view, must not move.
	const fraction = (view) => [
		(400 - view.x) / (W / view.k),
		(200 - view.y) / (H / view.k),
	];
	const [bx, by] = fraction(before);
	const [ax, ay] = fraction(after);
	assert.ok(Math.abs(bx - ax) < 1e-9 && Math.abs(by - ay) < 1e-9);
	assert.equal(after.k, 3);
});

test("zoom stays between the whole map and the maximum", () => {
	assert.equal(zoomAt(IDENTITY, 0.1, 500, 250).k, 1);
	assert.equal(zoomAt(IDENTITY, 1000, 500, 250).k, MAX_ZOOM);
});

test("the map cannot be dragged off its own canvas", () => {
	assert.deepEqual(clampView(panBy(IDENTITY, -300, 900), W, H), IDENTITY);
	assert.deepEqual(clampView({ x: 9999, y: -5, k: 2 }, W, H), { x: 500, y: 0, k: 2 });
});

test("zooming all the way out lands back on the whole map", () => {
	const zoomed = clampView(zoomAt(IDENTITY, 4, 900, 450), W, H);
	assert.deepEqual(clampView(zoomAt(zoomed, 0.01, 10, 10), W, H), IDENTITY);
});
