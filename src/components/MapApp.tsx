"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AreaPanel, type Row } from "@/components/AreaPanel";
import { Attribution } from "@/components/Attribution";
import { ExportMenu } from "@/components/ExportMenu";
import { GlobeCanvas } from "@/components/GlobeCanvas";
import {
	CloseIcon,
	GithubIcon,
	PanelIcon,
	SearchIcon,
	WarningIcon,
} from "@/components/Icons";
import { Ladder } from "@/components/Ladder";
import { Logo } from "@/components/Logo";
import { MapCanvas } from "@/components/MapCanvas";
import { PlaceCard } from "@/components/PlaceCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { loadMap, prefetchMap } from "@/lib/maps";
import { KIND_NAMES, KIND_PLURALS } from "@/lib/places.mjs";
import { follow, navigate, useMapId } from "@/lib/route";
import { isPlaceId } from "@/lib/search";
import { type MapFeature, type MapFile, placeId } from "@/types/map";

const SITE = "Open Interactive Maps";
const REPO = "https://github.com/akshit-bansal11/open-interactive-maps";

/** How long the pointer rests on an area before its map is fetched ahead. */
const PREFETCH_DELAY = 90;

type Load =
	| { state: "loading" }
	| { state: "missing" }
	| { state: "failed" }
	| { state: "ready"; map: MapFile };

/** "36 states · 1,204 towns": what is on this map, in one line. */
function statsOf(map: MapFile) {
	const counts = [0, 0, 0];
	for (const place of map.places ?? []) counts[place[1]] = (counts[place[1]] ?? 0) + 1;
	return [
		map.features.length > 0 &&
			`${map.features.length.toLocaleString()} ${map.childLabel.toLowerCase()}`,
		...counts.map(
			(count, kind) =>
				count > 0 &&
				`${count.toLocaleString()} ${(count === 1 ? KIND_NAMES : KIND_PLURALS)[kind]?.toLowerCase()}`,
		),
	]
		.filter(Boolean)
		.join(" · ");
}

const isMobile = () => window.matchMedia("(max-width: 820px)").matches;

