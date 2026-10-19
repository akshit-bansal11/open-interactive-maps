"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PinIcon } from "@/components/Icons";
import { formatPopulation, KIND_NAMES, KIND_PLURALS } from "@/lib/places.mjs";
import { hrefOf } from "@/lib/route";
import { isPlaceId, type SearchHit, searchElsewhere } from "@/lib/search";
import { useMarked } from "@/lib/use-marked";
import { type MapFile, type PlaceKind, placeId } from "@/types/map";

/** An area of this map, or a search hit elsewhere. */
export interface Row {
	id: string;
	name: string;
	note: string;
	/** The map opening this row leads to; null when it has none. */
	target: string | null;
	/** Set when `target` is the row's parent and the row should be lit there. */
	focus?: string;
	/** A settlement, found by search elsewhere. */
	place?: boolean;
}

/** What the list holds: areas, places, and the headings that group places. */
type Item =
	| { type: "row"; row: Row }
	| { type: "place"; id: string; name: string; kind: PlaceKind; population: number }
	| { type: "group"; id: string; label: string; count: number };

type Tab = "areas" | "places";
type Sort = "kind" | "population" | "name";

const SORTS: { value: Sort; label: string }[] = [
	{ value: "kind", label: "By kind" },
	{ value: "population", label: "By population" },
	{ value: "name", label: "A to Z" },
];

const parentOf = (id: string) => id.split("/").slice(0, -1).join("/");

/** Lower-case and accent-free, so “sao paulo” finds “São Paulo”. */
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const localRows = (map: MapFile, folded: string[], needle: string): Row[] =>
	map.features.flatMap((feature, i) =>
		needle && !folded[i]?.includes(needle)
			? []
			: {
					id: feature.id,
					name: feature.name,
					note:
						feature.children > 0
							? feature.children.toLocaleString()
							: feature.d
								? ""
								: "too small to draw",
					target: feature.children > 0 ? feature.id : null,
				},
	);

const remoteRows = (rows: SearchHit[]): Row[] =>
	rows.map(([name, id, parent, hasMap]) => ({
		id,
		name,
		note: parent,
		target: hasMap ? id : parentOf(id),
		focus: hasMap ? undefined : id,
		place: isPlaceId(id),
	}));

/** The matching places, ordered and (by kind) grouped the way the reader chose. */
function placeItems(map: MapFile, folded: string[], needle: string, sort: Sort): Item[] {
	const found = (map.places ?? []).flatMap((place, i) =>
		needle && !folded[i]?.includes(needle)
			? []
			: {
					type: "place" as const,
					id: placeId(map.id, place[5]),
					name: place[0],
					kind: place[1],
					population: place[4],
				},
	);

	const byName = (a: { name: string }, b: { name: string }) =>
		a.name.localeCompare(b.name);
	const bySize = (a: { population: number }, b: { population: number }) =>
		b.population - a.population;

	if (sort === "name") return found.sort(byName);
	if (sort === "population") return found.sort((a, b) => bySize(a, b) || byName(a, b));

	return ([0, 1, 2] as const).flatMap((kind) => {
		const ofKind = found
			.filter((place) => place.kind === kind)
			.sort((a, b) => bySize(a, b) || byName(a, b));
		return ofKind.length
			? [
					{
						type: "group" as const,
						id: `group-${kind}`,
						label: KIND_PLURALS[kind] ?? "",
						count: ofKind.length,
					},
					...ofKind,
				]
			: [];
	});
}

interface ListProps {
	items: Item[];
	showKind: boolean;
	onHover: (id: string | null) => void;
	onOpen: (row: Row) => void;
	onSelect: (id: string) => void;
}

