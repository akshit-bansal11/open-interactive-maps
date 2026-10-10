/**
 * Shared geometry helpers for the map generators.
 *
 * Everything here works on lng/lat rings and ends up as SVG path data fitted
 * into a fixed canvas, so a map always fills its box no matter how the region
 * is shaped.
 */

/** Every closed ring of a GeoJSON feature, outer and inner alike, in lng/lat. */
export function ringsOf(feature) {
	const { type, coordinates } = feature.geometry;
	const polygons = type === "Polygon" ? [coordinates] : coordinates;
	return polygons.flatMap((polygon) =>
		polygon.map((ring) => ring.map(([lng, lat]) => [lng, lat])),
	);
}

/** [minX, minY, maxX, maxY] of a list of rings. */
export function bbox(rings) {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const ring of rings) {
		for (const [x, y] of ring) {
			if (x < minX) minX = x;
			if (y < minY) minY = y;
			if (x > maxX) maxX = x;
			if (y > maxY) maxY = y;
		}
	}
	return [minX, minY, maxX, maxY];
}

export const bboxOverlaps = (a, b) =>
	a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** Even-odd point-in-ring. */
export function pointInRing(ring, px, py) {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xi, yi] = ring[i];
		const [xj, yj] = ring[j];
		if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
			inside = !inside;
		}
	}
	return inside;
}

/** Even-odd across every ring, so holes punch out as they should. */
export function pointInRings(rings, px, py) {
	let inside = false;
	for (const ring of rings) {
		if (pointInRing(ring, px, py)) inside = !inside;
	}
	return inside;
}

/** Shoelace area, unsigned. */
export function ringArea(ring) {
	let total = 0;
	for (let i = 0; i < ring.length; i++) {
		const [x1, y1] = ring[i];
		const [x2, y2] = ring[(i + 1) % ring.length];
		total += x1 * y2 - x2 * y1;
	}
	return Math.abs(total) / 2;
}

/** Perpendicular distance from `p` to the segment `a`–`b`. */
function segmentDistance(p, a, b) {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const lengthSq = dx * dx + dy * dy;
	const t =
		lengthSq === 0
			? 0
			: Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq));
	return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Ramer–Douglas–Peucker, iterative — a recursive one blows the stack on the
 * 100k-vertex coastlines that show up in national datasets.
 */
export function simplify(ring, tolerance) {
	if (ring.length < 3) return ring;

	const keep = new Uint8Array(ring.length);
	keep[0] = 1;
	keep[ring.length - 1] = 1;

	const stack = [[0, ring.length - 1]];
	while (stack.length > 0) {
		const [first, last] = stack.pop();
		let index = -1;
		let furthest = tolerance;
		for (let i = first + 1; i < last; i++) {
			const distance = segmentDistance(ring[i], ring[first], ring[last]);
			if (distance > furthest) {
				furthest = distance;
				index = i;
			}
		}
		if (index !== -1) {
			keep[index] = 1;
			stack.push([first, index], [index, last]);
		}
	}

	return ring.filter((_, i) => keep[i]);
}

const RAD = Math.PI / 180;

/** Longitude relative to `lambda0`, wrapped into [-180, 180). */
export const normalizeLng = (lng, lambda0) =>
	((((lng - lambda0) % 360) + 540) % 360) - 180;

/**
 * Longitude to centre a map on: the circular mean of its vertices, so a region
 * straddling the antimeridian is centred on itself instead of on Greenwich.
 *
 * A region wrapping the whole globe — Antarctica — has no meaningful mean, and
 * its resultant vector collapses to nearly zero. Greenwich is as good as
 * anything there.
 */
export function centralMeridian(rings) {
	let x = 0;
	let y = 0;
	let n = 0;
	for (const ring of rings) {
		for (const [lng] of ring) {
			x += Math.cos(lng * RAD);
			y += Math.sin(lng * RAD);
			n++;
		}
	}
	if (n === 0 || Math.hypot(x, y) / n < 0.05) return 0;
	return Math.atan2(y, x) / RAD;
}

/**
 * Re-centres rings on `lambda0` and cuts them where they cross the far side of
 * the globe, so a shape spanning the antimeridian comes out as two pieces at
 * opposite edges instead of one smeared across the whole canvas.
 *
 * The cut point is interpolated onto the ±180 edge, so each piece closes along
 * the edge of the map rather than across the middle of it. A ring is closed, so
 * the run before the first cut and the run after the last one are the same
 * piece — they get rejoined.
 *
 * ponytail: edge splitting, not true polygon clipping. Enough for a landmass
 * crossing the line; a shape that encloses a pole would need real clipping.
 */
export function splitAtAntimeridian(rings, lambda0) {
	const out = [];

	for (const ring of rings) {
		const normalized = ring.map(([lng, lat]) => [normalizeLng(lng, lambda0), lat]);
		const pieces = [[normalized[0]]];

		for (let i = 1; i < normalized.length; i++) {
			const [x0, y0] = normalized[i - 1];
			const [x1, y1] = normalized[i];

			if (Math.abs(x1 - x0) <= 180) {
				pieces[pieces.length - 1].push([x1, y1]);
				continue;
			}

			// Walk the short way round, off whichever edge it leaves by.
			const edge = x0 > 0 ? 180 : -180;
			const delta = x1 - x0 + (x0 > 0 ? 360 : -360);
			const cut = y0 + ((edge - x0) / delta) * (y1 - y0);
			pieces[pieces.length - 1].push([edge, cut]);
			pieces.push([
				[-edge, cut],
				[x1, y1],
			]);
		}

		// Rejoin across the ring's own closing point.
		if (pieces.length > 1) {
			const last = pieces.pop();
			pieces[0] = [...last.slice(0, -1), ...pieces[0]];
		}
		out.push(...pieces);
	}

	return out.filter((ring) => ring.length >= 4);
}

