/**
 * The geometry behind the world globe, kept free of the DOM so it can be tested.
 *
 * The data set has no globe of its own. The world map's continents are Equal
 * Earth outlines already projected into a flat canvas (`feature.d`), so the
 * globe takes them back out: invert each vertex to a longitude and latitude, and
 * hand the result to d3-geo, which does the orthographic projection, the
 * rotation and — the part that is not worth writing twice — the clipping at the
 * horizon.
 *
 * @typedef {{ scale: number, offsetX: number, offsetY: number, lambda0: number }} EqualEarth
 * @typedef {[number, number]} LngLat
 * @typedef {{ type: "MultiPolygon", coordinates: number[][][][] }} Land
 * @typedef {{ type: "MultiLineString", coordinates: number[][][] }} Coast
 * @typedef {{ id: string, name: string, d: string }} Outlined
 * @typedef {{ polygon: number[][][], lines: number[][][], centre: LngLat, radius: number }} Part
 * @typedef {{ id: string, name: string, land: Land, coast: Coast, centroid: LngLat, parts: Part[] }} Continent
 */

import { geoArea, geoCentroid, geoDistance } from "d3-geo";

const RAD = Math.PI / 180;

/**
 * Equal Earth's constants, as scripts/lib/geo.mjs writes them. The published
 * projection differs from that file's (it takes θ⁶ where the build takes θ⁸), so
 * this must invert what the build *did*, not what the paper says: keep the two
 * in step. globe.test.mjs round-trips through the build's own `fitProjection`.
 */
const EE = { a1: 1.340264, a2: -0.081106, a3: 0.000893, a4: 0.003796 };
const EE_M = Math.sqrt(3) / 2;
/** θ at the poles: the projection's y never goes past this. */
const THETA_MAX = Math.asin(EE_M);

const clamp = (
	/** @type {number} */ value,
	/** @type {number} */ min,
	/** @type {number} */ max,
) => Math.min(Math.max(value, min), max);

/** An angle in degrees, wrapped into [-180, 180). */
export const wrapLng = (/** @type {number} */ lng) =>
	((((lng + 180) % 360) + 360) % 360) - 180;

/** How far the globe may be tipped toward either pole, in degrees. */
export const MAX_TILT = 80;

export const clampTilt = (/** @type {number} */ phi) => clamp(phi, -MAX_TILT, MAX_TILT);

/** Slow at both ends, for a flight from one side of the globe to the other. */
export const easeInOut = (/** @type {number} */ t) =>
	t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/**
 * A screen point on the flat Equal Earth map back to [longitude, latitude].
 *
 * The forward map is y = θ(a1 + a2θ² + θ⁸(a3 + a4θ²)) with sin θ = M sin φ, and
 * x = λ cos θ / (M·dy/dθ). y has no closed-form inverse, so θ is Newton-solved;
 * dy/dθ is the derivative the forward map already divides by, so each step is
 * one evaluation of it. The result is clamped to the poles, where a rounded path
 * coordinate can land a hair past the edge.
 *
 * @param {number[]} point `[X, Y]` as written in a path
 * @param {EqualEarth} projection
 * @returns {LngLat}
 */
export function invertEqualEarth([px, py], { scale, offsetX, offsetY, lambda0 }) {
	const x = ((px ?? 0) - offsetX) / scale;
	// The build flips y so north is up on screen.
	const y = -((py ?? 0) - offsetY) / scale;

	let theta = clamp(y / EE.a1, -THETA_MAX, THETA_MAX);
	let dy = EE.a1;
	for (let i = 0; i < 16; i++) {
		const t2 = theta * theta;
		const t8 = t2 * t2 * t2 * t2;
		dy = EE.a1 + 3 * EE.a2 * t2 + t8 * (9 * EE.a3 + 11 * EE.a4 * t2);
		const error = theta * (EE.a1 + EE.a2 * t2 + t8 * (EE.a3 + EE.a4 * t2)) - y;
		const step = error / dy;
		theta = clamp(theta - step, -THETA_MAX, THETA_MAX);
		if (Math.abs(step) < 1e-13) break;
	}

	const lat = Math.asin(clamp(Math.sin(theta) / EE_M, -1, 1)) / RAD;
	const lambda = (x * EE_M * dy) / Math.cos(theta);
	return [wrapLng(lambda / RAD + lambda0), lat];
}

/**
 * The rings of a path as the build writes it: `M x yLx yL…Z`, one subpath per
 * ring, no curves and no relative commands.
 *
 * @param {string} d
 * @returns {number[][][]}
 */
export function parseRings(d) {
	return d
		.split("Z")
		.map((subpath) =>
			subpath
				.replace(/^\s*M/, "")
				.split("L")
				.map((pair) =>
					pair
						.trim()
						.split(/[\s,]+/)
						.map(Number),
				)
				.filter((point) => point.length === 2 && point.every(Number.isFinite)),
		)
		.filter((ring) => ring.length > 0);
}

/**
 * How close to a seam a vertex has to be, in degrees, to be taken as lying on it.
 * A path coordinate is rounded to 0.1 px, which is a few hundredths of a degree
 * anywhere and a tenth near the poles; this is wider than that and far narrower
 * than anything on a coast.
 */
const SNAP = 0.25;

/**
 * Whether a vertex lies on a meridian where the outlines were cut. There are two
 * such lines. One is the flat map's own edge, 180 degrees from its centre
 * `lambda0`. The other is the antimeridian of the source data, where outlines
 * that cross it are split in two (Antarctica's, which closes itself along it
 * and the pole). They are the same line when `lambda0` is 0, and neither is a
 * coast.
 *
 * @param {number} lng
 * @param {number} lambda0
 * @param {number} within degrees
 * @returns {number | null} the longitude of the line it is on, or null
 */
