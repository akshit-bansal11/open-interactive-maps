"use client";

import { geoDistance, geoInterpolate } from "d3-geo";
import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { clampTilt, easeInOut, wrapLng } from "@/lib/globe.mjs";

/** Pointer travel, in CSS px, before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD = 4;
const WHEEL_SPEED = 0.0015;
export const MAX_ZOOM = 3;

/** Where the globe opens: Africa and the Middle East, with Europe and India either side. */
const HOME: Orientation = { lambda: 35, phi: 22 };

/** Slow spin, in degrees a second — a full turn takes a minute and a half. */
const SPIN = 4;
/** How long the globe must be left alone before it starts to turn again. */
const IDLE = 3500;
/** Inertia dies away with this time constant, in ms. */
const GLIDE = 340;
/** Below this speed, in degrees a ms, a glide is over. */
const REST = 0.004;
/** A release after the pointer has stood still this long throws nothing. */
const STALE = 90;
/** The least time between two draws of the idle spin, in ms. */
const DRIFT_FRAME = 28;
/** A flight to a point this close, in radians (about 2 degrees), is not worth making. */
const FACING = 0.035;
/** A flight to a continent, in ms. */
const FLIGHT = 650;
/** Time constant of a zoom settling on its target, in ms. */
const ZOOM_EASE = 90;

/** The point on the globe that faces the viewer, in degrees. */
interface Orientation {
	lambda: number;
	phi: number;
}

export interface GlobeView extends Orientation {
	/** Zoom: 1 fits the sphere to the stage. */
	k: number;
}

interface Sim extends GlobeView {
	/** Where the zoom is heading. */
	target: number;
	/** Glide, in degrees a ms. */
	vLambda: number;
	vPhi: number;
	dragging: boolean;
	hovering: boolean;
	/** When the globe was last touched, by anything. */
	touched: number;
	last: number;
	/** When the view was last committed to the screen. */
	painted: number;
	flight: { at: number; along: (t: number) => [number, number] } | null;
	/** Last drag sample, for the throw on release. */
	sample: { at: number; x: number; y: number } | null;
}

const clamp = (value: number, min: number, max: number) =>
	Math.min(Math.max(value, min), max);

/**
 * The turning globe: drag, throw, wheel and pinch, the idle spin, and flights to
 * a point. State lives in a ref and is stepped by one animation-frame loop that
 * runs only while something is moving, then committed to `view` so the SVG is
 * redrawn once per frame.
 *
 * `radius` is the sphere's radius in px at zoom 1; a drag turns the globe so the
 * land under the pointer follows it, which is `1 / (radius * k)` rad per px.
 */
