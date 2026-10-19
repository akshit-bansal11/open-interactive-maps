"use client";

import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { memo, type SVGProps, useEffect, useId, useMemo, useRef, useState } from "react";
import { FitIcon, MinusIcon, PlusIcon } from "@/components/Icons";
import { buildGlobe, type Continent, inView } from "@/lib/globe.mjs";
import { MAX_ZOOM, useGlobe } from "@/lib/use-globe";
import { useMarked } from "@/lib/use-marked";
import type { MapFeature, MapFile } from "@/types/map";

/** One press of a zoom button. */
const ZOOM_STEP = 1.6;

/** How many fill tones the continents cycle through — the flat map's, so they match. */
const TONES = 4;

/** The sphere's radius as a share of the shorter side of the stage, leaving room for the glow. */
const FILL = 0.44;
/** The atmosphere reaches this far past the surface, as a share of the radius. */
const GLOW = 1.16;

/** A name is shown while its continent is within this of the middle of the view, in degrees. */
const LABEL_LIMIT = 75;
/** ...and fades out over the last stretch of it, so it never pops at the horizon. */
const LABEL_FADE = 25;
const RAD = Math.PI / 180;

const GRATICULE = geoGraticule10();

interface Props {
	map: MapFile;
	active: string | null;
	onHover: (id: string | null) => void;
	onOpen: (feature: MapFeature) => void;
}

interface Tip {
	name: string;
	x: number;
	y: number;
}

interface Drawn extends Continent {
	tone: number;
	leaf: boolean;
}

/**
 * The sphere's paint. Memoised, because the gradients are fractions of the
 * circle they fill and the colours are the stylesheet's: none of it changes while
 * the globe turns or zooms.
 */
const Paint = memo(function Paint({ id }: { id: string }) {
	return (
		<defs>
			{/* The air: bright at the surface, gone a little way out. */}
			<radialGradient id={`${id}-glow`}>
				<stop offset="0.78" style={{ stopColor: "var(--globe-glow)" }} />
				<stop
					offset="0.86"
					style={{ stopColor: "var(--globe-glow)", stopOpacity: 0.6 }}
				/>
				<stop offset="1" style={{ stopColor: "var(--globe-glow)", stopOpacity: 0 }} />
			</radialGradient>
			{/* The sea is lit from the upper left and deepens toward the edge. */}
			<radialGradient id={`${id}-sea`} cx="0.5" cy="0.5" r="0.5" fx="0.38" fy="0.32">
				<stop offset="0" style={{ stopColor: "var(--globe-sea-hi)" }} />
				<stop offset="0.55" style={{ stopColor: "var(--globe-sea-mid)" }} />
				<stop offset="1" style={{ stopColor: "var(--globe-sea-lo)" }} />
			</radialGradient>
			{/* Limb darkening: the surface turns away from the light toward the rim. */}
			<radialGradient id={`${id}-limb`} cx="0.5" cy="0.5" r="0.5" fx="0.4" fy="0.34">
				<stop offset="0.55" style={{ stopColor: "var(--globe-limb)", stopOpacity: 0 }} />
				<stop
					offset="0.86"
					style={{ stopColor: "var(--globe-limb)", stopOpacity: 0.32 }}
				/>
				<stop offset="1" style={{ stopColor: "var(--globe-limb)" }} />
			</radialGradient>
			<radialGradient id={`${id}-shine`} cx="0.33" cy="0.27" r="0.4">
				<stop offset="0" style={{ stopColor: "var(--globe-shine)" }} />
				<stop offset="1" style={{ stopColor: "var(--globe-shine)", stopOpacity: 0 }} />
			</radialGradient>
		</defs>
	);
});

/**
 * The world as a ball. The flat world map has no globe in its data, so this
 * draws the same continents turned inside out of Equal Earth (see
 * lib/globe.mjs) through d3's orthographic projection, which also cuts them off
 * cleanly at the horizon. Mount with `key={map.id}`.
 *
 * The continents are `data-id` paths exactly as on the flat map, so hovering one
 * here or in the list beside it lights it the same way (`useMarked` and the
 * stylesheet's `[data-on]`). Every continent is also a row in that list, which
 * is the keyboard's way in.
 */