/** Memoised for the same reason the map's paths are: a hover changes one row. */
const Rows = memo(function Rows({
	items,
	showKind,
	onHover,
	onOpen,
	onSelect,
}: ListProps) {
	return items.map((item) => {
		if (item.type === "group") {
			return (
				<li key={item.id} className="group">
					<span>{item.label}</span>
					<span className="num">{item.count.toLocaleString()}</span>
				</li>
			);
		}

		if (item.type === "place") {
			return (
				<li key={item.id}>
					<button
						type="button"
						className="place-row"
						data-id={item.id}
						onPointerEnter={() => onHover(item.id)}
						onFocus={() => onHover(item.id)}
						onClick={() => onSelect(item.id)}
					>
						<span className="kind-dot" data-kind={item.kind} aria-hidden="true" />
						<span className="name">{item.name}</span>
						<span className="meta num">
							{item.population > 0
								? formatPopulation(item.population)
								: showKind
									? KIND_NAMES[item.kind]
									: ""}
						</span>
					</button>
				</li>
			);
		}

		const { row } = item;
		const label = (
			<>
				{row.place && <PinIcon className="pin" width={15} height={15} />}
				<span className="name">{row.name}</span>
				<span className="meta">{row.note}</span>
			</>
		);
		return (
			<li key={row.id}>
				{row.target ? (
					<a
						href={hrefOf(row.target)}
						data-id={row.id}
						onPointerEnter={() => onHover(row.id)}
						onFocus={() => onHover(row.id)}
						onClick={(event) => {
							// A modified click is the browser's: new tab, new window.
							if (event.metaKey || event.ctrlKey || event.shiftKey) return;
							event.preventDefault();
							onOpen(row);
						}}
					>
						{label}
					</a>
				) : (
					<button
						type="button"
						data-id={row.id}
						onPointerEnter={() => onHover(row.id)}
						onFocus={() => onHover(row.id)}
					>
						{label}
					</button>
				)}
			</li>
		);
	});
});

interface Props {
	map: MapFile;
	/** What the search box holds. */
	query: string;
	active: string | null;
	selected: string | null;
	onHover: (id: string | null) => void;
	onOpen: (row: Row) => void;
	onSelect: (id: string) => void;
}

