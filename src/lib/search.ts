import { DATA_URL } from "@/lib/data-url";
import type { SearchRow } from "@/types/map";

/** How many hits the list shows; more than this is a query worth narrowing. */
const LIMIT = 30;

/** A country id is "world/<continent>/<country>". */
const COUNTRY_DEPTH = 3;

const isSearchRows = (value: unknown): value is SearchRow[] =>
	Array.isArray(value) && value.every((row) => Array.isArray(row) && row.length === 4);

async function fetchRows(file: string): Promise<SearchRow[]> {
	const response = await fetch(`${DATA_URL}/${file}.json`);
	if (!response.ok) throw new Error(`${file}.json: HTTP ${response.status}`);
	const rows: unknown = await response.json();
	if (!isSearchRows(rows)) throw new Error(`${file}.json is not a search index`);
	return rows;
}

/**
 * Areas matching `needle` beyond the map on screen: everything in the country
 * the map belongs to, then the world down to first-level areas. The world's
 * full index is a quarter of a million rows, which is why it is not one file.
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
