"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hrefOf } from "@/lib/route";
import { searchElsewhere } from "@/lib/search";
import { useMarked } from "@/lib/use-marked";
import type { MapFile, SearchRow } from "@/types/map";

/** A row in the list — either an area of this map, or a search hit elsewhere. */
export interface Row {
	id: string;
	name: string;
	note: string;
	/** The map opening this row leads to; null when it has none. */
	target: string | null;
	/** Set when `target` is the row's parent and the row should be lit there. */
	focus?: string;
}

const parentOf = (id: string) => id.split("/").slice(0, -1).join("/");

const localRows = (map: MapFile, needle: string): Row[] =>
	map.features
		.filter((feature) => !needle || feature.name.toLowerCase().includes(needle))
		.map((feature) => ({
			id: feature.id,
			name: feature.name,
			note:
				feature.children > 0
					? feature.children.toLocaleString()
					: feature.d
						? ""
						: "too small to draw",
			target: feature.children > 0 ? feature.id : null,
		}));

const remoteRows = (rows: SearchRow[]): Row[] =>
	rows.map(([name, id, parent, hasMap]) => ({
		id,
		name,
		note: parent,
		target: hasMap ? id : parentOf(id),
		focus: hasMap ? undefined : id,
	}));

interface ListProps {
	rows: Row[];
	onHover: (id: string | null) => void;
	onOpen: (row: Row) => void;
}

/** Memoised for the same reason the map's paths are: a hover changes one row. */
const Rows = memo(function Rows({ rows, onHover, onOpen }: ListProps) {
	return rows.map((row) => (
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
					<span>{row.name}</span>
					<span className="note">{row.note}</span>
				</a>
			) : (
				<button
					type="button"
					data-id={row.id}
					onPointerEnter={() => onHover(row.id)}
					onFocus={() => onHover(row.id)}
				>
					<span>{row.name}</span>
					<span className="note">{row.note}</span>
				</button>
			)}
		</li>
	));
});

interface Props {
	map: MapFile;
	active: string | null;
	onHover: (id: string | null) => void;
	onOpen: (row: Row) => void;
}

/** Mount with `key={map.id}`: a new map means a new list and an empty search. */
export function AreaPanel({ map, active, onHover, onOpen }: Props) {
	const listRef = useRef<HTMLUListElement>(null);
	const [query, setQuery] = useState("");
	const [elsewhere, setElsewhere] = useState<SearchRow[] | "failed" | null>(null);

	const needle = query.trim().toLowerCase();
	const local = useMemo(() => localRows(map, needle), [map, needle]);

	/**
	 * The search box is scoped to what is on screen. When that finds nothing it
	 * falls back to the rest of the country and the world's first-level areas, so
	 * looking up Bathinda from the map of India still gets you there.
	 */
	const nothingHere = needle.length >= 2 && local.length === 0;
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

	// The list follows the map: hovering an area brings its row into view.
	const reveal = useCallback(
		(element: Element) => element.scrollIntoView({ block: "nearest" }),
		[],
	);
	useMarked(listRef, active, reveal);

	const remote = useMemo(
		() => (Array.isArray(elsewhere) ? remoteRows(elsewhere) : []),
		[elsewhere],
	);
	const rows = nothingHere ? remote : local;

	const status = !nothingHere
		? needle
			? `${local.length.toLocaleString()} of ${map.features.length.toLocaleString()}`
			: ""
		: elsewhere === null
			? "Searching further afield…"
			: elsewhere === "failed"
				? "Search is unavailable right now."
				: elsewhere.length > 0
					? `Not on this map — ${elsewhere.length} elsewhere`
					: `Nothing called “${query.trim()}”.`;

	return (
		<>
			<label className="search">
				<span className="visually-hidden">Search areas</span>
				<input
					type="search"
					placeholder={`Search ${map.name}`}
					autoComplete="off"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Escape") setQuery("");
					}}
				/>
			</label>
			<p className="status" role="status" aria-live="polite">
				{status}
			</p>
			<ul className="areas" ref={listRef} onPointerLeave={() => onHover(null)}>
				<Rows rows={rows} onHover={onHover} onOpen={onOpen} />
			</ul>
		</>
	);
}
