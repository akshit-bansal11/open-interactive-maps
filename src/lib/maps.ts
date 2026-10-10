/**
 * Fetches the generated maps straight from the static host that publishes them.
 *
 * The browser does this itself rather than asking the app's server to: a map is
 * one CDN request away, and a pack, once fetched, answers for every map inside
 * it. Opening a district after its state costs nothing at all.
 */
import { fileOf, isPacked } from "@/lib/pack.mjs";
import type { MapFile } from "@/types/map";

/** Where `npm run data` output is served from. No trailing slash. */
export const DATA_URL =
	process.env.NEXT_PUBLIC_DATA_URL ??
	"https://akshit-bansal11.github.io/open-interactive-maps";

/** Every id segment the generator writes; anything else is not a map. */
const SEGMENT = /^[a-z0-9-]+$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const isMapFile = (value: unknown): value is MapFile =>
	isRecord(value) && typeof value.id === "string" && Array.isArray(value.features);

/** Files already asked for, by name. Null means the host has no such file. */
const files = new Map<string, Promise<unknown>>();

/** One published JSON file, fetched once however many callers want it. */
export function fetchFile(file: string): Promise<unknown> {
	const known = files.get(file);
	if (known) return known;

	const request = fetch(`${DATA_URL}/${file}.json`).then((response) => {
		if (response.status === 404) return null;
		if (!response.ok) {
			throw new Error(`${file}.json: HTTP ${response.status} from the data host`);
		}
		return response.json();
	});
	// A failure is not an answer: let the next caller try again.
	request.catch(() => files.delete(file));
	files.set(file, request);
	return request;
}

/** The id comes straight off the URL, so it is checked before it is requested. */
const isMapId = (id: string) => {
	const parts = id.split("/");
	return parts[0] === "world" && parts.every((part) => SEGMENT.test(part));
};

/** One map by id, or null when there is none. */
export async function loadMap(id: string): Promise<MapFile | null> {
	if (!isMapId(id)) return null;
	const file = await fetchFile(fileOf(id));
	const map = isPacked(id) ? (isRecord(file) ? file[id] : null) : file;
	return isMapFile(map) ? map : null;
}

/** Warms the cache for a map the pointer is resting on. */
export function prefetchMap(id: string) {
	if (isMapId(id)) fetchFile(fileOf(id)).catch(() => {});
}
