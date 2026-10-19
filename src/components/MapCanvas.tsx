"use client";

import {
	memo,
	type SVGProps,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { ArrowIcon, FitIcon, MinusIcon, PlusIcon } from "@/components/Icons";
import {
	type Candidate,
	chooseLabels,
	formatPopulation,
	KIND_NAMES,
	rankPlaces,
	textWidth,
} from "@/lib/places.mjs";
import { useMarked } from "@/lib/use-marked";
import { usePanZoom } from "@/lib/use-pan-zoom";
import { MAX_ZOOM, type View } from "@/lib/view.mjs";
import { type MapFeature, type MapFile, type Place, placeId } from "@/types/map";

/** One press of a zoom button, and of a pan button as a share of the view. */
const ZOOM_STEP = 1.6;
const PAN_STEP = 0.25;

const PAN_BUTTONS = [
	{ label: "Pan up", className: "up", rotate: -90, fx: 0, fy: -PAN_STEP },
	{ label: "Pan left", className: "left", rotate: 180, fx: -PAN_STEP, fy: 0 },
	{ label: "Pan right", className: "right", rotate: 0, fx: PAN_STEP, fy: 0 },
	{ label: "Pan down", className: "down", rotate: 90, fx: 0, fy: PAN_STEP },
];

/** How many fill tones the areas cycle through, so neighbours read apart. */
const TONES = 4;

/**
 * Label geometry, in screen px — the same on a world-sized screen and a phone,
 * at any zoom. The dot diameters mirror `.dots path[data-kind]` in the
 * stylesheet, so the collision pass knows how big a dot is.
 */
const DOT_PX = [11, 8, 5];
const LABEL_PX = 12;
/** Most places considered for a label in one pass, however many are in view. */
const MAX_CANDIDATES = 300;
const MAX_LABELS = 120;

/**
 * The areas themselves. Memoised on the map, because a state can hold thousands
 * of paths and neither a hover nor a pan should make React look at them again:
 * the highlight is a class set on one element, the pan is the viewBox.
 */
const Areas = memo(function Areas({ map }: { map: MapFile }) {
	return (
		<>
			{map.features
				.filter((feature) => feature.d)
				.map((feature, i) => (
					<path
						key={feature.id}
						d={feature.d}
						data-id={feature.id}
						data-tone={i % TONES}
						data-leaf={feature.children > 0 ? undefined : ""}
					/>
				))}
		</>
	);
});

/** A settlement map's own shape: land to put places on, not something to click. */
const Outline = memo(function Outline({ d }: { d: string }) {
	return <path className="outline" d={d} />;
});

/**
 * Each place is a zero-length path. With a round line cap that draws a dot, and
 * with `vector-effect: non-scaling-stroke` its width is in screen px, so a dot
 * keeps its size however far the map is zoomed — and, being an element, it is
 * hit-tested, hovered and marked like any area. Smallest first, so a city is
 * never hidden under a village.
 */
const Dots = memo(function Dots({ map }: { map: MapFile }) {
	const ordered = useMemo(
		() => [...(map.places ?? [])].sort((a, b) => b[1] - a[1]),
		[map],
	);
	return (
		<g className="dots">
			{ordered.map(([, kind, x, y, , osm]) => (
				<path
					key={osm}
					d={`M${x} ${y}h0`}
					data-id={placeId(map.id, osm)}
					data-kind={kind}
				/>
			))}
		</g>
	);
});

interface LabelItem {
	id: number;
	name: string;
	kind: number;
	x: number;
	y: number;
	side: 1 | -1;
	/** Offset from the dot to the text's near edge, in map units. */
	dx: number;
	/** Font size in map units: LABEL_PX of screen. */
	size: number;
}

/**
 * Which places get a name at this zoom. Works in screen px so the result does
 * not depend on the map's units: place the dots on the screen as the svg will
 * (default `meet` fit, so one screen px is max(vbW/cw, vbH/ch) map units),
 * walk them most important first, and let `chooseLabels` keep what fits.
 */
function layoutLabels(
	map: MapFile,
	ranked: number[],
	view: View,
	size: { w: number; h: number },
): LabelItem[] {
	const places = map.places;
	if (!places?.length || !size.w || !size.h) return [];

	const vbW = map.width / view.k;
	const vbH = map.height / view.k;
	const unitsPerPx = Math.max(vbW / size.w, vbH / size.h);
	// `meet` centres the viewBox in the element; the slack is on one axis only.
	const left = (size.w - vbW / unitsPerPx) / 2;
	const top = (size.h - vbH / unitsPerPx) / 2;
	// Villages are labelled only where they are the point of the map.
	const settlement = map.outline !== undefined;

	const candidates: Candidate[] = [];
	const source: Place[] = [];
	for (const i of ranked) {
		const place = places[i];
		if (!place) continue;
		const [name, kind, x, y] = place;
		if (kind === 2 && !settlement) continue;
		const sx = left + (x - view.x) / unitsPerPx;
		const sy = top + (y - view.y) / unitsPerPx;
		if (sx < 0 || sy < 0 || sx > size.w || sy > size.h) continue;
		candidates.push({
			x: sx,
			y: sy,
			r: (DOT_PX[kind] ?? 5) / 2,
			w: textWidth(name, LABEL_PX) + 2,
			h: LABEL_PX * 1.3,
		});
		source.push(place);
		if (candidates.length >= MAX_CANDIDATES) break;
	}

	// A few labels on the whole map, more as it is zoomed.
	const budget = Math.min(
		MAX_LABELS,
		Math.round((settlement ? 30 : 14) * view.k ** 1.15),
	);
	return chooseLabels(candidates, size.w, size.h, budget).flatMap(({ index, side }) => {
		const place = source[index];
		const dot = candidates[index];
		if (!place || !dot) return [];
		const [name, kind, x, y, , osm] = place;
		return {
			id: osm,
			name,
			kind,
			x,
			y,
			side,
			dx: side * (dot.r + 3) * unitsPerPx,
			size: LABEL_PX * unitsPerPx,
		};
	});
}

const Labels = memo(function Labels({ items }: { items: LabelItem[] }) {
	return (
		<g className="labels">
			{items.map((label) => (
				<text
					key={label.id}
					x={label.x + label.dx}
					y={label.y}
					dy="0.35em"
					textAnchor={label.side === 1 ? "start" : "end"}
					data-kind={label.kind}
					style={{ fontSize: label.size, strokeWidth: label.size * 0.3 }}
				>
					{label.name}
				</text>
			))}
		</g>
	);
});

interface Props {
	map: MapFile;
	active: string | null;
	/** The place whose card is open. */
	selected: string | null;
	onHover: (id: string | null) => void;
	onOpen: (feature: MapFeature) => void;
	onSelect: (id: string | null) => void;
}

/** A pointer event's target: exactly one of `place` and `feature` is set. */
type Hit =
	| { id: string; place: Place; feature?: undefined }
	| { id: string; feature: MapFeature; place?: undefined };

interface Tip {
	name: string;
	note: string;
	x: number;
	y: number;
}

/** Mount with `key={map.id}`: a new map starts unzoomed, with no stale tooltip. */
export function MapCanvas({ map, active, selected, onHover, onOpen, onSelect }: Props) {
	const frameRef = useRef<HTMLDivElement>(null);
	const { svgRef, view, viewBox, dragged, reset, zoom, pan, reveal, handlers } =
		usePanZoom(map.width, map.height);
	const [tip, setTip] = useState<Tip | null>(null);
	const [size, setSize] = useState({ w: 0, h: 0 });

	const byId = useMemo(
		() => new Map(map.features.map((feature) => [feature.id, feature])),
		[map],
	);
	const placeById = useMemo(
		() => new Map((map.places ?? []).map((place) => [placeId(map.id, place[5]), place])),
		[map],
	);
	const ranked = useMemo(() => rankPlaces(map.places ?? []), [map]);

	useMarked(svgRef, active);
	useMarked(svgRef, selected, { attribute: "data-sel" });

	// The svg's pixel size turns map units into screen px for the labels.
	const hasPlaces = placeById.size > 0;
	useEffect(() => {
		const svg = svgRef.current;
		if (!hasPlaces || !svg) return;
		const observer = new ResizeObserver(([entry]) => {
			if (!entry) return;
			const { width, height } = entry.contentRect;
			setSize((now) =>
				now.w === width && now.h === height ? now : { w: width, h: height },
			);
		});
		observer.observe(svg);
		return () => observer.disconnect();
	}, [svgRef, hasPlaces]);

	// Picking a place from the list brings it into view if it is not.
	useEffect(() => {
		const place = selected ? placeById.get(selected) : undefined;
		if (place) reveal(place[2], place[3]);
	}, [selected, placeById, reveal]);

	// Labels follow the zoom and the pan but may lag a frame behind them.
	const settled = useDeferredValue(view);
	const labels = useMemo(
		() => layoutLabels(map, ranked, settled, size),
		[map, ranked, settled, size],
	);

	/** What a pointer event landed on: an area, a place, or neither. */
	const hitAt = (target: EventTarget): Hit | null => {
		if (!(target instanceof SVGPathElement)) return null;
		const id = target.dataset.id ?? "";
		const place = placeById.get(id);
		if (place) return { id, place };
		const feature = byId.get(id);
		return feature ? { id, feature } : null;
	};

	/**
	 * One set of pointer handlers for the whole map rather than a pair per area.
	 * Every area and place is also a button or link in the list beside the map,
	 * which is the keyboard's way in.
	 */
	const pointer: SVGProps<SVGSVGElement> = {
		...handlers,
		onPointerMove: (event) => {
			handlers.onPointerMove(event);
			const hit = hitAt(event.target);
			const frame = frameRef.current?.getBoundingClientRect();
			if (!hit || !frame || dragged()) return setTip(null);
			const at = { x: event.clientX - frame.left, y: event.clientY - frame.top };
			if (hit.place) {
				const [name, kind, , , population] = hit.place;
				const people = formatPopulation(population, true);
				setTip({
					...at,
					name,
					note: people ? `${KIND_NAMES[kind]} · ${people}` : (KIND_NAMES[kind] ?? ""),
				});
			} else {
				setTip({ ...at, name: hit.feature.name, note: "" });
			}
			onHover(hit.id);
		},
		onPointerUp: (event) => {
			handlers.onPointerUp(event);
			// The release that ends a drag is not a press on anything.
			if (dragged()) return;
			const hit = hitAt(event.target);
			if (!hit) return onSelect(null);
			if (hit.place) onSelect(hit.id);
			else onOpen(hit.feature);
		},
		onPointerLeave: () => {
			setTip(null);
			onHover(null);
		},
	};

	return (
		<div className="canvas" ref={frameRef}>
			<svg
				ref={svgRef}
				viewBox={viewBox}
				{...pointer}
				role="img"
				aria-label={`Map of ${map.name}`}
			>
				{map.outline && <Outline d={map.outline} />}
				<Areas map={map} />
				<Dots map={map} />
				<Labels items={labels} />
			</svg>

			{tip && (
				<div className="tip" style={{ left: tip.x, top: tip.y }}>
					<strong>{tip.name}</strong>
					{tip.note && <span>{tip.note}</span>}
				</div>
			)}

			<div className="controls">
				{/* Dragging needs an alternative that is a plain press. */}
				{view.k > 1 && (
					<div className="pan">
						{PAN_BUTTONS.map(({ label, className, rotate, fx, fy }) => (
							<button
								key={label}
								type="button"
								className={className}
								aria-label={label}
								title={label}
								onClick={() => pan(fx, fy)}
							>
								<ArrowIcon width={16} height={16} style={{ rotate: `${rotate}deg` }} />
							</button>
						))}
					</div>
				)}
				<div className="zoom">
					<button
						type="button"
						className="icon-button"
						aria-label="Zoom in"
						title="Zoom in"
						disabled={view.k >= MAX_ZOOM}
						onClick={() => zoom(ZOOM_STEP)}
					>
						<PlusIcon />
					</button>
					<button
						type="button"
						className="icon-button"
						aria-label="Zoom out"
						title="Zoom out"
						disabled={view.k === 1}
						onClick={() => zoom(1 / ZOOM_STEP)}
					>
						<MinusIcon />
					</button>
					<button
						type="button"
						className="icon-button"
						aria-label="Reset view"
						title="Reset view"
						disabled={view.k === 1}
						onClick={reset}
					>
						<FitIcon />
					</button>
				</div>
			</div>
		</div>
	);
}
