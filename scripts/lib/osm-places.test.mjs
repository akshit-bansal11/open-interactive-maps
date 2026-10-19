import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	areaQuery,
	bboxPieces,
	bboxQuery,
	fetchOverpass,
	loadPlaces,
	NOTABLE_KINDS,
	parsePlaces,
	parsePopulation,
} from "./osm-places.mjs";

const HEADER = "@id\t@lat\t@lon\tname\tname:en\tplace\tpopulation\n";
const row = (id, lat, lng, name, place, population = "") =>
	`${id}\t${lat}\t${lng}\t${name}\t\t${place}\t${population}\n`;

test("population is read from whatever OpenStreetMap was given", () => {
	assert.equal(parsePopulation("12345"), 12345);
	assert.equal(parsePopulation("12,345"), 12345);
	assert.equal(parsePopulation("1.234.567"), 1234567);
	assert.equal(parsePopulation("approx 5000"), 5000);
	assert.equal(parsePopulation("5000 (2011)"), 5000);
	assert.equal(parsePopulation("12.5"), 12);
	assert.equal(parsePopulation(""), 0);
	assert.equal(parsePopulation(undefined), 0);
	assert.equal(parsePopulation("many"), 0);
});

test("CSV rows become places, and bad ones are skipped", () => {
	const text =
		HEADER +
		row(1, 30.9, 75.85, "Ludhiana", "city", "1,618,879") +
		row(2, 30.2, 75.1, "Talwandi Sabo", "town") +
		row(3, 30.1, 75.2, "Some Village", "village", "approx 800") +
		row(4, 30, 75, "", "village") + // unnamed
		row(5, 30, 75, "Hamlet", "hamlet") + // not a kind we want
		row(6, "", 75, "No Latitude", "town") + // empty is not zero
		row(7, 95, 75, "Off The Globe", "town") +
		row(8, 12, 13, "Fine", "town").replace("\t\t", "\t\t") +
		row(1, 30.9, 75.85, "Ludhiana", "city") + // seen twice
		"short\tline\n";

	assert.deepEqual(
		parsePlaces(text).map(({ osm, name, kind, pop }) => [osm, name, kind, pop]),
		[
			[1, "Ludhiana", 0, 1618879],
			[2, "Talwandi Sabo", 1, 0],
			[3, "Some Village", 2, 800],
			[8, "Fine", 1, 0],
		],
	);
});

test("a row that stops before the population column still parses", () => {
	const [place] = parsePlaces("9\t1.5\t2.5\tName\tEn\tcity\r\n");
	assert.deepEqual(place, { osm: 9, name: "Name", kind: 0, lat: 1.5, lng: 2.5, pop: 0 });
});

