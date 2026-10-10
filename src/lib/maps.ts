/**
 * Reads the generated maps from wherever the data build published them.
 *
 * The maps are far too many to ship inside the app — a quarter of a million of
 * them — so they live on a static host and each page fetches the one it draws.
 */
import { cache } from "react";
import type { MapFile, MapIndex } from "@/types/map";

/** Where `npm run data` output is served from. No trailing slash. */
export const DATA_URL =
	process.env.NEXT_PUBLIC_DATA_URL ??
	"https://akshit-bansal11.github.io/open-interactive-maps";

/**
 * Maps this many segments deep or deeper are published together, one file per
 * first-level area. Mirrors PACK_DEPTH in scripts/build-maps.mjs.
 */
const PACK_DEPTH = 4;

/** The data only changes when the build is re-run, which is rare. */
const REVALIDATE = 86_400;

/** Every id segment the generator writes; anything else is not a map. */
const SEGMENT = /^[a-z0-9-]+$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const isMapFile = (value: unknown): value is MapFile =>
	isRecord(value) && typeof value.id === "string" && Array.isArray(value.features);

const isMapIndex = (value: unknown): value is MapIndex =>
	isRecord(value) && Array.isArray(value.countries) && Array.isArray(value.continents);

/** The parsed file, or null when the host has no such file. */
async function fetchJson(file: string): Promise<unknown> {
	const response = await fetch(`${DATA_URL}/${file}.json`, {
		next: { revalidate: REVALIDATE },
	});
	if (response.status === 404) return null;
	if (!response.ok) {
		throw new Error(`${file}.json: HTTP ${response.status} from the data host`);
	}
	return response.json();
}

/**
 * One map by id, or null when there is none. The segments come straight off the
 * URL, so they are checked before they are allowed into a request path.
 */
export const readMap = cache(async (id: string): Promise<MapFile | null> => {
	const parts = id.split("/");
	if (parts[0] !== "world" || !parts.every((part) => SEGMENT.test(part))) {
		return null;
	}

	if (parts.length < PACK_DEPTH) {
		const map = await fetchJson(id);
		return isMapFile(map) ? map : null;
	}

	const pack = await fetchJson(parts.slice(0, PACK_DEPTH).join("/"));
	const map = isRecord(pack) ? pack[id] : null;
	return isMapFile(map) ? map : null;
});

export const readIndex = cache(async (): Promise<MapIndex> => {
	const index = await fetchJson("index");
	if (!isMapIndex(index)) throw new Error("index.json is missing or malformed");
	return index;
});