export function GlobeCanvas({ map, active, onHover, onOpen }: Props) {
	const frameRef = useRef<HTMLDivElement>(null);
	const id = useId().replace(/\W/g, "");
	const [size, setSize] = useState({ w: 0, h: 0 });
	const [tip, setTip] = useState<Tip | null>(null);

	const radius = FILL * Math.min(size.w, size.h);
	const { svgRef, view, hovering, dragged, zoomBy, reset, flyTo, handlers } =
		useGlobe(radius);

	// Inverting every outline is the one costly step, and it depends on the map alone.
	const continents = useMemo<Drawn[]>(() => {
		if (map.projection.kind !== "equal-earth") return [];
		const drawn = map.features.filter((feature) => feature.d);
		const byId = new Map(map.features.map((feature) => [feature.id, feature]));
		return buildGlobe(map.features, map.projection).map((continent) => ({
			...continent,
			tone: drawn.findIndex((feature) => feature.id === continent.id) % TONES,
			leaf: (byId.get(continent.id)?.children ?? 0) === 0,
		}));
	}, [map]);
	const byId = useMemo(
		() => new Map(map.features.map((feature) => [feature.id, feature])),
		[map],
	);
	const centroids = useMemo(
		() => new Map(continents.map((continent) => [continent.id, continent.centroid])),
		[continents],
	);

	useMarked(svgRef, active);

	// The svg's pixel size is the stage's, less the room the panel takes.
	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) return;
		const observer = new ResizeObserver(([entry]) => {
			if (!entry) return;
			const { width, height } = entry.contentRect;
			setSize((now) =>
				now.w === width && now.h === height ? now : { w: width, h: height },
			);
		});
		observer.observe(svg);
		return () => observer.disconnect();
	}, [svgRef]);

	// Resting on a continent in the list turns the globe to face it. Hovering the
	// globe itself is the pointer already pointing at it: nothing should move then.
	useEffect(() => {
		const centroid = active ? centroids.get(active) : undefined;
		if (centroid && !hovering()) flyTo(centroid);
	}, [active, centroids, hovering, flyTo]);

	const cx = size.w / 2;
	const cy = size.h / 2;
	const r = radius * view.k;

	// Everything below depends on the view, and so is redone every frame it turns.
	const projection = geoOrthographic()
		.translate([cx, cy])
		.scale(r)
		.rotate([-view.lambda, -view.phi])
		.clipAngle(90)
		.precision(0.8);
	const path = geoPath(projection).digits(1);
	const facing: [number, number] = [view.lambda, view.phi];
	const shown = continents.map((continent) => ({
		id: continent.id,
		...inView(continent, facing),
	}));
	const ready = size.w > 0 && size.h > 0;

	const labels = ready
		? continents.flatMap((continent) => {
				const away = geoDistance(continent.centroid, facing) / RAD;
				const at = projection(continent.centroid);
				if (away > LABEL_LIMIT || !at) return [];
				return {
					id: continent.id,
					name: continent.name,
					x: at[0],
					y: at[1],
					opacity: Math.min(1, (LABEL_LIMIT - away) / LABEL_FADE),
				};
			})
		: [];

	/** The continent a pointer event landed on, if any. */
	const hitAt = (target: EventTarget): MapFeature | null => {
		if (!(target instanceof SVGPathElement)) return null;
		return byId.get(target.dataset.id ?? "") ?? null;
	};

	const pointer: SVGProps<SVGSVGElement> = {
		...handlers,
		onPointerMove: (event) => {
			handlers.onPointerMove(event);
			const feature = hitAt(event.target);
			const frame = frameRef.current?.getBoundingClientRect();
			if (!feature || !frame || dragged()) {
				setTip(null);
				if (!feature && !dragged()) onHover(null);
				return;
			}
			setTip({
				name: feature.name,
				x: event.clientX - frame.left,
				y: event.clientY - frame.top,
			});
			onHover(feature.id);
		},
		onPointerUp: (event) => {
			handlers.onPointerUp(event);
			// The release that ends a drag is not a press on anything.
			if (dragged()) return;
			const feature = hitAt(event.target);
			if (feature) onOpen(feature);
		},
		onPointerLeave: () => {
			handlers.onPointerLeave();
			setTip(null);
			onHover(null);
		},
	};

	return (
		<div className="canvas globe" ref={frameRef}>
			<svg
				ref={svgRef}
				{...pointer}
				role="img"
				aria-label={`Globe of ${map.name}. Drag to turn it; the continents are listed in the panel.`}
			>
				{ready && (
					<>
						<Paint id={id} />
						<circle
							className="globe-glow"
							cx={cx}
							cy={cy}
							r={r * GLOW}
							fill={`url(#${id}-glow)`}
						/>
						<circle
							className="globe-sea"
							cx={cx}
							cy={cy}
							r={r}
							fill={`url(#${id}-sea)`}
						/>
						<path className="globe-grid" d={path(GRATICULE) ?? undefined} />
						<g className="land">
							{continents.map((continent, i) => (
								<path
									key={continent.id}
									d={path(shown[i]?.land ?? null) ?? undefined}
									data-id={continent.id}
									data-tone={continent.tone}
									data-leaf={continent.leaf ? "" : undefined}
								/>
							))}
						</g>
						{/* Borders come from their own lines, so the cut the flat map was made with is not drawn. */}
						<g className="globe-coast">
							{shown.map(({ id, coast }) => (
								<path key={id} d={path(coast) ?? undefined} />
							))}
						</g>
						<circle
							className="globe-shade"
							cx={cx}
							cy={cy}
							r={r}
							fill={`url(#${id}-limb)`}
						/>
						<circle
							className="globe-shade"
							cx={cx}
							cy={cy}
							r={r}
							fill={`url(#${id}-shine)`}
						/>
						<circle className="globe-rim" cx={cx} cy={cy} r={r} />
						<g className="labels">
							{labels.map((label) => (
								<text
									key={label.id}
									x={label.x}
									y={label.y}
									dy="0.35em"
									textAnchor="middle"
									style={{ fontSize: 13, strokeWidth: 4, opacity: label.opacity }}
								>
									{label.name}
								</text>
							))}
						</g>
					</>
				)}
			</svg>

			{tip && (
				<div className="tip" style={{ left: tip.x, top: tip.y }}>
					<strong>{tip.name}</strong>
				</div>
			)}

			<div className="controls">
				<div className="zoom">
					<button
						type="button"
						className="icon-button"
						aria-label="Zoom in"
						title="Zoom in"
						disabled={view.k >= MAX_ZOOM - 0.005}
						onClick={() => zoomBy(ZOOM_STEP)}
					>
						<PlusIcon />
					</button>
					<button
						type="button"
						className="icon-button"
						aria-label="Zoom out"
						title="Zoom out"
						disabled={view.k <= 1.005}
						onClick={() => zoomBy(1 / ZOOM_STEP)}
					>
						<MinusIcon />
					</button>
					<button
						type="button"
						className="icon-button"
						aria-label="Reset view"
						title="Reset view"
						onClick={reset}
					>
						<FitIcon />
					</button>
				</div>
			</div>
		</div>
	);
}
