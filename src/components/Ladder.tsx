"use client";

import { useEffect, useRef, useState } from "react";
import { loadMap } from "@/lib/maps";
import { follow, hrefOf } from "@/lib/route";
import type { MapFile } from "@/types/map";

/**
 * What the first three tiers are called. They are fixed by the shape of the
 * data — world, continent, country — so they need no fetch; below a country the
 * generator labels each tier per country ("State", "District", "Block"…), and
 * that label lives on the map itself.
 */
const TOP_LEVELS = ["World", "Continent", "Country"];

/** Levels learnt so far, by map id, for the lifetime of the page. */
const known = new Map<string, string>();

const depthOf = (id: string) => id.split("/").length;

/**
 * The level label of every map above this one. A visited map's label is already
 * known; one reached by a pasted address is read from its own map file, which
 * sits in the same pack as the map on screen or one the page has already held.
 */
function useLevels(map: MapFile) {
	const [, bump] = useState(0);
	known.set(map.id, map.level);

	useEffect(() => {
		let live = true;
		for (const { id } of map.parents) {
			if (depthOf(id) <= TOP_LEVELS.length || known.has(id)) continue;
			loadMap(id)
				.then((parent) => {
					if (!parent || !live) return;
					known.set(id, parent.level);
					bump((n) => n + 1);
				})
				.catch(() => {});
		}
		return () => {
			live = false;
		};
	}, [map.parents]);

	return (id: string) => TOP_LEVELS[depthOf(id) - 1] ?? known.get(id) ?? "Area";
}

/**
 * The way down, one step per tier: World, Continent, Country, State… to the map
 * on screen. Each step above is a link back up.
 */
export function Ladder({ map }: { map: MapFile }) {
	const levelOf = useLevels(map);
	const listRef = useRef<HTMLOListElement>(null);

	// A deep ladder scrolls; keep its end, the map on screen, in sight.
	useEffect(() => {
		const list = listRef.current;
		if (list) list.scrollTo({ left: list.scrollWidth, top: list.scrollHeight });
	}, [map.id]);

	return (
		<nav className="ladder" aria-label="Where you are in the world">
			<ol ref={listRef}>
				{map.parents.map((parent) => (
					<li key={parent.id}>
						<a href={hrefOf(parent.id)} onClick={follow(parent.id)}>
							<span className="step-level">{levelOf(parent.id)}</span>
							<span className="step-name">{parent.name}</span>
						</a>
					</li>
				))}
				<li aria-current="page">
					<span className="step">
						<span className="step-level">{map.level}</span>
						<span className="step-name">{map.name}</span>
					</span>
				</li>
			</ol>
		</nav>
	);
}
