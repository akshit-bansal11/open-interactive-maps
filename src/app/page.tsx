import Link from "next/link";
import { readIndex } from "@/lib/maps";

export const revalidate = 86_400;

export default async function Home() {
	const { countries, continents, builtAt } = await readIndex();

	return (
		<main className="home">
			<div className="home-intro">
				<h1>Every boundary, ready to take away.</h1>
				<p>
					Start at the <Link href="/world">world</Link> and click down through{" "}
					{continents.length} continents to any of {countries.length} countries, its
					states, its districts and whatever lies below them. Copy or download any map as
					SVG, PNG or JSON.
				</p>
			</div>

			<ul className="picker">
				{countries.map((country) => (
					<li key={country.id}>
						<Link href={`/${country.id}`}>
							<svg viewBox={country.thumb.viewBox} aria-hidden="true">
								<path d={country.thumb.d} />
							</svg>
							<strong>{country.name}</strong>
							<span>{country.areas.toLocaleString()} areas</span>
						</Link>
					</li>
				))}
			</ul>

			<p className="attribution">
				Boundaries from{" "}
				<a href="https://www.geoboundaries.org" target="_blank" rel="noopener noreferrer">
					geoBoundaries
				</a>{" "}
				(gbOpen), with{" "}
				<a
					href="https://www.openstreetmap.org/copyright"
					target="_blank"
					rel="noopener noreferrer"
				>
					OpenStreetMap
				</a>{" "}
				filling the outlines it lacks. Built {builtAt}. Licence terms differ by country
				and by level — each map carries its own.
			</p>
		</main>
	);
}