export function MapApp() {
	const id = useMapId();
	const [load, setLoad] = useState<Load>({ state: "loading" });
	const [busy, setBusy] = useState(true);
	const [active, setActive] = useState<string | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	// The panel is a side card on a wide screen and a bottom sheet on a narrow
	// one; each remembers its own state, and the stylesheet picks which applies.
	const [panelOpen, setPanelOpen] = useState(true);
	const [sheetOpen, setSheetOpen] = useState(false);
	const searchRef = useRef<HTMLInputElement>(null);

	// The map last drawn stays up while the next one loads, so a click never
	// blanks the screen.
	const show = useCallback((mapId: string) => {
		let live = true;
		setBusy(true);
		loadMap(mapId)
			.then((map) => {
				if (!live) return;
				setBusy(false);
				setLoad(map ? { state: "ready", map } : { state: "missing" });
				setQuery("");

				// A search hit with no map of its own lands on its parent, lit.
				let focus: string | null = null;
				try {
					focus = sessionStorage.getItem("focus");
					sessionStorage.removeItem("focus");
				} catch {
					// Storage blocked: the hit still lands on the right map, just unlit.
				}
				const found =
					focus !== null &&
					map !== null &&
					(map.features.some((feature) => feature.id === focus) ||
						(map.places ?? []).some((place) => placeId(map.id, place[5]) === focus));
				setActive(found ? focus : null);
				setSelected(found && focus && isPlaceId(focus) ? focus : null);
			})
			.catch((error: unknown) => {
				console.error(error);
				if (!live) return;
				setBusy(false);
				setLoad({ state: "failed" });
			});
		return () => {
			live = false;
		};
	}, []);

	useEffect(() => show(id), [id, show]);

	const map = load.state === "ready" ? load.map : null;
	const isGlobe = map?.id === "world" && map.projection.kind === "equal-earth";

	useEffect(() => {
		document.title = map && map.id !== "world" ? `${map.name} — ${SITE}` : SITE;
	}, [map]);

	// Resting on an area fetches its map, so the click that follows is instant.
	useEffect(() => {
		if (!active) return;
		const timer = setTimeout(() => prefetchMap(active), PREFETCH_DELAY);
		return () => clearTimeout(timer);
	}, [active]);

	// "/" jumps to the search box; Escape lets go of a selected place.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") return setSelected(null);
			const typing =
				event.target instanceof HTMLElement &&
				(event.target.isContentEditable ||
					["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName));
			if (event.key !== "/" || typing || event.metaKey || event.ctrlKey) return;
			event.preventDefault();
			searchRef.current?.focus();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const openFeature = useCallback((feature: MapFeature) => {
		if (feature.children > 0) navigate(feature.id);
		else setActive(feature.id);
	}, []);

	const openRow = useCallback((row: Row) => {
		if (!row.target) return;
		try {
			if (row.focus) sessionStorage.setItem("focus", row.focus);
		} catch {
			// Storage blocked: the map opens, the place is just not lit.
		}
		navigate(row.target);
	}, []);

	const place = useMemo(
		() =>
			selected && map
				? map.places?.find((candidate) => placeId(map.id, candidate[5]) === selected)
				: undefined,
		[map, selected],
	);
	const stats = useMemo(() => (map ? statsOf(map) : ""), [map]);

	const togglePanel = () => (isMobile() ? setSheetOpen : setPanelOpen)((open) => !open);

	return (
		<div
			className="app"
			data-panel={panelOpen ? "open" : "closed"}
			data-sheet={sheetOpen ? "open" : "closed"}
		>
			<a className="skip" href="#main">
				Skip to the map
			</a>

			<div className="progress" data-busy={busy} aria-hidden="true" />
			<p className="visually-hidden" role="status">
				{busy ? "Loading the map…" : ""}
			</p>

			<main id="main" className="stage">
				{/* The world is a globe; a continent and everything inside it is flat. */}
				{map && isGlobe && (
					<GlobeCanvas
						key={map.id}
						map={map}
						active={active}
						onHover={setActive}
						onOpen={openFeature}
					/>
				)}
				{map && !isGlobe && (
					<MapCanvas
						key={map.id}
						map={map}
						active={active}
						selected={selected}
						onHover={setActive}
						onOpen={openFeature}
						onSelect={setSelected}
					/>
				)}

				{load.state === "missing" && (
					<div className="card notice" role="alert">
						<WarningIcon width={28} height={28} />
						<h1>There is no map at this address.</h1>
						<p>
							It may have been renamed in a newer release of the boundary data. Start
							again from the world and click down.
						</p>
						<button type="button" className="primary" onClick={() => navigate("world")}>
							Open the world map
						</button>
					</div>
				)}

				{load.state === "failed" && (
					<div className="card notice" role="alert">
						<WarningIcon width={28} height={28} />
						<h1>The map could not be loaded.</h1>
						<p>
							The map data did not arrive — usually a dropped connection. Nothing is lost;
							try again.
						</p>
						<button type="button" className="primary" onClick={() => show(id)}>
							Try again
						</button>
					</div>
				)}
			</main>

			<header className="hud card">
				<a className="brand" href="/" onClick={follow("world")} aria-label={SITE}>
					<Logo />
					<span className="wordmark">
						<span className="open">Open</span> <strong>Interactive Maps</strong>
					</span>
				</a>
				<button
					type="button"
					className="icon-button panel-toggle"
					aria-label={panelOpen ? "Hide the panel" : "Show the panel"}
					aria-expanded={panelOpen}
					aria-controls="panel"
					title={panelOpen ? "Hide the panel" : "Show the panel"}
					onClick={() => setPanelOpen((open) => !open)}
				>
					<PanelIcon />
				</button>
				<label className="search">
					<SearchIcon width={18} height={18} />
					<span className="visually-hidden">Search areas and places</span>
					<input
						ref={searchRef}
						type="search"
						placeholder={map ? `Search ${map.name}` : "Search"}
						autoComplete="off"
						spellCheck={false}
						disabled={!map}
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
							if (event.target.value) setSheetOpen(true);
						}}
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								setQuery("");
								event.currentTarget.blur();
							}
						}}
					/>
					{query ? (
						<button
							type="button"
							className="clear"
							aria-label="Clear search"
							onClick={() => {
								setQuery("");
								searchRef.current?.focus();
							}}
						>
							<CloseIcon width={15} height={15} />
						</button>
					) : (
						<kbd>/</kbd>
					)}
				</label>
			</header>

			<div className="toolbar card">
				{map && <ExportMenu map={map} />}
				<ThemeToggle />
				<a
					className="icon-button"
					href={REPO}
					target="_blank"
					rel="noopener noreferrer"
					aria-label="Source code on GitHub"
					title="Source code on GitHub"
				>
					<GithubIcon />
				</a>
			</div>

			{map && (
				<aside
					id="panel"
					className="panel card"
					aria-label={`${map.name}: areas and places`}
				>
					<button
						type="button"
						className="handle"
						aria-expanded={sheetOpen}
						aria-controls="panel"
						aria-label={sheetOpen ? "Collapse the panel" : "Expand the panel"}
						onClick={togglePanel}
					>
						<span />
					</button>
					<Ladder map={map} />
					<header className="title">
						<p className="eyebrow">{map.level}</p>
						<h1>{map.name}</h1>
						{stats && <p className="stats num">{stats}</p>}
					</header>
					<div
						className="panel-body"
						// Reaching into the list with the keyboard opens a collapsed sheet.
						onFocusCapture={() => setSheetOpen(true)}
					>
						<AreaPanel
							key={map.id}
							map={map}
							query={query}
							active={active}
							selected={selected}
							onHover={setActive}
							onOpen={openRow}
							onSelect={setSelected}
						/>
					</div>
				</aside>
			)}

			{map && place && (
				<PlaceCard map={map} place={place} onClose={() => setSelected(null)} />
			)}

			<Attribution map={map} />
		</div>
	);
}
