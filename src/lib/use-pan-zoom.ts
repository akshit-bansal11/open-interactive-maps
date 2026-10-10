"use client";

import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { clampView, IDENTITY, panBy, type View, zoomAt } from "@/lib/view.mjs";

/** Pointer travel, in CSS px, before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD = 4;
const WHEEL_SPEED = 0.0015;

/**
 * Pan and zoom for one SVG map, expressed as the viewBox to draw. Wheel zooms on
 * the pointer, one pointer drags, two pinch. `dragged()` tells a click handler
 * whether the press that produced it was really the end of a drag.
 */
export function usePanZoom(width: number, height: number) {
	const svgRef = useRef<SVGSVGElement>(null);
	const [view, setView] = useState<View>(IDENTITY);
	const pointers = useRef(new Map<number, { x: number; y: number }>());
	const travel = useRef(0);

	const reset = useCallback(() => setView(IDENTITY), []);

	const update = useCallback(
		(change: (view: View) => View) =>
			setView((previous) => clampView(change(previous), width, height)),
		[width, height],
	);

	/** Screen position → map units, and how many screen px one map unit covers. */
	const locate = useCallback((clientX: number, clientY: number) => {
		const matrix = svgRef.current?.getScreenCTM();
		if (!matrix) return null;
		const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
		return { x: point.x, y: point.y, scale: matrix.a };
	}, []);

	// React registers wheel listeners as passive, and a passive listener cannot
	// stop the page scrolling underneath the map.
	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			const at = locate(event.clientX, event.clientY);
			if (!at) return;
			update((v) => zoomAt(v, Math.exp(-event.deltaY * WHEEL_SPEED), at.x, at.y));
		};
		svg.addEventListener("wheel", onWheel, { passive: false });
		return () => svg.removeEventListener("wheel", onWheel);
	}, [locate, update]);

	const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
		if (pointers.current.size === 0) travel.current = 0;
		pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
	};

	const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
		const last = pointers.current.get(event.pointerId);
		if (!last) return;
		const next = { x: event.clientX, y: event.clientY };
		const dx = next.x - last.x;
		const dy = next.y - last.y;
		travel.current += Math.hypot(dx, dy);
		if (travel.current < DRAG_THRESHOLD) return;

		// Captured only once it is a drag: capturing on press would retarget the
		// click away from the area that was pressed.
		event.currentTarget.setPointerCapture(event.pointerId);
		pointers.current.set(event.pointerId, next);

		const [first, second] = [...pointers.current.values()];
		if (first && second) {
			const other = first === next ? second : first;
			const before = Math.hypot(last.x - other.x, last.y - other.y);
			const after = Math.hypot(next.x - other.x, next.y - other.y);
			const at = locate((next.x + other.x) / 2, (next.y + other.y) / 2);
			if (at && before > 0) update((v) => zoomAt(v, after / before, at.x, at.y));
			return;
		}

		const at = locate(next.x, next.y);
		if (at) update((v) => panBy(v, -dx / at.scale, -dy / at.scale));
	};

	const onPointerEnd = (event: PointerEvent<SVGSVGElement>) => {
		pointers.current.delete(event.pointerId);
	};

	return {
		svgRef,
		view,
		viewBox: `${view.x} ${view.y} ${width / view.k} ${height / view.k}`,
		dragged: () => travel.current >= DRAG_THRESHOLD,
		reset,
		/** Zoom about the centre of what is on screen. */
		zoom: (factor: number) =>
			update((v) => zoomAt(v, factor, v.x + width / v.k / 2, v.y + height / v.k / 2)),
		/** Pan by a fraction of what is on screen. */
		pan: (fx: number, fy: number) =>
			update((v) => panBy(v, (fx * width) / v.k, (fy * height) / v.k)),
		handlers: {
			onPointerDown,
			onPointerMove,
			onPointerUp: onPointerEnd,
			onPointerCancel: onPointerEnd,
		},
	};
}
