/**
 * Turns a generated map into standalone SVG source.
 *
 * Plain JS with JSDoc types on purpose: the Next app imports it and so does
 * scripts/check-maps.mjs, which runs under bare node. One implementation, so
 * what the check verifies is exactly what the download button produces.
 *
 * Free of anything DOM or React — the export is built from the map data, not
 * scraped off the page, so a downloaded file carries no interaction hooks and
 * no dependency on the site's stylesheet.
 *
 * @import { MapFile } from "../types/map"
 */

/**
 * Baked into every export, so a downloaded file looks like what was on screen in
 * the light theme: warm land, a hairline of ink, a soft-blue sea for the PNG.
 */
export const STYLE = {
	fill: "#efeadc",
	highlight: "#5457e8",
	stroke: "#26304a",
	strokeOpacity: "0.35",
	strokeWidth: "1",
	background: "#dbe7f2",
	/** Settlement dots, by kind: city, town, village. */
	place: ["#3b3fc4", "#0f8f8a", "#5d6b82"],
	placeStroke: "#ffffff",
};

/** Dot radius in canvas units (the longest side is 1000), by kind. */
const PLACE_RADIUS = [6, 4, 2.6];

/** @type {Record<string, string>} */
const ESCAPES = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
};

/**
 * @param {string | number} value
 * @returns {string}
 */
export const xml = (value) => String(value).replace(/[&<>"]/g, (c) => ESCAPES[c]);

/**
 * @param {MapFile} map
 * @returns {string}
 */
export function buildSvg(map) {
	const paths = map.features
		.filter((feature) => feature.d)
		.map((feature) => {
			const slug = /** @type {string} */ (feature.id.split("/").pop());
			return `\t\t<path id="${xml(slug)}" data-name="${xml(feature.name)}" d="${feature.d}" />`;
		})
		.join("\n");

	// A settlement map is one area: its outline goes in a group of its own, apart
	// from the places that sit on it.
	const outline = map.outline
		? `\t<g id="outline" fill="${STYLE.fill}" fill-rule="evenodd" stroke="${STYLE.stroke}" stroke-opacity="${STYLE.strokeOpacity}" stroke-width="${STYLE.strokeWidth}" stroke-linejoin="round">
\t\t<path d="${map.outline}" />
\t</g>
`
		: "";

	// Circles, not paths: an admin map's export must hold exactly one <path> per
	// area, which is what scripts/check-maps.mjs counts.
	const places = map.places?.length
		? `\t<g id="places" stroke="${STYLE.placeStroke}" stroke-width="1">
${[...map.places]
	.sort((a, b) => b[1] - a[1])
	.map(([name, kind, x, y]) => {
		const fill = STYLE.place[kind] ?? STYLE.place[2];
		return `\t\t<circle cx="${x}" cy="${y}" r="${PLACE_RADIUS[kind] ?? PLACE_RADIUS[2]}" fill="${fill}" data-name="${xml(name)}" />`;
	})
	.join("\n")}
\t</g>
`
		: "";

	const areas = paths
		? `\t<g fill="${STYLE.fill}" fill-rule="evenodd" stroke="${STYLE.stroke}" stroke-opacity="${STYLE.strokeOpacity}" stroke-width="${STYLE.strokeWidth}" stroke-linejoin="round">
${paths}
\t</g>
`
		: "";

	const count = map.outline
		? `${map.places?.length ?? 0} settlements`
		: `${map.features.length} ${map.childLabel}`;
	const osm = map.places?.length
		? ` Settlements: ${/OpenStreetMap/i.test(map.placesSource ?? "") ? map.placesSource : `© OpenStreetMap contributors${map.placesSource ? ` (${map.placesSource})` : ""}`}. Licence: ${map.placesLicense ?? "ODbL 1.0"}.`
		: "";
	const credit = `${map.name} — ${count}. Source: ${map.source}. Licence: ${map.license}.${osm} Built with open-interactive-maps.`;

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${map.viewBox}" width="${map.width}" height="${map.height}" role="img" aria-label="Map of ${xml(map.name)}">
	<title>${xml(map.name)}</title>
	<desc>${xml(credit)}</desc>
${outline}${areas}${places}</svg>`;
}
