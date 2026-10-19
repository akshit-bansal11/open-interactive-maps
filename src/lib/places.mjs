/**
 * Arithmetic for the settlement layer, kept free of the DOM so it can be tested:
 * what a place is called, where on Earth it is, and which labels fit on screen.
 *
 * @import { MapFile, Place } from "../types/map"
 */

export const KIND_NAMES = ["City", "Town", "Village"];
export const KIND_PLURALS = ["Cities", "Towns", "Villages"];

const COMPACT = new Intl.NumberFormat("en", {
	notation: "compact",
	maximumFractionDigits: 1,
});

/**
 * @param {number} population 0 means OpenStreetMap does not say
 * @param {boolean} [compact] "1.2M" rather than "1,204,000"
 */
export const formatPopulation = (population, compact = false) =>
	population > 0
		? compact
			? COMPACT.format(population)
			: population.toLocaleString("en")
		: "";

const wrapLng = (/** @type {number} */ lng) => ((((lng + 180) % 360) + 360) % 360) - 180;

/**
 * Inverts the map's projection for a point on its canvas. Only the
 * equirectangular maps (country and below) carry places, and their projection is
 * a scale and an offset, corrected in x by the cosine of the centre latitude;
 * Equal Earth is not inverted here and answers null.
 *
 * @param {MapFile} map
 * @param {number} x canvas units
 * @param {number} y canvas units
 * @returns {{ lat: number, lng: number } | null}
 */
export function placeLatLon(map, x, y) {
	const p = map.projection;
	if (p.kind !== "equirectangular") return null;
	let lng = (x - p.offsetX) / p.scale / p.cosLat;
	// A map that straddles the antimeridian was re-centred on its own meridian.
	if (p.lambda0 !== undefined) lng = wrapLng(lng + p.lambda0);
	return { lat: -(y - p.offsetY) / p.scale, lng };
}

/**
 * Indices of `places` in the order they deserve a label: cities, then towns,
 * then villages, the most populous first inside each, unknown population last.
 *
 * @param {Place[]} places
 * @returns {number[]}
 */
export function rankPlaces(places) {
	return places
		.map((_, i) => i)
		.sort((a, b) => {
			const [, kindA, , , popA] = /** @type {Place} */ (places[a]);
			const [, kindB, , , popB] = /** @type {Place} */ (places[b]);
			return kindA - kindB || popB - popA || a - b;
		});
}

/**
 * A rough width for a line of text. Geist's average advance is about 0.58 em;
 * East Asian scripts are square. Close enough to keep two labels apart.
 *
 * @param {string} text
 * @param {number} fontSize
 */
export function textWidth(text, fontSize) {
	let em = 0;
	for (const char of text) em += (char.codePointAt(0) ?? 0) >= 0x2e80 ? 1 : 0.58;
	return em * fontSize;
}

/**
 * @typedef {{ x: number, y: number, r: number, w: number, h: number }} Candidate
 *   a dot at screen position (x, y) with radius r, wanting a label w by h
 * @typedef {{ index: number, side: 1 | -1 }} Placed
 */

const GAP = 3;

/** @param {{ x0: number, y0: number, x1: number, y1: number }} a @param {typeof a} b */
const overlaps = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * Greedy label placement in screen space. Candidates arrive in priority order;
 * each is tried to the right of its dot and then to the left, and kept if the
 * label stays inside the screen and clear of every label and dot kept so far.
 * A dot that is not labelled is not an obstacle — a village cluster would
 * otherwise veto every town label near it.
 *
 * @param {Candidate[]} candidates
 * @param {number} width screen px
 * @param {number} height screen px
 * @param {number} limit most labels to place
 * @returns {Placed[]}
 */
export function chooseLabels(candidates, width, height, limit) {
	/** @type {{ x0: number, y0: number, x1: number, y1: number }[]} */
	const taken = [];
	/** @type {Placed[]} */
	const placed = [];

	for (let index = 0; index < candidates.length && placed.length < limit; index++) {
		const { x, y, r, w, h } = /** @type {Candidate} */ (candidates[index]);
		const dot = { x0: x - r, y0: y - r, x1: x + r, y1: y + r };

		for (const side of /** @type {const} */ ([1, -1])) {
			const near = x + side * (r + GAP);
			const far = near + side * w;
			const box = {
				x0: Math.min(near, far),
				x1: Math.max(near, far),
				y0: y - h / 2,
				y1: y + h / 2,
			};
			if (box.x0 < 0 || box.x1 > width || box.y0 < 0 || box.y1 > height) continue;
			if (taken.some((other) => overlaps(box, other))) continue;
			taken.push(box, dot);
			placed.push({ index, side });
			break;
		}
	}
	return placed;
}
