import { fetchFile } from "@/lib/maps";
import { COUNTRY_DEPTH } from "@/lib/pack.mjs";
import type { PlaceKind, SearchRow } from "@/types/map";

/**
 * A search row, and — should the index ever say — the kind of settlement it is as
 * a fifth element. Today a place is told apart by its id alone (see `isPlaceId`).
 */
export type SearchHit = [...SearchRow, PlaceKind?];

/** A place row's id is "<map id>/~n<osm node id>"; see `placeId`. */
export const isPlaceId = (id: string) => /\/~n\d+$/.test(id);

/** How many hits the list shows; more than this is a query worth narrowing. */
const LIMIT = 40;

const isSearchRows = (value: unknown): value is SearchHit[] =>
	Array.isArray(value) && value.every((row) => Array.isArray(row) && row.length >= 4);

async function fetchRows(file: string): Promise<SearchHit[]> {
	const rows = await fetchFile(file);
	if (!isSearchRows(rows)) throw new Error(`${file}.json is not a search index`);
	return rows;
}

/**
 * Areas matching `needle` beyond the map on screen: the country the map belongs
 * to, down to its sub-districts, then the world down to first-level areas.
 * Villages are not indexed — there are most of a million of them — and are
 * found by searching the map of the sub-district they are in.
 */
export async function searchElsewhere(
	mapId: string,
	needle: string,
): Promise<SearchHit[]> {
	const parts = mapId.split("/");
	const files = ["search"];
	if (parts.length >= COUNTRY_DEPTH) {
		files.unshift(`${parts.slice(0, COUNTRY_DEPTH).join("/")}.search`);
	}

	const seen = new Set<string>();
	return (await Promise.all(files.map(fetchRows)))
		.flat()
		.filter(([name, id]) => {
			if (seen.has(id) || !name.toLowerCase().includes(needle)) return false;
			seen.add(id);
			return true;
		})
		.sort((a, b) => a[0].length - b[0].length)
		.slice(0, LIMIT);
}
