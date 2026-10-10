/**
 * Which published file holds a map. The generator, its check and the browser all
 * have to agree on this, so it lives in one place.
 *
 * Maps down to a country get a file each. Below that they are packed, in two
 * tiers, because nearly a million areas as loose files is more than a static
 * host wants to publish:
 *
 *   world/asia/india/punjab            Punjab's map and its districts' maps
 *   world/asia/india/punjab/bathinda   every map below Bathinda — the
 *                                      sub-districts, whose areas are villages
 *
 * Two tiers rather than one keep a village-level pack to a district's worth of
 * villages instead of a state's.
 */

/** A country id is "world/<continent>/<country>". */
export const COUNTRY_DEPTH = 3;
const SHALLOW_DEPTH = 4;
const DEEP_DEPTH = 6;

/**
 * @param {string} id map id, e.g. "world/asia/india/punjab/bathinda"
 * @returns {string} id of the file that holds it, without the extension
 */
export function fileOf(id) {
	const parts = id.split("/");
	if (parts.length < SHALLOW_DEPTH) return id;
	return parts
		.slice(0, parts.length < DEEP_DEPTH ? SHALLOW_DEPTH : DEEP_DEPTH - 1)
		.join("/");
}

/**
 * Whether the file is a pack — an object of maps keyed by id — or one map.
 *
 * @param {string} id
 */
export const isPacked = (id) => id.split("/").length >= SHALLOW_DEPTH;