function seamAt(lng, lambda0, within) {
	if (Math.abs(wrapLng(lng - lambda0)) > 180 - within) return wrapLng(lambda0 + 180);
	if (Math.abs(lng) > 180 - within) return 180;
	return null;
}

/**
 * Puts a vertex that is on a seam exactly on it. The two pieces of a continent
 * cut there meet along one meridian, but each was rounded on its own, so left
 * alone they overlap or part by a hair and the join shows as a faint line in the
 * fill.
 *
 * @param {LngLat} point
 * @param {number} lambda0
 * @returns {LngLat}
 */
function snapped([lng, lat], lambda0) {
	return [seamAt(lng, lambda0, SNAP) ?? lng, lat < -90 + SNAP ? -90 : lat];
}

/**
 * A point that sits on an artificial edge of the flat map rather than on a
 * coast: a cut along a seam (see `seamAt`), or the bottom pole line Antarctica
 * closes itself along.
 *
 * @param {LngLat} point
 * @param {number} lambda0
 */
const onSeam = ([lng, lat], lambda0) => seamAt(lng, lambda0, 0.5) !== null || lat < -89.5;

/**
 * d3 reads a polygon's inside from its winding, so a ring wound the wrong way
 * covers the whole globe except itself. The right way round is whichever
 * encloses the smaller area.
 *
 * @param {number[][]} ring closed
 */
function wound(ring) {
	const area = geoArea({ type: "Polygon", coordinates: [ring] });
	return area > 2 * Math.PI ? [...ring].reverse() : ring;
}

/** Slack on each ring's cap, in radians (about 2 degrees), against its bulges and its rounding. */
const CAP_MARGIN = 0.035;

/**
 * What of a continent can be seen with `facing` at the middle of the view: the
 * rings whose cap reaches onto the visible hemisphere, as the geometry d3
 * should draw. Every ring on the far side would be clipped away anyway, but only
 * after being rotated vertex by vertex, which is most of a frame's work.
 *
 * @param {Continent} continent
 * @param {LngLat} facing
 * @returns {{ land: Land, coast: Coast }}
 */
export function inView(continent, facing) {
	/** @type {number[][][][]} */
	const polygons = [];
	/** @type {number[][][]} */
	const lines = [];
	for (const part of continent.parts) {
		if (geoDistance(part.centre, facing) - part.radius >= Math.PI / 2) continue;
		polygons.push(part.polygon);
		lines.push(...part.lines);
	}
	return {
		land: { type: "MultiPolygon", coordinates: polygons },
		coast: { type: "MultiLineString", coordinates: lines },
	};
}

/**
 * Turns the world map's continents into spherical geometry.
 *
 * Every ring becomes a polygon of its own. The flat map draws with the even-odd
 * rule, so its rings are country outlines and a hole such as Lesotho inside
 * South Africa is just a second ring; drawn here as overlapping polygons with
 * one fill it vanishes the same way.
 *
 * `coast` is the same rings as lines, minus the seams. The land is filled from
 * `land` with no stroke, so the cut along the antimeridian and the line under
 * Antarctica are never drawn, and the borders come from `coast`.
 *
 * @param {Outlined[]} features
 * @param {EqualEarth} projection
 * @returns {Continent[]}
 */
export function buildGlobe(features, projection) {
	const { lambda0 } = projection;

	return features.flatMap((feature) => {
		if (!feature.d) return [];
		/** @type {number[][][][]} */
		const polygons = [];
		/** @type {number[][][]} */
		const lines = [];
		/** @type {Part[]} */
		const parts = [];

		for (const ring of parseRings(feature.d)) {
			const points = ring.map((point) =>
				snapped(invertEqualEarth(point, projection), lambda0),
			);
			const first = points[0];
			if (!first) continue;
			const closed = [...points, first];
			// Fewer than three corners is not an area.
			if (closed.length < 4) continue;
			const polygon = [wound(closed)];
			polygons.push(polygon);
			const own = lines.length;

			/** @type {number[][]} */
			let run = [];
			for (let i = 1; i < closed.length; i++) {
				const from = /** @type {LngLat} */ (closed[i - 1]);
				const to = /** @type {LngLat} */ (closed[i]);
				if (onSeam(from, lambda0) && onSeam(to, lambda0)) {
					if (run.length > 1) lines.push(run);
					run = [];
					continue;
				}
				if (run.length === 0) run.push(from);
				run.push(to);
			}
			if (run.length > 1) lines.push(run);

			// A cap that holds the ring, to skip it while it is all out of sight.
			const centre = /** @type {LngLat} */ (
				geoCentroid({ type: "Polygon", coordinates: polygon })
			);
			const radius = closed.reduce(
				(far, point) => Math.max(far, geoDistance(centre, /** @type {LngLat} */ (point))),
				0,
			);
			parts.push({
				polygon,
				lines: lines.slice(own),
				centre,
				radius: radius + CAP_MARGIN,
			});
		}

		if (polygons.length === 0) return [];
		/** @type {Land} */
		const land = { type: "MultiPolygon", coordinates: polygons };
		return {
			id: feature.id,
			name: feature.name,
			land,
			coast: { type: "MultiLineString", coordinates: lines },
			centroid: /** @type {LngLat} */ (geoCentroid(land)),
			parts,
		};
	});
}
