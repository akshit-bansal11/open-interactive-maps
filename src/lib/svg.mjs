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

/** Baked into every export, so a downloaded file looks like what was on screen. */
export const STYLE = {
	fill: "#efece5",
	highlight: "#2f6d6a",
	stroke: "#17191a",
	strokeOpacity: "0.25",
	strokeWidth: "1",
	background: "#ffffff",
};

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

	const credit = `${map.name} — ${map.features.length} ${map.childLabel}. Source: ${map.source}. Licence: ${map.license}. Built with open-interactive-maps.`;

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${map.viewBox}" width="${map.width}" height="${map.height}" role="img" aria-label="Map of ${xml(map.name)}">
	<title>${xml(map.name)}</title>
	<desc>${xml(credit)}</desc>
	<g fill="${STYLE.fill}" fill-rule="evenodd" stroke="${STYLE.stroke}" stroke-opacity="${STYLE.strokeOpacity}" stroke-width="${STYLE.strokeWidth}" stroke-linejoin="round">
${paths}
	</g>
</svg>`;
}
