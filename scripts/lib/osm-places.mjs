/**
 * Fetches cities, towns and villages from OpenStreetMap through the Overpass
 * API, one country at a time, and parses them.
 *
 * Everything that touches the network takes its `fetch` and `sleep` as options,
 * so the retry and fallback logic can be tested without one. Nothing here knows
 * about maps: it deals in plain `{ osm, name, kind, lat, lng, pop }` points,
 * and scripts/lib/places.mjs files them into the admin hierarchy.
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { bbox } from "./geo.mjs";

/** OpenStreetMap's `place` tag → the `PlaceKind` the map files carry. */
export const KIND = new Map([
	["city", 0],
	["town", 1],
	["village", 2],
]);

/** Every kind of settlement, and the two that go on a map above the village level. */
export const ALL_KINDS = ["city", "town", "village"];
export const NOTABLE_KINDS = ["city", "town"];

/**
 * Public Overpass instances, tried in rotation. The main one is the busiest and
 * the one most likely to answer 429 or 504 in the middle of a thousand requests.
 */
export const ENDPOINTS = [
	"https://overpass-api.de/api/interpreter",
	"https://overpass.kumi.systems/api/interpreter",
	"https://overpass.private.coffee/api/interpreter",
];

/** The server gives a query 900 s; the client waits a little longer than that. */
const CLIENT_TIMEOUT_MS = 960_000;

/** Overpass asks for a pause between requests; this is the one between countries. */
const POLITE_DELAY_MS = 1000;

/** A cached download is reused for this long. */
const MAX_AGE_DAYS = 25;

const DAY_MS = 86_400_000;

/**
 * Tab-separated, with a header row, and a generous time and size budget: a big
 * country is a big answer. `name:en` is requested and not used — the display
 * name is the local `name`, the way geoBoundaries' names are shown as published.
 */
const PREAMBLE =
	'[out:csv(::id,::lat,::lon,name,"name:en",place,population;true;"\\t")][timeout:900][maxsize:2000000000];';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const filterOf = (kinds) => `[place~"^(${kinds.join("|")})$"][name]`;

/**
 * Every named place of the given kinds inside a country's OpenStreetMap
 * boundary relation, found by its ISO 3166-1 alpha-3 tag.
 */
export function areaQuery(iso3, kinds = ALL_KINDS) {
	// The code goes into a query; hold it to what a code can be.
	if (!/^[A-Z]{3}$/.test(iso3))
		throw new Error(`not an ISO 3166-1 alpha-3 code: ${iso3}`);
	return `${PREAMBLE}area["ISO3166-1:alpha3"="${iso3}"]["admin_level"="2"]->.a;node(area.a)${filterOf(kinds)};out;`;
}

/** The same places over one or more bounding boxes, each `[west, south, east, north]`. */
export function bboxQuery(boxes, kinds = ALL_KINDS) {
	const parts = boxes.map(
		([west, south, east, north]) =>
			`node(${south},${west},${north},${east})${filterOf(kinds)};`,
	);
	return `${PREAMBLE}(${parts.join("")});out;`;
}

/**
 * Boxes covering a country, for when its relation carries no alpha-3 tag.
 *
 * A country straddling the antimeridian — Russia, Fiji, the United States by way
 * of the Aleutians — has a bbox spanning the globe in raw longitude, and a
 * query over that would fetch half the planet. Its east-west span is over 180°,
 * so it is cut in two instead: from its westernmost eastern-hemisphere vertex to
 * +180, and from -180 to its easternmost western-hemisphere one.
 *
 * @param {number[][][]} rings lng/lat rings
 * @returns {number[][]} `[west, south, east, north]` boxes
 */
export function bboxPieces(rings) {
	const [west, south, east, north] = bbox(rings);
	if (!Number.isFinite(west)) return [];
	if (east - west <= 180) return [[west, south, east, north]];

	let minEast = Infinity;
	let maxWest = -Infinity;
	for (const ring of rings) {
		for (const [lng] of ring) {
			if (lng >= 0) minEast = Math.min(minEast, lng);
			else maxWest = Math.max(maxWest, lng);
		}
	}
	return [
		[minEast, south, 180, north],
		[-180, south, maxWest, north],
	];
}

/**
 * OpenStreetMap's `population` is free text: "12345", "12,345", "approx 5000",
 * "1.234.567", sometimes "5000 (2011)". Takes the first number in it, reading
 * a thousands separator as one only when exactly three digits follow it.
 * Anything else is 0, which is how a map file says "unknown".
 */
export function parsePopulation(text) {
	const match = /\d{1,3}(?:[,.]\d{3})+|\d+/.exec(text ?? "");
	if (!match) return 0;
	const value = Number(match[0].replace(/[,.]/g, ""));
	return Number.isSafeInteger(value) ? value : 0;
}

const numberOf = (text) => (text.trim() === "" ? Number.NaN : Number(text));

/**
 * Parses Overpass CSV (tab-separated) into places. Tolerant by design: a row
 * that is short, unnamed, of an unknown kind or off the globe is skipped rather
 * than failing the country, and a node listed twice — the two halves of a
 * bounding-box query can overlap — is kept once. The header row falls out of
 * the same check, since "@id" is not a positive integer.
 *
 * @param {string} text
 * @returns {{ osm: number, name: string, kind: number, lat: number, lng: number, pop: number }[]}
 */
