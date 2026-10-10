"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type SVGProps, useEffect, useRef, useState } from "react";
import { searchElsewhere } from "@/lib/search";
import { buildSvg, STYLE } from "@/lib/svg.mjs";
import { usePanZoom } from "@/lib/use-pan-zoom";
import type { MapFeature, MapFile, SearchRow } from "@/types/map";

/** A row in the side list — either an area of this map, or a search hit elsewhere. */
interface Row {
	id: string;
	name: string;
	note: string;
	noteClass: "count" | "flat";
	/** null when the area has no map to open. */
	href: string | null;
	/** Set when opening `href` should land with this area highlighted. */
	focus?: string;
}

const route = (id: string) => `/${id}`;

/** One press of a zoom button, and of a pan button as a share of the view. */
const ZOOM_STEP = 1.6;
const PAN_STEP = 0.25;

const PAN_BUTTONS = [
	{ label: "Pan left", glyph: "←", fx: -PAN_STEP, fy: 0 },
	{ label: "Pan up", glyph: "↑", fx: 0, fy: -PAN_STEP },
	{ label: "Pan down", glyph: "↓", fx: 0, fy: PAN_STEP },
	{ label: "Pan right", glyph: "→", fx: PAN_STEP, fy: 0 },
];

const drillable = (feature: MapFeature) => feature.children > 0;

