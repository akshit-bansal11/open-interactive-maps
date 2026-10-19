/**
 * Settlements and the map hierarchy: filing each OpenStreetMap point under the
 * deepest area that contains it, and choosing and projecting the ones a map
 * shows.
 *
 * Pure functions over plain objects, so they can be tested with a handful of
 * squares. Areas are the nodes build-maps already nests — `{ name, rings, box,
 * children }` — and a point is `{ osm, name, kind, lat, lng, pop }` from
 * scripts/lib/osm-places.mjs.
 */
import { bbox, normalizeLng, pointInRing } from "./geo.mjs";

/** Most cities and towns an admin map carries; its settlement maps carry all. */
export const PLACE_CAP = 1500;

/**
 * The id a place has in search and on the page: the map that lists it, then
 * `~n` and its OpenStreetMap node id. Same format as `placeId` in
 * src/types/map.ts — `~` cannot appear in a slug, so it never collides with an
 * area.
 */
export const placeId = (mapId, osmId) => `${mapId}/~n${osmId}`;

/** Cities before towns before villages, then the biggest first, then by id. */
export const rank = (a, b) => a.kind - b.kind || b.pop - a.pop || a.osm - b.osm;

const inBox = (box, x, y) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];

/**
 * Even-odd containment, like `pointInRings`, but skipping every ring whose own
 * box the point is outside of. An archipelago has thousands of rings and a
 * point is in at most a few; this is the difference between a country taking
 * seconds and taking minutes.
 */
function contains(area, x, y) {
	area.ringBoxes ??= area.rings.map((ring) => bbox([ring]));
	let inside = false;
	for (let i = 0; i < area.rings.length; i++) {
		if (inBox(area.ringBoxes[i], x, y) && pointInRing(area.rings[i], x, y)) {
			inside = !inside;
		}
	}
	return inside;
}

/** The deepest area down the tree that holds the point, or null. */
function locate(roots, x, y) {
	let found = null;
	let level = roots;
	for (;;) {
		const next = level.find((area) => inBox(area.box, x, y) && contains(area, x, y));
		if (!next) return found;
		found = next;
		level = next.children;
	}
}

/**
 * Files every point under the deepest area containing it, setting `place.area`
 * and pushing it onto that area's `filed`.
 *
 * Top-down, so a point is only ever tested against the children of the area it
 * is already in, with the bounding box as a first cut at each level. A point in
 * no top-level area is dropped. A point in a parent but in none of its children
 * — a border sliver between two independently simplified levels — stays filed
 * at the parent.
 *
 * @returns {{ filed: number, dropped: number }}
 */
export function fileInto(places, roots) {
	let filed = 0;
	for (const place of places) {
		const area = locate(roots, place.lng, place.lat);
		if (!area) continue;
		place.area = area;
		area.filed ??= [];
		area.filed.push(place);
		filed++;
	}
	return { filed, dropped: places.length - filed };
}

/** Cities and towns filed anywhere in the area or below it. */
export function gather(area, out = []) {
	for (const place of area.filed ?? []) if (place.kind < 2) out.push(place);
	for (const child of area.children) gather(child, out);
	return out;
}

/**
 * What a map needs to place a point on its canvas: the projection `fitAreas`
 * chose, and the central meridian when it re-centred a region crossing the
 * antimeridian.
 */
export function viewOf(project, lambda0) {
	return { project, lambda0, width: project.width, height: project.height };
}

/**
 * Picks the places a map shows: ranked, projected with the map's own projection,
 * those off the canvas dropped, and cut to `cap`. Coordinates are rounded to a
 * tenth of a pixel, which is as fine as the outlines are drawn.
 *
 * @returns {{ place: object, x: number, y: number }[]}
 */
export function select(candidates, view, cap = Number.POSITIVE_INFINITY) {
	const kept = [];
	for (const place of [...candidates].sort(rank)) {
		const lng =
			view.lambda0 === undefined ? place.lng : normalizeLng(place.lng, view.lambda0);
		const [px, py] = view.project([lng, place.lat]);
		const x = Math.round(px * 10) / 10;
		const y = Math.round(py * 10) / 10;
		if (!(x >= 0 && x <= view.width && y >= 0 && y <= view.height)) continue;

		kept.push({ place, x, y });
		if (kept.length >= cap) break;
	}
	return kept;
}

/** A place as a map file stores it: `[name, kind, x, y, population, osm id]`. */
export const tupleOf = ({ place, x, y }) => [
	place.name,
	place.kind,
	x,
	y,
	place.pop,
	place.osm,
];

/**
 * Search rows for a country's cities and towns, once each has a `home` map: the
 * settlement map when it has one, else the deepest admin map that listed it. A
 * place no map listed — cut by the cap — is left out. Villages are not indexed.
 * `cities` are the same rows, for the global index.
 */
export function searchRows(places) {
	const rows = [];
	const cities = [];
	for (const place of [...places].sort(rank)) {
		if (!place.home || place.kind > 1) continue;
		const row = [place.name, placeId(place.home, place.osm), place.area.name, 0];
		rows.push(row);
		if (place.kind === 0) cities.push(row);
	}
	return { rows, cities };
}