/**
 * Equal Earth (Šavrič, Patterson & Jenny 2018) — equal-area and pseudocylindrical,
 * for the world and continent tiers where equirectangular falls apart.
 * Longitudes are expected to be relative to the map's central meridian already.
 */
const EE = { a1: 1.340264, a2: -0.081106, a3: 0.000893, a4: 0.003796 };
const EE_M = Math.sqrt(3) / 2;

function equalEarth(lng, lat) {
	const theta = Math.asin(EE_M * Math.sin(lat * RAD));
	const t2 = theta * theta;
	const t8 = t2 * t2 * t2 * t2;
	// The x denominator is dy/dθ, which is what makes the projection equal-area.
	const dy = EE.a1 + 3 * EE.a2 * t2 + t8 * (9 * EE.a3 + 11 * EE.a4 * t2);
	return [
		(lng * RAD * Math.cos(theta)) / (EE_M * dy),
		theta * (EE.a1 + EE.a2 * t2 + t8 * (EE.a3 + EE.a4 * t2)),
	];
}

/**
 * Fits rings into their own canvas. `kind` picks the projection:
 *
 * - `equirectangular` (default), x corrected by the latitude at the centre of
 *   the region. Good at country scale and below, which is every map built from
 *   geoBoundaries admin levels.
 * - `equal-earth`, for the world and continent tiers. Pass rings that have
 *   already been through `splitAtAntimeridian`, so longitudes are relative to
 *   the central meridian.
 *
 * The canvas takes the region's own aspect — longest side `size`, the other
 * whatever the shape needs — rather than letterboxing into a fixed box. A tall
 * country exported into a wide box is mostly margin, and margin is the one
 * thing nobody wants in a downloaded map.
 */
export function fitProjection(rings, { size, padding, kind = "equirectangular" }) {
	const [, minLat, , maxLat] = bbox(rings);
	const cosLat = kind === "equal-earth" ? 1 : Math.cos(((minLat + maxLat) / 2) * RAD);

	const transform =
		kind === "equal-earth"
			? ([lng, lat]) => {
					const [x, y] = equalEarth(lng, lat);
					return [x, -y];
				}
			: ([lng, lat]) => [lng * cosLat, -lat];

	const flat = rings.map((ring) => ring.map(transform));
	const [minX, minY, maxX, maxY] = bbox(flat);

	const spanX = maxX - minX;
	const spanY = maxY - minY;
	const scale = (size - padding * 2) / Math.max(spanX, spanY);
	const offsetX = padding - minX * scale;
	const offsetY = padding - minY * scale;

	const project = (point) => {
		const [x, y] = transform(point);
		return [x * scale + offsetX, y * scale + offsetY];
	};
	project.width = Math.round(spanX * scale) + padding * 2;
	project.height = Math.round(spanY * scale) + padding * 2;
	project.params = {
		kind,
		scale: Number(scale.toFixed(4)),
		offsetX: Number(offsetX.toFixed(3)),
		offsetY: Number(offsetY.toFixed(3)),
		...(kind === "equal-earth" ? {} : { cosLat: Number(cosLat.toFixed(6)) }),
	};
	return project;
}

/**
 * Projects, simplifies and drops slivers, then emits one `M…Z` subpath per
 * surviving ring. Holes come out as extra subpaths — the renderer uses
 * fill-rule="evenodd", so they punch through.
 */
export function toPath(rings, project, { tolerance, minArea, precision = 1 }) {
	const round = (n) => Number(n.toFixed(precision));

	const projected = rings.map((ring) => simplify(ring.map(project), tolerance));
	// The biggest ring is the area itself — never let the sliver filter drop it,
	// or a small island territory vanishes from its parent's map entirely.
	const areas = projected.map(ringArea);
	const largest = areas.indexOf(Math.max(...areas));

	return projected
		.filter((ring, i) => ring.length >= 4 && (i === largest || areas[i] >= minArea))
		.map((ring) => {
			const out = [];
			for (const point of ring) {
				const x = round(point[0]);
				const y = round(point[1]);
				const previous = out[out.length - 1];
				if (!previous || previous[0] !== x || previous[1] !== y) out.push([x, y]);
			}
			// A ring that collapsed to a line after rounding is not worth drawing.
			if (out.length < 4) return "";
			return `M${out.map(([x, y]) => `${x} ${y}`).join("L")}Z`;
		})
		.join("");
}

/** Windows refuses these as filenames whatever the extension. */
const RESERVED = new Set(
	"con prn aux nul com1 com2 com3 com4 com5 com6 com7 com8 com9 lpt1 lpt2 lpt3 lpt4 lpt5 lpt6 lpt7 lpt8 lpt9".split(
		" ",
	),
);

export function slugify(name) {
	const slug =
		name
			.toLowerCase()
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "") || "area";
	return RESERVED.has(slug) ? `${slug}-area` : slug;
}

/** Makes `slug` unique within `taken`, which it also updates. */
export function uniqueSlug(name, taken) {
	const base = slugify(name);
	let slug = base;
	let n = 2;
	while (taken.has(slug)) slug = `${base}-${n++}`;
	taken.add(slug);
	return slug;
}