export function parsePlaces(text) {
	const seen = new Set();
	const places = [];

	for (const line of text.split("\n")) {
		const cols = line.replace(/\r$/, "").split("\t");
		if (cols.length < 6) continue;

		const osm = numberOf(cols[0]);
		const lat = numberOf(cols[1]);
		const lng = numberOf(cols[2]);
		const name = cols[3].trim();
		const kind = KIND.get(cols[5].trim());
		if (!Number.isSafeInteger(osm) || osm <= 0 || seen.has(osm)) continue;
		if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) continue;
		if (!name || kind === undefined) continue;

		seen.add(osm);
		places.push({ osm, name, kind, lat, lng, pop: parsePopulation(cols[6]) });
	}
	return places;
}

/**
 * POSTs a query, rotating through the endpoints and backing off between
 * attempts. A 200 that is really an error — Overpass reports a timeout or an
 * out-of-memory as XML in the body — counts as a failure too.
 *
 * @param {string} query
 * @param {{ agent: string, fetchFn?: typeof fetch, sleepFn?: (ms: number) => Promise<void>, endpoints?: string[], attempts?: number }} options
 * @returns {Promise<string>} the response body
 */
export async function fetchOverpass(
	query,
	{ agent, fetchFn = fetch, sleepFn = sleep, endpoints = ENDPOINTS, attempts = 6 },
) {
	let failure;
	for (let attempt = 0; attempt < attempts; attempt++) {
		const endpoint = endpoints[attempt % endpoints.length];
		try {
			const response = await fetchFn(endpoint, {
				method: "POST",
				headers: {
					"User-Agent": agent,
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({ data: query }).toString(),
				signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
			});
			if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);

			const text = await response.text();
			if (/^\s*</.test(text) || text.trim() === "") {
				const remark = text
					.replace(/<[^>]*>/g, " ")
					.replace(/\s+/g, " ")
					.trim();
				throw new Error(`${endpoint}: ${remark.slice(0, 200) || "empty response"}`);
			}
			return text;
		} catch (error) {
			failure = error;
			await sleepFn((attempt + 1) * 5000);
		}
	}
	throw failure;
}

/** The date a file was written, as the day it was fetched. */
const dayOf = (file) => statSync(file).mtime.toISOString().slice(0, 10);

/**
 * A country's settlements of the given kinds, from the cache when it is younger
 * than 25 days and from Overpass otherwise.
 *
 * The country's boundary relation is asked for first. When that returns nothing
 * — a territory whose relation lacks the alpha-3 tag, such as Kosovo — the
 * country's own bounding box is asked for instead, and the caller's
 * point-in-polygon filing drops whatever lies outside the border.
 *
 * A refresh that fails falls back on an older cache file when there is one: a
 * month-old list of cities is better than none.
 *
 * Leaves the cache as `<iso3>-places.tsv`, or `<iso3>-places-notable.tsv` when
 * villages were not asked for, so a download of one kind is never mistaken for
 * the other.
 *
 * @param {object} options
 * @param {string} options.iso3
 * @param {number[][][]} options.rings the country's outline, for the bbox fallback
 * @param {string[]} [options.kinds]
 * @param {string} options.agent User-Agent to identify the build with
 * @param {string} [options.cache]
 * @param {(message: string) => void} [options.log]
 * @returns {Promise<{ places: ReturnType<typeof parsePlaces>, fetched: string }>}
 *   `fetched` is the day the data was downloaded, `YYYY-MM-DD`
 */
export async function loadPlaces({
	iso3,
	rings,
	kinds = ALL_KINDS,
	agent,
	cache = ".cache",
	log = () => {},
	fetchFn = fetch,
	sleepFn = sleep,
	now = Date.now(),
	maxAgeDays = MAX_AGE_DAYS,
	delayMs = POLITE_DELAY_MS,
}) {
	const notable = kinds.length < ALL_KINDS.length;
	const file = join(cache, `${iso3}-places${notable ? "-notable" : ""}.tsv`);
	const options = { agent, fetchFn, sleepFn };

	let text;
	if (existsSync(file) && now - statSync(file).mtimeMs < maxAgeDays * DAY_MS) {
		text = readFileSync(file, "utf8");
	} else {
		log(`fetching ${iso3} places from Overpass …`);
		try {
			text = await fetchOverpass(areaQuery(iso3, kinds), options);
			if (parsePlaces(text).length === 0) {
				const boxes = bboxPieces(rings);
				if (boxes.length > 0) {
					log(`no OpenStreetMap relation for ${iso3}; querying its bounding box`);
					text = await fetchOverpass(bboxQuery(boxes, kinds), options);
				}
			}
			mkdirSync(cache, { recursive: true });
			// Written whole or not at all: a half-written file would look fresh.
			writeFileSync(`${file}.tmp`, text);
			renameSync(`${file}.tmp`, file);
		} catch (error) {
			if (!existsSync(file)) throw error;
			log(`refresh failed (${error.message}); using the older download`);
			text = readFileSync(file, "utf8");
		} finally {
			await sleepFn(delayMs);
		}
	}

	// A cache written for more kinds than are wanted now is filtered, not re-fetched.
	const wanted = new Set(kinds.map((kind) => KIND.get(kind)));
	const places = parsePlaces(text).filter((place) => wanted.has(place.kind));
	return { places, fetched: dayOf(file) };
}
