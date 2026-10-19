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
	/** Set when the region straddles the antimeridian and was re-centred. */
	lambda0?: number;
}

/** The world and continent tiers, centred on `lambda0`. */
export interface EqualEarthProjection extends ProjectionFit {
	kind: "equal-earth";
	lambda0: number;
}

export type MapProjection = EquirectangularProjection | EqualEarthProjection;

/** What kind of settlement a place is — OpenStreetMap's `place` tag. */
export type PlaceKind = 0 | 1 | 2; // 0 city, 1 town, 2 village

/**
 * A settlement from OpenStreetMap, projected into its map's canvas:
 * [name, kind, x, y, population (0 when untagged), OSM node id].
 */
export type Place = [string, PlaceKind, number, number, number, number];

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
	/**
	 * Settlements inside this map's region. Admin maps carry cities and towns;
	 * a settlement map (one with an `outline`) carries every city, town and
	 * village of one lowest-level area. Absent when there are none.
	 */
	places?: Place[];
	/**
	 * Set on a settlement map only: the area's own outline, drawn behind its
	 * places. A settlement map has `features: []` and `childLabel`
	 * "Settlements"; its `level` is the area's own level, e.g. "District".
	 */
	outline?: string;
	source: string;
	sourceUrl: string;
	license: string;
	/** Credit for the settlement layer, when the map has places. */
	placesSource?: string;
	placesLicense?: string;
}

export interface Country {
	id: string;
	name: string;
	iso3: string;
	areas: number;
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

/*
 * Places in search: a city or town row's id is "<map id>/~n<osm node id>" with
 * drillable 0, so the viewer opens "<map id>" (its parent) and lights the place,
 * whose SVG element carries data-id = that same id.
 */
export const placeId = (mapId: string, osmId: number) => `${mapId}/~n${osmId}`;