export function useGlobe(radius: number) {
	const svgRef = useRef<SVGSVGElement>(null);
	const [view, setView] = useState<GlobeView>({ ...HOME, k: 1 });
	const sim = useRef<Sim>({
		...HOME,
		k: 1,
		target: 1,
		vLambda: 0,
		vPhi: 0,
		dragging: false,
		hovering: false,
		touched: 0,
		last: 0,
		painted: 0,
		flight: null,
		sample: null,
	});
	// The drag handlers read the radius when they run; it need not re-create them.
	const radiusRef = useRef(radius);
	useEffect(() => {
		radiusRef.current = radius;
	}, [radius]);
	const frame = useRef(0);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const reduced = useRef(false);
	const pointers = useRef(new Map<number, { x: number; y: number }>());
	const travel = useRef(0);

	const commit = useCallback(() => {
		const { lambda, phi, k } = sim.current;
		setView((now) =>
			now.lambda === lambda && now.phi === phi && now.k === k ? now : { lambda, phi, k },
		);
	}, []);

	/** Starts the loop if it is not running. Defined by the effect below, which owns the loop. */
	const loop = useRef(() => {});
	const wake = useCallback(() => loop.current(), []);

	/** Anything the viewer does to the globe holds off the idle spin. */
	const touch = useCallback(() => {
		sim.current.touched = performance.now();
		sim.current.flight = null;
	}, []);

	useEffect(() => {
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");

		const step = (now: number) => {
			frame.current = 0;
			const s = sim.current;
			const dt = Math.min(now - s.last, 50);
			s.last = now;
			let moving = false;
			// Whether the idle spin is all that moved this frame.
			let drifting = false;

			if (s.flight) {
				const t = Math.min((now - s.flight.at) / FLIGHT, 1);
				const [lng, lat] = s.flight.along(easeInOut(t));
				s.lambda = lng;
				s.phi = clampTilt(lat);
				moving = true;
				if (t >= 1) {
					s.flight = null;
					s.touched = now;
				}
			} else if (!s.dragging) {
				if (Math.hypot(s.vLambda, s.vPhi) > REST) {
					s.lambda = wrapLng(s.lambda + s.vLambda * dt);
					s.phi = clampTilt(s.phi + s.vPhi * dt);
					const decay = Math.exp(-dt / GLIDE);
					s.vLambda *= decay;
					s.vPhi *= decay;
					moving = true;
				} else if (!s.hovering && !reduced.current && now - s.touched > IDLE) {
					s.lambda = wrapLng(s.lambda + (SPIN * dt) / 1000);
					moving = drifting = true;
				}
			}

			if (Math.abs(s.target - s.k) > 0.0005) {
				s.k += (s.target - s.k) * (1 - Math.exp(-dt / ZOOM_EASE));
				moving = true;
				drifting = false;
			} else {
				s.k = s.target;
			}

			// A turn this slow looks the same drawn at half the rate, for half the work.
			if (!drifting || now - s.painted >= DRIFT_FRAME) {
				commit();
				s.painted = now;
			}
			if (moving) {
				frame.current = requestAnimationFrame(step);
			} else if (!s.hovering && !s.dragging && !reduced.current) {
				// At rest, and it will turn again once it has been left alone long enough.
				timer.current = setTimeout(wakeUp, Math.max(0, IDLE - (now - s.touched)) + 20);
			}
		};

		function wakeUp() {
			clearTimeout(timer.current);
			if (frame.current) return;
			sim.current.last = performance.now();
			frame.current = requestAnimationFrame(step);
		}
		loop.current = wakeUp;

		const sync = () => {
			reduced.current = query.matches;
			if (query.matches) sim.current.vLambda = sim.current.vPhi = 0;
			wakeUp();
		};
		sync();
		query.addEventListener("change", sync);
		return () => {
			query.removeEventListener("change", sync);
			cancelAnimationFrame(frame.current);
			frame.current = 0;
			clearTimeout(timer.current);
		};
	}, [commit]);

	/** Sets the zoom, now rather than easing toward it. */
	const setZoom = useCallback(
		(k: number) => {
			const s = sim.current;
			s.target = clamp(k, 1, MAX_ZOOM);
			if (reduced.current) s.k = s.target;
			touch();
			wake();
		},
		[touch, wake],
	);

	// React registers wheel listeners as passive, and a passive listener cannot
	// stop the page scrolling underneath the globe.
	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			setZoom(sim.current.target * Math.exp(-event.deltaY * WHEEL_SPEED));
		};
		svg.addEventListener("wheel", onWheel, { passive: false });
		return () => svg.removeEventListener("wheel", onWheel);
	}, [setZoom]);

	const onPointerEnter = () => {
		sim.current.hovering = true;
	};

	const onPointerLeave = () => {
		sim.current.hovering = false;
		touch();
		wake();
	};

	const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
		if (pointers.current.size === 0) travel.current = 0;
		pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
		const s = sim.current;
		s.vLambda = s.vPhi = 0;
		s.sample = { at: event.timeStamp, x: event.clientX, y: event.clientY };
		touch();
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
		// click away from the continent that was pressed.
		event.currentTarget.setPointerCapture(event.pointerId);
		pointers.current.set(event.pointerId, next);
		const s = sim.current;
		touch();

		const [first, second] = [...pointers.current.values()];
		if (first && second) {
			// Two fingers pinch; the globe stays where it is.
			const other = first === next ? second : first;
			const before = Math.hypot(last.x - other.x, last.y - other.y);
			const after = Math.hypot(next.x - other.x, next.y - other.y);
			if (before > 0) {
				s.target = s.k = clamp(s.k * (after / before), 1, MAX_ZOOM);
				wake();
			}
			return;
		}

		s.dragging = true;
		// The land under the pointer follows it: radians per px is 1 / radius.
		const perPx = 180 / Math.PI / (radiusRef.current * s.k);
		s.lambda = wrapLng(s.lambda - dx * perPx);
		s.phi = clampTilt(s.phi + dy * perPx);

		// Velocity of the throw, smoothed over the last few moves.
		const before = s.sample;
		if (before && event.timeStamp > before.at) {
			const ms = event.timeStamp - before.at;
			const kinetic = 0.7;
			s.vLambda =
				s.vLambda * (1 - kinetic) + ((-(next.x - before.x) * perPx) / ms) * kinetic;
			s.vPhi = s.vPhi * (1 - kinetic) + (((next.y - before.y) * perPx) / ms) * kinetic;
		}
		s.sample = { at: event.timeStamp, x: next.x, y: next.y };
		commit();
	};

	const onPointerEnd = (event: PointerEvent<SVGSVGElement>) => {
		pointers.current.delete(event.pointerId);
		const s = sim.current;
		if (pointers.current.size > 0) return;
		s.dragging = false;
		const idle = s.sample ? event.timeStamp - s.sample.at : Infinity;
		// A pointer that stopped before it was let go throws nothing.
		if (reduced.current || idle > STALE) s.vLambda = s.vPhi = 0;
		s.sample = null;
		touch();
		wake();
	};

	/** Whether the pointer is over the globe, as opposed to a list beside it. */
	const hovering = useCallback(() => sim.current.hovering, []);
	/** Whether the press now ending was a drag, for a click handler to ignore. */
	const dragged = useCallback(() => travel.current >= DRAG_THRESHOLD, []);

	/** Turns the globe to face a point, along the great circle, unless it already does. */
	const flyTo = useCallback(
		([lng, lat]: [number, number]) => {
			const s = sim.current;
			const to: [number, number] = [lng, clampTilt(lat)];
			// Already facing it, near enough that a flight would only twitch.
			if (geoDistance([s.lambda, s.phi], to) < FACING) return;
			s.vLambda = s.vPhi = 0;
			if (reduced.current) {
				s.lambda = to[0];
				s.phi = to[1];
				s.touched = performance.now();
				commit();
				return;
			}
			s.flight = { at: performance.now(), along: geoInterpolate([s.lambda, s.phi], to) };
			wake();
		},
		[commit, wake],
	);

	const reset = useCallback(() => {
		// Zooming counts as a touch and cancels a flight, so zoom first.
		setZoom(1);
		flyTo([HOME.lambda, HOME.phi]);
	}, [flyTo, setZoom]);

	return {
		svgRef,
		view,
		hovering,
		dragged,
		zoomBy: (factor: number) => setZoom(sim.current.target * factor),
		reset,
		flyTo,
		handlers: {
			onPointerEnter,
			onPointerLeave,
			onPointerDown,
			onPointerMove,
			onPointerUp: onPointerEnd,
			onPointerCancel: onPointerEnd,
		},
	};
}