export function MapViewer({ map }: { map: MapFile }) {
	const router = useRouter();
	const canvasRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLUListElement>(null);
	const { svgRef, view, viewBox, dragged, reset, zoom, pan, handlers } = usePanZoom(
		map.width,
		map.height,
	);

	const [query, setQuery] = useState("");
	const [active, setActive] = useState<string | null>(null);
	const [badge, setBadge] = useState<{ name: string; x: number; y: number } | null>(null);
	const [elsewhere, setElsewhere] = useState<SearchRow[] | null>(null);
	const [flash, setFlash] = useState<Record<string, string>>({});

	// A new map means a new list; anything held over from the last one is stale.
	// A search hit for an area with no map of its own lands on its parent, so
	// pick the highlight back up on arrival.
	useEffect(() => {
		setQuery("");
		setBadge(null);
		setElsewhere(null);
		reset();

		const focus = sessionStorage.getItem("focus");
		sessionStorage.removeItem("focus");
		setActive(focus && map.features.some((f) => f.id === focus) ? focus : null);
	}, [map, reset]);

	const needle = query.trim().toLowerCase();
	const local = needle
		? map.features.filter((f) => f.name.toLowerCase().includes(needle))
		: map.features;

	/**
	 * The search box is scoped to what is on screen. When that finds nothing it
	 * falls back to the rest of the country and the world's first-level areas, so
	 * looking up Bathinda from the map of India still gets you there.
	 */
	useEffect(() => {
		if (local.length > 0 || needle.length < 2) {
			setElsewhere(null);
			return;
		}
		let live = true;
		searchElsewhere(map.id, needle)
			.then((rows) => {
				if (live) setElsewhere(rows);
			})
			.catch((error: unknown) => {
				console.error(error);
				if (live) setElsewhere([]);
			});
		return () => {
			live = false;
		};
	}, [map.id, needle, local.length]);

	// Keep the list following the map, as the layout calls for.
	useEffect(() => {
		if (!active) return;
		listRef.current
			?.querySelector(`[data-id="${CSS.escape(active)}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [active]);

	const rows: Row[] = elsewhere
		? elsewhere.map(([name, id, parent, hasMap]) => ({
				id,
				name,
				note: parent,
				noteClass: "count" as const,
				href: hasMap ? route(id) : route(id.split("/").slice(0, -1).join("/")),
				focus: hasMap ? undefined : id,
			}))
		: local.map((feature) => ({
				id: feature.id,
				name: feature.name,
				note: drillable(feature)
					? `${feature.children} →`
					: feature.d
						? ""
						: "not shown at this scale",
				noteClass: drillable(feature) ? ("count" as const) : ("flat" as const),
				href: drillable(feature) ? route(feature.id) : null,
			}));

	const meta = elsewhere
		? elsewhere.length > 0
			? `${elsewhere.length} elsewhere`
			: `nothing matching “${query.trim()}”`
		: needle
			? `${local.length} of ${map.features.length} ${map.childLabel}`
			: `${map.features.length} ${map.childLabel}`;

	/** Hovering the map highlights the area and puts the badge on it. */
	const point = (feature: MapFeature, target: SVGPathElement) => {
		setActive(feature.id);
		const bounds = canvasRef.current?.getBoundingClientRect();
		if (!bounds) return;
		const box = target.getBoundingClientRect();
		setBadge({
			name: feature.name,
			x: box.left + box.width / 2 - bounds.left,
			y: box.top + box.height / 2 - bounds.top,
		});
	};

	/** The area a pointer event landed on, if it landed on one. */
	const featureAt = (target: EventTarget) => {
		if (!(target instanceof SVGPathElement)) return null;
		const feature = map.features.find((f) => f.id === target.dataset.id);
		return feature ? { feature, path: target } : null;
	};

	/**
	 * One set of pointer handlers for the whole map rather than a pair per area —
	 * a country can hold thousands. Every area is also a button in the list beside
	 * the map, which is the keyboard's way in.
	 */
	const pointer: SVGProps<SVGSVGElement> = {
		...handlers,
		onPointerOver: (event) => {
			const hit = featureAt(event.target);
			if (hit) point(hit.feature, hit.path);
		},
		onPointerUp: (event) => {
			handlers.onPointerUp(event);
			const hit = featureAt(event.target);
			// The release that ends a drag is not a press on an area.
			if (!hit || dragged()) return;
			if (drillable(hit.feature)) router.push(route(hit.feature.id));
			else setActive(hit.feature.id);
		},
		onPointerLeave: () => {
			setActive(null);
			setBadge(null);
		},
	};

	const open = (row: Row) => {
		if (!row.href) {
			setActive(row.id);
			return;
		}
		if (row.focus) sessionStorage.setItem("focus", row.focus);
		router.push(row.href);
	};

	const say = (key: string, text: string) => {
		setFlash((previous) => ({ ...previous, [key]: text }));
		setTimeout(() => setFlash((previous) => ({ ...previous, [key]: "" })), 1200);
	};

	const download = (blob: Blob, extension: string) => {
		const url = URL.createObjectURL(blob);
		const link = Object.assign(document.createElement("a"), {
			href: url,
			download: `${map.id.replace(/\//g, "-")}.${extension}`,
		});
		link.click();
		URL.revokeObjectURL(url);
	};

	const svgBlob = () => new Blob([buildSvg(map)], { type: "image/svg+xml" });

	const copySvg = async () => {
		try {
			await navigator.clipboard.writeText(buildSvg(map));
			say("copy", "Copied");
		} catch {
			// Clipboard needs a secure context; downloading always works.
			download(svgBlob(), "svg");
			say("copy", "Saved instead");
		}
	};

	const downloadPng = () => {
		const scale = Number(
			(document.getElementById("png-scale") as HTMLSelectElement).value,
		);
		const transparent = (document.getElementById("png-transparent") as HTMLInputElement)
			.checked;

		const url = URL.createObjectURL(svgBlob());
		const image = new Image();
		image.onload = () => {
			const surface = document.createElement("canvas");
			// The longest side of a map is always 1000, so the scale reads as pixels.
			surface.width = map.width * scale;
			surface.height = map.height * scale;
			const context = surface.getContext("2d");
			if (!context) return;
			if (!transparent) {
				context.fillStyle = STYLE.background;
				context.fillRect(0, 0, surface.width, surface.height);
			}
			context.drawImage(image, 0, 0, surface.width, surface.height);
			URL.revokeObjectURL(url);
			surface.toBlob((blob) => blob && download(blob, "png"));
		};
		image.onerror = () => {
			URL.revokeObjectURL(url);
			say("png", "PNG failed");
		};
		image.src = url;
	};

	return (
		<main>
			<section className="stage">
				<div className="stage-head">
					<nav className="crumbs" aria-label="Breadcrumb">
						{map.parents.map((parent) => (
							<span key={parent.id}>
								<Link href={route(parent.id)}>{parent.name}</Link>
								<span className="sep">/</span>
							</span>
						))}
						<span className="here">{map.name}</span>
					</nav>

					<div className="toolbar">
						<button type="button" onClick={copySvg}>
							{flash.copy || "Copy SVG"}
						</button>
						<button type="button" onClick={() => download(svgBlob(), "svg")}>
							SVG
						</button>
						<button type="button" onClick={downloadPng}>
							{flash.png || "PNG"}
						</button>
						<button
							type="button"
							onClick={() =>
								download(
									new Blob([JSON.stringify(map, null, "\t")], {
										type: "application/json",
									}),
									"json",
								)
							}
						>
							JSON
						</button>
						<label className="opt">
							<select id="png-scale" defaultValue="2" aria-label="PNG resolution">
								<option value="1">1000 px</option>
								<option value="2">2000 px</option>
								<option value="4">4000 px</option>
							</select>
						</label>
						<label className="opt">
							<input id="png-transparent" type="checkbox" /> transparent
						</label>
					</div>
				</div>

				<div className="canvas" ref={canvasRef}>
					<svg
						ref={svgRef}
						viewBox={viewBox}
						{...pointer}
						role="img"
						aria-label={`Map of ${map.name}`}
						fill={STYLE.fill}
						fillRule="evenodd"
						stroke={STYLE.stroke}
						strokeOpacity={STYLE.strokeOpacity}
						strokeWidth={STYLE.strokeWidth}
						strokeLinejoin="round"
					>
						<title>{map.name}</title>
						{map.features
							.filter((feature) => feature.d)
							.map((feature) => (
								<path
									key={feature.id}
									d={feature.d}
									data-id={feature.id}
									data-drillable={drillable(feature) ? 1 : 0}
									fill={feature.id === active ? STYLE.highlight : STYLE.fill}
								/>
							))}
					</svg>

					<div className="zoom">
						<button type="button" aria-label="Zoom in" onClick={() => zoom(ZOOM_STEP)}>
							+
						</button>
						<button
							type="button"
							aria-label="Zoom out"
							disabled={view.k === 1}
							onClick={() => zoom(1 / ZOOM_STEP)}
						>
							−
						</button>
						<button
							type="button"
							aria-label="Reset view"
							disabled={view.k === 1}
							onClick={reset}
						>
							⟲
						</button>
						{/* Dragging needs an alternative that is a plain press. */}
						{view.k > 1 &&
							PAN_BUTTONS.map(({ label, glyph, fx, fy }) => (
								<button
									key={label}
									type="button"
									aria-label={label}
									onClick={() => pan(fx, fy)}
								>
									{glyph}
								</button>
							))}
					</div>

					{badge && (
						<div className="label" style={{ left: badge.x, top: badge.y }}>
							{badge.name}
						</div>
					)}
				</div>

				<p className="attribution">
					{map.source} · {map.license} ·{" "}
					<a href={map.sourceUrl} target="_blank" rel="noopener noreferrer">
						source data
					</a>
				</p>
			</section>

			<aside className="panel">
				<input
					type="search"
					placeholder="Search"
					autoComplete="off"
					aria-label="Search areas"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Escape") setQuery("");
					}}
				/>
				<p className="panel-meta">{meta}</p>

				<ul className="areas" ref={listRef}>
					{rows.map((row) => (
						<li key={row.id}>
							<button
								type="button"
								data-id={row.id}
								aria-current={row.id === active}
								onMouseEnter={() => setActive(row.id)}
								onMouseLeave={() => setActive(null)}
								onFocus={() => setActive(row.id)}
								onClick={() => open(row)}
							>
								<span>{row.name}</span>
								<span className={row.noteClass}>{row.note}</span>
							</button>
						</li>
					))}
				</ul>
			</aside>
		</main>
	);
}