test("queries ask for the right country, kinds and boxes", () => {
	const area = areaQuery("IND");
	assert.match(
		area,
		/^\[out:csv\(::id,::lat,::lon,name,"name:en",place,population;true;"\\t"\)\]/,
	);
	assert.match(area, /\[timeout:900\]\[maxsize:2000000000\]/);
	assert.match(area, /area\["ISO3166-1:alpha3"="IND"\]\["admin_level"="2"\]->\.a;/);
	assert.match(
		area,
		/node\(area\.a\)\[place~"\^\(city\|town\|village\)\$"\]\[name\];out;$/,
	);
	assert.match(areaQuery("FRA", NOTABLE_KINDS), /\^\(city\|town\)\$/);
	assert.throws(() => areaQuery('IND"];out;'), /alpha-3/);

	// Overpass boxes are south, west, north, east.
	assert.match(bboxQuery([[1, 2, 3, 4]]), /\(node\(2,1,4,3\)\[place~/);
});

test("a country across the antimeridian is queried in two pieces", () => {
	const ring = (...lngs) => [...lngs, lngs[0]].map((lng, i) => [lng, i % 2 ? 60 : 40]);
	assert.deepEqual(bboxPieces([ring(10, 20, 20, 10)]), [[10, 40, 20, 60]]);

	// Russia in miniature: 19°E eastward past 180°, then on to 170°W.
	assert.deepEqual(bboxPieces([ring(19, 180, 180, 19), ring(-180, -170, -170, -180)]), [
		[19, 40, 180, 60],
		[-180, 40, -170, 60],
	]);
	assert.deepEqual(bboxPieces([]), []);
});

/** A fetch that answers from a script, recording where each request went. */
function fakeFetch(...answers) {
	const calls = [];
	const fn = async (url, init) => {
		calls.push({ url, body: new URLSearchParams(init.body).get("data"), init });
		const answer = answers.shift();
		if (answer instanceof Error) throw answer;
		return {
			ok: answer.status === undefined || answer.status === 200,
			status: answer.status ?? 200,
			text: async () => answer.text ?? "",
		};
	};
	return { fn, calls };
}

const noSleep = async () => {};

test("a failing endpoint is rotated away from, and an error body counts as one", async () => {
	const { fn, calls } = fakeFetch(
		{ status: 429 },
		{ text: "<?xml?><remark> runtime error: Query timed out </remark>" },
		new Error("socket hang up"),
		{ text: HEADER + row(1, 1, 1, "A", "city") },
	);
	const text = await fetchOverpass("QUERY", {
		agent: "test agent",
		fetchFn: fn,
		sleepFn: noSleep,
		endpoints: ["https://a/", "https://b/", "https://c/"],
	});
	assert.match(text, /\n1\t1\t1\tA\t/);
	assert.deepEqual(
		calls.map((call) => call.url),
		["https://a/", "https://b/", "https://c/", "https://a/"],
	);
	assert.equal(calls[0].body, "QUERY");
	assert.equal(calls[0].init.method, "POST");
	assert.equal(calls[0].init.headers["User-Agent"], "test agent");
});

test("it gives up with the last error once the attempts are spent", async () => {
	const { fn, calls } = fakeFetch({ status: 504 }, { status: 504 });
	await assert.rejects(
		fetchOverpass("Q", { agent: "a", fetchFn: fn, sleepFn: noSleep, attempts: 2 }),
		/HTTP 504/,
	);
	assert.equal(calls.length, 2);
});

/** A cache directory holding whatever files are given, `[name, text, ageInDays]`. */
function cacheWith(...files) {
	const dir = mkdtempSync(join(tmpdir(), "places-"));
	mkdirSync(dir, { recursive: true });
	for (const [name, text, age] of files) {
		const file = join(dir, name);
		writeFileSync(file, text);
		const when = new Date(Date.now() - age * 86_400_000);
		utimesSync(file, when, when);
	}
	return dir;
}

const square = [
	[
		[170, 0],
		[175, 0],
		[175, 5],
		[170, 5],
		[170, 0],
	],
];
const options = (cache, fetchFn) => ({
	iso3: "XKX",
	rings: square,
	agent: "a",
	cache,
	fetchFn,
	sleepFn: noSleep,
});

test("a fresh cache is used as it is", async () => {
	const cache = cacheWith(["XKX-places.tsv", HEADER + row(1, 1, 1, "A", "city"), 3]);
	const { fn, calls } = fakeFetch();
	const { places, fetched } = await loadPlaces(options(cache, fn));
	assert.equal(calls.length, 0);
	assert.deepEqual(
		places.map((p) => p.name),
		["A"],
	);
	assert.match(fetched, /^\d{4}-\d{2}-\d{2}$/);
});

test("an old cache is refreshed, and an empty answer falls back on the bbox", async () => {
	const cache = cacheWith(["XKX-places.tsv", HEADER + row(1, 1, 1, "Stale", "city"), 40]);
	const { fn, calls } = fakeFetch(
		{ text: HEADER },
		{
			text:
				HEADER + row(2, 2, 172, "Pristina", "city") + row(3, 3, 173, "Prizren", "town"),
		},
	);
	const { places } = await loadPlaces(options(cache, fn));
	assert.equal(calls.length, 2);
	assert.match(calls[0].body, /area\["ISO3166-1:alpha3"="XKX"\]/);
	assert.match(calls[1].body, /node\(0,170,5,175\)/);
	assert.deepEqual(
		places.map((p) => p.name),
		["Pristina", "Prizren"],
	);

	// And what was fetched is what the next run reads.
	const again = fakeFetch();
	const second = await loadPlaces(options(cache, again.fn));
	assert.equal(again.calls.length, 0);
	assert.equal(second.places.length, 2);
});

test("a failed refresh uses the old download; with none, it throws", async () => {
	const cache = cacheWith(["XKX-places.tsv", HEADER + row(1, 1, 1, "Stale", "city"), 40]);
	const messages = [];
	const { fn } = fakeFetch(...Array(6).fill({ status: 503 }));
	const { places } = await loadPlaces({
		...options(cache, fn),
		log: (message) => messages.push(message),
	});
	assert.deepEqual(
		places.map((p) => p.name),
		["Stale"],
	);
	assert.ok(messages.some((message) => /refresh failed/.test(message)));

	const empty = cacheWith();
	await assert.rejects(
		loadPlaces(options(empty, fakeFetch(...Array(6).fill({ status: 503 })).fn)),
		/HTTP 503/,
	);
});

test("villages are left out of the notable download, which is cached apart", async () => {
	const cache = cacheWith([
		"XKX-places.tsv",
		HEADER + row(1, 1, 1, "Hamlet", "village"),
		1,
	]);
	const { fn, calls } = fakeFetch({
		text: HEADER + row(2, 2, 2, "Town", "town") + row(3, 3, 3, "Hamlet", "village"),
	});
	const { places } = await loadPlaces({ ...options(cache, fn), kinds: NOTABLE_KINDS });
	assert.equal(calls.length, 1);
	assert.deepEqual(
		places.map((p) => p.name),
		["Town"],
	);
});
