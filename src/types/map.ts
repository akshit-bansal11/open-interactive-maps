/** Shapes written by scripts/build-maps.mjs into data/. */

/** One clickable area on a map. `d` is empty when it is sub-pixel at this zoom. */
export interface MapFeature {
	/** Full path id, e.g. "world/asia/india/punjab" — also the route. */
	id: string;
	name: string;
	d: string;
	/** How many areas its own map holds; 0 means there is no map to drill into. */
	children: number;
}

interface ProjectionFit {
	scale: number;
	offsetX: number;
	offsetY: number;
}

/** Country scale and below: x corrected by the region's centre latitude. */
export interface EquirectangularProjection extends ProjectionFit {
	kind: "equirectangular";
	cosLat: number;
}

/** The world and continent tiers, centred on `lambda0`. */
export interface EqualEarthProjection extends ProjectionFit {
	kind: "equal-earth";
	lambda0: number;
}

export type MapProjection = EquirectangularProjection | EqualEarthProjection;

export interface MapFile {
	id: string;
	name: string;
	/** What this area is — "Country", "State / Union Territory", "District". */
	level: string;
	/** What its children are, for the list heading. */
	childLabel: string;
	parents: { id: string; name: string }[];
	width: number;
	height: number;
	viewBox: string;
	projection: MapProjection;
	features: MapFeature[];
	source: string;
	sourceUrl: string;
	license: string;
}

export interface Country {
	id: string;
	name: string;
	iso3: string;
	areas: number;
	thumb: { d: string; viewBox: string };
}

/** A continent as the index lists it — the map itself holds the geometry. */
export interface ContinentSummary {
	id: string;
	name: string;
	countries: number;
}

export interface MapIndex {
	countries: Country[];
	continents: ContinentSummary[];
	/** Countries whose build failed, as "ISO3: reason". They stay undrillable. */
	failed: string[];
	builtAt: string;
}

/**
 * One row of a search index: name, id, parent name, has its own map.
 * `search.json` covers the world down to first-level areas; each country's
 * `<id>.search.json` covers everything inside it.
 */
export type SearchRow = [string, string, string, 0 | 1];
