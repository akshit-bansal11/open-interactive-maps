"use client";

import { memo, type SVGProps, useMemo, useRef, useState } from "react";
import { useMarked } from "@/lib/use-marked";
import { usePanZoom } from "@/lib/use-pan-zoom";
import type { MapFeature, MapFile } from "@/types/map";

/** One press of a zoom button, and of a pan button as a share of the view. */
const ZOOM_STEP = 1.6;
const PAN_STEP = 0.25;

const PAN_BUTTONS = [
	{ label: "Pan left", glyph: "←", fx: -PAN_STEP, fy: 0 },
	{ label: "Pan up", glyph: "↑", fx: 0, fy: -PAN_STEP },
	{ label: "Pan down", glyph: "↓", fx: 0, fy: PAN_STEP },
	{ label: "Pan right", glyph: "→", fx: PAN_STEP, fy: 0 },
];

/** How many fill tones the areas cycle through, so neighbours read apart. */
const TONES = 4;

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

interface Props {
	map: MapFile;
	active: string | null;
	onHover: (id: string | null) => void;
	onOpen: (feature: MapFeature) => void;
}

/** Mount with `key={map.id}`: a new map starts unzoomed, with no stale tooltip. */
export function MapCanvas({ map, active, onHover, onOpen }: Props) {
	const frameRef = useRef<HTMLDivElement>(null);
	const { svgRef, view, viewBox, dragged, reset, zoom, pan, handlers } = usePanZoom(
		map.width,
		map.height,
	);
	const [tip, setTip] = useState<{ name: string; x: number; y: number } | null>(null);

	const byId = useMemo(
		() => new Map(map.features.map((feature) => [feature.id, feature])),
		[map],
	);

	useMarked(svgRef, active);

	/** The area a pointer event landed on, if it landed on one. */
	const featureAt = (target: EventTarget) =>
		target instanceof SVGPathElement ? byId.get(target.dataset.id ?? "") : undefined;

	/**
	 * One set of pointer handlers for the whole map rather than a pair per area.
	 * Every area is also a button in the list beside the map, which is the
	 * keyboard's way in.
	 */
	const pointer: SVGProps<SVGSVGElement> = {
		...handlers,
		onPointerMove: (event) => {
			handlers.onPointerMove(event);
			const feature = featureAt(event.target);
			const frame = frameRef.current?.getBoundingClientRect();
			if (!feature || !frame || dragged()) return setTip(null);
			setTip({
				name: feature.name,
				x: event.clientX - frame.left,
				y: event.clientY - frame.top,
			});
			onHover(feature.id);
		},
		onPointerUp: (event) => {
			handlers.onPointerUp(event);
			const feature = featureAt(event.target);
			// The release that ends a drag is not a press on an area.
			if (feature && !dragged()) onOpen(feature);
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
				<Areas map={map} />
			</svg>

			{tip && (
				<div className="tip" style={{ left: tip.x, top: tip.y }}>
					{tip.name}
				</div>
			)}

			<div className="zoom">
				{/* Dragging needs an alternative that is a plain press. */}
				{view.k > 1 &&
					PAN_BUTTONS.map(({ label, glyph, fx, fy }) => (
						<button
							key={label}
							type="button"
							aria-label={label}
							title={label}
							onClick={() => pan(fx, fy)}
						>
							{glyph}
						</button>
					))}
				<button
					type="button"
					aria-label="Reset view"
					title="Reset view"
					disabled={view.k === 1}
					onClick={reset}
				>
					⟲
				</button>
				<button
					type="button"
					aria-label="Zoom out"
					title="Zoom out"
					disabled={view.k === 1}
					onClick={() => zoom(1 / ZOOM_STEP)}
				>
					−
				</button>
				<button
					type="button"
					aria-label="Zoom in"
					title="Zoom in"
					onClick={() => zoom(ZOOM_STEP)}
				>
					+
				</button>
			</div>
		</div>
	);
}
