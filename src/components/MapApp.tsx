"use client";

import { type MouseEvent, useCallback, useEffect, useState } from "react";
import { AreaPanel, type Row } from "@/components/AreaPanel";
import { ExportMenu } from "@/components/ExportMenu";
import { MapCanvas } from "@/components/MapCanvas";
import { loadMap, prefetchMap } from "@/lib/maps";
import { hrefOf, navigate, useMapId } from "@/lib/route";
import type { MapFeature, MapFile } from "@/types/map";

const SITE = "Open Interactive Maps";
const REPO = "https://github.com/akshit-bansal11/open-interactive-maps";

/** How long the pointer rests on an area before its map is fetched ahead. */
const PREFETCH_DELAY = 90;

type Load =
	| { state: "loading" }
	| { state: "missing" }
	| { state: "failed" }
	| { state: "ready"; map: MapFile };

/** A modified click is the browser's — new tab, new window — not a navigation. */
const plainClick = (event: MouseEvent) =>
	!(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);

export function MapApp() {
	const id = useMapId();
	const [load, setLoad] = useState<Load>({ state: "loading" });
	const [active, setActive] = useState<string | null>(null);

	// The map last drawn stays up while the next one loads, so a click never
	// blanks the screen.
	const show = useCallback((mapId: string) => {
		let live = true;
		loadMap(mapId)
			.then((map) => {
				if (!live) return;
				setLoad(map ? { state: "ready", map } : { state: "missing" });
				// A search hit with no map of its own lands on its parent, lit.
				const focus = sessionStorage.getItem("focus");
				sessionStorage.removeItem("focus");
				setActive(focus && map?.features.some((f) => f.id === focus) ? focus : null);
			})
			.catch((error: unknown) => {
				console.error(error);
				if (live) setLoad({ state: "failed" });
			});
		return () => {
			live = false;
		};
	}, []);

	useEffect(() => show(id), [id, show]);

	const map = load.state === "ready" ? load.map : null;

	useEffect(() => {
		document.title = map && map.id !== "world" ? `${map.name} — ${SITE}` : SITE;
	}, [map]);

	// Resting on an area fetches its map, so the click that follows is instant.
	useEffect(() => {
		if (!active) return;
		const timer = setTimeout(() => prefetchMap(active), PREFETCH_DELAY);
		return () => clearTimeout(timer);
	}, [active]);

	const openFeature = useCallback((feature: MapFeature) => {
		if (feature.children > 0) navigate(feature.id);
		else setActive(feature.id);
	}, []);

	const openRow = useCallback((row: Row) => {
		if (!row.target) return;
		if (row.focus) sessionStorage.setItem("focus", row.focus);
		navigate(row.target);
	}, []);

	return (
		<>
			<a className="skip" href="#main">
				Skip to the map
			</a>

			<header className="bar">
				<a
					className="brand"
					href="/"
					onClick={(event) => {
						if (!plainClick(event)) return;
						event.preventDefault();
						navigate("world");
					}}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20Z M9 4v13.5 M15 6.5V20" />
					</svg>
					<span>{SITE}</span>
				</a>

				{map && (
					<nav className="crumbs" aria-label="Breadcrumb">
						<ol>
							{map.parents.map((parent) => (
								<li key={parent.id}>
									<a
										href={hrefOf(parent.id)}
										onClick={(event) => {
											if (!plainClick(event)) return;
											event.preventDefault();
											navigate(parent.id);
										}}
									>
										{parent.name}
									</a>
								</li>
							))}
							<li aria-current="page">{map.name}</li>
						</ol>
					</nav>
				)}

				<div className="bar-end">
					{map && <ExportMenu map={map} />}
					<a className="ghost" href={REPO} target="_blank" rel="noopener noreferrer">
						GitHub
					</a>
				</div>
			</header>

			<main id="main">
				{load.state === "ready" && (
					<>
						<section className="stage" aria-label="Map">
							<MapCanvas
								key={load.map.id}
								map={load.map}
								active={active}
								onHover={setActive}
								onOpen={openFeature}
							/>
							<p className="attribution">
								{load.map.source} · {load.map.license} ·{" "}
								<a href={load.map.sourceUrl} target="_blank" rel="noopener noreferrer">
									source data
								</a>
							</p>
						</section>

						<aside className="panel" aria-label={`Areas of ${load.map.name}`}>
							<p className="eyebrow">{load.map.level}</p>
							<h1>{load.map.name}</h1>
							<p className="count">
								{load.map.features.length.toLocaleString()} {load.map.childLabel}
							</p>
							<AreaPanel
								key={load.map.id}
								map={load.map}
								active={active}
								onHover={setActive}
								onOpen={openRow}
							/>
						</aside>
					</>
				)}

				{load.state === "loading" && (
					<p className="notice" role="status">
						Loading the map…
					</p>
				)}

				{load.state === "missing" && (
					<div className="notice" role="alert">
						<h1>There is no map at this address.</h1>
						<p>
							It may have been renamed in a newer release of the boundary data. Start
							again from the world and click down.
						</p>
						<button type="button" onClick={() => navigate("world")}>
							Open the world map
						</button>
					</div>
				)}

				{load.state === "failed" && (
					<div className="notice" role="alert">
						<h1>The map could not be loaded.</h1>
						<p>
							The map data did not arrive — usually a dropped connection. Nothing is lost;
							try again.
						</p>
						<button type="button" onClick={() => show(id)}>
							Try again
						</button>
					</div>
				)}
			</main>
		</>
	);
}
