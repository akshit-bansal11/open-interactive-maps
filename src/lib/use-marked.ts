"use client";

import { type RefObject, useEffect } from "react";

/**
 * Marks the one element under `root` whose `data-id` is `id` with `data-on`,
 * and returns it to the caller's effect through `onMark`.
 *
 * Done on the element directly instead of through React state on purpose. The
 * map and the list beside it each hold up to thousands of items, and a hover
 * would otherwise re-render all of them to change one.
 */
export function useMarked(
	root: RefObject<Element | null>,
	id: string | null,
	onMark?: (element: Element) => void,
) {
	useEffect(() => {
		if (!id) return;
		const element = root.current?.querySelector(`[data-id="${CSS.escape(id)}"]`);
		if (!element) return;
		element.setAttribute("data-on", "");
		onMark?.(element);
		return () => element.removeAttribute("data-on");
	}, [root, id, onMark]);
}
