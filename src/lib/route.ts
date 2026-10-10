"use client";

import { useSyncExternalStore } from "react";

/**
 * The map on screen is the URL path — "/world/asia/india" — and nothing else.
 *
 * Every map URL is served the same static shell, so moving between maps is a
 * `pushState` and never a request to the app's server. That is why this does
 * not go through the framework's router: a router navigation would ask the
 * server for a page that is identical to the one already loaded.
 */
const NAVIGATE = "maps:navigate";
const ROOT = "world";

function subscribe(onChange: () => void) {
	window.addEventListener("popstate", onChange);
	window.addEventListener(NAVIGATE, onChange);
	return () => {
		window.removeEventListener("popstate", onChange);
		window.removeEventListener(NAVIGATE, onChange);
	};
}

/** The id of the map the URL names. The bare site root is the world. */
export function useMapId(): string {
	const path = useSyncExternalStore(
		subscribe,
		() => window.location.pathname,
		() => "/",
	);
	return path.replace(/^\/+|\/+$/g, "") || ROOT;
}

export const hrefOf = (id: string) => `/${id}`;

export function navigate(id: string) {
	window.history.pushState(null, "", hrefOf(id));
	window.dispatchEvent(new Event(NAVIGATE));
}
