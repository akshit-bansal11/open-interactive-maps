import { fetchFile } from "@/lib/maps";
import { COUNTRY_DEPTH } from "@/lib/pack.mjs";
import type { SearchRow } from "@/types/map";

/** How many hits the list shows; more than this is a query worth narrowing. */
const LIMIT = 40;

const isSearchRows = (value: unknown): value is SearchRow[] =>
	Array.isArray(value) && value.every((row) => Array.isArray(row) && row.length === 4);

async function fetchRows(file: string): Promise<SearchRow[]> {
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
): Promise<SearchRow[]> {
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