/** Mount with `key={map.id}`: a new map means a new list. */
export function AreaPanel({
	map,
	query,
	active,
	selected,
	onHover,
	onOpen,
	onSelect,
}: Props) {
	const listRef = useRef<HTMLUListElement>(null);
	const hasAreas = map.features.length > 0;
	const hasPlaces = (map.places?.length ?? 0) > 0;
	// A settlement map has no areas to list; its places are the map.
	const [chosen, setTab] = useState<Tab>(hasAreas ? "areas" : "places");
	const [sort, setSort] = useState<Sort>("kind");
	const [elsewhere, setElsewhere] = useState<SearchHit[] | "failed" | null>(null);

	const needle = fold(query.trim());
	const folded = useMemo(
		() => ({
			areas: map.features.map((feature) => fold(feature.name)),
			places: (map.places ?? []).map((place) => fold(place[0])),
		}),
		[map],
	);
	const areas = useMemo(
		() => localRows(map, folded.areas, needle),
		[map, folded, needle],
	);
	const places = useMemo(
		() => placeItems(map, folded.places, needle, sort),
		[map, folded, needle, sort],
	);
	const placeCount = places.filter((item) => item.type === "place").length;

	// A search that finds nothing on the tab in view but something on the other
	// goes to the other, rather than leaving the reader looking at an empty list.
	const tab: Tab =
		needle && hasAreas && hasPlaces
			? chosen === "areas" && areas.length === 0 && placeCount > 0
				? "places"
				: chosen === "places" && placeCount === 0 && areas.length > 0
					? "areas"
					: chosen
			: hasAreas && !hasPlaces
				? "areas"
				: !hasAreas && hasPlaces
					? "places"
					: chosen;

	/**
	 * The search box is scoped to what is on screen. When that finds nothing it
	 * falls back to the rest of the country and the world's first-level areas, so
	 * looking up Bathinda from the map of India still gets you there.
	 */
	const nothingHere = needle.length >= 2 && areas.length === 0 && placeCount === 0;
	useEffect(() => {
		if (!nothingHere) return setElsewhere(null);
		let live = true;
		searchElsewhere(map.id, needle)
			.then((rows) => live && setElsewhere(rows))
			.catch((error: unknown) => {
				console.error(error);
				if (live) setElsewhere("failed");
			});
		return () => {
			live = false;
		};
	}, [map.id, needle, nothingHere]);

	const remote = useMemo(
		() => (Array.isArray(elsewhere) ? remoteRows(elsewhere) : []),
		[elsewhere],
	);

	const items = useMemo<Item[]>(
		() =>
			nothingHere
				? remote.map((row) => ({ type: "row", row }))
				: tab === "areas"
					? areas.map((row) => ({ type: "row", row }))
					: places,
		[nothingHere, remote, tab, areas, places],
	);

	// The list follows the map: hovering an area or a dot brings its row into view.
	const reveal = useCallback(
		(element: Element) => element.scrollIntoView({ block: "nearest" }),
		[],
	);
	useMarked(listRef, active, { onMark: reveal, version: items });
	useMarked(listRef, selected, { onMark: reveal, attribute: "data-sel", version: items });

	const status = !nothingHere
		? needle
			? [
					hasAreas &&
						`${areas.length.toLocaleString()} of ${map.features.length.toLocaleString()} areas`,
					hasPlaces &&
						`${placeCount.toLocaleString()} of ${(map.places?.length ?? 0).toLocaleString()} places`,
				]
					.filter(Boolean)
					.join(" · ")
			: ""
		: elsewhere === null
			? "Searching further afield…"
			: elsewhere === "failed"
				? "Search is unavailable right now."
				: elsewhere.length > 0
					? `Not on this map — ${elsewhere.length} elsewhere`
					: `Nothing called “${query.trim()}”.`;

	const tabs: { value: Tab; label: string; count: number }[] = [
		{
			value: "areas",
			label: map.childLabel,
			count: needle ? areas.length : map.features.length,
		},
		{
			value: "places",
			label: "Places",
			count: needle ? placeCount : (map.places?.length ?? 0),
		},
	];
	const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

	return (
		<>
			{hasAreas && hasPlaces && !nothingHere && (
				<div
					className="tabs"
					role="tablist"
					aria-label="What to list"
					onKeyDown={(event) => {
						if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
						const next = tab === "areas" ? "places" : "areas";
						setTab(next);
						document.getElementById(`tab-${next}`)?.focus();
					}}
				>
					{tabs.map(({ value, label: text, count }) => (
						<button
							key={value}
							id={`tab-${value}`}
							type="button"
							role="tab"
							aria-selected={tab === value}
							aria-controls="area-list"
							tabIndex={tab === value ? 0 : -1}
							onClick={() => setTab(value)}
						>
							{label(text)}
							<span className="count num">{count.toLocaleString()}</span>
						</button>
					))}
				</div>
			)}

			<div className="list-head">
				<p className="status" role="status" aria-live="polite">
					{status}
				</p>
				{tab === "places" && !nothingHere && placeCount > 1 && (
					<label className="sort">
						<span className="visually-hidden">Sort places</span>
						<select
							value={sort}
							onChange={(event) => setSort(event.target.value as Sort)}
						>
							{SORTS.map(({ value, label: text }) => (
								<option key={value} value={value}>
									{text}
								</option>
							))}
						</select>
					</label>
				)}
			</div>

			<div
				id="area-list"
				className="list-wrap"
				{...(hasAreas && hasPlaces
					? { role: "tabpanel", "aria-labelledby": `tab-${tab}` }
					: {})}
			>
				<ul
					className="areas"
					key={nothingHere ? "elsewhere" : tab}
					ref={listRef}
					onPointerLeave={() => onHover(null)}
				>
					<Rows
						items={items}
						showKind={sort !== "kind"}
						onHover={onHover}
						onOpen={onOpen}
						onSelect={onSelect}
					/>
				</ul>
			</div>
		</>
	);
}
