"use client";

import { MoonIcon, SunIcon } from "@/components/Icons";

/**
 * Flips between the light and dark theme. The choice is `data-theme` on <html>
 * (the stylesheet falls back to the system theme without it) and is kept in
 * localStorage, which the inline script in the layout reads before first paint.
 *
 * Which icon shows is the stylesheet's call, from the same state the colours
 * use, so there is nothing for the server and client to disagree about.
 */
export function ThemeToggle() {
	const toggle = () => {
		const root = document.documentElement;
		const dark =
			root.dataset.theme === "dark" ||
			(root.dataset.theme !== "light" &&
				window.matchMedia("(prefers-color-scheme: dark)").matches);
		const next = dark ? "light" : "dark";
		root.dataset.theme = next;
		try {
			localStorage.setItem("theme", next);
		} catch {
			// Private window or blocked storage: the theme just won't be remembered.
		}
	};

	return (
		<button
			type="button"
			className="icon-button theme"
			aria-label="Toggle light and dark theme"
			title="Toggle theme"
			onClick={toggle}
		>
			<SunIcon className="sun" />
			<MoonIcon className="moon" />
		</button>
	);
}
