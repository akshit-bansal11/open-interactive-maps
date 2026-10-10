"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Country } from "@/types/map";

/** Persistent country picker — lives in the layout, so it survives navigation. */
export function CountryStrip({ countries }: { countries: Country[] }) {
	const pathname = usePathname();

	// A country id is a path of its own now — "world/asia/india" — so the active
	// one is whichever the current route sits inside.
	const inside = (id: string) => pathname === `/${id}` || pathname.startsWith(`/${id}/`);

	return (
		<nav className="countries" aria-label="Countries">
			{countries.map((country) => (
				<Link
					key={country.id}
					href={`/${country.id}`}
					aria-current={inside(country.id) ? "page" : undefined}
				>
					<svg viewBox={country.thumb.viewBox} aria-hidden="true">
						<path d={country.thumb.d} />
					</svg>
					<span>
						{country.name}
						<span className="areas-count">{country.areas.toLocaleString()} areas</span>
					</span>
				</Link>
			))}
		</nav>
	);
}
