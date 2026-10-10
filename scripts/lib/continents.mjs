/**
 * The world and continent tiers that sit above the countries.
 *
 * Membership is derived from geoBoundaries' own metadata, so no country has to
 * be filed by hand. Its `Continent` field carries UN M49 regions rather than
 * continents — "Latin America and the Caribbean" and "Northern America" — so
 * the Americas are split on `UNSDG-subregion` instead: the South America
 * subregion is the continent, and everything else in either region is North
 * America.
 */

/** Drawing order is irrelevant; this is the order continents are listed in. */
export const CONTINENTS = [
	{ slug: "africa", name: "Africa" },
	{ slug: "asia", name: "Asia" },
	{ slug: "europe", name: "Europe" },
	{ slug: "north-america", name: "North America" },
	{ slug: "south-america", name: "South America" },
	{ slug: "oceania", name: "Oceania" },
	{ slug: "antarctica", name: "Antarctica" },
];

/** geoBoundaries `Continent` → slug. Antarctica is the one "Undefined" entry. */
const REGIONS = {
	Africa: "africa",
	Asia: "asia",
	Europe: "europe",
	"Northern America": "north-america",
	Oceania: "oceania",
	Undefined: "antarctica",
};

/**
 * Where the metadata gives the wrong answer.
 *
 * Russia is filed under Europe, but roughly three quarters of its land is east
 * of the Urals, and it is the only European member whose outline spans -180 to
 * 180 — left in Europe it stretches that map from Iceland to Kamchatka and
 * squeezes the rest of the continent into a third of the canvas. Asia already
 * reaches the antimeridian, so it costs nothing there.
 */
const ISO_CONTINENTS = { RUS: "asia" };

/**
 * @param {string} slug
 * @returns {string}
 */
export function continentName(slug) {
	const found = CONTINENTS.find((continent) => continent.slug === slug);
	if (!found) throw new Error(`unknown continent ${slug}`);
	return found.name;
}

/**
 * @param {string} iso
 * @param {string | undefined} region geoBoundaries `Continent`
 * @param {string | undefined} subregion geoBoundaries `UNSDG-subregion`
 * @returns {string | null} continent slug, or null when nothing places it
 */
export function continentOf(iso, region, subregion) {
	if (ISO_CONTINENTS[iso]) return ISO_CONTINENTS[iso];
	if (region === "Latin America and the Caribbean") {
		return subregion === "South America" ? "south-america" : "north-america";
	}
	return REGIONS[region ?? ""] ?? null;
}
