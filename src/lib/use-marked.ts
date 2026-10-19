"use client";

import { type RefObject, useEffect } from "react";

interface Options {
	/** Called with the marked element, e.g. to scroll it into view. */
	onMark?: (element: Element) => void;
	/** The attribute to set; `data-on` unless a second mark is wanted. */
	attribute?: string;
	/**
	 * Anything whose change means the elements under `root` were replaced, so the
	 * mark has to be put back on the new one.
	 */
	version?: unknown;
}

/**
 * Marks the one element under `root` whose `data-id` is `id` with `data-on`
 * (or `options.attribute`).
 *
 * Done on the element directly instead of through React state on purpose. The
 * map and the list beside it each hold up to thousands of items, and a hover
 * would otherwise re-render all of them to change one.
 */
export function useMarked(
	root: RefObject<Element | null>,
	id: string | null,
	{ onMark, attribute = "data-on", version }: Options = {},
) {
	useEffect(() => {
		if (!id) return;
		const element = root.current?.querySelector(`[data-id="${CSS.escape(id)}"]`);
		if (!element) return;
		element.setAttribute(attribute, "");
		onMark?.(element);
		return () => element.removeAttribute(attribute);
	}, [root, id, onMark, attribute, version]);
}
